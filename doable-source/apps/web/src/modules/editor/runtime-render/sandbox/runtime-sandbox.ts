/**
 * Runtime preview sandbox — runs INSIDE the opaque-origin iframe.
 *
 * Bundled on its own (scripts/build-runtime-sandbox.mjs) into
 * public/runtime-sandbox.js, so it carries the app's exact React 19 build and
 * UI libraries; nothing from here is imported by the Next.js app.
 *
 * Everything the user's code can touch lives in this document, whose origin
 * is "null": document.cookie and localStorage throw SecurityError, so the
 * session token of the logged-in editor is out of reach. That isolation is
 * the entire reason this runs in a frame instead of the editor page.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import * as ReactDomClient from "react-dom/client";
import * as ReactJsxRuntime from "react/jsx-runtime";
import * as LucideIcons from "lucide-react";
import * as Clsx from "clsx";
import * as TailwindMerge from "tailwind-merge";
import * as Cva from "class-variance-authority";
import { CDN, PARENT_SOURCE, SANDBOX_SOURCE, type RenderRequest, type SandboxMessage } from "./protocol";
import { resolveImport } from "../resolve-import";

declare global {
  interface Window {
    __DOABLE_RUNTIME_NONCE__?: string;
    __DOABLE_PARENT_ORIGIN__?: string;
    Babel?: { transform(code: string, opts: Record<string, unknown>): { code?: string | null } };
    Recharts?: Record<string, unknown>;
    React?: unknown;
    ReactDOM?: unknown;
    PropTypes?: unknown;
  }
}

const nonce = window.__DOABLE_RUNTIME_NONCE__ ?? "";
// Baked into the srcdoc by the editor from its own location.origin. This
// frame's origin is opaque, but the PARENT's is known, so messages go to
// that exact origin rather than "*": error text can carry Babel code frames
// of the user's source, which must not reach any other embedder.
const parentOrigin = window.__DOABLE_PARENT_ORIGIN__ ?? "";

function post(msg: SandboxMessage): void {
  if (!parentOrigin) return; // not embedded by the editor — stay silent
  window.parent.postMessage(msg, parentOrigin);
}

// ─── Globals for UMD packages ─────────────────────────────────────────────
// recharts' UMD build reads window.React / ReactDOM / PropTypes at load. Point
// them at this bundle's React so the charts share ONE React instance with the
// component that renders them (two instances break hooks).
window.React = React;
window.ReactDOM = ReactDOM;
window.PropTypes = createPropTypesShim();

/**
 * React 19 no longer checks propTypes, but libraries still build propTypes
 * objects at module load (`PropTypes.oneOf([...]).isRequired`), so validators
 * must carry `.isRequired` and factories must return one.
 *
 * A plain object, not a catch-all Proxy: bundler interop asks
 * `mod.__esModule ? mod.default : mod`, and a Proxy that answers every key
 * makes recharts read `.default.oneOfType` and crash at load.
 */
function createPropTypesShim(): Record<string, unknown> {
  const validator = Object.assign(() => null, { isRequired: () => null });
  const factory = () => validator;
  const shim: Record<string, unknown> = { checkPropTypes: () => undefined, resetWarningCache: () => undefined };
  for (const k of ["any", "array", "bigint", "bool", "func", "number", "object", "string", "symbol", "node", "element", "elementType"]) {
    shim[k] = validator;
  }
  for (const k of ["instanceOf", "oneOf", "oneOfType", "arrayOf", "objectOf", "shape", "exact"]) {
    shim[k] = factory;
  }
  shim.PropTypes = shim;
  return shim;
}

/**
 * Roots created by the user's own code (e.g. main.tsx calling createRoot).
 * Tracked so they can be unmounted before the next render, and so an entry
 * that mounts itself counts as a success. Detecting that from the DOM does
 * not work: React 19's root.render() is asynchronous, so right after the
 * module runs the container is still empty.
 */
const userRoots = new Set<ReactDomClient.Root>();
const instrumentedClient = {
  ...ReactDomClient,
  createRoot: (...args: Parameters<typeof ReactDomClient.createRoot>) => {
    const r = ReactDomClient.createRoot(...args);
    userRoots.add(r);
    return r;
  },
  hydrateRoot: (...args: Parameters<typeof ReactDomClient.hydrateRoot>) => {
    const r = ReactDomClient.hydrateRoot(...args);
    userRoots.add(r);
    return r;
  },
};

const baseRegistry: Record<string, unknown> = {
  react: React,
  "react-dom": ReactDOM,
  "react-dom/client": instrumentedClient,
  "react/jsx-runtime": ReactJsxRuntime,
  "react/jsx-dev-runtime": ReactJsxRuntime,
  "lucide-react": LucideIcons,
  clsx: Clsx,
  "tailwind-merge": TailwindMerge,
  "class-variance-authority": Cva,
};

const loadedScripts = new Map<string, Promise<void>>();
function loadScript(src: string, integrity: string): Promise<void> {
  let p = loadedScripts.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.integrity = integrity;
      el.crossOrigin = "anonymous";
      el.onload = () => resolve();
      el.onerror = () => {
        loadedScripts.delete(src);
        reject(new Error(`Could not load ${src} (network blocked, offline, or integrity check failed).`));
      };
      document.head.appendChild(el);
    });
    loadedScripts.set(src, p);
  }
  return p;
}

// ─── Styles ───────────────────────────────────────────────────────────────
// @tailwindcss/browser compiles <style type="text/tailwindcss"> in-page and
// already includes the framework, so the project's `@import "tailwindcss"`
// is dropped (it would try to fetch a file named "tailwindcss").
function applyProjectCss(files: Record<string, string>): void {
  const css = Object.entries(files)
    .filter(([p]) => p.endsWith(".css"))
    .map(([, src]) => src.replace(/@import\s+["']tailwindcss(?:\/[^"']*)?["']\s*;?/g, ""))
    .join("\n");
  let el = document.getElementById("doable-project-css");
  if (!el) {
    el = document.createElement("style");
    el.id = "doable-project-css";
    el.setAttribute("type", "text/tailwindcss");
    document.head.appendChild(el);
  }
  el.textContent = css;
}

// ─── Module loader ────────────────────────────────────────────────────────
class ModuleNotAvailable extends Error {}

function createLoader(files: Record<string, string>, registry: Record<string, unknown>) {
  const fileSet = new Set(Object.keys(files));
  const cache = new Map<string, { exports: Record<string, unknown> }>();

  function load(path: string): Record<string, unknown> {
    const cached = cache.get(path);
    if (cached) return cached.exports;

    const source = files[path];
    const mod = { exports: {} as Record<string, unknown> };
    // Register before executing so circular imports resolve to the partial
    // module instead of recursing forever, as CommonJS does.
    cache.set(path, mod);

    if (source === undefined) throw new ModuleNotAvailable(`File not found: ${path}`);
    if (path.endsWith(".css")) return mod.exports; // applied globally
    if (path.endsWith(".json")) {
      mod.exports = { default: JSON.parse(source) };
      return mod.exports;
    }

    const babel = window.Babel;
    if (!babel) throw new Error("Babel failed to load.");
    const { code } = babel.transform(source, {
      filename: path,
      sourceFileName: path,
      presets: [["react", { runtime: "automatic" }], "typescript"],
      plugins: ["transform-modules-commonjs"],
      sourceMaps: "inline",
    });

    const localRequire = (spec: string): unknown => {
      if (spec in registry) return registry[spec];
      const resolved = resolveImport(path, spec, fileSet);
      if (resolved) return load(resolved);
      if (spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("/")) {
        throw new ModuleNotAvailable(`Cannot resolve "${spec}" from ${path}.`);
      }
      throw new ModuleNotAvailable(
        `Package "${spec}" isn't available in the Runtime preview. ` +
          `Available: ${Object.keys(registry).filter((k) => !k.includes("/")).sort().join(", ")}. ` +
          `Use the Preview tab for full dependency support.`,
      );
    };

    // eslint-disable-next-line no-new-func
    new Function("require", "module", "exports", `${code ?? ""}\n//# sourceURL=runtime:///${path}`)(
      localRequire,
      mod,
      mod.exports,
    );
    return mod.exports;
  }

  return { load, count: () => cache.size };
}

// ─── Rendering ────────────────────────────────────────────────────────────
class Boundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error) {
    post({ source: SANDBOX_SOURCE, type: "runtime-error", nonce, error: error.message });
  }
  override render() {
    if (this.state.error) {
      return React.createElement(
        "pre",
        { style: { color: "#b91c1c", padding: 16, whiteSpace: "pre-wrap", font: "12px ui-monospace, monospace" } },
        `Runtime error: ${this.state.error.message}`,
      );
    }
    return this.props.children;
  }
}

let root: ReactDomClient.Root | null = null;

function freshMount(): HTMLElement {
  if (root) {
    root.unmount();
    root = null;
  }
  for (const r of userRoots) {
    try { r.unmount(); } catch { /* already unmounted */ }
  }
  userRoots.clear();
  document.getElementById("root")?.remove();
  const el = document.createElement("div");
  el.id = "root";
  document.body.appendChild(el);
  return el;
}

async function render(req: RenderRequest): Promise<void> {
  const t0 = performance.now();
  const elapsed = () => Math.round(performance.now() - t0);
  try {
    document.documentElement.classList.toggle("dark", req.dark);
    const registry = { ...baseRegistry };
    if (req.packages.includes("recharts")) {
      await loadScript(CDN.recharts.src, CDN.recharts.integrity);
      if (!window.Recharts) throw new Error("recharts failed to initialise in the preview sandbox.");
      registry.recharts = window.Recharts;
    }
    applyProjectCss(req.files);

    const container = freshMount();
    const loader = createLoader(req.files, registry);
    const exports = loader.load(req.entry);

    const Component = pickComponent(exports);
    if (Component) {
      root = ReactDomClient.createRoot(container);
      root.render(React.createElement(Boundary, null, React.createElement(Component)));
    } else if (userRoots.size === 0) {
      throw new Error(
        "No component to render. Export one (`export default function App() {…}`), " +
          "or open a file that mounts itself with createRoot (e.g. src/main.tsx).",
      );
    }
    post({ source: SANDBOX_SOURCE, type: "result", nonce, ok: true, durationMs: elapsed(), modules: loader.count() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({ source: SANDBOX_SOURCE, type: "result", nonce, ok: false, error: message, durationMs: elapsed() });
  }
}

function pickComponent(exports: Record<string, unknown>): React.ComponentType | null {
  const isComponent = (v: unknown): v is React.ComponentType =>
    typeof v === "function" || (typeof v === "object" && v !== null && "$$typeof" in v);
  if (isComponent(exports.default)) return exports.default;
  const named = Object.entries(exports).find(([k, v]) => /^[A-Z]/.test(k) && isComponent(v));
  return named ? (named[1] as React.ComponentType) : null;
}

// ─── Wiring ───────────────────────────────────────────────────────────────
window.addEventListener("message", (event: MessageEvent) => {
  // Only the embedding editor may drive this frame: right window, right
  // origin, and the nonce it minted for this document.
  if (event.source !== window.parent || !parentOrigin || event.origin !== parentOrigin) return;
  const data = event.data as Partial<RenderRequest> | null;
  if (!data || data.source !== PARENT_SOURCE || data.type !== "render" || data.nonce !== nonce) return;
  void render(data as RenderRequest);
});

window.addEventListener("error", (e) => {
  post({ source: SANDBOX_SOURCE, type: "runtime-error", nonce, error: e.message || "Unknown runtime error" });
});
window.addEventListener("unhandledrejection", (e) => {
  const reason = (e as PromiseRejectionEvent).reason;
  post({ source: SANDBOX_SOURCE, type: "runtime-error", nonce, error: reason instanceof Error ? reason.message : String(reason) });
});

post({ source: SANDBOX_SOURCE, type: "ready", nonce });

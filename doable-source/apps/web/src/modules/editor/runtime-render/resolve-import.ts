/**
 * Import discovery and resolution for the runtime preview.
 *
 * Pure and dependency-free on purpose: the editor uses it to decide which
 * project files to ship into the sandbox, and the sandbox runtime bundle
 * (runtime-sandbox.ts) uses the SAME functions to resolve `require()` calls,
 * so the two sides can never disagree about what a specifier points at.
 */

const RESOLVE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".json", ".css"];
const INDEX_FILES = ["index.tsx", "index.ts", "index.jsx", "index.js"];

/** True for specifiers that point into the project rather than at a package. */
export function isLocalSpecifier(spec: string): boolean {
  return spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("@/") || spec.startsWith("/");
}

/**
 * Remove comments so commented-out imports are not followed. String literals
 * are copied through untouched, which matters because `"https://..."`
 * contains a `//` that a naive line-comment strip would eat, along with any
 * real import that follows it on the same line.
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < n) {
          out += src.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += src[i];
        i++;
      }
      if (i < n) out += src[i++];
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Specifiers a module needs at runtime, in first-seen order, de-duplicated.
 * Type-only imports/exports are skipped: the TypeScript transform erases them,
 * so following them would fetch files the code never loads.
 */
export function extractImports(source: string): string[] {
  const code = stripComments(source);
  const seen = new Set<string>();
  const patterns = [
    // import X from "a" | import { a } from "a" | import * as a from "a"
    // The clause is [^;'"]* rather than [\s\S]*?: an import clause never
    // contains a semicolon or a quote, and allowing either lets this pattern
    // run past a side-effect import into unrelated code (e.g. `"from", 'x'`).
    // Newlines are still allowed, so multi-line `{ a,\n b }` clauses match.
    /\bimport\s+(?!type\b)([^;'"]*?)\bfrom\s*["']([^"']+)["']/g,
    // import "a"  (side effect)
    /\bimport\s*["']([^"']+)["']/g,
    // export { x } from "a" | export * from "a"
    /\bexport\s+(?!type\b)(?:\*|\{[\s\S]*?\})\s*(?:as\s+\w+\s*)?from\s*["']([^"']+)["']/g,
    // import("a") | require("a")
    /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  const hits: { index: number; spec: string }[] = [];
  for (const re of patterns) {
    for (const m of code.matchAll(re)) {
      const spec = m[m.length - 1];
      if (spec !== undefined && m.index !== undefined) hits.push({ index: m.index, spec });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  for (const h of hits) seen.add(h.spec);
  return [...seen];
}

/** Normalise `a/./b/../c` to `a/c`; null if it climbs above the project root. */
function normalizePath(path: string): string | null {
  const parts: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join("/");
}

/**
 * Resolve a local specifier against the set of project file paths
 * (root-relative, e.g. "src/App.tsx"). Mirrors Vite's `@` -> `src` alias and
 * its extension/index lookup. Returns null for packages and unknown files.
 */
export function resolveImport(fromFile: string, spec: string, files: ReadonlySet<string>): string | null {
  if (!isLocalSpecifier(spec)) return null;

  let base: string | null;
  if (spec.startsWith("@/")) {
    base = normalizePath(`src/${spec.slice(2)}`);
  } else if (spec.startsWith("/")) {
    base = normalizePath(spec.slice(1));
  } else {
    const dir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";
    base = normalizePath(dir ? `${dir}/${spec}` : spec);
  }
  if (base === null || base === "") return null;

  if (files.has(base)) return base;
  for (const ext of RESOLVE_EXTENSIONS) {
    if (files.has(base + ext)) return base + ext;
  }
  for (const index of INDEX_FILES) {
    if (files.has(`${base}/${index}`)) return `${base}/${index}`;
  }
  return null;
}

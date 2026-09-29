/**
 * Message protocol between the editor and the runtime sandbox iframe.
 *
 * The iframe runs with sandbox="allow-scripts" and no allow-same-origin, so
 * its origin is opaque ("null") and postMessage cannot be targeted at it by
 * origin. A per-mount nonce stands in: the editor only trusts messages that
 * come from its own iframe's window AND carry the nonce it baked into the
 * srcdoc, and only sends source once that document has announced itself.
 * If code in the frame navigated it elsewhere, the new document would not
 * know the nonce and would never be sent anything.
 */

export const SANDBOX_SOURCE = "doable-runtime-sandbox";
export const PARENT_SOURCE = "doable-runtime-parent";

export interface RenderRequest {
  source: typeof PARENT_SOURCE;
  type: "render";
  nonce: string;
  /** Root-relative path of the file to render, e.g. "src/App.tsx". */
  entry: string;
  /** Every project file the entry can reach, keyed by root-relative path. */
  files: Record<string, string>;
  /** Package specifiers imported anywhere in `files` (used to preload recharts). */
  packages: string[];
  dark: boolean;
}

export type SandboxMessage =
  | { source: typeof SANDBOX_SOURCE; type: "ready"; nonce: string }
  | { source: typeof SANDBOX_SOURCE; type: "result"; nonce: string; ok: true; durationMs: number; modules: number }
  | { source: typeof SANDBOX_SOURCE; type: "result"; nonce: string; ok: false; error: string; durationMs: number }
  | { source: typeof SANDBOX_SOURCE; type: "runtime-error"; nonce: string; error: string };

/** Pinned, integrity-checked CDN assets. SRI: sha384 of the exact bytes. */
export const CDN = {
  babel: {
    src: "https://unpkg.com/@babel/standalone@7.25.6/babel.min.js",
    integrity: "sha384-EIcs2MbARRLcLs7Gv2wqqhhfMlcLeW9yuJsWki1r5iveN1F5gpzHOwAKycJqSQOI",
  },
  tailwind: {
    src: "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3/dist/index.global.js",
    integrity: "sha384-2ql948lIdLcGEE0/qxNiudyTjgauA3RDJERu5xW75kFCvSl5a9odyQYCb6tEjnmB",
  },
  recharts: {
    src: "https://unpkg.com/recharts@2.15.0/umd/Recharts.js",
    integrity: "sha384-H15ZP78OvxlVElS6iYiDRT8299zdsy9sPHwz3Z6E6FagkYHICNdItER4Mr5nI8ty",
  },
} as const;

/** Served from the app's own origin; built by scripts/build-runtime-sandbox.mjs. */
export const SANDBOX_BUNDLE_PATH = "/runtime-sandbox.js";

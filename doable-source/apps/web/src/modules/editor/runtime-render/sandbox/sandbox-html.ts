import { CDN, SANDBOX_BUNDLE_PATH } from "./protocol";

/** JSON-encode for an inline <script>, so no value can close the tag early. */
function scriptLiteral(value: string): string {
  // U+2028/U+2029 are built with fromCharCode rather than written as escapes
  // or literal characters: both are line terminators inside a JS regex
  // literal, and a literal one silently breaks the file.
  const LS = String.fromCharCode(0x2028);
  const PS = String.fromCharCode(0x2029);
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .split(LS).join("\\u2028")
    .split(PS).join("\\u2029");
}

function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * The srcdoc for the runtime sandbox frame.
 *
 * srcdoc (not a blob: URL) because the app's CSP frame-src has no blob:; a
 * srcdoc document inherits the editor's CSP, whose script-src already allows
 * these CDNs and 'unsafe-eval'. Every third-party script carries SRI, so a
 * tampered CDN response is refused rather than executed.
 */
export function buildSandboxHtml(nonce: string, parentOrigin: string): string {
  const bundle = `${parentOrigin}${SANDBOX_BUNDLE_PATH}`;
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<style>html,body{margin:0;min-height:100%}body{background:#fff}.dark body{background:#09090b}</style>",
    `<script>window.__DOABLE_RUNTIME_NONCE__=${scriptLiteral(nonce)};window.__DOABLE_PARENT_ORIGIN__=${scriptLiteral(parentOrigin)};</script>`,
    `<script src="${attr(CDN.babel.src)}" integrity="${attr(CDN.babel.integrity)}" crossorigin="anonymous"></script>`,
    `<script src="${attr(CDN.tailwind.src)}" integrity="${attr(CDN.tailwind.integrity)}" crossorigin="anonymous"></script>`,
    `<script src="${attr(bundle)}"></script>`,
    '</head><body><div id="root"></div></body></html>',
  ].join("");
}

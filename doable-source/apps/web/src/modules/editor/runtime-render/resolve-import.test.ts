import { test } from "node:test";
import assert from "node:assert/strict";
import { extractImports, isLocalSpecifier, resolveImport } from "./resolve-import";

const FILES = new Set([
  "src/App.tsx",
  "src/main.tsx",
  "src/index.css",
  "src/lib/utils.ts",
  "src/components/stat-card.tsx",
  "src/components/layout/sidebar.tsx",
  "src/components/ui/index.ts",
  "src/data/items.json",
]);

test("extractImports: every value-import form", () => {
  const src = `
    import React from "react";
    import { a, b } from 'lucide-react';
    import * as C from "clsx";
    import "./index.css";
    import {
      Card,
      CardHeader,
    } from "@/components/ui";
    export { x } from "./re-export";
    export * from "./star";
    const lazy = import("./lazy-page");
    const req = require("tailwind-merge");
  `;
  assert.deepEqual(
    extractImports(src).sort(),
    ["./index.css", "./lazy-page", "./re-export", "./star", "@/components/ui", "clsx", "lucide-react", "react", "tailwind-merge"].sort(),
  );
});

test("extractImports: ignores type-only imports and commented-out code", () => {
  const src = `
    import type { Foo } from "./types";
    export type { Bar } from "./more-types";
    // import Dead from "./dead";
    /* import AlsoDead from "./also-dead"; */
    import Live from "./live";
  `;
  assert.deepEqual(extractImports(src), ["./live"]);
});

test("extractImports: URLs inside strings are not mistaken for comments", () => {
  const src = `const u = "https://example.com"; import Live from "./live";`;
  assert.deepEqual(extractImports(src), ["./live"]);
});

test("isLocalSpecifier", () => {
  for (const s of ["./a", "../a", "@/a", "/a"]) assert.equal(isLocalSpecifier(s), true, s);
  for (const s of ["react", "react-dom/client", "@scope/pkg", "lucide-react"]) assert.equal(isLocalSpecifier(s), false, s);
});

test("resolveImport: @/ alias maps to src/", () => {
  assert.equal(resolveImport("src/App.tsx", "@/lib/utils", FILES), "src/lib/utils.ts");
});

test("resolveImport: relative paths from nested files", () => {
  assert.equal(resolveImport("src/components/layout/sidebar.tsx", "../stat-card", FILES), "src/components/stat-card.tsx");
  assert.equal(resolveImport("src/App.tsx", "./components/stat-card", FILES), "src/components/stat-card.tsx");
});

test("resolveImport: directory index and explicit extensions", () => {
  assert.equal(resolveImport("src/App.tsx", "@/components/ui", FILES), "src/components/ui/index.ts");
  assert.equal(resolveImport("src/main.tsx", "./index.css", FILES), "src/index.css");
  assert.equal(resolveImport("src/App.tsx", "@/data/items.json", FILES), "src/data/items.json");
});

test("resolveImport: root-absolute specifier", () => {
  assert.equal(resolveImport("src/components/stat-card.tsx", "/src/lib/utils", FILES), "src/lib/utils.ts");
});

test("resolveImport: unknown files and escaping the project root return null", () => {
  assert.equal(resolveImport("src/App.tsx", "./nope", FILES), null);
  assert.equal(resolveImport("src/App.tsx", "../../../etc/passwd", FILES), null);
  assert.equal(resolveImport("src/App.tsx", "react", FILES), null);
});

test("extractImports: a side-effect import does not swallow later statements", () => {
  // Pattern for `import ... from` must not span past the side-effect
  // import's semicolon and latch onto an unrelated `from"` in a string.
  const src = `import "./side";\nconsole.log("from", 'x');\nimport Real from "./real";`;
  assert.deepEqual(extractImports(src), ["./side", "./real"]);
});

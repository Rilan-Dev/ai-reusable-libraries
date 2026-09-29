import { test } from "node:test";
import assert from "node:assert/strict";
import { collectModules } from "./collect-modules";

const DISK: Record<string, string> = {
  "src/App.tsx": `import { cn } from "@/lib/utils";\nimport StatCard from "./components/stat-card";\nimport { LineChart } from "recharts";\nexport default function App() { return null; }`,
  "src/lib/utils.ts": `import { clsx } from "clsx";\nimport { twMerge } from "tailwind-merge";\nexport const cn = () => "";`,
  "src/components/stat-card.tsx": `import { cn } from "@/lib/utils";\nimport { Missing } from "./does-not-exist";\nimport "./stat-card.css";\nexport default function StatCard() { return null; }`,
  "src/components/stat-card.css": `.x{}`,
  "src/a.ts": `import "./b";`,
  "src/b.ts": `import "./a";`,
  "src/index.css": `@import "tailwindcss";`,
  "package.json": `{}`,
};
const LIST = Object.keys(DISK);

function reader(log: string[]) {
  return async (path: string) => {
    log.push(path);
    const v = DISK[path];
    if (v === undefined) throw new Error(`404 ${path}`);
    return v;
  };
}

test("walks the local import graph and reports packages", async () => {
  const log: string[] = [];
  const r = await collectModules({ entry: "src/App.tsx", entrySource: DISK["src/App.tsx"]!, fileList: LIST, readFile: reader(log) });
  assert.deepEqual(Object.keys(r.files).sort(), [
    "src/App.tsx", "src/components/stat-card.css", "src/components/stat-card.tsx", "src/index.css", "src/lib/utils.ts",
  ]);
  assert.deepEqual(r.packages.sort(), ["clsx", "recharts", "tailwind-merge"]);
  assert.deepEqual(r.unresolved, ["./does-not-exist (from src/components/stat-card.tsx)"]);
  assert.equal(r.truncated, false);
});

test("uses the unsaved editor buffer for the entry instead of re-reading it", async () => {
  const log: string[] = [];
  const r = await collectModules({ entry: "src/App.tsx", entrySource: "export default () => null; // edited", fileList: LIST, readFile: reader(log) });
  assert.equal(r.files["src/App.tsx"], "export default () => null; // edited");
  assert.equal(log.includes("src/App.tsx"), false);
});

test("reads each shared dependency once", async () => {
  const log: string[] = [];
  await collectModules({ entry: "src/App.tsx", entrySource: DISK["src/App.tsx"]!, fileList: LIST, readFile: reader(log) });
  assert.equal(log.filter((p) => p === "src/lib/utils.ts").length, 1);
});

test("terminates on circular imports", async () => {
  const r = await collectModules({ entry: "src/a.ts", entrySource: DISK["src/a.ts"]!, fileList: LIST, readFile: reader([]) });
  assert.deepEqual(Object.keys(r.files).sort(), ["src/a.ts", "src/b.ts", "src/index.css"]);
});

test("stops at the file cap and says so", async () => {
  const many: Record<string, string> = {};
  for (let i = 0; i < 20; i++) many[`src/m${i}.ts`] = i < 19 ? `import "./m${i + 1}";` : "";
  const r = await collectModules({
    entry: "src/m0.ts", entrySource: many["src/m0.ts"]!, fileList: Object.keys(many),
    readFile: async (p) => many[p]!, maxFiles: 5,
  });
  assert.equal(Object.keys(r.files).length, 5);
  assert.equal(r.truncated, true);
});

test("a read failure is reported as unresolved rather than aborting", async () => {
  const r = await collectModules({
    entry: "src/App.tsx", entrySource: DISK["src/App.tsx"]!, fileList: LIST,
    readFile: async (p) => { if (p === "src/lib/utils.ts") throw new Error("boom"); return DISK[p]!; },
  });
  assert.ok(r.unresolved.some((u) => u.startsWith("src/lib/utils.ts")));
  assert.ok("src/App.tsx" in r.files);
});

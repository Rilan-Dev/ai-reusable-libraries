import { extractImports, isLocalSpecifier, resolveImport } from "./resolve-import";

export interface CollectInput {
  /** Root-relative path of the file being previewed. */
  entry: string;
  /** Current editor buffer for the entry — may hold unsaved edits. */
  entrySource: string;
  /** Every file path in the project (root-relative). */
  fileList: readonly string[];
  /** Fetches a project file's contents. */
  readFile: (path: string) => Promise<string>;
  /** Hard cap on files shipped to the sandbox. */
  maxFiles?: number;
}

export interface CollectedModules {
  files: Record<string, string>;
  /** Package specifiers imported anywhere in the collected code. */
  packages: string[];
  /** Local imports that could not be resolved or read, with their importer. */
  unresolved: string[];
  truncated: boolean;
}

const DEFAULT_MAX_FILES = 80;
const GLOBAL_STYLESHEET = "src/index.css";

/**
 * Breadth-first walk of the entry's local import graph.
 *
 * Only files the entry can actually reach are shipped to the sandbox, so a
 * large project does not send its whole tree on every keystroke. The
 * project's global stylesheet is always included even when unimported: a
 * leaf component opened on its own still needs the Tailwind theme that
 * main.tsx would normally load.
 */
export async function collectModules(input: CollectInput): Promise<CollectedModules> {
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const fileSet = new Set(input.fileList);
  const files: Record<string, string> = {};
  const packages = new Set<string>();
  const unresolved: string[] = [];
  const queued = new Set<string>([input.entry]);
  const queue: string[] = [input.entry];
  let truncated = false;

  while (queue.length > 0) {
    if (Object.keys(files).length >= maxFiles) {
      truncated = true;
      break;
    }
    const path = queue.shift()!;

    let source: string;
    try {
      source = path === input.entry ? input.entrySource : await input.readFile(path);
    } catch (err) {
      unresolved.push(`${path} (${err instanceof Error ? err.message : String(err)})`);
      continue;
    }
    files[path] = source;
    if (path.endsWith(".css") || path.endsWith(".json")) continue;

    for (const spec of extractImports(source)) {
      if (!isLocalSpecifier(spec)) {
        packages.add(spec);
        continue;
      }
      const resolved = resolveImport(path, spec, fileSet);
      if (!resolved) {
        unresolved.push(`${spec} (from ${path})`);
        continue;
      }
      if (!queued.has(resolved)) {
        queued.add(resolved);
        queue.push(resolved);
      }
    }
  }

  if (!truncated && fileSet.has(GLOBAL_STYLESHEET) && !(GLOBAL_STYLESHEET in files)) {
    try {
      files[GLOBAL_STYLESHEET] = await input.readFile(GLOBAL_STYLESHEET);
    } catch {
      /* optional */
    }
  }

  return { files, packages: [...packages], unresolved, truncated };
}

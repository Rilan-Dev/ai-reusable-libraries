import type { ExecutionContext } from "./core-types.js";

export interface FileEntry { path: string; type: "file" | "directory"; size?: number; }
export interface FileWorkspaceAdapter {
  list(context: ExecutionContext, path?: string): Promise<FileEntry[]>;
  read(context: ExecutionContext, path: string): Promise<string>;
  write(context: ExecutionContext, path: string, content: string): Promise<void>;
  delete(context: ExecutionContext, path: string): Promise<void>;
}
export interface ProcessExecutionAdapter {
  execute(context: ExecutionContext, command: string, args: string[], options?: { cwd?: string; timeoutMs?: number }): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}
export interface SandboxAdapter {
  execute(context: ExecutionContext, operation: "shell" | "build" | "install", request: unknown): Promise<unknown>;
}

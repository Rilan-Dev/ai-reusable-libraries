import type { ExecutionContext, ToolDefinition, ToolResult } from "./core-types.js";

export interface ToolRegistryAdapter {
  list(context: ExecutionContext): Promise<ToolDefinition[]>;
  invoke(context: ExecutionContext, toolName: string, input: unknown): Promise<ToolResult>;
}

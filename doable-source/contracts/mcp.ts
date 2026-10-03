import type { ExecutionContext, ToolDefinition, ToolResult } from "./core-types.js";

export interface MCPServer { id: string; name: string; transport: "http" | "stdio"; status?: string; metadata?: Record<string, unknown>; }
export interface MCPAdapter {
  listServers(context: ExecutionContext): Promise<MCPServer[]>;
  listTools(context: ExecutionContext, serverId: string): Promise<ToolDefinition[]>;
  callTool(context: ExecutionContext, serverId: string, toolName: string, input: unknown): Promise<ToolResult>;
}

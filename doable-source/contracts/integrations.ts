import type { ExecutionContext, ToolDefinition, ToolResult } from "./core-types.js";

export interface IntegrationDescriptor { id: string; name: string; category?: string; actions?: string[]; metadata?: Record<string, unknown>; }
export interface IntegrationConnection { integrationId: string; status: "connected" | "disconnected" | "error"; metadata?: Record<string, unknown>; }
export interface IntegrationAdapter {
  list(context: ExecutionContext): Promise<IntegrationDescriptor[]>;
  getConnection(context: ExecutionContext, integrationId: string): Promise<IntegrationConnection | null>;
  connect(context: ExecutionContext, integrationId: string, configuration: Record<string, unknown>): Promise<IntegrationConnection>;
  disconnect(context: ExecutionContext, integrationId: string): Promise<void>;
  listTools(context: ExecutionContext, integrationId: string): Promise<ToolDefinition[]>;
  invoke(context: ExecutionContext, integrationId: string, action: string, input: unknown): Promise<ToolResult>;
}

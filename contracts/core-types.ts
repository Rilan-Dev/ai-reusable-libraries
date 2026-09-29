export type TenantId = string;
export type UserId = string;
export type AgentId = string;
export type SessionId = string;
export type ProjectId = string;

export interface ExecutionContext {
  tenantId: TenantId;
  userId?: UserId;
  agentId?: AgentId;
  sessionId?: SessionId;
  projectId?: ProjectId;
  metadata?: Record<string, unknown>;
}

export interface ModelRef { providerId: string; modelId: string; }
export interface ToolDefinition { name: string; description?: string; inputSchema: unknown; }
export interface ToolResult { content: unknown; isError?: boolean; metadata?: Record<string, unknown>; }
export interface StreamEvent { type: string; data: unknown; }

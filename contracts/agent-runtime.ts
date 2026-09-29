import type { ExecutionContext, ModelRef, StreamEvent, ToolDefinition } from "./core-types.js";

export interface AgentDefinition {
  id: string;
  name: string;
  instructions?: string;
  model?: ModelRef;
  toolNames?: string[];
  skillNames?: string[];
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeRequest {
  context: ExecutionContext;
  agent: AgentDefinition;
  input: string;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
}

export interface AgentRuntimeAdapter {
  run(request: AgentRuntimeRequest): AsyncIterable<StreamEvent>;
}

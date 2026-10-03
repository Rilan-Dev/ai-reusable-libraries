import type { ExecutionContext } from "./core-types.js";

export interface RetrievedDocument { id: string; content: string; score?: number; metadata?: Record<string, unknown>; }
export interface RAGAdapter {
  retrieve(context: ExecutionContext, query: string, options?: { topK?: number }): Promise<RetrievedDocument[]>;
}
export interface ContextMemoryAdapter {
  build(context: ExecutionContext, input: string): Promise<string>;
  remember(context: ExecutionContext, key: string, value: unknown): Promise<void>;
  recall(context: ExecutionContext, key?: string): Promise<unknown[]>;
}

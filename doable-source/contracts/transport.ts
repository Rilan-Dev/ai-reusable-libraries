import type { ExecutionContext, StreamEvent } from "./core-types.js";

export interface ChatTransportAdapter {
  stream(context: ExecutionContext, events: AsyncIterable<StreamEvent>): Response | Promise<Response>;
}
export interface VoiceRealtimeAdapter {
  start(context: ExecutionContext, options: Record<string, unknown>): Promise<{ sessionId: string }>;
  stop(context: ExecutionContext, sessionId: string): Promise<void>;
}
export interface IdentityTenantAdapter {
  resolve(request: unknown): Promise<Pick<ExecutionContext, "tenantId" | "userId">>;
}
export interface SecretCredentialAdapter {
  get(context: ExecutionContext, key: string): Promise<string | null>;
}

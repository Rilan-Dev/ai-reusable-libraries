import type { ExecutionContext, ModelRef } from "./core-types.js";

export interface ProviderDescriptor { id: string; name: string; models?: string[]; capabilities?: string[]; }
export interface ProviderConnection { providerId: string; configuration: Record<string, unknown>; }

export interface ProviderRegistryAdapter {
  list(context: ExecutionContext): Promise<ProviderDescriptor[]>;
  getConnection(context: ExecutionContext, providerId: string): Promise<ProviderConnection | null>;
  testConnection(context: ExecutionContext, providerId: string): Promise<{ ok: boolean; message?: string }>;
}

export interface ProviderResolverAdapter {
  resolve(context: ExecutionContext, requested?: ModelRef): Promise<ModelRef>;
}

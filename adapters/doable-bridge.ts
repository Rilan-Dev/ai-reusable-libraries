import type { AIPlatformAdapters } from "./adapter-registry.js";
import type { ExecutionContext, ToolDefinition, ToolResult } from "../contracts/index.js";
export interface DoableRuntimeBridge { createAdapters(): AIPlatformAdapters; buildExecutionContext(input: unknown): Promise<ExecutionContext>; normalizeToolDefinition(input: unknown): ToolDefinition; normalizeToolResult(input: unknown): ToolResult; }
export function createDoableCompatibilityBridge(bridge: DoableRuntimeBridge): DoableRuntimeBridge { return bridge; }

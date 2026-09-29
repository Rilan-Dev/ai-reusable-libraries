# AI Platform Core — Adapter Architecture

The reusable core exposes stable contracts. Doable remains the captured runtime implementation behind a compatibility boundary; no copied Doable source is edited.

## Runtime path

Agent Runtime → Provider Resolver → Tool Registry → MCP → Integrations → Context/Memory → Workspace → Sandbox/Processes → Chat Transport

### Doable bindings

| Core adapter | Doable runtime capability | Boundary |
|---|---|---|
| AgentRuntimeAdapter | services/api/src/ai/engine.ts + chat orchestration | host supplies an agent-run function |
| ProviderRegistryAdapter / Resolver | provider catalog, provider configuration and provider bridge routes | host supplies provider discovery/configuration |
| ToolRegistryAdapter | services/api/src/ai/tools/index.ts | host supplies list/invoke |
| MCPAdapter | services/api/src/mcp/connector-manager.ts and MCP exports | host supplies connector discovery/calls |
| IntegrationAdapter | services/api/src/integrations/index.ts and registry | host supplies catalog/connections/actions |
| ContextMemoryAdapter | services/api/src/context/manager.ts | host supplies persistence/tenant mapping |
| FileWorkspaceAdapter | project file/runtime path layer | host owns filesystem root and authorization |
| ProcessExecutionAdapter | subprocess/runtime layer | host owns process policy |
| SandboxAdapter | services/api/src/sandbox/orchestrator.ts | host owns kernel/container/UID/security policy |
| ChatTransportAdapter | services/api/src/routes/chat | host owns HTTP/SSE/WebSocket transport |
| RAGAdapter | Doable context/retrieval boundary | host chooses Qdrant/pgvector/etc. |
| SecretCredentialAdapter | Doable credential/vault boundary | host owns encryption, KEK and secret storage |
| VoiceRealtimeAdapter | no Doable-native assumption | host-specific realtime implementation |

## Why the binding layer exists

The adapter implementation is deliberately dependency-injected. This keeps reusable contracts free of Doable database clients, filesystem paths, authentication/RLS, environment variables, subprocess assumptions, MCP credential storage, and RAG-provider assumptions.

## Adapter lifecycle

1. Resolve identity and tenant.
2. Build an ExecutionContext.
3. Resolve the requested provider/model.
4. Discover effective tools, MCP tools and integration actions.
5. Build context/memory and optional RAG retrieval.
6. Run the agent runtime.
7. Execute workspace/process/sandbox operations through adapters.
8. Stream normalized StreamEvent values through the host transport.
9. Persist memory/audit/usage through host-owned adapters.

## Fail-closed boundary

Adapters must not silently invent credentials, tenant identity, project paths, or security policy. Missing required bindings should fail during registration/validation rather than at an arbitrary UI action.

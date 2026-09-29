# Second-Order Dependency Audit

Status: Phase 2 — second-order dependency audit complete
Branch: ai-platform-core-extraction
Captured Doable source commit: a6036d1fd6dca83c08ee5affa141e5c85e45f5af

## Scope

This pass audits the dependency closure already captured under `ai-platform-core/` and follows the runtime assumptions one level further: package dependencies, operating-system services, environment/configuration, database/schema, filesystem/project layout, subprocesses, Copilot runtime, authentication/tenant identity, MCP/network access, secrets/crypto, integrations, and application RAG.

The immutable-copy rule remains unchanged. No copied Doable source was edited.

## Findings

| Area | Dependency / assumption | Classification | Extraction decision |
|---|---|---|---|
| Agent engine | `@github/copilot-sdk` | Infrastructure requirement | External runtime dependency; keep behind future provider/engine adapter |
| Copilot runtime | GitHub Copilot CLI / `@github/copilot` + per-project CLI subprocess | Host adapter + infrastructure requirement | Not portable source; host supplies CLI executable/auth/runtime |
| AI provider config | Provider/model/account resolution stored in Doable SQL tables | Host adapter | Future ProviderRegistry/ProviderResolver owns persistence mapping |
| OpenAI-compatible provider bridge | Doable compatibility route | Doable-only | Already isolated as immutable C coupling; replace with adapter |
| Database client | `postgres` / PostgreSQL | Infrastructure requirement | Host supplies SQL backend and connection |
| Doable DB package | `@doable/db` query functions and schema | Host adapter | Closure copied for characterization; future contract maps core persistence to host |
| Database schema | Workspaces, projects, users/auth, AI settings/providers, Copilot accounts, credits, integrations, MCP connectors, environments, skills/context, traces/usage, sandbox settings and related tables | Host adapter / Doable-only | Do not make these tables the universal core contract |
| Filesystem | `DOABLE_PROJECTS_DIR` or cwd/`projects`, projectId directory layout, local file CRUD | Host adapter | Future FileWorkspaceAdapter supplies root/path semantics |
| Project templates | Built-in Doable templates and scaffold definitions | Doable-only | Newly copied exactly because file-manager has a hard source dependency |
| Framework registry | Vite/Next framework adapters, install/build/dev assumptions | Host adapter | Future Framework/Workspace adapter |
| Git | Git CLI, local `.git`, Doable git initialization/operations | Host adapter + infrastructure requirement | Newly copied exactly because file-manager depends on git init; not part of universal AI core |
| Runtime process control | Node child processes, process supervisor, ports, dev servers, caddy, UID allocation | Host adapter + infrastructure requirement | Newly copied exactly as a closure dependency; adapterize before host reuse |
| Linux hardening | `sudo`, `setpriv`, bubblewrap/namespaces, nftables, `/opt/doable/bin/sandbox-spawn`, per-project UIDs | Host adapter + infrastructure requirement | Runtime capability supplied by host; Doable paths are not universal |
| Windows sandbox | Windows process/job/ACL assumptions in sandbox runtime | Host adapter + infrastructure requirement | Capability-based adapter required |
| Secrets | Doable KEK/envelope crypto, environment-seeded secrets, encrypted DB credentials | Host adapter | Future Secret/Credential adapter supplies key material and storage |
| Authentication | Doable auth middleware, project/workspace access, signed sessions, RLS identity | Host adapter | Future Identity/Tenant adapter; core must not depend on Doable user/session tables |
| Tenant context | `workspaceId`, `projectId`, `userId` propagated through AI/tool/MCP/integration paths | Host adapter | Normalize to host-neutral execution context |
| MCP | HTTP/stdio transports, connector configs, OAuth/auth credentials, tool schemas | Portable dependency + host adapter | Protocol/tool model is portable; credential storage, connector policy and network execution are host-provided |
| MCP network security | Outbound HTTP, URL validation/SSRF controls, auth headers, connector lifecycle | Host adapter + infrastructure requirement | Host owns network policy and egress controls |
| Integrations | Activepieces framework plus a very large catalog of `@activepieces/piece-*` packages | Portable dependency when enabled + host adapter | Do not copy every third-party package into core; load integrations through IntegrationAdapter |
| Email/billing/product services | Nodemailer, Stripe, Cloudflare and similar product services | Doable-only / host adapter | Not required for the universal AI execution core |
| Per-app database | PGlite + vector extension, Unix socket/Named Pipe worker, bwrap jail | Host adapter + infrastructure requirement | Portable data-plane concept; actual worker process, storage path and sandbox are host capabilities |
| Embeddings/RAG | Doable AI embedding abstractions and generated-app pgvector recipe | Portable dependency | Core exposes RAG/embedding contracts; host may use Qdrant, pgvector or another store |
| Clara RAG | Qdrant knowledge base | Host adapter | Remains outside the copied Doable core; no replacement with Doable pgvector |
| Streaming | Hono/Node HTTP streaming, SSE/event mapping, Yjs bridge | Portable dependency + host adapter | Protocol/event concepts portable; HTTP/session/collaboration transport host-owned |
| Environment | `process.env` values such as database URL, Copilot model/CLI path/URL, project root, KEK, sandbox toggles and provider configuration | Host adapter / infrastructure requirement | Convert to explicit runtime configuration contract; no env reads in future adapters' public API |
| Subprocess execution | `git`, package installers, dev servers, build tools, Python tools and Copilot CLI | Host adapter + infrastructure requirement | Capability interface with allowlist/timeouts/resource policy |
| Object storage | S3/cloud storage appears through integration ecosystem rather than universal AI runtime | Host adapter | Not a core requirement; supplied by integrations/storage adapter when needed |
| Redis/RabbitMQ | No direct Redis/RabbitMQ dependency was found in the inspected API package dependency list | Not currently required by this closure | Do not add speculative dependencies; verify per host deployment separately |
| Third-party npm runtime | Hono, Zod, postgres, PGlite, argon2, nodemailer, Stripe, Copilot SDK and related packages | Portable dependency or infrastructure requirement depending on capability | Keep package-level dependencies explicit; host adapters isolate service-specific packages |

## Newly identified source-level closure

The existing closure contained `services/api/src/projects/file-manager.ts`, which imports source outside the prior copied directories. To make the snapshot internally complete without changing that file, the following original Doable trees were copied by Git object identity into:

`ai-platform-core/dependency-closure/services/api/src/`

- `templates` — original tree SHA `1289c0ae29d5dc893c6f2db5c80b893f177b1e52`
- `git` — original tree SHA `830aa877f377e78e9e1df3703ec4ebe8d2158846`
- `runtime` — original tree SHA `ae8aa7c249b90eaf6dd66ec82d5d47021d2aeb79`

These trees are unchanged source snapshots. They are closure dependencies, not endorsements of Doable-specific architecture.

## Important second-order observations

### 1. Copilot is a runtime boundary, not the platform identity

`docore` directly depends on `@github/copilot-sdk`, while the API manager configures a Copilot CLI path/URL and optional GitHub token. Therefore the universal core must model an agent-engine capability rather than treating GitHub Copilot as the only provider.

### 2. The current AI execution path is deeply persistence-aware

The resolver and tool loader directly query Doable tables for workspace, project, AI settings, provider credentials, MCP connectors and integration state. The copied DB package is therefore useful as a ground-truth compatibility snapshot, but its schema must not become the public host-neutral contract.

### 3. Filesystem and process execution are the largest host boundary

The AI writes directly to project directories, installs packages, starts dev servers/builds, initializes Git, and may execute shell commands under a sandbox. This is portable as a capability model, but the implementation is inherently host-specific.

### 4. Sandbox security is capability-based infrastructure

The Doable implementation assumes Linux primitives (`setpriv`, sudo wrapper, UID ranges, nftables and sandbox-spawn) and has separate platform backends. The adapter layer must expose security capabilities and fail closed when a required capability is unavailable.

### 5. MCP is protocol-portable but execution-policy-specific

MCP tool discovery, schemas and invocation are reusable. Connector credentials, OAuth, network egress, SSRF protection, process spawning for stdio servers, and tenant scoping belong to the host.

### 6. RAG remains deliberately outside the Doable storage contract

The platform core should define retrieval/indexing/embedding interfaces. Clara can continue using Qdrant; another host can use pgvector or another vector database without changing immutable Doable source.

## Adapter boundary implied by this audit

Before implementation, the minimum host-neutral boundary is:

1. `IdentityTenantAdapter`
2. `PersistenceAdapter`
3. `ProviderRegistryAdapter`
4. `AgentEngineAdapter`
5. `ToolRegistryAdapter`
6. `MCPAdapter`
7. `IntegrationAdapter`
8. `FileWorkspaceAdapter`
9. `ProcessExecutionAdapter`
10. `SandboxAdapter`
11. `FrameworkRuntimeAdapter`
12. `SecretCredentialAdapter`
13. `ContextMemoryAdapter`
14. `RAGAdapter`
15. `ChatTransportAdapter`
16. `VoiceRealtimeAdapter`

These contracts should be implemented outside the immutable copied trees. No adapter should modify the captured Doable source.

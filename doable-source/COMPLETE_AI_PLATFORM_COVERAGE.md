# AI Platform Core — Completeness Audit

Audit target: `Rilan-Dev/Doable` at `develop` / `a6036d1fd6dca83c08ee5affa141e5c85e45f5af`.

## Result

The **headless AI/runtime extraction is source-complete for the requested Doable AI platform domains** represented by the captured source trees and dependency closure.

The **UI/UX reference layer is now expanded to cover the missing agent/chat/tool-call interaction surfaces** in addition to provider, integration, MCP, skills, workspace and settings surfaces.

No Doable source is modified. Host implementations remain outside the immutable/reference areas.

## Domain-by-domain audit

### 1. AI providers

Captured:
- `services/api/src/ai/**`
- `packages/shared/src/ai/**`
- `packages/doable-ai/**`
- provider discovery/validation/bridge routes

This includes the generic LLM interface, provider implementations, Copilot engine/bridge, BYOK/OpenAI-compatible flow, Anthropic provider, provider discovery, model discovery and the complete provider catalog/data tables.

The provider catalog is intentionally broader than a single vendor: cloud-major, cloud-specialized, regional, infrastructure and local-engine/frontend provider definitions are in the captured shared AI package.

### 2. Agents and agent runtime

Captured:
- AI engine
- agent mode
- plan mode
- chat mode
- streaming event generation
- tool-calling loop
- retries/limits
- session/chat orchestration
- Copilot engine and tool loader

### 3. Tools and tool calling

Captured:
- tool registry and definitions
- built-in file/build/search/install/planning tools
- tool execution/error handling
- tool-call stream events
- agent tool loop
- Copilot tool bridge
- MCP-to-tool bridge
- integration-to-tool bridge
- user-input blocking/resume path

### 4. Integrations and integration calling

Captured:
- integration types
- merged registry
- generated/curated integration catalogs
- credential vault
- OAuth2
- enhanced authentication
- runners
- tool bridge
- catalog/connections/admin/OAuth routes

Doable's integration registry also consumes external integration pieces. Those third-party package implementations are not silently duplicated into the core; the reusable registry/runner/credential/tool-bridge contract is captured and the external piece packages remain installable host dependencies.

### 5. MCP and MCP calling

Captured:
- MCP types
- transports
- clients
- connector manager
- discovery
- tool bridge
- MCP app/UI-resource side channel
- built-in connector provisioning
- SSRF/network/process security boundaries
- MCP routes

Built-in connector definitions include Presentation Builder, Spreadsheet Builder, Markdown Builder, PDF Builder and NotebookLM. Their separate server packages are host/infrastructure dependencies and are not confused with the MCP core protocol/bridge.

### 6. Plugins

Doable's plugin-like extension model is represented primarily by:
- Activepieces integration pieces
- generated integration registry
- built-in MCP connectors/MCP Apps
- MCP tool discovery/bridge
- skills

The platform core therefore captures the **plugin runtime and invocation boundary**, rather than vendoring every third-party plugin package into an immutable Doable snapshot.

### 7. Skills and rules

Captured:
- skill runtime
- skill materializer
- scoped skills
- skill files
- progressive loading
- rules/settings routes
- picker/panel UX
- workspace/project/user scope semantics

### 8. AI chat

Captured:
- chat route orchestration
- SSE/streaming
- session state
- tool callbacks
- stream recovery
- event processing
- user-input requests
- SDK streaming chat client
- synchronous chat helper
- MCP agent helper
- thinking-tag streaming helpers

### 9. Context / memory / RAG boundary

Captured:
- context manager
- context injection
- workspace/project context
- memory append/recall
- context routes
- retrieval-facing AI boundaries

The actual vector store is correctly classified as host-specific. A future host can bind Qdrant, pgvector, another vector DB, or another retrieval service without changing the captured Doable source.

### 10. Workspace / sandbox / execution

Captured:
- project filesystem dependencies
- build/dev runtime
- process execution
- Git runtime
- sandbox orchestrator/profiles/rules
- data-worker
- required DB/auth/secret/config closure

These are reusable capabilities but host-bound security/infrastructure. They are not treated as portable credentials or tenant policy.

## UI/UX audit

Captured reference areas:
- AI settings and provider configuration
- provider connection/wizard/model/access-control surfaces
- integrations catalog/card/connect/OAuth/detail drawer
- MCP panel/add-server
- skills panel/picker/rules
- workspace knowledge
- project settings
- setup flows
- dashboard destructive/configuration dialogs
- editor chat panel
- chat message/streaming renderer
- tool-call card
- agent blocking user-input card
- editor chat/session state store
- dashboard voice-input surface

The UI capability matrix maps these surfaces to the runtime capabilities and explicitly preserves loading, empty, validation, saving, success, error, permission, disconnected, retry, destructive-confirmation, streaming, tool-execution and blocked-user-input states.

## Isolation rule

The reusable package has four different layers and they must not be mixed:

1. **Immutable Doable source** — exact copied runtime/source trees.
2. **Dependency closure** — exact source required to execute those capabilities.
3. **UI reference** — exact Doable UI source used for interaction-model reuse.
4. **Host adapters/contracts** — new code that translates another project into the core.

A host must never modify layer 1, 2 or the captured UI reference to make its own product work.

## Before any real host integration

The next phase should be verification/package-hardening, not host wiring:

1. verify every captured tree/blob SHA against the Doable source commit;
2. verify UI reference additions against their source blobs;
3. generate a machine-readable capability manifest;
4. identify external runtime dependencies that must be installed by a host;
5. add import/build smoke checks for the extracted packages;
6. only after those checks pass, resume Clara/Dynamic UI/NexaHub adapters.

This audit deliberately does **not** claim that third-party integration piece source or host-specific realtime voice implementations are part of Doable's own immutable source. Those remain explicit external/host boundaries.

## Newly promoted reusable capability: Marketplace / AI asset distribution

The extraction also includes the immutable `@doable/marketplace-bundle` package at `doable-source/packages/marketplace-bundle/`. It provides the canonical bundle manifest plus JSON and Standards ZIP codecs, permission classification, moderation signaling, skills/rules/instructions/knowledge packaging, and MCP connector declarations.

This is important for downstream AI projects because reusable AI behavior is not limited to runtime inference: projects can package and move skills, rules, knowledge, instructions, and connector declarations between environments without copying credentials.

See `capabilities/marketplace/MANIFEST.md`.

## Newly identified standalone AI capability: NotebookLM

A second-pass audit found a separate AI product integration outside the previously captured `services/api/src/mcp` runtime: `mcp-servers/notebooklm/server/`.

It is now preserved under `doable-source/mcp-servers/notebooklm/server/` and registered as `capabilities/notebooklm/MANIFEST.md`. This includes the actual NotebookLM client, native browser transport, Playwright transport, multi-user cookie manager, MCP server, MCP App UI, async infographic jobs, reauthentication and human-input/disambiguation behavior.

This is intentionally optional: it should be reused when a host needs NotebookLM-specific research/knowledge tooling, while the generic MCP runtime remains the platform abstraction.

## Realtime AI collaboration extension

The second-pass audit identified `services/ws/` as a separate reusable capability rather than generic infrastructure. The preserved source now includes the complete WS service closure: rooms, presence, team chat, Yjs CRDT synchronization, AI stream/tool events, AI-originated CRDT file writes, visual editing, design comments, internal API bridges, and WS tracing.

See `capabilities/realtime-collaboration/MANIFEST.md`. This extension is intentionally kept outside the generic AI runtime because it transports AI execution into a multi-user collaborative workspace.

## AI document-generation extensions

Doable also contains standalone MCP Apps for PDF, presentations, spreadsheets and Markdown. Their complete source is preserved under `doable-source/mcp-servers/{pdf-builder,presentation-builder,spreadsheet-builder,markdown-builder}/` plus `doable-source/mcp-servers/_shared/ui.mjs`. These are separate from the generic MCP runtime because they implement concrete AI content-generation products.

## Realtime AI collaboration and visual editing

The extraction now includes Doable's standalone realtime service and the corresponding UI/reference implementation:
- `doable-source/services/ws/`
- `ui-reference/apps/web/src/modules/collaboration/`
- `ui-reference/apps/web/src/modules/editor/visual-edit/`

This covers AI stream/tool-event propagation over WebSocket, project rooms, presence, Yjs/CRDT synchronization, collaborative AI chat, preview synchronization, visual editing property panels, iframe bridging, and design comments/sticky-note workflows.

## Standalone AI capability extensions

The extracted core now also preserves complete standalone MCP product servers under `doable-source/mcp-servers/`: image generation, Markdown/document building, NotebookLM, PDF generation, presentations and spreadsheets, plus their shared MCP UI helpers.

The extraction also preserves the realtime collaboration service and editor-side visual AI editing/runtime/context/build modules. These are separate extensions because they have additional host boundaries, but they are part of the reusable Doable-derived AI platform source inventory.

## Second-pass platform extensions

The requested platform-wide AI-enabling and product capabilities are now preserved as immutable optional extensions in `doable-source-extensions/`.

This includes the complete WS/Yjs collaboration service and collaboration UI; visual editing/runtime/build/editor UX; AI usage/credits/quotas; tracing and admin trace UI; audit logs and admin audit UI; analytics; authentication/MFA/OAuth/RLS/workspace roles; GitHub project workflow; version/diff/restore; deployment and custom-domain helpers; marketplace backend/UI/data-query source; notifications; email providers/templates/queue; billing/plans; and reusable admin/settings/dashboard/editor UI.

The extraction deliberately keeps these separate from the host-neutral AI runtime. A target project can copy the complete extension source and selectively bind its host-specific identity, database, secrets, OAuth, billing, email, domain, deployment and realtime infrastructure.

Doable's public architecture also identifies real-time collaboration, AI-powered development, built-in document-builder MCP servers, multi-tenant RBAC, audit logging, quotas, custom domains and self-hosted deployment as first-class product capabilities. citeturn3search0

## Second-pass extension coverage

The extraction now also preserves these complete Doable-derived reusable extensions:

- Realtime AI collaboration: WebSocket rooms, Yjs/CRDT, presence, AI stream/tool synchronization, team chat, preview/file-tab synchronization.
- AI + visual editing: iframe bridge, property editors, design comments, visual-edit collaboration, editor runtime, code editor, build/preview, clarification/plan UI, version diff/restore, GitHub and deployment UI.
- AI media/document builders: image generator, Markdown builder, PDF builder, presentation builder, spreadsheet builder, shared MCP UI infrastructure.
- AI observability and audit-supporting infrastructure: analytics, tracing, redaction, sampling, retention, logging and usage services.
- AI project lifecycle: project routes, scaffold/file CRUD/dev-server routes, runtime/framework/template dependencies, build-event infrastructure, direct-save transforms.
- GitHub AI/project workflow: GitHub client/sync/webhooks/project routes and editor UI.
- Version control/diff/restore: backend version-control source and editor history/diff/restore UX.
- Platform services: authentication/MFA/OAuth, usage/credits/plans, billing UI, notifications/email administration, custom domains/deployment, marketplace/moderation, environments/workspaces.
- NotebookLM: standalone NotebookLM MCP source and MCP App.
- Marketplace bundle: portable skills/rules/instructions/knowledge/MCP connector packaging.

Host-specific infrastructure remains preserved where useful but explicitly marked as adapter boundaries rather than silently removed.



## Requested checklist closure

All requested platform capabilities are now explicitly indexed in SOURCE_COVERAGE_MATRIX.md and promoted under capabilities/platform-foundation/MANIFEST.md where they cross the AI/runtime boundary. This includes authentication/tenant/RBAC, PostgreSQL schema, secrets/KEK, OS/container infrastructure, Activepieces, billing/subscriptions, notifications/email, analytics, GitHub/versioning, deployment/domains and realtime collaboration in addition to the previously extracted AI capabilities.

The source remains additive: existing immutable Doable trees are not rewritten or deduplicated. Reusable platform source is referenced from the canonical capability manifests so downstream projects copy the complete implementation closure without losing source provenance.


## AI security scanner

The reusable source now includes Doable's project security scanner and route closure:

- `doable-source/services/api/src/security/scanner.ts`
- `doable-source/services/api/src/security/scanner-patterns.ts`
- `doable-source/services/api/src/routes/security.ts`
- security DB query/migration closure under `dependency-closure/packages/db/`

This capability is intended for AI-generated code/project workflows: scan generated changes for dependency vulnerabilities, hardcoded secrets and common security anti-patterns before publication/deployment. The host must provide the project-path, process, database and authorization boundaries.

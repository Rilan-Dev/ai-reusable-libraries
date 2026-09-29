# AI Platform Core Extraction Manifest

## Immutable source rule

The Doable source snapshot and copied UI reference trees are immutable reference material. Do not edit, reformat, rename, refactor, optimize, or fix copied Doable source. Host-specific behavior belongs in adapters and compatibility layers.

## Captured source baseline

- Source repository: `Rilan-Dev/Doable`
- Source ref: `develop`
- Captured source commit: `a6036d1fd6dca83c08ee5affa141e5c85e45f5af`
- Extraction branch: `ai-platform-core-extraction`

## Requested reusable AI-platform capabilities

| Capability | Exact extracted source boundary | Status |
|---|---|---|
| AI provider abstractions and provider implementations | `doable-source/services/api/src/ai` + `doable-source/packages/shared/src/ai` + `doable-source/packages/doable-ai` | captured |
| Provider catalog/model metadata/discovery/validation | `doable-source/services/api/src/ai/provider-discovery*`, provider routes, shared provider catalog/data | captured |
| Agent engine and agent modes | `doable-source/services/api/src/ai/engine.ts`, `ai/modes/*`, provider/Copilot engine files | captured |
| Tool registry, definitions, execution and tool-calling loop | `doable-source/services/api/src/ai/tools`, `ai/modes/agent.ts`, Copilot tool loader/bridge | captured |
| Planning / plan execution / clarification | `doable-source/services/api/src/ai/modes/plan.ts`, plan tools/routes and context dependencies | captured |
| MCP protocol, transports, clients, connectors, discovery and tool bridge | `doable-source/services/api/src/mcp` + MCP routes | captured |
| Native integrations, catalog, connections, OAuth, enhanced auth, credential vault and tool bridge | `doable-source/services/api/src/integrations` + integration routes | captured |
| Skills, rules, scopes, progressive loading and materialization | `doable-source/services/api/src/ai/skills*`, context/skill dependencies and skills routes | captured |
| AI chat/session/streaming/events/tool callbacks/recovery | `doable-source/services/api/src/routes/chat` + AI streaming/session dependencies | captured |
| Context/memory/injection/budgeting | `doable-source/services/api/src/context` + context routes | captured |
| Workspace/project file operations and build/search/install tools | AI tools + projects/runtime/framework/git dependency closure | captured |
| Sandbox/isolation/process execution | `doable-source/services/api/src/sandbox`, runtime/git/framework/project closure | captured |
| SDK/client-side AI chat, embeddings and MCP agent helper | `doable-source/packages/doable-ai` and `doable-source/packages/doable-sdk` | captured |
| Shared AI types/catalogs | `doable-source/packages/shared` | captured |
| Core utility/secret packages | `doable-source/packages/docore`, `dovault`, shared/lib closure | captured |
| Required DB/auth/config compatibility dependencies | `dependency-closure/*` | captured as host-bound dependencies |
| AI/provider/settings/integration/MCP/skills/workspace UI | `ui-reference/apps/web/src/modules/*` and setup/workspace pages | captured |
| Agent/chat/tool-call UI and streaming interaction model | `ui-reference/apps/web/src/modules/editor/chat/*` plus editor state store and dashboard chat input | captured |
| Voice/realtime UI | Doable has no single native realtime voice UI equivalent; host voice UI remains an adapter concern | intentionally host-bound |
| AI security scanner | `doable-source/services/api/src/security/` + `doable-source/services/api/src/routes/security.ts` + DB security closure | captured |

## Important distinction: reusable code vs host bindings

The extraction is not a new standalone product implementation. It is a **portable source library/reference** plus contracts and adapters.

- `doable-source/` is exact Doable source.
- `dependency-closure/` contains exact source required by that runtime but coupled to DB/filesystem/process/security infrastructure.
- `ui-reference/` contains exact Doable UI source used as the interaction-model reference.
- `contracts/` defines the host-neutral seam.
- `adapters/` translates a host into that seam.

A future host must not edit copied source to make it fit. It binds identity, tenancy, credentials, providers, RAG, persistence, filesystem, process execution, sandboxing and transport through adapters.

## Completeness rule

No host project should be treated as the next implementation target until the requested AI-platform source and UX domains above are present and the verification record confirms:

1. exact source commit is recorded;
2. immutable backend trees are present;
3. dependency closure is present;
4. provider catalog + provider implementations are present;
5. agent/tool/MCP/integration/skills/chat code is present;
6. relevant UI reference source is present;
7. capability matrix maps UI surfaces to runtime capabilities;
8. no copied source is modified by host integration work.

## Verification boundary

The original Doable source ref remains untouched. All extraction and reference additions are under `ai-platform-core/`. Host implementations belong in their own repositories.


## Copy-ready feature implementation contract

The extraction is intentionally usable as a source library for Codex.

A target project may copy the entire `ai-platform-core/` directory and request one capability using the corresponding manifest under `capabilities/`. The manifest identifies the complete source boundaries that must be inspected; it is not a code snippet.

Examples:
- complete multi-provider AI → `capabilities/multi-provider/MANIFEST.md`
- complete integrations → `capabilities/integrations/MANIFEST.md`
- agents → `capabilities/agents/MANIFEST.md`
- tools/tool calling → `capabilities/tools/MANIFEST.md`
- MCP → `capabilities/mcp/MANIFEST.md`
- skills → `capabilities/skills/MANIFEST.md`
- AI chat → `capabilities/chat/MANIFEST.md`

Codex must follow imports/dependencies recursively and implement the feature through host adapters rather than modifying the immutable source. This is what makes the folder a reusable AI core rather than a documentation-only reference.

## Package-hardening artifacts

- `COPY_TO_ANY_PROJECT.md`
- `external-dependencies/source-manifests/`
- `external-dependencies/external-dependencies.json`
- `external-dependencies/generate-external-dependencies.mjs`
- `verification/verify-extraction.mjs`
- `verification/completeness-report.json`
- `verification/source-and-ui-manifest.json`

The verifier can run in the original Git checkout for Git tree/blob identity checks or after copying into another repository for filesystem/key-blob/structure checks.

## Package-hardening status

The extraction is now pinned by a complete immutable provenance manifest at `verification/immutable-source-manifest.json`.

- **802/802 immutable files** have expected Doable baseline blob SHAs and modes recorded.
- **93/93 captured immutable tree roots** match their baseline Git tree SHAs.
- The current extraction contains **121/121 captured directory trees** and **0 blob mismatches** and **0 missing baseline files** against Doable commit `a6036d1fd6dca83c08ee5affa141e5c85e45f5af`.
- `verification/verify-extraction.mjs` validates the complete file inventory, every immutable blob, captured tree roots, required manifests, and feature manifests.
- `external-dependencies/external-dependencies.json` now inventories package dependencies across the captured package manifests, including **573 external npm packages**, **526 Activepieces packages**, **6 workspace packages**, peer dependencies, package overrides, and build-time packages.
- Runtime installation/build verification remains a target-project responsibility after copying the core into the host repository.

## Second-pass promoted source families

The immutable extraction additionally includes:

- Complete standalone MCP servers under `doable-source/mcp-servers/`:
  - `_shared`
  - `image-generator`
  - `markdown-builder`
  - `notebooklm`
  - `pdf-builder`
  - `presentation-builder`
  - `spreadsheet-builder`
- Complete realtime collaboration service under `doable-source/services/ws/`.
- Complete editor visual-AI/runtime/context/build source under `doable-source/apps/web/src/modules/editor/` for the promoted submodules:
  - `visual-edit`
  - `runtime-render`
  - `context-files`
  - `build`

All are pinned to the original Doable Git tree/blob identities. They are optional extensions around the generic AI core and retain their host-boundary contracts.

### Second-pass platform extension source families

The extraction now additionally preserves the requested non-core platform capabilities under `doable-source-extensions/`, with immutable Git tree identities recorded in `verification/immutable-source-manifest.json`.

- realtime collaboration / Yjs / team chat / presence
- visual AI editing and editor runtime UX
- usage, credits, quotas and billing
- tracing / observability and trace administration
- audit trail / admin audit UX
- analytics
- authentication / MFA / OAuth / RLS / workspace roles
- GitHub account/OAuth/project synchronization
- version control / versions / restore
- deployment / custom domains / Cloudflare/Caddy domain helpers
- marketplace API, moderation, discovery/listing UI and marketplace data queries
- notifications
- email providers, templates, queue and admin email configuration
- reusable editor panels/components/toolbar
- reusable admin/settings/billing/usage/workspace/dashboard UI

These are reusable platform extensions, not replacements for the host-neutral AI contracts. Their persistence, identity, security, payment, email, domain and deployment bindings remain host-specific.


## Universal agent implementation guide

- `IMPLEMENTATION_PLAYBOOK.md` — deterministic workflow for Codex/Claude Code/Clodex/other coding agents to inspect a capability, map host boundaries, implement adapters, integrate runtime/API/UI/persistence, and verify the result.
- `COPY_TO_ANY_PROJECT.md` — copy/integration contract and ready-to-use request patterns.

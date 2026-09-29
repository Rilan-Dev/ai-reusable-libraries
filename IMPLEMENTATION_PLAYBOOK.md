# AI Platform Core — Implementation Playbook

This folder is intended to be copied into an existing project and used as an implementation source by Codex, Claude Code, Clodex or another coding agent.

## Golden rule

Treat `ai-platform-core/` as a **reference implementation + dependency map**, not as a drop-in package that can be blindly copied into the target application.

Preserve the immutable source. Integrate the behavior into the target project's architecture.

## Agent execution protocol

### 1. Inspect the target project first

Identify:

- framework/runtime
- package manager
- backend/API framework
- database and migration system
- authentication/tenant model
- secret storage
- storage/filesystem
- realtime transport
- existing AI/provider abstraction
- existing MCP/integration system
- existing billing/usage model
- test/build/type-check commands

Do not replace an existing host abstraction merely because Doable uses a different one.

### 2. Select the requested capability

Open the matching:

`capabilities/*/MANIFEST.md`

Then inspect every referenced runtime, dependency-closure and UI path recursively.

For broad platform work, also read:

- `SOURCE_COVERAGE_MATRIX.md`
- `SECOND_ORDER_DEPENDENCY_AUDIT.md`
- `ADAPTER_ARCHITECTURE.md`
- `contracts/`
- `adapters/`

### 3. Build a host mapping before coding

Create a small mapping such as:

| Doable boundary | Target project |
|---|---|
| identity/user/workspace | target auth/tenant |
| PostgreSQL/query layer | target DB |
| secrets/KEK | target secret manager |
| project filesystem | target storage/workspace |
| runtime/process | target sandbox/runtime |
| provider credentials | target secret/provider registry |
| WebSocket/Yjs | target realtime layer |
| RAG | target vector store |
| email/notifications | target providers |
| deployment/domains | target deploy provider |

Anything that cannot be mapped should become an explicit adapter requirement, not a hidden hardcoded dependency.

### 4. Implement the capability in layers

Prefer this order:

`contracts → adapters → persistence → backend/services → routes/tools → UI → tests → observability`

For AI features, preserve the behavioral flow, not only the API names.

Examples:

- Multi-provider: registry → credential resolution → discovery → compatibility → model selection → runtime → UI.
- Integrations: connection → credential vault → provider/piece → action schema → tool bridge → agent.
- MCP: server registration → transport → discovery → tool resolution → execution → result streaming.
- Security: generated/changed code → scan → findings → review/remediation → rescan.
- Realtime AI: session → auth → room → AI events → Yjs state → persistence → reconnect/recovery.

### 5. Keep immutable source immutable

Never modify:

- `doable-source/`
- `dependency-closure/`
- captured `ui-reference/`

Do not “fix” those copies for the target project.

Create target-specific code elsewhere, usually:

`src/integrations/doable-ai/`
or
`src/lib/ai-platform/`

and bind the host through the adapter contracts.

### 6. Resolve imports before declaring completion

For every copied capability:

1. follow imports;
2. identify package dependencies;
3. identify DB tables/migrations;
4. identify environment variables;
5. identify process/runtime assumptions;
6. identify authentication/authorization assumptions;
7. identify external provider credentials;
8. identify UI/state/event dependencies.

A source file being present is not proof that the feature is complete.

### 7. Preserve security boundaries

Never place API keys, OAuth tokens, provider secrets, KEKs or user credentials in the copied source.

AI tools must receive capability-level abstractions, not raw secrets.

Generated code must not bypass:

- path restrictions
- tool permissions
- credential isolation
- sandbox policy
- tenant authorization
- audit/usage tracking
- deployment approval policy

### 8. Verify incrementally

After each major capability:

- type-check
- lint
- unit tests
- integration tests
- migration/schema validation
- provider connection smoke test
- tool/MCP smoke test
- realtime smoke test where applicable
- production build

Then verify the extracted bundle itself:

`node ai-platform-core/verification/verify-extraction.mjs`

and:

`node ai-platform-core/external-dependencies/verify-external-dependencies.mjs`

### 9. Report exactly what was integrated

At the end, provide:

- capabilities implemented
- source paths reused
- adapters created
- migrations added/changed
- environment variables required
- external packages required
- UI/routes/tools added
- tests executed
- known host-specific differences
- anything intentionally not implemented

Do not report a capability as complete merely because its source files were copied.

## Ready-to-use request template

Use this wording with a coding agent after copying the folder:

> You have `ai-platform-core/` available in this repository. Treat it as the primary reference implementation for the requested feature. First inspect the target architecture and the relevant capability manifest. Trace all referenced source, dependency-closure, contracts and UI/state dependencies before changing code. Reuse the Doable implementation behavior rather than recreating it from memory. Keep `ai-platform-core/doable-source/`, `dependency-closure/` and captured `ui-reference/` immutable. Implement host adapters for authentication, tenancy, database, secrets, storage/runtime, providers, transport and RAG as required. Preserve security, audit, usage, error, retry, streaming and recovery behavior. Run the target project's type-check, build and relevant tests, and report exactly which capability pieces are integrated and which remain host-specific.

## Capability examples

For multi-provider:

> Implement `capabilities/multi-provider/MANIFEST.md` completely. Reuse provider catalog, discovery, credentials, resolver, compatibility/proxy behavior and settings reference. Integrate it into the target provider architecture without hardcoding Doable's database or auth.

For integrations:

> Implement `capabilities/integrations/MANIFEST.md` completely. Reuse the connection lifecycle, credential isolation, Activepieces bridge and AI tool schema conversion. Bind it to the target project's auth, secret storage, database and integration UI.

For MCP:

> Implement `capabilities/mcp/MANIFEST.md` and any required `mcp-tool-servers` capability. Preserve transport, discovery, progressive tool loading, execution, MCP Apps and error behavior.

For security:

> Implement `capabilities/ai-security/MANIFEST.md`. Reuse the scanner, patterns, security API route and database closure. Run it against AI-generated or modified project code at the appropriate lifecycle point and adapt project path, DB and authorization boundaries.

## Definition of done

A capability is complete only when:

`source inspected + dependencies resolved + host adapters implemented + persistence/API/UI integrated where needed + tests/build pass + operational requirements documented`

The reusable source itself remains unchanged.

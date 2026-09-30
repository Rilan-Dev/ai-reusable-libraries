# AGENTS.md — Doable Reusable Source / Agent Initialization

## Purpose

This repository is a **reusable implementation source library**, not a normal application to be rewritten as a monolith.

Its purpose is to let an AI coding agent (Codex, Claude Code, Gemini, Cursor, or another capable agent) take a requested capability from the preserved Doable implementation and integrate that capability completely into an arbitrary host project.

Typical workflow:

1. Copy or clone this repository into a target project.
2. Keep the copied source/reference material intact.
3. Tell the agent which capability is required.
4. The agent discovers the complete implementation closure.
5. The agent maps Doable host boundaries to the target project's architecture.
6. The agent implements the capability in the target project, including backend/runtime, persistence, security, APIs/tools, UI, states and tests.
7. The agent adapts the UI to the target project's existing design system rather than blindly copying Doable branding.
8. The agent verifies the integrated feature and reports all remaining host-specific work.

The source of truth is the preserved code and its manifests. **Do not recreate functionality from memory when an implementation exists here.**

---

## 1. Repository identity

- Repository: `Rilan-Dev/doable-source`
- Default branch: `main`
- This repository is private and is intended as a reusable engineering source.
- Captured Doable source baseline:
  - Repository: `Rilan-Dev/Doable`
  - Ref: `develop`
  - Commit: `a6036d1fd6dca83c08ee5affa141e5c85e45f5af`
- Current source-library import commit: `1d6079eb40d8d789e9a1999397eef90a0100069b`

Read these first when doing substantial work:

1. `EXTRACTION_MANIFEST.md`
2. `SOURCE_COVERAGE_MATRIX.md`
3. `COPY_TO_ANY_PROJECT.md`
4. `IMPLEMENTATION_PLAYBOOK.md`
5. `ADAPTER_ARCHITECTURE.md`
6. `UI_CAPABILITY_MATRIX.md`
7. `UI_UX_REFERENCE.md`
8. `SECOND_ORDER_DEPENDENCY_AUDIT.md`
9. `external-dependencies/external-dependencies.json`
10. `verification/completeness-report.json`

For a specific feature, the corresponding `capabilities/*/MANIFEST.md` is the primary navigation document.

---

## 2. What is preserved here

The repository is deliberately divided into different roles.

### `doable-source/`

The captured Doable implementation.

Treat it as **immutable reference source**.

Do not:
- refactor it;
- rename files;
- reformat it;
- optimize it;
- fix it for a target project;
- change imports merely to make it fit the host;
- delete apparently unused files;
- copy only isolated files without tracing their dependencies.

### `dependency-closure/`

Exact source required by captured runtime capabilities but coupled to broader Doable infrastructure.

This is also reference source. Follow it recursively when a manifest points into it.

### `doable-source-extensions/`

Promoted reusable platform-extension source families, including areas such as:

- authentication / identity / RBAC;
- billing / subscriptions / credits / usage / quotas;
- analytics;
- audit;
- observability / tracing;
- notifications;
- email;
- GitHub integration;
- version control / history / restore;
- deployment / domains;
- marketplace;
- realtime collaboration / Yjs;
- reusable editor and product UI.

These are reusable source extensions, not permission to impose Doable's host architecture on a target.

### `ui-reference/`

Captured Doable UI/UX implementation used as an **interaction and state reference**.

Use it to understand:
- information architecture;
- component composition;
- interaction flows;
- loading/empty/error/success states;
- streaming behavior;
- tool-call presentation;
- configuration flows;
- editor behavior;
- settings patterns.

Adapt visual styling, layout constraints, branding, navigation and design tokens to the target application.

### `capabilities/`

Feature-level manifests.

Each manifest defines the relevant runtime source, dependency closure, UI reference and host boundaries. A manifest is a navigation/acceptance contract, not a substitute for reading the source.

### `contracts/`

Host-neutral contracts/seams for provider, runtime, tools, integrations, MCP, RAG, transport, workspace and platform behavior.

### `adapters/`

Examples and utilities describing how host-specific concerns should be bound to the reusable source.

### `external-dependencies/`

Explicit inventory of packages and infrastructure that are intentionally not silently treated as part of the immutable source.

### `verification/`

Provenance, completeness, source/UI manifests and extraction verification.

---

## 3. Capability catalog

Before implementing anything, locate the smallest matching capability manifest.

Important capabilities include:

- `capabilities/multi-provider/` — provider registry/catalog, credentials, model discovery, resolution, validation and runtime selection.
- `capabilities/agents/` — agent engine, modes, orchestration and agent interaction.
- `capabilities/tools/` — tool registry, definitions, execution, tool loop and tool-call UI.
- `capabilities/integrations/` — integration catalog, connections, OAuth, credential handling, runners and AI tool bridge.
- `capabilities/mcp/` — MCP clients, transports, discovery, connectors, tool bridge and MCP Apps.
- `capabilities/mcp-tool-servers/` — concrete reusable MCP servers.
- `capabilities/skills/` — skills, rules, scopes, progressive loading and materialization.
- `capabilities/chat/` — chat sessions, streaming, events, attachments, tool callbacks and recovery.
- `capabilities/context-memory/` — context, memory, injection and budgeting.
- `capabilities/workspace-sandbox/` — project workspace, filesystem, sandbox and process execution.
- `capabilities/ai-security/` — security scanning for generated/modified project code, dependencies, secrets and security anti-patterns.
- `capabilities/visual-ai-editing/` — visual editing, runtime render, context files and build UX.
- `capabilities/visual-editing/` — editor/visual-edit interaction and bridge.
- `capabilities/realtime-collaboration/` — WebSocket/Yjs collaboration and related UI.
- `capabilities/document-builders/` — PDF, presentation, spreadsheet and Markdown generation.
- `capabilities/ai-media-builders/` — AI image/media and document-builder ecosystem.
- `capabilities/marketplace/` — reusable AI asset marketplace/bundle lifecycle.
- `capabilities/platform-foundation/` — broad platform foundation and host-bound extensions.
- `capabilities/platform-extensions/` — reusable non-core platform extensions.
- `capabilities/ui/` — reusable UI capability mapping.
- `capabilities/notebooklm/` — NotebookLM MCP implementation.

For broad requests, use `SOURCE_COVERAGE_MATRIX.md` to identify related capabilities rather than assuming the requested feature is isolated.

---

## 4. Mandatory initialization procedure for a target project

When this repository has been copied into another project and the user asks you to implement a feature, **do not start editing immediately**.

### Step A — Inspect the host

Determine:

- framework and version;
- frontend architecture;
- backend/API architecture;
- package manager;
- TypeScript/runtime version;
- database and migration mechanism;
- authentication/session system;
- tenant/workspace model;
- RBAC/authorization;
- secret/credential storage;
- object/file storage;
- project filesystem/workspace model;
- sandbox/process execution;
- AI/provider abstraction;
- RAG/vector database;
- MCP/integration architecture;
- realtime transport;
- billing/usage/credits;
- analytics/tracing/audit;
- notification/email infrastructure;
- deployment/domain infrastructure;
- existing UI/design system;
- test/lint/typecheck/build commands.

Never replace an existing host abstraction simply because Doable uses another implementation.

### Step B — Identify the feature

Translate the user's request into one or more capability manifests.

Example:

> "Add multi-provider AI with settings and model selection"

Inspect:
`capabilities/multi-provider/MANIFEST.md`

Then inspect every referenced source directory and recursively follow imports/dependencies.

### Step C — Build a host mapping

Before implementation, establish an explicit mapping:

| Doable concern | Target project |
|---|---|
| user / identity | target authentication |
| workspace / tenant | target tenancy |
| roles / permissions | target RBAC |
| PostgreSQL/query layer | target DB and query layer |
| migrations | target migration system |
| secret vault / KEK | target secret manager |
| provider credentials | target provider/credential registry |
| project filesystem | target workspace/storage |
| runtime/process | target sandbox/runtime |
| RAG/context | target vector store/context system |
| WebSocket/Yjs | target realtime system |
| billing/credits | target billing system |
| usage/quotas | target metering |
| audit | target audit system |
| tracing | target observability |
| notifications/email | target providers |
| GitHub | target GitHub integration |
| deployment/domains | target deployment provider |
| marketplace | target marketplace/storage |
| UI | target design system |

Anything that cannot be mapped becomes an explicit adapter requirement.

Do not hide an unmapped dependency behind hardcoded Doable assumptions.

---

## 5. Implementation rules

### Golden rule

**Preserve behavior; adapt boundaries.**

The target implementation should retain the relevant Doable behavioral model while integrating naturally into the host architecture.

Do not blindly copy a Doable route, database table or component and declare the feature complete.

A complete feature may require:

`contracts → adapters → persistence → backend/services → routes/tools → UI → state/recovery → tests → observability`

### Follow the complete closure

For every referenced source:

1. inspect the file;
2. inspect its imports;
3. inspect imported local modules;
4. inspect package dependencies;
5. inspect database queries and migrations;
6. inspect environment variables;
7. inspect auth/authorization;
8. inspect process/filesystem assumptions;
9. inspect provider/network assumptions;
10. inspect UI state/event dependencies;
11. inspect error/retry/reconnect paths.

**Source presence is not implementation completeness.**

### Never silently omit second-order dependencies

If capability A imports infrastructure B and B depends on C, follow A → B → C.

Use:
- `SECOND_ORDER_DEPENDENCY_AUDIT.md`
- capability closure information;
- external dependency inventory.

Do not declare a capability "too coupled" until the actual closure has been inspected.

---

## 6. UI implementation protocol

The UI reference is part of the reusable implementation knowledge.

When implementing a feature with a UI:

1. Find the capability's UI paths in its manifest.
2. Read the referenced components recursively.
3. Identify the interaction model.
4. Identify all state transitions.
5. Identify API/data requirements.
6. Identify keyboard, modal, drawer, popover and navigation behavior.
7. Identify streaming/tool/progress/retry behavior where applicable.
8. Rebuild the interaction in the target project's framework/design system.
9. Adapt typography, spacing, colors, borders, icons, navigation and branding to the target.
10. Preserve capability and state coverage even when the visuals differ.

Do **not**:
- paste Doable branding into the host;
- make a screenshot-level clone unless explicitly requested;
- remove states merely because the target design system lacks an existing component;
- implement only the happy path.

At minimum, applicable reusable screens should cover:

- initial/loading;
- populated;
- empty;
- validation;
- saving/submitting;
- success;
- recoverable error;
- permission denied/restricted;
- disconnected/expired;
- retry/reconnect;
- destructive confirmation;
- disabled/read-only.

For AI chat specifically, preserve relevant behavior for:
- streaming;
- thinking/reasoning presentation where supported;
- tool calls;
- tool results;
- attachments;
- user-input blocking/resume;
- stop;
- retry;
- errors;
- context;
- artifacts;
- reconnect/recovery.

---

## 7. Security rules

Never move secrets into the reusable source.

Never hardcode:
- API keys;
- OAuth tokens;
- cookies;
- provider secrets;
- encryption keys;
- database credentials;
- user credentials.

Host-specific credentials belong to the host's secure credential system.

Generated/modified project code must respect:
- tenant authorization;
- RBAC;
- path restrictions;
- sandbox policy;
- tool permissions;
- credential isolation;
- network/egress restrictions;
- audit/usage tracking;
- deployment approval rules.

Do not expose raw credentials to an AI model or browser when a capability-level server abstraction can be used.

Treat external integrations, MCP servers and generated code as potentially untrusted execution surfaces.

---

## 8. AI/provider rules

For multi-provider work, preserve the conceptual flow:

`provider registry → credentials → discovery → compatibility/validation → model selection → resolution → runtime → UI`

Do not hardwire one provider into a supposedly multi-provider feature.

Provider-specific behavior should remain behind provider abstractions.

For RAG/context:
- do not assume Doable's vector database is the host's vector database;
- map retrieval, chunk/context budgeting and persistence to the host;
- preserve context injection semantics and safety boundaries.

For agents:
- preserve the agent/tool loop;
- preserve tool-call lifecycle and errors;
- preserve user-input blocking/resume where applicable;
- preserve retry/limit behavior;
- preserve streaming events.

---

## 9. Integrations and MCP rules

### Integrations

A complete integration is not merely an API client.

Inspect and implement the relevant closure for:

`catalog → connection → credentials → OAuth/manual auth → validation → runner/action → tool schema → agent/tool bridge → UI → disconnect/error/retry`

Only install the Activepieces packages actually required by the target capability. The repository contains an inventory of many external packages; their presence in the inventory does not mean every target project must install all of them.

### MCP

Inspect the complete flow:

`server registration → transport → authentication → discovery → progressive tool loading → tool resolution → execution → result/error → MCP App/UI resource`

Preserve SSRF, process, network and credential boundaries.

For concrete MCP servers, inspect their manifests and runtime requirements rather than reducing them to generic tool definitions.

---

## 10. Database and persistence rules

Never assume the target can directly adopt Doable's complete schema.

For DB-dependent features:

1. identify required Doable tables/queries/migrations;
2. determine which data is intrinsic to the capability;
3. map identity/tenant/project IDs;
4. map persistence to the target schema;
5. create target migrations;
6. preserve required constraints and authorization;
7. preserve indexes/uniqueness where behavior depends on them;
8. test migration and rollback expectations.

Do not silently create a second incompatible persistence model.

---

## 11. External dependencies

Read:

`external-dependencies/external-dependencies.json`

before adding packages.

The captured inventory currently records:
- external npm packages;
- Activepieces packages;
- workspace packages;
- peer dependencies;
- package overrides;
- build-time/native dependencies;
- runtime infrastructure;
- host adapter requirements.

Important runtime expectations include Node.js 22+, pnpm-compatible workspace tooling, PostgreSQL for DB-dependent paths, Git, browser/Chromium where required, and OS/process primitives for sandboxed functionality.

The target project may use a different compatible implementation, but that substitution must be deliberate and verified.

---

## 12. Verification protocol

### Verify the reusable source

When operating from the original source-library repository, use:

```bash
node verification/verify-extraction.mjs
```

and, where available:

```bash
node external-dependencies/verify-external-dependencies.mjs
```

When the source is copied under another directory such as `ai-platform-core/`, use the paths appropriate to that copy.

### Verify the host implementation

Run the target project's normal:

- install/dependency validation;
- type-check;
- lint;
- unit tests;
- integration tests;
- migration/schema validation;
- relevant provider smoke tests;
- API/route tests;
- MCP/integration tests;
- realtime tests when applicable;
- production build.

For UI changes, perform an actual browser verification when browser tooling is available.

Never claim a feature is complete solely because:
- files were copied;
- TypeScript compiles;
- the extraction verifier passes.

The extraction verifier proves extraction integrity, not target-project runtime compatibility.

---

## 13. Definition of done

A requested capability is complete only when all applicable layers are addressed:

- [ ] target architecture inspected;
- [ ] capability manifest identified;
- [ ] complete source closure inspected;
- [ ] second-order dependencies inspected;
- [ ] external packages identified;
- [ ] host mapping documented;
- [ ] contracts/adapters implemented;
- [ ] persistence/migrations integrated;
- [ ] backend/services integrated;
- [ ] routes/API/tools integrated;
- [ ] authentication/authorization integrated;
- [ ] provider/RAG/MCP/integration boundaries integrated;
- [ ] UI implemented/adapted;
- [ ] loading/empty/error/success/retry states implemented;
- [ ] observability/audit/usage integrated where applicable;
- [ ] security boundaries verified;
- [ ] tests pass;
- [ ] type-check/lint/build pass;
- [ ] browser verification performed for significant UI work;
- [ ] environment/config requirements documented;
- [ ] intentionally unimplemented host-specific work explicitly reported.

---

## 14. Change isolation

When this source is copied into a target project, prefer a structure such as:

```text
ai-platform-core/
  doable-source/
  doable-source-extensions/
  dependency-closure/
  ui-reference/
  capabilities/
  contracts/
  adapters/
  external-dependencies/
  verification/
```

Put host implementation outside the immutable reference tree, for example:

```text
src/
  lib/
    ai-platform/
  integrations/
    doable/
  features/
    <target-feature>/
```

Never modify `ai-platform-core/doable-source/` to solve host integration problems.

If the target repository copies this entire repository at its root instead of under `ai-platform-core/`, treat the equivalent root directories as the immutable/reference boundary.

---

## 15. Recommended agent request format

A user can ask:

> Implement **<FEATURE>** completely using this Doable source. First inspect the target architecture. Find the matching capability manifest and trace its entire runtime, dependency, persistence, security, UI and state closure. Do not recreate the feature from memory. Keep the copied Doable source, dependency closure and UI reference immutable. Map host-specific identity, tenancy, DB, secrets, providers, RAG, runtime, transport and deployment through adapters. Adapt the reference UI to this project's existing design system while preserving the interaction and state model. Implement all required backend, persistence, API/tool, UI, security, error/retry/recovery, tests and observability pieces. Verify type-check, lint, tests, build and browser behavior where applicable. Report exactly what was integrated and any remaining host-specific requirements.

For example:

> Implement **multi-provider AI** completely from `capabilities/multi-provider/MANIFEST.md`.

or:

> Implement **integrations** completely from `capabilities/integrations/MANIFEST.md`, including OAuth, credential handling, catalog, actions, AI tool bridge and adapted settings UI.

or:

> Implement **MCP** completely from `capabilities/mcp/MANIFEST.md`, including transports, discovery, progressive tool loading, execution, error handling and MCP Apps.

---

## 16. If the user asks for a broad feature

Do not arbitrarily choose a single file.

First determine whether the request crosses capability boundaries.

For example, "build an AI coding assistant" may require:

- agents;
- chat;
- tools;
- planning/clarification;
- context/memory;
- workspace/sandbox;
- framework prompts;
- project/runtime generation;
- skills;
- MCP;
- integrations;
- provider abstraction;
- usage/credits;
- tracing;
- audit/security;
- visual editing;
- realtime collaboration;
- version control;
- GitHub;
- deployment;
- UI.

Use `SOURCE_COVERAGE_MATRIX.md` and the capability closure rather than guessing.

---

## 17. Do not confuse source extraction with host completion

There are three separate verification questions:

### A. Is the reusable source present?

Use the extraction/provenance verifier.

### B. Is the requested source capability complete?

Use the capability manifest, closure maps and source/UI coverage.

### C. Is the feature actually working in Project A?

Only the target project's tests, build, browser/runtime verification, migrations, credentials and infrastructure checks can establish this.

A passing A does not prove B or C.

---

## 18. Working style expected from an AI agent

Be deterministic and evidence-driven.

Before changing code:
- inspect;
- map;
- trace;
- plan;
- then implement.

While changing code:
- make the smallest host-specific changes necessary;
- preserve existing host architecture where compatible;
- do not edit immutable reference source;
- do not silently remove behavior;
- keep security and tenant boundaries explicit.

After changing code:
- verify;
- test;
- inspect failures;
- fix host integration issues;
- rerun verification;
- report exact results.

If something is unavailable or incompatible, state the concrete boundary and what adapter or host change is required. Do not invent a successful integration.

---

## 19. Final agent handoff report

At completion, report:

1. Requested capability.
2. Capability manifest(s) used.
3. Doable source paths reused.
4. Dependency-closure paths reused.
5. UI reference paths used.
6. Host adapters created/changed.
7. DB/migrations changed.
8. API/routes/tools changed.
9. UI/state flows implemented.
10. Packages added/removed.
11. Environment variables/configuration required.
12. Security/auth/tenant implications.
13. Tests/typecheck/lint/build/browser verification results.
14. Known limitations.
15. Remaining host-specific work.
16. Confirmation that immutable source/reference trees were not modified.

Never say "implemented completely" without evidence for the applicable items above.

---

## 20. Primary principle

**This repository is the implementation memory for Doable capabilities.**

When Project A needs a Doable feature:

`copy source → identify capability → trace complete closure → map host boundaries → implement runtime + persistence + API + security + UI → adapt design → verify`

The goal is not to make Project A look like Doable.

The goal is to make Project A **inherit the relevant capability and behavior from the preserved Doable implementation while remaining native to Project A's architecture, data model, security model and UI.**


## 12. Machine-readable agent interface

The repository also exposes machine-readable navigation and safety artifacts:

- `capabilities/CATALOG.json` — capability IDs, descriptions and manifest paths.
- `capabilities/DEPENDENCY_GRAPH.json` — known cross-capability relationships to guide closure discovery.
- `verification/IMMUTABLE_PATHS.json` — immutable/reference boundaries for automated checks.
- `agent-init/init.mjs` — read-only initialization and basic natural-language capability lookup.

These files are navigation aids, not substitutes for reading the authoritative capability manifests and source. A lookup result is a candidate, never proof that the feature is complete.

### Initialize after copying into a host

Run:

```bash
node agent-init/init.mjs
```

Or provide the requested feature:

```bash
node agent-init/init.mjs "AI coding assistant"
node agent-init/init.mjs "multi-provider"
```

The initializer must remain read-only and must never modify the immutable source trees.

## 13. README maintenance rule

Keep the root `README.md` as the human-facing entry point. When repository architecture, capability coverage, initialization workflow, verification commands or source boundaries materially change, update the README in the same change set as the relevant implementation/documentation change.

Do not duplicate the full operational instructions between README and AGENTS.md. `AGENTS.md` is the canonical agent execution guidance; README explains the library and onboarding workflow.

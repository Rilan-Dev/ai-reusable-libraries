# Copy-to-Any-Project AI Core

This directory is designed to be copied into another repository and handed to Codex, Claude Code, Clodex or another coding agent as a reusable implementation source. Read `IMPLEMENTATION_PLAYBOOK.md` before implementing a capability.

## Contract

The copied core contains:

1. immutable Doable runtime source;
2. dependency-closure source;
3. exact/reference UI source;
4. host-neutral contracts;
5. adapter examples and capability maps;
6. feature manifests telling Codex exactly which source boundaries implement each capability;
7. verification and external-dependency manifests.

Codex should **reuse the copied implementation source instead of recreating the feature from memory**.

## Recommended workflow

Copy the entire `ai-platform-core/` directory into the target project, then ask Codex for a specific capability.

Example:

> Implement complete integrations from `ai-platform-core/capabilities/integrations/MANIFEST.md`. Use the referenced Doable source as the implementation source. Preserve the Doable behavior and interaction model, but adapt authentication, tenancy, persistence, secrets, routing, UI framework and styling to this project. Do not modify the immutable source copy. First inspect the manifest and dependency map, then implement all required runtime, API, persistence, security and UI pieces, and finish with tests.

For multi-provider support:

> Implement complete multi-provider AI support from `ai-platform-core/capabilities/multi-provider/MANIFEST.md`. Reuse all referenced source and dependency-closure code. Include provider registry/catalog, credentials, model discovery, resolution, validation, runtime selection, chat integration, settings UI and error/reconnect states. Adapt only the host-specific boundaries.

## Important

The feature manifests are not partial examples. They are dependency maps into the complete captured core. If a manifest references a directory, Codex must inspect that directory recursively and follow its imports before deciding what can be omitted.

Do not copy only one TypeScript file and assume the feature is complete.

## Immutable rule

Never edit, reformat, rename, optimize or fix files under:

- `doable-source/`
- `dependency-closure/`
- captured `ui-reference/` source

Create host adapters outside those directories.

## UI rule

The UI reference is implementation/reference material, not a requirement to reproduce Doable's visual theme. Preserve capability, information architecture, interaction behavior and state coverage while adapting components to the target project's design system.

## Feature selection

Available capability manifests:

- `capabilities/multi-provider/MANIFEST.md`
- `capabilities/agents/MANIFEST.md`
- `capabilities/tools/MANIFEST.md`
- `capabilities/integrations/MANIFEST.md`
- `capabilities/mcp/MANIFEST.md`
- `capabilities/skills/MANIFEST.md`
- `capabilities/chat/MANIFEST.md`
- `capabilities/context-memory/MANIFEST.md`
- `capabilities/workspace-sandbox/MANIFEST.md`
- `capabilities/ai-security/MANIFEST.md` — project security scanner for AI-generated/modified code, dependency audit, secret detection and security anti-pattern detection.
- `capabilities/ui/MANIFEST.md`
- `capabilities/platform-foundation/MANIFEST.md` — authentication/RBAC, PostgreSQL schema, secrets/KEK, billing/plans/credits, usage, audit/observability, analytics, notifications/email, GitHub/versioning, deployment/domains, collaboration persistence, templates and Activepieces ecosystem boundary.

Use the smallest capability manifest that satisfies the requested feature, then follow its shared dependency references.

## Verification

Run the extraction verifier before using the core:

```bash
node ai-platform-core/verification/verify-extraction.mjs
```

The verifier includes the dependency-inventory gate. The dependency inventory can also be checked directly without rewriting it:

```bash
node ai-platform-core/external-dependencies/verify-external-dependencies.mjs
```

Do not begin host adapter implementation until the extraction verifier passes. A passing extraction gate proves source/package structure and immutable provenance; it does not claim that the target project's runtime build, database, credentials, providers or end-to-end integrations are already configured.

The verifier checks required structure, key entrypoints, manifest consistency and the immutable source boundary. When run inside the original Git checkout it also verifies the captured Git tree SHAs.

### Marketplace / AI asset portability

For projects that need reusable AI assets to be importable/exportable, use `capabilities/marketplace/MANIFEST.md` and the immutable `doable-source/packages/marketplace-bundle/` implementation. Implement the host marketplace/install lifecycle around the preserved bundle schema; do not replace it with an ad-hoc skills export format. Credentials must remain outside bundles and be collected/provisioned at install time.

### Realtime AI collaboration

When a host needs multi-user live AI development, use `capabilities/realtime-collaboration/MANIFEST.md` and copy the complete `doable-source/services/ws/` closure. Do not copy only AI event types: the room, message handler, Yjs document manager, persistence bridge, authentication, internal API protection, and tracing are coupled behavior. Adapt JWT/tenant authorization, project storage, internal secrets, telemetry, WebSocket endpoint/origin policy, and editor UI at the host boundary.

### AI document-generation extensions

For projects that need AI-generated business artifacts, use `capabilities/document-builders/MANIFEST.md`. Copy the complete PDF, presentation, spreadsheet and Markdown builder sources plus the shared MCP-App UI module and authoring skills. Do not reduce them to generic MCP tool definitions.

### Realtime collaboration and visual AI editing

For products that need collaborative AI editing, use `capabilities/realtime-collaboration/MANIFEST.md`. Reuse both the immutable `doable-source/services/ws/` service and the corresponding `ui-reference/apps/web/src/modules/collaboration/` and `ui-reference/apps/web/src/modules/editor/visual-edit/` sources. Preserve the AI event protocol, Yjs synchronization, room lifecycle, presence, visual-edit interaction model, and design-comment states while adapting identity, persistence, deployment, and visual theme to the host.

## Additional reusable AI extensions

When implementing an AI product, inspect these capability manifests before rebuilding functionality:

- `capabilities/mcp-tool-servers/MANIFEST.md` — complete concrete MCP tool servers.
- `capabilities/realtime-collaboration/MANIFEST.md` — realtime AI/Yjs collaboration.
- `capabilities/visual-ai-editing/MANIFEST.md` — visual editing, runtime sandbox, context-file and build UX.

The corresponding source is immutable under `doable-source/`. Reuse the source and adapt only host boundaries such as auth, tenancy, persistence, provider credentials, routing and deployment.

### Platform extensions

For platform capabilities beyond the AI runtime, inspect `capabilities/platform-extensions/MANIFEST.md`. It maps the immutable `doable-source-extensions/` trees for collaboration/Yjs, visual AI editing, observability, audit, analytics, billing/usage, identity/RBAC, GitHub/version control, deployment/domains, marketplace, notifications/email and reusable product UI.

Do not cherry-pick individual files without following the manifest and dependency closure. Preserve the Doable implementation and interaction/state model; adapt only host-specific identity, tenancy, persistence, secrets, providers, infrastructure and theme.


### Full requested reusable-platform coverage

Use SOURCE_COVERAGE_MATRIX.md as the canonical checklist. It maps every requested AI, editor, collaboration, platform, persistence and infrastructure capability to the exact preserved source boundary and identifies what the host must adapt.


### AI security scanner

For AI coding/project-generation products that need security checks around generated or modified code, use `capabilities/ai-security/MANIFEST.md`. Reuse the complete immutable scanner and route source plus the referenced database closure. The scanner covers dependency audit, secret detection and code/security anti-patterns. Adapt project-path resolution, process execution, persistence, authorization and deployment policy at the host boundary. Do not modify the immutable source copy.

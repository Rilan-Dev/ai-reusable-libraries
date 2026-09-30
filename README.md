# Doable Source — Reusable AI Platform Source Library

**Doable Source** is a reusable, agent-oriented implementation library extracted from Doable. It is designed to be copied into an arbitrary Project A and used by Codex, Claude Code, Gemini, Cursor, or another coding agent as the primary reference for implementing complete capabilities.

> **This is not a drop-in application and not a package to blindly install.**
> It is an immutable reference implementation + dependency closure + UI/UX reference + capability manifests + host adapters/contracts + verification.

## The intended workflow

```text
Project A
   │
   │ copy/clone this repository
   ▼
/init
   │
   ├─ inspect Project A architecture
   ├─ load capability catalog
   └─ establish source/target boundaries
   │
   ▼
"Implement <feature>"
   │
   ▼
Capability Resolver
   │
   ├─ manifest
   ├─ dependency closure
   ├─ second-order dependencies
   ├─ UI reference
   └─ host adapter requirements
   │
   ▼
Project A implementation
   │
   ├─ backend/runtime
   ├─ persistence/migrations
   ├─ auth/tenant/security
   ├─ providers/RAG/MCP/integrations
   ├─ APIs/tools/realtime
   ├─ UI/state/recovery
   └─ tests/observability
   │
   ▼
Verification
```

The agent should **reuse the preserved implementation rather than recreate behavior from memory**.

## Start here

### For AI agents

Read:

1. [AGENTS.md](AGENTS.md)
2. [capabilities/CATALOG.json](capabilities/CATALOG.json)
3. [capabilities/DEPENDENCY_GRAPH.json](capabilities/DEPENDENCY_GRAPH.json)
4. [COPY_TO_ANY_PROJECT.md](COPY_TO_ANY_PROJECT.md)
5. [IMPLEMENTATION_PLAYBOOK.md](IMPLEMENTATION_PLAYBOOK.md)
6. [ADAPTER_ARCHITECTURE.md](ADAPTER_ARCHITECTURE.md)
7. [EXTRACTION_MANIFEST.md](EXTRACTION_MANIFEST.md)

Then inspect the matching `capabilities/<id>/MANIFEST.md` before changing Project A.


### Resolve a capability closure

After identifying a capability, use the machine-readable resolver to expand its known cross-capability closure:

    node agent-init/resolve.mjs multi-provider
    node agent-init/resolve.mjs agents chat

The resolver separates:

- **core closure** — required/bridge/protection/package relationships that should be inspected together;
- **recommended review** — common, related and supporting capabilities that may affect completeness;
- **optional review** — explicitly optional branches.

The resolver is a navigation aid, not a substitute for reading the manifests or tracing source imports. A capability must not be declared complete merely because the resolver returned a finite closure.

### Capability manifest contract

`capabilities/CAPABILITY_MANIFEST.schema.json` defines the canonical machine-readable shape for future capability manifests. Existing `MANIFEST.md` files remain authoritative and are not automatically rewritten; this prevents a tooling improvement from altering the preserved extraction documentation.

### For humans

The most important distinction is:

- **Immutable source** = implementation/reference that must not be modified.
- **Contracts/adapters** = boundaries where Project A is connected.
- **UI reference** = interaction/state reference, not a branding/template requirement.
- **Manifest/catalog** = navigation and completeness information.
- **Verification** = evidence that the source was preserved and the target integration was actually checked.

## Repository layout

| Path | Purpose |
|---|---|
| `doable-source/` | Exact captured Doable implementation; immutable |
| `dependency-closure/` | Exact transitive source required by captured capabilities; immutable |
| `doable-source-extensions/` | Promoted reusable platform extensions |
| `ui-reference/` | Exact/reference Doable UI used to preserve interaction and state behavior |
| `capabilities/` | Capability manifests, catalog and dependency graph |
| `contracts/` | Host-neutral integration seams |
| `adapters/` | Host binding examples/utilities |
| `external-dependencies/` | Explicit external package/infrastructure inventory |
| `verification/` | Provenance, completeness and integrity checks |
| `agent-init/` | Agent initialization and capability-discovery helpers |

## Capability areas

The current capability catalog covers AI/runtime and supporting platform areas including:

- multi-provider AI
- agents and orchestration
- tools and tool calling
- integrations
- MCP and MCP tool servers
- skills and rules
- AI chat and streaming
- context and memory
- workspace/sandbox/process execution
- AI security scanning
- visual AI editing
- visual editing
- realtime collaboration/Yjs
- document builders
- AI media builders
- marketplace/AI asset bundles
- platform foundation
- platform extensions
- reusable UI
- NotebookLM

A request can require multiple capabilities. Do not assume that a UI surface or single route represents a complete feature.

## Immutable source rule

Never modify, reformat, rename, optimize or "fix" the captured reference trees:

- `doable-source/**`
- `dependency-closure/**`
- captured `ui-reference/**`

Target-specific changes belong in Project A and should normally connect through contracts/adapters.

## Complete implementation rule

A feature is complete only when its relevant closure has been considered:

`source → imports → dependencies → persistence → security → runtime → APIs/tools → UI/state → recovery → observability → tests`

The agent must explicitly identify anything that remains host-specific.

## UI rule

Use the Doable UI reference to preserve:

- information architecture
- interaction model
- state transitions
- streaming/tool behavior
- loading/empty/success/error/retry states
- permissions and destructive confirmations

Adapt:

- branding
- colors
- typography
- spacing
- navigation
- component library
- responsive behavior

to Project A.

## Verification

The extraction verifier proves preservation/completeness of the source library. It does **not** prove that Project A is correctly integrated.

Run:

```bash
node verification/verify-extraction.mjs
node external-dependencies/verify-external-dependencies.mjs
```

Then, in Project A, run its own dependency installation, migrations, typecheck, lint, tests, production build and browser/runtime verification as applicable.

## Example request to an AI coding agent

> Implement **<FEATURE>** completely using this Doable Source library.
>
> First inspect the target project. Find the matching capability manifest and trace the complete runtime, import, dependency, persistence, security, UI and state closure. Do not recreate the feature from memory.
>
> Keep `doable-source/`, `dependency-closure/`, and captured `ui-reference/` immutable. Map identity, tenancy, database, secrets, providers, RAG, filesystem, runtime, sandbox, MCP, integrations and transport through Project A's existing architecture/adapters.
>
> Implement the complete backend/runtime, persistence/migrations, API/routes/tools, authorization/security, UI/state/recovery, observability/usage/audit where applicable, and tests. Adapt the UI interaction model to Project A's design system.
>
> Verify typecheck, lint, tests, build and browser/runtime behavior where applicable. Report exact source paths, adapters, migrations, packages, environment requirements, verification results and remaining host-specific work.

## Source provenance

The captured Doable baseline is recorded in `EXTRACTION_MANIFEST.md` and the verification manifests. The source baseline is:

- Repository: `Rilan-Dev/Doable`
- Ref: `develop`
- Commit: `a6036d1fd6dca83c08ee5affa141e5c85e45f5af`

## Principle

**Copy source → identify capability → resolve complete closure → map host boundaries → implement → adapt UI → verify.**

### Validate the agent-facing metadata

Run the deterministic metadata validator from the library root:

    node verification/validate-library.mjs

It checks catalog entries, manifest paths, discovered manifests, dependency-graph capability references, immutable-policy roots and the required manifest-schema fields. It does not modify source files and it does not replace the deeper extraction verifier or target-project tests.

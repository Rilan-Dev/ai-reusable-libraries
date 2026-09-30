# Doable Source Worklog

## 2026-10-01 — Agent capability-resolution layer

### Goal

Make the reusable source library easier for AI coding agents to consume after copying it into a target project, without modifying the preserved implementation/reference trees.

### Completed

- Added agent-init/resolve.mjs to resolve known cross-capability relationships from CATALOG.json and DEPENDENCY_GRAPH.json.
- The resolver separates core, recommended and optional closure and remains read-only.
- Added capabilities/CAPABILITY_MANIFEST.schema.json as the canonical machine-readable shape for future structured capability manifests.
- Existing MANIFEST.md files remain authoritative and were not rewritten.
- Updated agent-init/init.mjs to expose the closure resolver.
- Updated agent-init/README.md, README.md and AGENTS.md with resolver and manifest-contract guidance.
- Confirmed the capability tree contains 21 capability directories and 21 MANIFEST.md files; the catalog count is consistent.

### Verification

- GitHub compare from d69bdb85f98a136dfda430befbdad262db408125 to c0e1fc528a8cba9765adc2ba3cc8fee0436ee5b0 contains only AGENTS.md, README.md, agent-init/README.md, agent-init/init.mjs, agent-init/resolve.mjs and capabilities/CAPABILITY_MANIFEST.schema.json.
- No files under doable-source/**, dependency-closure/** or ui-reference/** changed in this phase.
- The catalog and manifest inventory were inspected through the GitHub tree.

### Not yet completed

- Existing Markdown manifests have not been migrated to structured JSON/YAML sidecars.
- Resolver relationships are still the manually curated graph; source-import analysis remains necessary for true dependency closure.
- Target-project verification remains a Project-A responsibility.

### Next candidate phase

Build a machine-readable per-capability closure/host-binding index from the existing manifests and source-coverage documents, then add deterministic validation so agents can detect missing manifest fields, stale catalog entries, broken manifest paths and graph references before implementation.

## 2026-10-01 — Metadata validation gate

### Completed

- Added `verification/validate-library.mjs`.
- The validator checks catalog entries, discovered manifests, manifest paths, dependency-graph references, immutable-policy roots and required manifest-schema fields.
- Updated `README.md` and `AGENTS.md` so agents can run the validator before relying on capability resolution.
- Preserved all immutable source/reference trees.

### Remaining

- The validator intentionally does not infer source-level dependencies; manifests and extraction verification remain authoritative for implementation completeness.
- A future phase can add structured per-capability closure metadata and deterministic host-binding records without rewriting immutable source.


## 2026-10-01 — Machine-readable implementation index and planner

### Goal

Turn the capability catalog into a more actionable agent interface without rewriting immutable source or existing authoritative Markdown manifests.

### Completed

- Added `capabilities/IMPLEMENTATION_INDEX.json` covering all 21 catalog capabilities.
- The index maps each capability to its authoritative manifest and records conservative implementation-area signals only; it does not invent routes, tables or dependency details.
- Extended `verification/validate-library.mjs` to validate index coverage, IDs and manifest-path consistency against the catalog.
- Added read-only `agent-init/plan.mjs` to expand the curated core dependency closure and print a deterministic implementation sequence.
- Updated `AGENTS.md`, `README.md` and `agent-init/README.md` with the new index/planner workflow.

### Verification

- Changes were written only to agent-facing metadata/tooling and documentation.
- Immutable trees remain `doable-source/**`, `dependency-closure/**` and `ui-reference/**`; no source/reference files were intentionally modified.
- The metadata validator now includes the implementation-index gate, but its runtime has not yet been executed in a local checkout during this phase.

### Remaining

- The implementation index is conservative and does not replace source-level dependency analysis.
- Existing Markdown manifests remain authoritative; structured sidecars are not yet generated from their full contents.
- A future phase can add source-derived closure evidence and host-binding records, provided those records remain evidence-backed and do not replace manifest authority.

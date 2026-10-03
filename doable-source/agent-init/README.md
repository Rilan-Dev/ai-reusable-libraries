# Agent initialization

This directory contains lightweight helpers for agents consuming Doable Source.

## Intended command

From the root of a copied library:

```bash
node agent-init/init.mjs
```

The initializer is intentionally read-only. It does not modify the immutable source. It reports the repository's agent instructions, capability catalog, immutable boundaries and the next steps for selecting a capability.

## Capability lookup

```bash
node agent-init/init.mjs "multi-provider"
node agent-init/init.mjs "AI coding assistant"
```

The first argument is a natural-language feature request. The helper performs a simple local catalog match; the capability manifest remains authoritative and must be inspected before implementation.

## Capability closure resolution

After lookup, resolve known cross-capability dependencies before implementation:

```bash
node agent-init/resolve.mjs multi-provider
node agent-init/resolve.mjs agents chat
```

The resolver is read-only and separates core, recommended and optional relationships. It does not replace manifest reading or source-level dependency tracing.


## Implementation plan generation

Use the read-only planner after capability lookup/resolution:

```bash
node agent-init/plan.mjs multi-provider
node agent-init/plan.mjs agents chat
```

The planner reads `capabilities/IMPLEMENTATION_INDEX.json` and `capabilities/DEPENDENCY_GRAPH.json`, expands the known core closure, and prints the manifests/signals plus a deterministic implementation sequence. It never edits source or target files.

The implementation index is intentionally conservative: it references authoritative Markdown manifests and records implementation-area signals rather than pretending to infer exact routes, tables or imports. Agents must still trace the actual source closure.

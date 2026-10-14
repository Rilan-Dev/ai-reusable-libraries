# AI Reusable Libraries

A shared, versioned source library and operating system for reusing verified capabilities across products. The repository hosts **one global extraction/control framework** and multiple independent source-library workstreams.

## Start here

1. Read [the global operating model](SOURCE_LIBRARY_OPERATING_MODEL.md).
2. Read [the source-library catalog](SOURCE_LIBRARY_CATALOG.md) to choose a source or capability.
3. Recover this repository's active source-library checkpoint in [project-control/source-library/](project-control/source-library/).
4. Use the global [Source Extraction Agent](source-extraction-agent/README.md) prompts, rules, schemas, templates, tools and verification gates for every upstream repository.
5. Follow the selected source's own pin, manifest, license record, worklog and next action. Do not transfer another source's PASS or authorization.

## Global framework vs. product data

| Area | Responsibility |
|---|---|
| `project-control/` | Global project-control protocol, agent roles, memories, plans and repo-level continuity |
| `project-control/source-library/` | Central source catalog, cross-source roadmap, current next action, decisions, risks and worklog |
| `source-extraction-agent/` | Canonical reusable prompts, extraction rules, schemas, templates, workflows and tools |
| `doable-source/` | Doable source library and capability catalog |
| `clara-core/` | Clara AI Platform source library |
| `mailflow-source-library/` | MailFlow-specific pins, inventory, path dispositions, verification utility and workstream state |

Source-specific directories store **facts and evidence about that source**, not a separate copy of the global agent architecture. New upstreams should use the same engine without requiring new repo-specific prompt frameworks.

## Non-negotiable

- Pin upstream commit/tree/license before claiming source identity.
- Preserve source bytes and Git object identity; never refactor immutable captured source.
- Trace complete first-party dependency, runtime, data, security, UI and test closure.
- Keep host/product adapters outside immutable source.
- Treat upstream changes as review events, never blind syncs.
- Keep progress, decisions, risks, verification and the next action in this repository.
- A plan, inventory, workflow definition or AI claim is not verification evidence.

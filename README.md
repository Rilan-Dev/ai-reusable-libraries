# AI Reusable Libraries

A shared, versioned source library and operating system for reusing verified capabilities across products. The repository hosts **one global extraction/control framework** and the cross-project catalog; source-specific working evidence lives with each source's designated repository/workspace.

## Start here

1. Read [the global operating model](SOURCE_LIBRARY_OPERATING_MODEL.md).
2. Read the [source-library catalog](SOURCE_LIBRARY_CATALOG.md) to choose a source or capability.
3. Recover the cross-source checkpoint in [project-control/source-library/](project-control/source-library/).
4. Use the global [Source Extraction Agent](source-extraction-agent/README.md) prompts, rules, schemas, templates, tools and verification gates for every upstream repository.
5. Follow the selected source's own repository/workspace, pin, manifest, license record, worklog and next action. Do not transfer another source's PASS or authorization.

## Global framework vs. source data

| Area | Responsibility |
|---|---|
| `project-control/` | Global project-control protocol, agent roles, reusable memories, plans and repo-level continuity |
| `project-control/source-library/` | Central source catalog, cross-source roadmap, current next action, decisions, risks and worklog |
| `source-extraction-agent/` | Canonical reusable prompts, extraction rules, schemas, templates, workflows and tools |
| `doable-source/` | Doable source library and capability catalog |
| `clara-core/` | Clara AI Platform source library |
| [MailFlow extraction workspace](https://github.com/Rilan-Dev/mailflow/tree/main/extraction/) | MailFlow-specific pins, inventory, path dispositions, verification utility, memory, sessions and workstream state |

The shared framework is maintained once here. A source repository may carry a versioned local copy of the framework to support self-contained sessions, with its upstream pin recorded; source-specific evidence remains in that source's workspace. Do not create a separate MailFlow working copy here.

## Non-negotiable

- Pin upstream commit/tree/license before claiming source identity.
- Preserve source bytes and Git object identity; never refactor immutable captured source.
- Trace complete first-party dependency, runtime, data, security, UI and test closure.
- Keep host/product adapters outside immutable source.
- Treat upstream changes as review events, never blind syncs.
- Keep global cross-source governance here and source-specific progress in its designated workspace.
- A plan, inventory, workflow definition or AI claim is not verification evidence.

# Source Library Catalog

This is the human-readable navigation view. The machine-readable registry is `project-control/source-library/SOURCE_LIBRARY_CATALOG.json`.

| Source/library | Working workspace | Upstream | Current state | Global method |
|---|---|---|---|---|
| Doable Source | `doable-source/` | Doable upstream; confirm pin from its own manifest before monitoring | Existing source library and capability catalog; use its own verification records | `source-extraction-agent/` |
| Clara Core | `clara-core/` | Clara AI Platform | Incremental extraction; manifest currently records 108 immutable entries | `source-extraction-agent/` |
| MailFlow | [`Rilan-Dev/mailflow/extraction/`](https://github.com/Rilan-Dev/mailflow/tree/main/extraction/) | [`maathimself/mailflow`](https://github.com/maathimself/mailflow) | Inventory captured; 1,319 files remain unclassified; no application source copied; licensing and closure gates pending. Central monitoring disabled until external pin retrieval is supported. | `source-extraction-agent/` (versioned local copy in MailFlow) |
| Future sources | Source-specific workspace in the owning repository or an explicitly selected library path | Owner-supplied repository/ref | Register provenance and state before monitoring | Same global framework |

## Important distinctions

- A source library existing does not mean every capability is complete.
- Inventory complete does not mean dependency closure complete.
- An extraction proposal pin is not an approved immutable snapshot.
- Doable is reference material for Clara Core, not Clara Core's upstream source.
- MailFlow remains governed by its own AGPL-3.0/commercial-license/CLA review; do not infer redistribution rights.
- The central catalog records navigation and governance; source-specific evidence is maintained in its designated workspace.

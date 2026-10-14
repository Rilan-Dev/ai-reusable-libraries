# Source Library Catalog

This is the human-readable navigation view. The machine-readable registry is `project-control/source-library/sources.json`.

| Source/library | Repository area | Upstream | Current state | Global method |
|---|---|---|---|---|
| Doable Source | `doable-source/` | Doable upstream; confirm pin from its own manifest before monitoring | Existing source library and capability catalog; use its own verification records | `source-extraction-agent/` |
| Clara Core | `clara-core/` | Clara AI Platform | Incremental extraction; manifest currently records 108 immutable entries | `source-extraction-agent/` |
| MailFlow | `mailflow-source-library/` | [Rilan-Dev/mailflow](https://github.com/Rilan-Dev/mailflow) | Inventory captured; 1,319 files remain unclassified; no application source copied; licensing and closure gates pending | `source-extraction-agent/` |
| Future sources | New source-specific folder | Owner-supplied repository/ref | Add only after recording provenance and state | Same global framework |

## Important distinctions

- A source library existing does not mean every capability is complete.
- Inventory complete does not mean dependency closure complete.
- An extraction proposal pin is not an approved immutable snapshot.
- Doable is reference material for Clara Core, not Clara Core's upstream source.
- MailFlow remains governed by its own AGPL-3.0/commercial-license/CLA review; do not infer redistribution rights.

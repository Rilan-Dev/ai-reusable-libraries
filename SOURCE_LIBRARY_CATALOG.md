# Source Library Catalog

This is the human-readable navigation view. The machine-readable registry is `project-control/source-library/SOURCE_LIBRARY_CATALOG.json`.

| Source/library | Repository area | Upstream | Current state | Global method |
|---|---|---|---|---|
| Doable Source | `doable-source/` | Doable upstream; confirm pin from its own manifest before monitoring | Existing source library and capability catalog; use its own verification records | `source-extraction-agent/` |
| Clara Core | `clara-core/` | Clara AI Platform | Incremental extraction; manifest currently records 108 immutable entries | `source-extraction-agent/` |
| MailFlow | [Rilan-Dev/mailflow `extraction/`](https://github.com/Rilan-Dev/mailflow/tree/main/extraction/) | [Rilan-Dev/mailflow](https://github.com/Rilan-Dev/mailflow) | Source-specific records moved to MailFlow repo; 1,319 files remain unclassified; no application source copied; licensing and closure gates pending | Vendored `source-extraction-agent/` copy in MailFlow, based on this canonical framework |
| Future sources | New source-specific folder | Owner-supplied repository/ref | Add only after recording provenance and state | Same global framework |

## Important distinctions

- A source library existing does not mean every capability is complete.
- Inventory complete does not mean dependency closure complete.
- An extraction proposal pin is not an approved immutable snapshot.
- Doable is reference material for Clara Core, not Clara Core's upstream source.
- MailFlow's extraction workspace and local copy of the generic framework are maintained in `Rilan-Dev/mailflow`; this repository retains the canonical framework and cross-source catalog, not duplicate MailFlow evidence.
- MailFlow remains governed by its own AGPL-3.0/commercial-license/CLA review; do not infer redistribution rights.

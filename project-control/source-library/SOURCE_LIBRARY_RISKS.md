# Source Library Program Risks

- **GSR-001:** Duplicated prompts can drift if product folders maintain independent copies. Mitigation: canonical prompts live under `source-extraction-agent/`.
- **GSR-002:** Automated watchers could encourage blind syncing. Mitigation: watcher creates review issues only; no source copying, pin promotion or merging.
- **GSR-003:** A proposed source pin may be mistaken for an approved snapshot. Mitigation: source-specific gate state remains authoritative and must be explicit.
- **GSR-004:** Legal terms can vary by path/assets or include commercial alternatives. Mitigation: path-level license/provenance review and unresolved legal questions block redistribution.

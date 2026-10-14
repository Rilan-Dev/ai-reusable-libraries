# Source Library Program Risks

- **GSR-001:** Duplicated prompts can drift if product folders maintain independent copies. Mitigation: canonical prompts live under `source-extraction-agent/`; any local framework copy must record its upstream pin and be refreshed deliberately.
- **GSR-002:** Automated watchers could encourage blind syncing. Mitigation: watcher creates review issues only; no source copying, pin promotion or merging.
- **GSR-003:** A proposed source pin may be mistaken for an approved snapshot. Mitigation: source-specific gate state remains authoritative and must be explicit.
- **GSR-004:** Legal terms can vary by path/assets or include commercial alternatives. Mitigation: path-level license/provenance review and unresolved legal questions block redistribution.
- **GSR-005:** A source-specific working area in the central repository can become a stale second authority. Mitigation: maintain source-specific work records in the designated source workspace and keep only catalog/navigation/governance records centrally.
- **GSR-006:** Enabling MailFlow monitoring before external-pin support could cause the workflow to fail or read the wrong pin. Mitigation: `watch_enabled: false` until external repository pin retrieval is safely implemented and verified.

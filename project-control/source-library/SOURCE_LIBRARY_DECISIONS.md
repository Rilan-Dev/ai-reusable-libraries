# Source Library Program Decisions

## SLD-001 — One global extraction architecture

- **Status:** Accepted; merged to `main` in PR #5.
- **Decision:** Use `source-extraction-agent/` as the canonical shared extraction framework for all source libraries.
- **Rationale:** Generic rules, prompts, schemas, agent roles, update capture and verification should be maintained once and reused for Doable Source, Clara Core, MailFlow and future upstreams.
- **Boundary:** Generic framework ownership remains here; each source's evidence, memories, sessions and working state belong in its designated source workspace.
- **Authority:** User instruction on 2026-10-14.

## SLD-002 — MailFlow owns its extraction working records

- **Status:** In implementation; PRs #1 and #6 are open.
- **Decision:** Keep MailFlow-specific pins, inventories, path dispositions, capability maps, source-specific project-control, memory, sessions, and verification evidence in `Rilan-Dev/mailflow/extraction/`. Keep the canonical reusable framework and cross-source catalog in this repository.
- **Framework copy:** MailFlow may carry a versioned local snapshot of `source-extraction-agent/` for self-contained work. The local copy records the canonical commit and is updated only through a deliberate review.
- **Monitoring:** Disable central MailFlow monitoring until the watcher can safely retrieve and validate the pin from the external workspace.
- **Authority:** User instruction on 2026-10-14.

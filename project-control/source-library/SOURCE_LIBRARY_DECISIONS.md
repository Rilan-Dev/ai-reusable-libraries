# Source Library Program Decisions

## SLD-001 — One global extraction architecture

- **Status:** Proposed in this branch; pending merge.
- **Decision:** Use `source-extraction-agent/` as the canonical shared extraction framework for all source libraries.
- **Rationale:** Generic rules, prompts, schemas, agent roles, update capture and verification should be maintained once and reused for Doable Source, Clara Core, MailFlow and future upstreams.
- **Boundary:** Product-specific folders store source facts and evidence, not duplicate generic prompts or agent architectures.
- **Authority:** User instruction on 2026-10-14.

# MailFlow Extraction Workspace — Moved to the MailFlow Repository

MailFlow-specific extraction records are being consolidated in the target repository so memories, sessions, manifests, source pins, project-control and evidence have one authoritative home.

- **Authoritative workspace:** https://github.com/Rilan-Dev/mailflow/tree/chore/self-contained-source-extraction/extraction/
- **Migration PR:** https://github.com/Rilan-Dev/mailflow/pull/3
- **Canonical upstream being analyzed:** https://github.com/maathimself/mailflow
- **Reusable framework:** [`source-extraction-agent/`](../source-extraction-agent/README.md), retained here as the canonical shared framework and vendored into the MailFlow repository for self-contained use.

Do not continue maintaining source-specific manifests, memory or progress in this directory. Once the MailFlow workspace migration is merged, this directory is only a pointer. The global catalog will track the upstream and link to the source-owned workspace; it will not duplicate source-specific evidence.

The migration does not copy any upstream application source and does not authorize an immutable source snapshot. The proposed discovery pin remains unapproved; all 1,319 upstream blobs remain unclassified, with license/provenance, dependency closure and independent reconciliation outstanding.

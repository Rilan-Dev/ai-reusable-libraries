# MailFlow Upstream Update Notes

This file is specific to MailFlow's baseline and known risks. The global procedure is maintained once at:

- `../source-extraction-agent/prompts/11-upstream-update-review.md`
- `../source-extraction-agent/workflows/upstream-update-capture.md`
- `../source-extraction-agent/templates/upstream-update-report.md`

For every upstream update, record baseline/latest commit and tree, changed path identities, capability/dependency impact, license/provenance review, verification evidence and an explicit promotion decision. Preserve the previous pin/snapshot. Never blind-sync, overwrite or auto-promote.

MailFlow-specific checks:
- Review AGPL-3.0 and the separate commercial licensing path and CLA.
- Re-evaluate notices, icons, fonts, third-party assets and per-path provenance.
- Reconcile all changes against the current path-disposition register and capability/dependency evidence.
- An update issue is only a review trigger; it does not authorize source copying or PASS.

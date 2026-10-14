# Source Library Program Issues

- **GSL-001 — Default-branch convergence:** MailFlow workstream was previously merged into `feature/source-extraction-agent`, not `main`; this PR brings source records into a branch based on `main`.
- **GSL-002 — Watcher unverified:** Generalized workflow has not been executed end-to-end; scheduled workflow only activates after merge to default branch.
- **GSL-003 — MailFlow closure/licensing:** 1,319 paths remain unclassified; AGPL-3.0, separate commercial license and CLA require explicit review.
- **GSL-004 — Other source pins:** Confirm Doable and Clara upstream pins before turning on automated monitoring for them.

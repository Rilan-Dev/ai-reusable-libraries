# Source Library Program State

- **Program:** Shared reusable source-library system in `Rilan-Dev/ai-reusable-libraries`.
- **Current phase:** Maintain the canonical shared extraction framework and cross-source catalog while each source repository owns its own extraction evidence.
- **State:** IN_PROGRESS.
- **Authority:** User requested globally reusable extraction rules/prompts/agent control and repo-native cross-source progress management.
- **Global method:** `source-extraction-agent/` is canonical for every source; source-specific directories hold source data/evidence, not duplicated generic prompt architectures.
- **Current source workstreams:** Doable Source, Clara Core, MailFlow.
- **Verification status:** Global architecture PR #5 is merged. MailFlow workspace migration is proposed in `Rilan-Dev/mailflow` PR #2; its Git tree structure was inspected via API, but the local Node verifier remains unexecuted. External MailFlow watching is disabled until the watcher can safely read a pin in another repository.
- **Safety boundary:** No new source-copy authorization is implied. MailFlow remains discovery/closure/license review only.

- Global architecture PR #5: https://github.com/Rilan-Dev/ai-reusable-libraries/pull/5 — merged 2026-10-14.
- MailFlow self-contained workspace PR #2: https://github.com/Rilan-Dev/mailflow/pull/2 — open and not merged at the time of this update.
- MailFlow-specific records should be maintained in `Rilan-Dev/mailflow/extraction/`; this repository retains the canonical generic framework and the cross-source program catalog.


## 2026-10-14 — MailFlow workspace ownership

MailFlow extraction state, manifests, sessions, memory, verifier, and a versioned copy of all 63 generic framework files are proposed in `Rilan-Dev/mailflow` under `extraction/` and `source-extraction-agent/`. This repository should not be the day-to-day home for MailFlow-specific records. Catalog status now points to the MailFlow repo, and monitoring is disabled until cross-repository pin handling is implemented.

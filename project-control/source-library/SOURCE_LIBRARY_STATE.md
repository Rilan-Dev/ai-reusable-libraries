# Source Library Program State

- **Program:** Shared reusable source-library system in `Rilan-Dev/ai-reusable-libraries`.
- **Current phase:** Consolidate global framework and source workspace boundaries.
- **State:** IN_PROGRESS.
- **Authority:** User requested globally reusable extraction rules/prompts/agent control and repo-native cross-source progress management, with MailFlow-specific extraction documents maintained in the MailFlow repository.
- **Global method:** `source-extraction-agent/` is canonical for every source; source repositories may carry a pinned versioned copy for self-contained sessions.
- **Current source workstreams:** Doable Source, Clara Core, MailFlow.
- **MailFlow workspace:** https://github.com/Rilan-Dev/mailflow/tree/main/extraction/ (migration PR #1 is open; not merged at the last check).
- **Verification status:** Global architecture PR #5 was merged. The MailFlow inventory verifier and central watcher remain unexecuted/unverified end-to-end.
- **Safety boundary:** No new source-copy authorization is implied. MailFlow remains discovery/closure/license review only.

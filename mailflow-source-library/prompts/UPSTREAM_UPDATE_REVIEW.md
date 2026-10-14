# Upstream Update Review Prompt — MailFlow

Review upstream changes to https://github.com/Rilan-Dev/mailflow as a proposed library update. Read source-extraction-agent rules and mailflow-source-library/SOURCE_UPDATE_PLAYBOOK.md.

Inputs: old approved pin in source-pins/current.json; new commit/tree from the tracking issue; compare URL; existing immutable snapshots and manifests.

1. Never modify or replace the previous snapshot or evidence.
2. Confirm source commit and root tree via Git Data API.
3. Fetch the full commit range and produce changed-path inventory including old/new blob SHA, mode, status and commit messages.
4. Inspect patches plus related callers, tests, schemas, migrations, configs, permissions, runtime and release paths. Expand until dependency closure is complete.
5. Map changes to capabilities and label added/changed/removed, behavior, security, data/schema, UI/platform, build/test and license impact.
6. Re-evaluate licensing/provenance for new or changed paths.
7. Generate a new versioned snapshot proposal and verifier report. Do not update the approved pin or claim PASS until exact-copy and independent reconciliation evidence exist.
8. Add/update tests for change detection and snapshot verification; report exact commands, exit codes and links.
9. Append worklog and update NEXT_ACTION, VERIFICATION_STATE and CHAT_CONTINUITY.
10. Open a PR with risk-aware summary. Never merge automatically.

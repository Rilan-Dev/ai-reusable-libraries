# User Guide — MailFlow Source Library

This is the end-to-end guide for a human working with ChatGPT, Codex, Claude Code, Z.AI or another repository-aware AI coding agent.

## A. Initial extraction

1. Open Rilan-Dev/ai-reusable-libraries on branch extraction/mailflow-source-library.
2. Give the agent repository access to Rilan-Dev/mailflow and Rilan-Dev/ai-reusable-libraries.
3. Paste prompts/INITIAL_EXTRACTION.md into the agent.
4. Require it to read source-extraction-agent/AGENTS.md, the extraction rules/specification and every MailFlow project-control file before changing anything.
5. Confirm the live main commit and root tree match source-pins/current.json. If either differs, stop and reconcile the baseline first.
6. Map architecture and capabilities: backend/server, web frontend, plugins, Electron desktop, Android, PWA, database migrations, IMAP/SMTP, authentication/OIDC/OAuth, contacts/CardDAV, rules, search, notifications, AI assistant, image proxy/privacy, build and release.
7. For every capability, trace entry points, callers, types/contracts, data models/migrations, config/secrets, runtime, UI, tests, platform packaging and external dependencies. A filename list is not enough.
8. Classify every path as first-party reusable, host-specific, third-party/dependency, generated/build artifact, docs/test, asset/license-sensitive or excluded with a reason. Unknown is not a valid final disposition.
9. Run closure analysis and independent reconciliation. Resolve all unknown paths and dependency edges.
10. Only after a machine-evidenced gate PASS and controller authorization, copy selected source byte-for-byte into a versioned immutable snapshot. Preserve paths and modes; do not reformat or fix the copied code.
11. Build separate capability indexes, dependency maps, provenance/license reports and host-adapter guidance.
12. Verify copied blob identities and the resulting tree against the pinned source. Record commands, exit codes and evidence.
13. Append the worklog and update next action, continuity and verification state.

## B. Resume in a new chat

Paste this instruction:

Resume the MailFlow source-library work. Read source-extraction-agent/README.md and AGENTS.md, then mailflow-source-library/project-control/CHAT_CONTINUITY.md, CURRENT_PHASE.md, NEXT_ACTION.md, VERIFICATION_STATE.md, DECISIONS.md, ISSUES.md, RISKS.md and WORKLOG.md. Inspect live Git refs and compare them with source-pins/current.json. Do not repeat completed work, delete history, mutate immutable source, or advance a gate without raw evidence. Report completed work, pending work, missing evidence, changed files and the single next safe action.

## C. When upstream commits change

1. The scheduled watcher checks main every six hours and can be run manually from GitHub Actions.
2. If the upstream commit advances, it opens a tracking issue with old/new pins and a compare link.
3. Start an AI agent with prompts/UPSTREAM_UPDATE_REVIEW.md.
4. The agent lists changed paths and object IDs, reads patches and commit messages, traces related callers/tests/migrations/config/release paths, and expands the change set until dependency closure is complete.
5. It updates a proposal manifest and impact report. It must not overwrite the current recorded baseline or immutable snapshot.
6. Review license/provenance changes and run verification.
7. Open a PR advancing the library pin only after checks and independent reconciliation. Keep older snapshots and reports.

## D. Separate agent roles

- Controller/architect: approves scope and gates; records PASS only after evidence review.
- Discovery agent: inventories capabilities and dependencies; does not copy source.
- Copy/verifier agent: exact copies only after authorization; records hashes and command results.
- Update-review agent: evaluates upstream commits and proposes library updates; does not auto-merge.
- Implementer: writes host adapters/examples outside immutable source.
- CI/operations agent: runs checks and records actual results.

Do not let an agent approve its own work without independent evidence.

## E. Reusable prompt pattern

Recover checkpoint, inspect pinned source, map capability and dependency closure, report evidence and gaps, make only authorized changes, run checks, append worklog, update continuity and hand off without claiming PASS unless proven.

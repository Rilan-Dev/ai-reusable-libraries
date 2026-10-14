# Next Action

1. Read source-extraction-agent/AGENTS.md, rules/spec and all MailFlow project-control files.
2. Reconfirm live main commit/tree against source-pins/current.json; stop if either differs.
3. Audit architecture and build/test surfaces from README, CLA, licenses, CI, package manifests, Docker/config, migrations, backend/frontend and platform packages.
4. Produce all-path dispositions and capability/dependency manifests. Trace end-to-end flows and high-risk security/privacy/auth/data paths.
5. Run closure scan and independent reconciliation; resolve unknown paths and missing dependency edges.
6. Only after gate PASS, plan versioned immutable copy and exact blob/tree verification.
7. Validate the source watcher safely and document update review.
8. Append evidence and precise next action; never delete completed history.


## Update — 2026-10-14
The complete tree inventory and preliminary candidate index are now present. All 1,319 file paths are explicitly registered but remain UNCLASSIFIED. The watcher workflow is authored but not yet verified on a default-branch run.

Immediate next action: inspect high-risk and central architecture paths (backend entry/config, package manifests, IMAP manager, message service/parser, auth/OIDC/OAuth, image proxy/sanitizer, migrations, plugin boundary, frontend app, Electron/Android security and CI); map their callers and tests; update the per-path disposition register with evidence. Do not copy source until the closure and license gates pass.


## Architecture map update
The initial map now includes 16 candidate capability areas with pinned blob identities and test candidates. Immediate next step is to expand each candidate through actual imports/callers, schema/migrations, configuration, permissions, runtime and tests, then use evidence to classify paths. High-risk priority: auth/OAuth, safeFetch/image proxy/email sanitizer, IMAP move/sync, plugin isolation, migrations, native Electron/Android security and update watcher permissions.


## Verification update
Stored-manifest consistency was checked against the pinned tree and passed with zero mismatches. Next run tools/verify-inventory.mjs in a local checkout or through CI, then continue actual content/call-chain discovery and path classification. Do not confuse manifest consistency with extraction closure.

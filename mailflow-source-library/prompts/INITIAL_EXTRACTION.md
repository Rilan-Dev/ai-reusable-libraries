# Initial Extraction Prompt — MailFlow

You are the discovery agent for a source library of https://github.com/Rilan-Dev/mailflow. Follow source-extraction-agent/AGENTS.md, extraction rules and specification. Read all existing project-control files first.

Proposed source baseline: commit e7a53760a7e4b15e0ee631533655d99dde657599; root tree 27059315bc16155f0064dc136aae94cd5097cb02. Reconfirm both against live main.

Tasks:
1. Recover the checkpoint and inspect existing source-library artifacts. Preserve completed work; never delete historical records.
2. Audit README, contributor guidance, CLA, licenses, root structure, build/test/CI, manifests and all 1462 tree entries.
3. Produce architecture and capability inventory for server/backend, web UI, plugins, Electron, Android/PWA, persistence/migrations, IMAP/SMTP, OAuth/OIDC/auth, contacts/CardDAV, search, rules, AI assistant, notifications, image proxy/privacy, build/package/release and tests.
4. Trace each candidate capability through entry points, implementation, callers, data models, config/secrets, UI, tests, runtime and third-party dependencies.
5. Give every path an explicit disposition and reason. Unknown/unclassified paths block closure.
6. Run discovery, dependency-closure and reconciliation steps. Save raw outputs and exact commands.
7. Do not copy application source yet and do not change source-pins/current.json. Copying is blocked until closure, license/provenance review and independent reconciliation pass.
8. Produce a proposed exact-copy plan and verifier requirements; append worklog and update continuity/verification.
9. Return changed files, commands/results, evidence paths, unresolved edges and one exact next action. Do not self-approve PASS.

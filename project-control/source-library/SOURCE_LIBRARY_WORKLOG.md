# Source Library Program Worklog

## 2026-10-14 — Global architecture clarification

- User clarified that extraction prompts, rules, agent controls, update-capture process and templates must be globally reusable for any upstream, not designed around MailFlow.
- Established the intended boundary: `source-extraction-agent/` is the canonical engine; source-specific directories hold only source pins, inventories, evidence, source-specific license notes and workstream state.
- Added central source-library program navigation, catalog and roadmap under this repository's `project-control/source-library/`.
- Imported MailFlow inventory and workstream records onto the global architecture branch without importing its duplicate product-local prompts.
- Added generic upstream-change review prompt and workflow plus a registry-driven watcher design. Watcher execution and local verifier execution are pending.

## 2026-10-14 — PR opened

- Opened PR #5: https://github.com/Rilan-Dev/ai-reusable-libraries/pull/5 from `architecture/global-source-library-control` to `main`.
- Head commit: `91b734633d4b64649e1e318d5629d75c9098b591`; GitHub reports the PR mergeable and open.
- Confirmed the MailFlow workstream records are present in the branch and `mailflow-source-library/prompts/` is absent; generic update prompt/workflow/report live under `source-extraction-agent/`.
- Confirmed the registry enables upstream watching for MailFlow only; Doable and Clara monitoring remain disabled pending pin reconciliation.
- Not yet run: local Node inventory verifier or manual GitHub Actions workflow dispatch.


## 2026-10-14 — MailFlow extraction workspace moved to MailFlow repo

- User clarified that MailFlow-specific extraction, memory, sessions and document records should live in the MailFlow repository, alongside a self-contained copy of the generic framework.
- Added a proposed workspace in `Rilan-Dev/mailflow` PR #2: https://github.com/Rilan-Dev/mailflow/pull/2. It vendors all 63 generic framework files and places MailFlow-specific pins, inventories, project-control, verifier, memory and sessions under `extraction/`.
- Updated this repository's machine-readable and human-readable catalog to point to MailFlow's own `extraction/` folder.
- Disabled MailFlow monitoring in the global catalog because the current watcher assumes a source pin lives in this repository. Do not re-enable until external-repository pin support exists.
- This branch removes the duplicated MailFlow-specific workstream folder after the MailFlow-owned workspace is established. The reusable framework remains canonical here.
- Safety remains unchanged: 1,319 source blobs are unclassified, licensing/provenance and dependency closure are pending, and no source-copy authorization is granted.

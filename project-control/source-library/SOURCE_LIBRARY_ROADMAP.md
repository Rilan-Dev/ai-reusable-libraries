# Global Source Library Roadmap

## Phase GSL-1 — Global operating model
- [x] Define one canonical extraction agent and global prompt/rule/schema/template location.
- [x] Define source catalog and independent per-source evidence boundaries.
- [x] Define a cross-source project-control checkpoint in this repository.
- [x] Merge the global architecture into the default branch.

## Phase GSL-2 — Update capture
- [x] Define a generic upstream-change review prompt and workflow.
- [x] Add a configurable source registry.
- [ ] Extend the watcher to fetch and validate source pins from external workspaces such as `Rilan-Dev/mailflow`.
- [ ] Run the global watcher manually and verify issue creation/update behavior after external-pin support is implemented.
- [ ] Confirm GitHub Actions schedule runs from the default branch.

## Phase GSL-3 — Source workstream convergence
- [ ] Merge MailFlow workspace PR #1: https://github.com/Rilan-Dev/mailflow/pull/1.
- [ ] Merge the catalog/cleanup PR #6 after reviewing the MailFlow migration: https://github.com/Rilan-Dev/ai-reusable-libraries/pull/6.
- [ ] Validate Doable Source's pin and current verifier evidence.
- [ ] Validate Clara Core's pin, closure and verifier evidence.
- [ ] Enable monitoring for Doable and Clara only after source/ref/pin are verified.

## Phase GSL-4 — Continuous quality
- [ ] Add source-update report schema validation and regression tests.
- [ ] Add cross-source status dashboard generation from source registry + per-source state.
- [ ] Define promotion/release process for versioned immutable snapshots.
- [ ] Add automated detection for unclassified paths, stale evidence and unresolved closure edges.

# Prompt 01 — Upstream repository onboarding

Analyze the specified upstream repository without modifying its source.

- Confirm repository identity and access; list available refs and determine the requested source ref.
- Pin commit SHA and root tree SHA; preserve license, NOTICE, submodule, LFS and provenance information.
- Inspect root layout, repository guidance, workspaces, package manifests, lockfiles, CI, tests, migrations and runtime/deployment docs.
- Build an initial architecture map across API, workers, UI, CLI, packages, services, protocols and runtime.
- Record unknowns as issues. Never infer a missing tree or use the current default branch as a substitute for a requested pinned commit.
- Save source identity and onboarding evidence in project-control/evidence and update CURRENT_PHASE/NEXT_ACTION.

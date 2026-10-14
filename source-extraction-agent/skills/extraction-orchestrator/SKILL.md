# Skill: Extraction Orchestrator

## Trigger
Any request to start, resume, plan, or coordinate reusable source extraction.

## Procedure
1. Read AGENTS.md and EXTRACTION_RULES.md.
2. Run session recovery before any changes.
3. Confirm upstream identity, pinned commit/tree, target package root, license and authorized scope.
4. Dispatch focused skills for architecture, capability hunting, business logic, UI, closure and verification; avoid duplicate work by assigning bounded outputs.
5. Maintain a capability ID registry and evidence index.
6. Gate transitions using workflows/verification-gates.md.
7. Keep independent discovery/documentation work moving while unrelated CI runs, but never bypass required extraction gates.
8. Update project-control on every handoff.

## Output
Checkpoint summary, current phase, inventory deltas, blockers/evidence, changed files, actual results, and next action. Never claim a gate based on narrative alone.

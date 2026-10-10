# Copy the source extraction agent into any project

1. Copy the complete `source-extraction-agent/` folder into the target repository, preserving its relative structure.
2. Read `AGENTS.md`, `EXTRACTION_RULES.md`, and `EXTRACTION_AGENT_SPEC.md`.
3. Create or recover a target-specific project-control checkpoint; never carry over another target's commit, evidence or PASS status.
4. Fill `templates/extraction-request.md` and pin the upstream repository commit and root tree.
5. Run prompts 00–06 to recover context, onboard, map architecture, inventory capabilities, trace business logic/UI and close dependencies.
6. Run prompt 08 as an independent second pass and reconcile all candidates.
7. Do not run prompt 07 until discovery, closure and reconciliation gates are explicitly authorized.
8. Keep copied upstream files byte-identical under immutable roots. Put contracts, adapters, inventories, reports and generated tooling elsewhere.
9. Run the verifier against the actual pinned source checkout and extracted package; retain raw evidence.
10. Only after extraction PASS, ask a coding agent to implement one capability using its manifest and host boundaries.

Example instruction to an implementation agent:

> Implement the complete capability described by the selected capability manifest using the immutable source and dependency closure it references. Do not invent simplified stubs when the upstream implementation exists. Preserve upstream behavior. Adapt only explicitly documented host boundaries. Do not modify immutable source. Record tests, gaps, and evidence.

Do not claim that copying this agent folder verifies any upstream extraction. Each target needs its own independent pinned snapshot, manifests, reconciliation and verification.

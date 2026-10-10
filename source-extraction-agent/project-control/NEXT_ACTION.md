# Next action

1. Review PR #2's final diff, keeping the base at `feature/ai-project-control-protocol` so unrelated parent-branch changes are excluded.
2. Confirm the latest head's package-check workflow result after the APCP navigation links and worklog update; do not repeatedly poll while independent work remains.
3. Address any reviewer feedback or newly observed CI failure without modifying immutable upstream source.
4. After PR review/merge authorization, begin target-specific source extraction by recovering the target repository's latest project-control and pinned commit/tree.
5. For OmniRoute, resume from its existing extraction branch/worklog and resolve the actual current verifier/evidence gap before any new copy.
6. Do not claim an upstream extraction PASS until that target's pinned source, closure, reconciliation, immutable copy, and verifier are all evidenced.

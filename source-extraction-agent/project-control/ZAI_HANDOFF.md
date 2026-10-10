# Z.AI handoff

## Mission
Implement and maintain the source extraction agent package under source-extraction-agent/ without modifying immutable upstream source.

## First actions
1. Read AGENTS.md, EXTRACTION_RULES.md, EXTRACTION_AGENT_SPEC.md and project-control/NEXT_ACTION.md.
2. Inspect parent project-control files before integration.
3. Complete publishing and actual checkout verification.
4. Implement executable verifier and tests as a separate bounded task.
5. Update WORKLOG and all relevant checkpoint files before stopping.

## Boundaries
Do not start a target repository's host integration before extraction PASS. Do not claim checks or commits that were not observed. Stop and report any access or licensing blocker.

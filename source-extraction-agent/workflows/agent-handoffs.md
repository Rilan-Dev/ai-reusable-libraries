# Agent handoffs

## Controller / architect
Defines scope, resolves conflicts, authorizes gates, reviews evidence and declares phase outcomes.

## Implementation agent
Executes one bounded task, reads latest control state, avoids unauthorized scope, records changes and evidence, updates worklog and stops at handoff.

## Error-fixing agent
Reproduces a specific tooling/verifier failure, identifies root cause, modifies extraction tooling only (never immutable upstream source), adds regression coverage where appropriate, records prevention rules and returns evidence.

## Verification agent
Runs independent verification, records exact commands/results/artifacts and reports discrepancies. It must not repair source silently while verifying.

Agents must not overwrite each other's state; serialize shared-state writes and append worklog entries.

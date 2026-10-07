# APCP Design — Final

## Purpose
Provide reusable governance for AI-assisted software projects that survives new conversations.

## Key design correction
The protocol explicitly separates authority, authorization, state, decisions and evidence. A markdown state file is not automatically truth; a plan is not automatically authorization; a passing test is not automatically phase completion.

## Four ledgers
State ledger: what exists now.
Authorization ledger: what may change now.
Decision ledger: why durable choices were made.
Evidence ledger: what was actually observed.
WORKLOG links these over time.

## Governance
Phases have explicit entry and exit conditions. Closure requires evidence, review disposition, scope reconciliation and explicit authority.

## Continuity
CHAT_CONTINUITY contains recovery procedure and stable facts, while current state remains in dedicated state files and Git.

## Async execution
CI/CD is an evidence stream, not a universal blocker. Independent authorized work may continue, but pending jobs cannot be reported as passing.

## Security
Never place secrets, tokens, credentials or unnecessary personal data in project-control records.
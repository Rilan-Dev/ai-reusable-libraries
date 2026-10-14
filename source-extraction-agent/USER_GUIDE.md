# Source Extraction Agent — User Guide

## Start here
Read README.md, AGENTS.md, EXTRACTION_RULES.md and EXTRACTION_AGENT_SPEC.md, then recover the package's project-control checkpoint. When copying this agent to a target repo, keep target-specific source pins, worklogs and verification state separate; never copy a PASS status from one repo to another.

## How to prompt
Start with: “Recover the latest repository checkpoint from Git and project-control. List completed, pending, blocked and awaiting-evidence work. Preserve historical records and continue the next safe action.”

Then use separate stages: pin source/license/tree; map architecture; inventory capabilities and trace business/UI behavior; close static/dynamic/data/runtime dependencies; perform independent second pass; present gate evidence; copy exact source only after authorization; run actual verifier; append worklog and hand off.

## Roles
Investigator discovers and documents; exact-copy implementer copies only after gate authorization; independent verifier/reconciler checks identity and closure; controller alone declares PASS. If only one agent is available, perform distinct passes and identify their evidence.

## Memory
Git objects and raw evidence outrank chat memory. Worklog is append-only; NEXT_ACTION is immediate; VERIFICATION_STATE is actual machine evidence; CHAT_CONTINUITY is the resume index. Never delete completed work docs; mark them completed/superseded and append an explanation. Never store credentials in memory files.

## User handoff
Always report changed files, actual checks, completed work, pending features, awaited evidence, blockers, gate state and one next action. A green CI run on an earlier commit is not evidence for current HEAD. This guidance package is not itself proof that any upstream source extraction passed.

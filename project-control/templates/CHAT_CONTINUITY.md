# Chat Continuity

This file defines recovery procedure, not current product truth.

## Recovery order
1. Repository instructions.
2. This file.
3. NEXT_ACTION.
4. CURRENT_PHASE.
5. PROJECT_STATE.
6. IMPLEMENTATION_PLAN.
7. Active decisions/issues/risks/verification.
8. Recent Git history.

## Durable project facts
- <stable facts>

## Project-specific operating rules
- <rules>

## Unknown/stale areas
- <items>

## Last session
- Date: <date>
- Completed: <summary>
- Evidence: <summary>
- Unfinished: <summary>
- Next action: <exact action>

## Continuation test
A fresh AI must be able to determine phase, authorization, implementation state, verification state and next action from repository state alone.
## Agent continuity
- Registered agents: <references>
- Current agent owner: <agent ID / name>
- Active handoff: <reference>
- Latest agent events: <references>
- Relevant active lessons: <references>
- Pending rule proposals: <references>


## Autonomous agent recovery
Before continuing a multi-agent project, also read:
- AGENT_REGISTRY.md
- AGENT_MEMORY.md
- AGENT_EVENTS.md
- AGENT_BACKLOG.md when present
- active AGENT_HANDOFF.md

The fresh agent must recover its own role, the ownership of outstanding work, cross-agent blockers, suggested assignments, applicable lessons, and the next independent authorized task. Never infer these from chat memory.

# APCP Multi-Agent Interaction Protocol

The agents form a coordinated development team. **The repository is their durable communication bus.**

| ID | Name | Responsibility |
|---|---|---|
| DEV-01 | Forge | Product development |
| FIX-01 | Sentinel | Error fixing |
| OPS-01 | Shipwright | CI/CD and deployment |

Projects may add specialized agents, but every agent needs a stable unique ID, name, role and authority boundary.

## Shared communication
Agents communicate through `AGENT_HANDOFF.md`, `AGENT_MEMORY.md`, `AGENT_EVENTS.md`, `WORKLOG.md`, `DECISIONS.md`, `ISSUES.md`, `RISKS.md` and `VERIFICATION_STATE.md`.

## Handoff
A receiving agent must read the handoff and relevant memory before acting. A handoff cannot grant more authority than its referenced authorization.

## Collision control
One agent owns a mutable task at a time unless explicit coordination permits overlap. Before editing overlapping files, reconcile Git and active handoffs.

## Learning loop
`event → diagnosis → remedy → evidence → lesson → future agent consumption`. Record successful and failed approaches.

## Governance boundary
Agents can propose rule improvements. Only an authorized governance actor can approve and promote a proposal into APCP. Never erase historical rules or lessons; supersede them explicitly.


## Autonomous role isolation

**Non-transferable responsibility rule:** an agent may assist another agent through evidence or a handoff, but may not silently assume the other agent's role.

A blocker is classified as: (1) current-role-owned; (2) another-agent-owned; (3) governance/authorization-owned; (4) a genuine dependency; or (5) non-blocking.

For another-agent-owned work, the discovering agent must route the task, record the suggested assignment, and continue independent authorized work.

### No-wait protocol

Never use repeated polling as an autonomous work strategy. The standard loop is:

work → route blocker → durable backlog → next independent task → continue

Pending CI/CD, deployment, review and verification are not automatic stop conditions.

### Durable backlog

Use AGENT_BACKLOG.md for unresolved cross-agent work. The backlog records ownership and suggested action but never grants authorization or transfers role ownership.

### Suggested assignment

Every routed task should state: responsible agent, reason, authorization, base/current commit, exact action, required evidence and return information. This makes the assignment recoverable from a fresh chat.

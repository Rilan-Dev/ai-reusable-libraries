# Agent Backlog

Durable cross-agent work queue. This is not authorization. An item may only be executed when the responsible agent has compatible active authorization.

### AGENT-BACKLOG-<id>
**Discovered by:** <agent ID / name>
**Responsible agent:** <agent ID / name>
**Phase:** <phase>
**Authorization:** <authorization ID>
**Affected task:** <task>
**Type:** <BLOCKER | FOLLOW_UP | CI | DEPLOYMENT | VERIFICATION | DEFECT | DEPENDENCY>
**Priority:** <CRITICAL | HIGH | MEDIUM | LOW>
**Status:** <OPEN | ASSIGNED | IN_PROGRESS | PENDING | BLOCKED | RESOLVED | SUPERSEDED>
**Dependency:** <what must happen, or none>
**Suggested action:** <exact action for responsible agent>
**Evidence:** <current evidence>
**Next review condition:** <event/evidence that should cause re-evaluation>
**Created:** <timestamp>
**Updated:** <timestamp>
**Handoff:** <AGENT_HANDOFF reference or none>

## Rules
- Creating a backlog item does not transfer ownership.
- Backlog items do not grant authorization.
- Do not use the backlog as an excuse to repeatedly poll.
- Resolve items when new evidence arrives; preserve history.
- If the responsible agent is unavailable, escalate rather than silently taking over its role unless governance explicitly reassigns ownership.
# APCP State Invariants

1. VERIFIED requires current evidence for every mandatory acceptance criterion.
2. CLOSED requires VERIFIED, review disposition, scope reconciliation and explicit closure authority.
3. IN_PROGRESS requires an ACTIVE authorization covering the task.
4. BLOCKED requires a recorded blocker and recovery path.
5. PASS_WITH_FOLLOWUP requires explicit follow-up records.
6. STALE evidence cannot satisfy a current criterion.
7. A superseded decision cannot be active authority.
8. NEXT_ACTION may only target ACTIVE authorized work.
9. Phase transition cannot be inferred solely from commits.
10. CI success proves only what that job actually exercised.
11. Pending or failed CI does not automatically block unrelated independent implementation.
12. Worklog history is append-only; corrections are appended.
13. Revoked, expired or superseded authorization cannot justify new implementation.
14. A worker claim cannot promote implementation to VERIFIED or CLOSED.
15. Every implementation task must identify the owning agent and active authorization.
16. A handoff cannot grant authority beyond its referenced active authorization.
17. Agents must consume relevant reusable lessons before meaningful work and record significant new lessons afterward.
18. New requirements/plans must be reconciled against current active scope; initialization scope is not permanent authority.
19. A material scope change requires explicit impact analysis and updated/superseded authorization before affected implementation.
20. Completed work may be changed by later authorized scope, but historical implementation and decisions must remain traceable.
21. Agent rule improvements are proposals until explicitly approved by a governance authority.
22. An agent cannot approve its own rule-improvement proposal or use a proposal as implementation authorization.
23. Significant error/CI/deployment incidents require durable event/lesson records before being considered fully handed back.


24. A specialized agent must not silently assume another registered agent's role.
25. A blocker owned by another agent is a routing event, not authorization for the discovering agent to take over.
26. Cross-agent blockers should have durable ownership and a concrete suggested action when they affect project execution.
27. A pending asynchronous check is not a reason to stop independent authorized work.
28. Repeated polling/waiting for another agent or asynchronous system is prohibited when independent authorized work exists.
29. After completing or routing a task, an agent must select the next independent authorized task belonging to its role when one exists.
30. AGENT_BACKLOG entries record ownership and dependency but never grant authorization or transfer role ownership.
31. A fresh chat must be able to recover agent identity, role ownership, blockers, suggested assignments and lessons from repository state alone.

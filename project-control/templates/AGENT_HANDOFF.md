# Agent Handoff

### <HANDOFF-ID>
**From:** <agent ID / name>  
**To:** <agent ID / name>  
**Phase:** <phase>  
**Authorization:** <authorization ID>  
**Base commit:** <sha>  
**Task:** <exact task>  
**Allowed scope:** <files/behavior>  
**Prohibited changes:** <non-scope>  
**Acceptance:** <criteria>  
**Tests/evidence required:** <requirements>  
**Known lessons:** <AGENT_MEMORY references>  
**Known issues/risks:** <references>  
**Stop condition:** <boundary>  
**Return information:** <required hand-back>


**Suggested action:** <exact action for receiving agent>
**Evidence required:** <exact evidence/result>
**Return information:** <what originating agent needs back>
**Backlog item:** <AGENT-BACKLOG reference or none>

### Role boundary
The receiving agent must operate only within its registered role and referenced active authorization. This handoff does not transfer the sender's role or grant additional authority.


## Navigation requirement

Before meaningful work, use `project-control/NAVIGATION.md` to locate the applicable APCP control records and prompt. A fresh agent must recover state from the repository, including role, ownership, authorization, blockers, lessons and NEXT_ACTION. Do not depend on previous chat context. Cross-agent work routes through durable handoff/backlog records and never transfers authority by itself.
# APCP Agent Schema

An agent record must define:
- stable unique agent ID
- human-readable name
- role
- responsibilities
- allowed scope
- prohibited scope
- authorization source
- handoff requirements
- learning/logging obligations
- escalation path

Agent identity does not itself grant implementation authority. Active authorization remains mandatory.


Additional mandatory behavior for specialized agents:
- stable role boundary that cannot be silently transferred;
- explicit prohibited roles/responsibilities;
- blocker classification and routing behavior;
- autonomous continuation rule;
- no-wait/no-polling rule;
- durable backlog/handoff requirements;
- required suggested-assignment fields;
- fresh-chat recoverability requirements.

Role ownership is not the same as project ownership. A handoff communicates work but does not grant authority beyond the referenced active authorization.

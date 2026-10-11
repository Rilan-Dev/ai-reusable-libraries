# Memory and Continuity Protocol

Authority order: Git objects and raw verifier evidence; target repository's existing project-control/plans/sessions/manifests/worklogs; current checkpoint documents; chat/model memory (index only).

At session start inspect branch, HEAD, working tree, source pin, latest worklog, next action, prior handoff and raw verification. Separate completed/pending/blocked/awaiting-evidence and do not redo completed work because a chat changed.

At session end append a dated worklog entry, update next action and verification state, preserve historical plans, record exact commands/exit codes/artifact paths/commit SHAs/limitations, and write concise resume instructions. Never store secrets. If PASS evidence is stale, absent or for another source pin, mark current status unverified and explain why; preserve the historical record.

# Verification and Handoff Prompt — MailFlow

Verify exact pinned source identity, full path inventory, blob SHAs, modes, copied bytes and snapshot tree. Confirm selected capabilities have dependency closure, excluded paths have rationale, and no unknown paths remain. Verify licensing/provenance separately. Run relevant checks and report exact commands and exit codes. Missing or failed required checks mean BLOCKED/INCOMPLETE, not PASS. Append worklog and update continuity, next action, issues, risks and verification state. Hand evidence to the controller; do not approve your own gate.

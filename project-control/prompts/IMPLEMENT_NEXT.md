# APCP — Implement Next Authorized Action

Read NEXT_ACTION and its owning phase/plan. Confirm the action is authorized and not superseded.

Use the applicable Superpowers workflow. For testable feature or bug work, use TDD: failing test, observed failure, minimal implementation, observed pass, then broader verification.

Record deviations and rulings. Update VERIFICATION_STATE with command, scope, timestamp and actual result. Update NEXT_ACTION only after the actual state is known.

Continue to the next independent authorized task when safe; do not block on unrelated asynchronous work.

Stop at a phase boundary unless the authorization explicitly includes the next phase. Discoveries become issues, risks or future tasks; they do not become implementation authorization.
# APCP + Superpowers Workflow

APCP is the governance layer; Superpowers is the engineering workflow.

## Architectural work
1. Use brainstorming.
2. Establish shared understanding and approaches.
3. Present and approve the design.
4. Write and self-review the design specification.
5. Obtain written-spec approval.
6. Use writing-plans.
7. Obtain plan/execution approval when required.
8. Execute with TDD and the applicable implementation workflow.
9. Perform independent review.
10. Verify before claiming completion.
11. Update APCP ledgers and phase state.

## Bounded work
Use brainstorming for the bounded design, obtain approval, then implement through the normal TDD workflow. Do not create unnecessary architecture.

## Recovery/debugging
Use systematic-debugging for unexpected behavior or failed tests rather than patching symptoms.

## Completion
Use verification-before-completion before any claim that work is complete, fixed, passing or ready to close.

## APCP rule
Superpowers gates how engineering work is performed. APCP still decides whether the work is authorized, what phase owns it, what evidence is required and who may close the phase.
## Agent-aware Superpowers mapping
APCP agent identity determines who owns the work; Superpowers determines how the work is executed.

- New requirement or material scope change: brainstorming → specification → writing-plans → explicit approval → implementation.
- New implementation plan: brainstorming when needed → writing-plans → approval → TDD/implementation.
- Existing implementation change: systematic-debugging for defects, or brainstorming/specification/writing-plans for behavioral or architectural changes → TDD/implementation.
- Major implementation: requesting-code-review → corrective work → verification-before-completion.
- CI/CD/deployment failure: systematic-debugging owned by Shipwright, followed by evidence-backed verification.

If a requested change conflicts with current authorization, APCP reconciliation happens before Superpowers execution. Superpowers never grants authorization.

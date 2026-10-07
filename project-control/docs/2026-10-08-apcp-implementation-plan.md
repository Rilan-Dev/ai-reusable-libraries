# APCP Implementation Plan

> For agentic workers: use superpowers:executing-plans or superpowers:subagent-driven-development for implementation.

**Goal:** Publish APCP as a self-hosting reusable protocol in ai-reusable-libraries.

**Architecture:** A repository-native governance layer with separate state, authorization, decision and evidence ledgers. Operational prompts recover and mutate those records while Superpowers supplies the engineering workflow.

**Tech stack:** Markdown plus Git; no product runtime dependency.

**Spec:** project-control/docs/2026-10-08-apcp-design.md

## Global Constraints
- Repository is durable memory; chat memory is supplementary.
- Authorization, implementation, verification and closure remain distinct.
- Pending asynchronous CI/CD is not a PASS.
- Historical records are append-only.
- Secrets and unnecessary personal data are excluded from control files.

## Work packages
1. Core authority and lifecycle rules.
2. Fresh-chat recovery and operational prompts.
3. State, decision, issue, risk, evidence and worklog templates.
4. Delegated-worker handoff.
5. Superpowers integration.
6. Self-critique and verification invariants.
7. Repository review and publication.

## Acceptance
- A fresh AI can recover phase, authorization, state, evidence and next action without prior chat memory.
- State and evidence cannot be conflated.
- Async CI/CD does not unnecessarily block independent authorized work.
- No completion claim is allowed without fresh evidence.
- Phase closure requires explicit governance.
- Scope drift is recorded rather than silently implemented.
- The protocol is generic and provider-independent.
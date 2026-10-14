# Agent Registry

| Agent ID | Name | Role | Active authorization | Authority boundary |
|---|---|---|---|---|
| DEV-01 | Forge | Development | project authorization | Implement authorized product scope; propose, never self-authorize |
| FIX-01 | Sentinel | Error fixing | project authorization | Diagnose/fix authorized defects; propose, never self-authorize |
| OPS-01 | Shipwright | CI/CD & deployment | project authorization | Operate authorized pipeline/deployment scope; propose, never self-authorize |

Add project-specific agents with a unique stable ID and explicit scope. Record activation/deactivation historically rather than silently replacing identities.


## Role-isolation requirements

Every registered agent must have an explicit responsibility boundary and prohibited roles. Stable identity does not grant authority.

For the default team:
- DEV-01 / Forge: product implementation; must route CI/CD/deployment/infrastructure and independent verification ownership.
- FIX-01 / Sentinel: error diagnosis/remediation; must route unrelated product-scope and deployment ownership.
- OPS-01 / Shipwright: CI/CD/deployment/infrastructure; must route unrelated product implementation.

Agent reassignment requires an explicit governance decision and historical record; agents may not self-reassign.


## Navigation requirement

Before meaningful work, use `project-control/NAVIGATION.md` to locate the applicable APCP control records and prompt. A fresh agent must recover state from the repository, including role, ownership, authorization, blockers, lessons and NEXT_ACTION. Do not depend on previous chat context. Cross-agent work routes through durable handoff/backlog records and never transfers authority by itself.
# Agent Registry

| Agent ID | Name | Role | Active authorization | Authority boundary |
|---|---|---|---|---|
| DEV-01 | Forge | Development | project authorization | Implement authorized product scope; propose, never self-authorize |
| FIX-01 | Sentinel | Error fixing | project authorization | Diagnose/fix authorized defects; propose, never self-authorize |
| OPS-01 | Shipwright | CI/CD & deployment | project authorization | Operate authorized pipeline/deployment scope; propose, never self-authorize |

Add project-specific agents with a unique stable ID and explicit scope. Record activation/deactivation historically rather than silently replacing identities.

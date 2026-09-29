# Reusable Source Coverage Matrix

Source: Doable develop at a6036d1fd6dca83c08ee5affa141e5c85e45f5af.
Branch: ai-platform-core-extraction.

Every item requested for the reusable extraction is represented below.

| Requested capability | Reusable source location | Status |
|---|---|---|
| AI planning / clarification | doable-source/services/api/src/ai/modes/plan.ts, ai/tools/plan-tools.ts, editor plan UI | Source + UI |
| AI attachments / image inputs | doable-source/services/api/src/ai/attachments.ts, attachment UI, attachment DB migration | Source + UI |
| AI image generation / persistence | doable-source/mcp-servers/image-generator/, services/api/src/mcp/generated-image-persist.ts | Source |
| AI usage / credits / quotas | doable-source-extensions/usage/, billing/credits queries + migrations | Source + adapter |
| AI tracing / observability | AI trace collector/factory/infra + doable-source-extensions/observability/ | Source + adapter |
| AI audit trail | doable-source-extensions/audit/ + audit DB schema | Source + adapter |
| AI collaboration | doable-source/services/ws/, collaboration UI/source extensions | Source + adapter |
| AI + visual editing | visual-edit bridge, runtime render, editor visual-edit, comments | Source + UI |
| AI + project/runtime generation | project/runtime/build closure + agent tools | Source + adapter |
| Framework-aware AI prompting | doable-source/services/api/src/ai/framework-prompts/ | Source |
| AI-assisted templates/scaffolding | templates closure + framework/project sources | Source + adapter |
| GitHub AI/project workflow | GitHub extension + Git runtime + UI/query closure | Source + adapter |
| Realtime collaboration/Yjs | WS service + Yjs provider/document manager | Source + adapter |
| Version control/diff/restore | version-control extension + Git closure + editor history UI | Source + adapter |
| Analytics | doable-source-extensions/analytics/ | Source + adapter |
| Billing/credits/plans | billing + usage + DB queries/migrations + UI | Source + adapter |
| Notifications | doable-source-extensions/notifications/ | Source + adapter |
| Email infrastructure | doable-source-extensions/email/, API email closure | Source + adapter |
| Marketplace/discovery | marketplace backend/UI + marketplace-bundle | Source + adapter |
| Custom domains/deployment | deployment/domains extensions + Cloudflare closure | Source + adapter |
| Realtime WS + Yjs AI collaboration | services/ws + realtime-collaboration extension/UI | Source + adapter |
| Editor visual-edit/design-comment UX | visual-edit + design-comments + collaboration UI | Source + UI + adapter |
| Authentication/tenant/RBAC | auth + identity-rbac + middleware/RLS + workspace-role DB source | Source + adapter |
| Billing/subscriptions | billing API/UI + Stripe boundary + billing DB source | Source + adapter |
| PostgreSQL schema | dependency-closure/packages/db/ + DB migrations/query source | Source + adapter |
| Secrets/KEK | secrets source + DoVault + credential vault | Source + adapter |
| OS/container infrastructure | sandbox + runtime + process + docore/dovault | Source + adapter |
| Activepieces ecosystem | integration registry/runner/tool bridge + external package inventory | Source + external dependency |

## Important preservation rule

Nothing in this matrix should be recreated from memory in a target project. The target project should copy ai-platform-core/, inspect the manifest for the requested capability, preserve the source behavior, and only replace host boundaries.

## Classification

- Source: exact Doable implementation is preserved.
- UI: exact/reference interaction source is preserved.
- Adapter: host-specific integration is required.
- External dependency: package is intentionally not vendored and must be installed/selected by the host.
| AI security scanning | doable-source/services/api/src/security/, doable-source/services/api/src/routes/security.ts, dependency-closure/packages/db/src/queries/security.ts + migrations | Source + adapter |

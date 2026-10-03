# Platform Foundation — Reusable Doable Source

This capability promotes the platform-wide source that sits around the AI runtime and is required when copying Doable-derived features into another project.

## Requested coverage

- Authentication / tenant / RBAC.
- Billing / subscriptions / credits / plans.
- PostgreSQL schema, migrations and DB query source.
- Secrets / KEK / encrypted credentials.
- OS / container / sandbox / process infrastructure.
- Analytics.
- Notifications.
- Email infrastructure.
- Version control / diff / restore.
- GitHub project workflow.
- Custom domains / deployment.
- Realtime WS / Yjs collaboration persistence and transport.
- AI usage / quota enforcement.
- Activepieces ecosystem integration boundary.
- Template / scaffold source.
- Audit and observability persistence/UI.
- Marketplace persistence/discovery/moderation.
- Shared editor/project platform services.

## Immutable reusable source

### Identity / authentication / RBAC
- doable-source-extensions/auth/
- doable-source-extensions/identity-rbac/
- dependency-closure/services/api/src/middleware/auth.ts
- dependency-closure/services/api/src/middleware/rls.ts
- dependency-closure/services/api/src/middleware/workspace-role.ts
- dependency-closure/packages/db/src/queries/auth.ts
- RLS / collaborator / workspace-role migrations under dependency-closure/**/db/migrations/

### Billing / subscriptions / credits / plans
- doable-source-extensions/billing/
- doable-source-extensions/usage/
- doable-source-extensions/services/api-services/usage-*
- dependency-closure/packages/db/src/queries/billing.ts
- dependency-closure/packages/db/src/queries/credits.ts
- dependency-closure/services/api/src/routes/plan.ts
- billing / credit / plan migrations under dependency-closure/**/db/migrations/

### PostgreSQL schema and persistence
- dependency-closure/packages/db/
- dependency-closure/services/api/src/db/
- migrations, query modules, RLS policies, tracing and audit tables
- includes AI providers, sessions, messages, plans, credits, usage, billing, marketplace, collaboration, deployments, domains and security schemas

The schema is reusable source, not a universal migration policy. A target project should reconcile names, tenant keys and existing tables before applying migrations.

### Secrets / KEK / credentials
- dependency-closure/services/api/src/lib/secrets.ts
- dependency-closure/packages/db/src/secrets.ts
- doable-source/packages/dovault/
- integration credential/vault source under doable-source/services/api/src/integrations/

A host must inject its own KEK/key-management policy and must never copy Doable credentials into the bundle.

### OS / container / runtime infrastructure
- doable-source/services/api/src/sandbox/
- dependency-closure/services/api/src/runtime/
- dependency-closure/services/api/src/git/
- dependency-closure/services/api/src/projects/
- doable-source/packages/docore/
- doable-source/packages/dovault/

This source captures the implementation and hardening model. The host chooses Linux/container primitives, Windows equivalents, UID policy, process quotas and network egress policy.

### Analytics / observability / audit
- doable-source-extensions/analytics/
- doable-source-extensions/observability/
- doable-source-extensions/audit/
- doable-source/services/api/src/ai/trace-*.ts
- dependency-closure/services/api/src/db/query-tracer.ts
- tracing/audit migrations and query modules under dependency-closure/

### Notifications / email
- doable-source-extensions/notifications/
- doable-source-extensions/email/
- dependency-closure/services/api/src/lib/email/
- email/notification routes and migrations under dependency-closure/

### GitHub / versioning
- doable-source-extensions/github/
- doable-source-extensions/version-control/
- doable-source/apps/web/src/modules/editor/sidebar/version-history*
- dependency-closure/services/api/src/git/
- GitHub/versioning migrations and queries under dependency-closure/

### Deployment / custom domains
- doable-source-extensions/deployment/
- doable-source-extensions/domains/
- dependency-closure/services/api/src/lib/cloudflare-*
- deployment/domain queries and migrations under dependency-closure/

### Realtime WS / Yjs collaboration
- doable-source/services/ws/
- doable-source/apps/web/src/modules/collaboration/
- doable-source-extensions/realtime-collaboration/
- collaboration migrations and RLS under dependency-closure/

### Templates / scaffolding
- dependency-closure/services/api/src/templates/
- dependency-closure/packages/db/src/queries/templates.ts
- framework detection and scaffold/build source under dependency-closure/services/api/src/projects/
- framework-aware prompt source under doable-source/services/api/src/ai/framework-prompts/

### Marketplace / discovery
- doable-source/packages/marketplace-bundle/
- doable-source-extensions/marketplace/
- marketplace queries and migrations under dependency-closure/

### Activepieces ecosystem
- doable-source/services/api/src/integrations/
- doable-source-extensions/integrations/
- contracts/integrations.ts
- external-dependencies/external-dependencies.json
- Activepieces package versions remain external host dependencies; they are not silently vendored into the immutable source snapshot.

## Host boundary

- identity/session issuer
- tenant mapping
- database connection/schema reconciliation
- KEK/secret storage
- billing provider credentials
- email provider credentials
- deployment provider
- domain DNS provider
- WebSocket auth/origin
- OS/container/network policy
- Activepieces packages selected by the host
- object storage/CDN
- RAG/vector store

## Adapter contracts

Use contracts/platform-foundation.ts for:
- PersistenceAdapter
- UsageQuotaAdapter
- AuditAdapter
- AnalyticsAdapter
- BillingAdapter
- NotificationAdapter
- EmailAdapter
- VersionControlAdapter
- DeploymentAdapter
- DomainAdapter
- TemplateScaffoldAdapter
- RealtimeCollaborationAdapter

These contracts keep platform source reusable without requiring a target project to reproduce Doable's database schema or infrastructure verbatim.
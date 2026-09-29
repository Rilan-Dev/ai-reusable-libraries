# Reusable AI-Platform Extensions

This capability groups Doable source that is reusable but host-bound at deployment time:

- `services/api/src/analytics/` and analytics routes: usage/product analytics.
- `services/api/src/tracing/`: AI execution observability, redaction, sampling, retention, PostgreSQL export.
- `services/api/src/version-control/`: snapshots, diffs, version management.
- `services/api/src/github/` and GitHub routes: account/OAuth/project sync/webhooks/Git operations.
- `services/api/src/deploy/` and deploy/custom-domain routes: deployment topology and domain lifecycle.
- `services/api/src/auth/` and auth routes: authentication/MFA/OAuth/project identity primitives.
- API routes for usage, plans, billing, notifications, email administration, marketplace, environments, projects, templates, embeddings, runtime and workspace controls.
- Web UI references for billing, dashboard/project setup, editor, collaboration and marketplace.

The implementation source is preserved verbatim. Hosts must adapt identity, persistence, billing provider, email provider, deployment provider, domains, secrets and infrastructure through adapters.

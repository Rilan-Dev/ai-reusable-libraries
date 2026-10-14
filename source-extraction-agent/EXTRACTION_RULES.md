# Non-negotiable extraction rules

1. Copy first-party source byte-for-byte. No refactoring, renaming, formatting, optimization, cleanup, or behavior change.
2. Pin upstream URL, ref, commit SHA, root tree SHA, license evidence, and retrieval timestamp before extraction.
3. Prefer Git blob/tree identity. Preserve file modes, symlinks, and executable bits; document submodules and LFS objects separately.
4. Never claim complete closure while imports, dynamic loading, runtime files, schemas, migrations, assets, native tools, subprocesses, or external contracts remain unexplained.
5. External packages are inventoried, not vendored, unless they are first-party source in the upstream repository.
6. Host identity, tenant isolation, product billing, secrets, branding, deployment topology, and host-owned persistence are boundary candidates—not permission to modify upstream source.
7. Classify source as reusable Tier 1, reusable Tier 2, dependency closure, UI reference, host boundary, product-only, or not applicable with evidence. Product-only files remain in the pinned audit inventory.
8. Trace actual business behavior: validation, authorization, transitions, retries, idempotency, side effects, recovery, audit, and user-visible states.
9. Capture complete capability trees and recursively close their first-party dependencies. No arbitrary fragments presented as complete.
10. Capture UI behavior references for each capability: routes, components, configuration, dialogs, loading/empty/error/disabled/permission/destructive/success states.
11. Contracts and adapters are new code and must not import immutable source from contract definitions.
12. No host integration until extraction verification passes.
13. Every second-pass candidate receives an explicit disposition and evidence.
14. A planned or green-looking CI workflow is not proof. Report actual machine output only.
15. Never delete, rewrite, or re-copy already pinned trees without explaining the reason and preserving provenance.
16. Respect upstream license, notices, attribution, and redistribution conditions. Flag legal uncertainty rather than deciding it silently.
17. Record all actions, changes, failed attempts, decisions, and handoffs in extraction project-control.
18. Verification must detect both missing and unexpected files and must recompute dependency inventories rather than trusting a checked-in report.

# Prompt 04 — Business logic tracing

For each high-value capability, trace the complete lifecycle from entry point to all side effects and recovery paths. Identify:
- invariants, validation and normalization
- authorization and ownership checks
- state transitions and transaction boundaries
- deduplication/idempotency and concurrency controls
- retry, timeout, circuit-breaker, compensation and partial-failure behavior
- ordering, quotas, accounting, pricing or domain calculations
- persistence reads/writes, migrations, indexes and constraints
- event publication, webhooks and notifications
- audit and observability
- tests for success, invalid input, permission denial, races, retries and recovery
- UI feedback for each outcome.

Use source evidence and symbol/path references. Do not paraphrase away important business rules. Mark inferred behavior as inference and unresolved paths as gaps.

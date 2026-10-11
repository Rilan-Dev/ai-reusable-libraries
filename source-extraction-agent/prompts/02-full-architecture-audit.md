# Prompt 02 — Full architecture audit

Map the whole pinned repository, not only the requested feature folder. Trace request-to-response and event-to-side-effect paths through routing, orchestration, providers, data, runtime, UI, telemetry, security and recovery.

Produce:
1. component and package map;
2. text architecture diagrams;
3. API/route/CLI/SDK/event entry-point inventory;
4. state and persistence map;
5. cross-cutting services and shared utilities;
6. external service and package map;
7. security/trust boundaries;
8. test coverage map;
9. unowned/unresolved areas and evidence gaps.

Distinguish prompt injection from actual retrieval/RAG; an LLM wrapper from a runtime; ad-hoc functions from a registry; provider routing from tool orchestration; and declared protocols from implemented transport behavior. Cite exact paths and symbols.

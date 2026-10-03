# Clara Core — AI Agent Navigation Guide

## Mission
Use this directory as the reusable Clara platform reference for implementing AI, chat, realtime voice, RAG, agents, tools/MCP, usage and multi-tenant runtime behavior in another project.

Source of truth: Rilan-Dev/Clara-AI-Platform.
Doable is reference-only, never an extraction source.

## Mandatory rules
1. Read clara-core/README.md, this file, REFERENCE-MAP.md and IMPLEMENTATION-PLAYBOOK.md first.
2. Search the reference tree before inventing an abstraction.
3. Prefer an existing Clara file whose whole dependency boundary is reusable.
4. Files under clara-core/source/ are immutable byte-for-byte source copies.
5. Never partially extract a coupled file.
6. Treat auth, tenancy, billing, secrets, HTTP/Next.js handlers, vendor webhooks and deployment as host adapters unless an existing primitive is provider-neutral.
7. Clara/Qdrant is the RAG source of truth; provider-native KBs are not a replacement.
8. Realtime voice must preserve provider selection, resolved config, session/capability, browser/relay transport, generation coordination, latency telemetry and metering.
9. Chat must preserve agent/version config, AI resolution/governance, RAG grounding/retrieval, streaming transport and usage/audit.
10. Search tests, plans, docs, scripts and API routes before declaring a capability complete.
11. Run the immutable verifier from a real checkout before claiming extraction integrity.

## Search procedure
Start with capability terms:
- AI: ai-core, ai-governance, provider, model-catalog, resolve, factory
- voice: voice-core, realtime, VoiceProvider, voiceProvider, realtimeProvider
- chat: embed/chat, stream, realtime-events, grounding
- agents: agent-versioning, deployment, runtime, public-token
- RAG: knowledge-bases, embedding-index, vector-store, grounding
- tools: tools, MCP, integrations, webhook
- telemetry: latency, metering, usage-db, analytics, audit
- embed: public/embed/clara.js, ndjson, public-token

For every candidate: read imports, trace dependencies, check whether it is already extracted, inspect tests/plans, then decide EXTRACT, REFERENCE or ADAPTER.

## Realtime voice completeness
Locate:
- voice-core/types.ts
- voice-core/config-types.ts
- voice-core/model-catalog.ts
- voice-core/resolve.ts
- voice-core/factory.ts
- voice-core/providers/*
- voice-core/realtime/identity.ts
- voice-core/realtime/generation-coordinator.ts
- voice-core/realtime/latency-tracker.ts
- voice-core/realtime/latency-log.ts
- voice-core/realtime/relay-url.ts
- voice-core/realtime/reconnect-policy.ts
- voice-core/realtime/ui-state-machine.ts
- provider realtime auth/session modules
- assistant/core/realtime-events.ts
- provider browser hooks
- provider relay scripts and scripts/sarvam-wire.mjs
- public/embed/clara.js
- usage/metering and RAG turn guidance

OpenAI and Gemini realtime are transport/API-specific rather than standalone VoiceProviderService implementations. Do not invent provider classes merely for symmetry.

## AI/chat completeness
Locate ai-core types/config/factory/resolve/resolve-cache/model-catalog/providers, ai-governance/core, agent version/deployment, RAG grounding/retrieval, streaming/NDJSON, quota/usage, audit/analytics and assistant language/prompt policy.

## Documentation discovery
Inspect README.md, repository AGENTS.md when present, Doc/, docs/, provider integration documents, superpowers voice/realtime/latency plans and adjacent tests.

## Integrity
extraction-manifest.json is authoritative. Verify with scripts/verify-extraction.mjs.

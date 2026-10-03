# Clara Core Reference Map

This is the navigation index for a new AI coding agent.

## AI provider configuration and chat
agent/version config
→ ai-core/resolve.ts
→ ai-governance/core/resolver.ts
→ ai-core/factory.ts
→ ai-core/providers/openai.ts, gemini.ts, sarvam.ts, tei.ts
→ model-catalog.ts
→ RAG/chat runtime
→ usage/quota/audit

Core references:
- src/modules/ai-core/types.ts
- src/modules/ai-core/config-types.ts
- src/modules/ai-core/factory.ts
- src/modules/ai-core/resolve.ts
- src/modules/ai-core/resolve-cache.ts
- src/modules/ai-core/model-catalog.ts
- src/modules/ai-core/providers/openai.ts
- src/modules/ai-core/providers/gemini.ts
- src/modules/ai-core/providers/sarvam.ts
- src/modules/ai-core/providers/tei.ts
- src/modules/ai-governance/core/types.ts
- src/modules/ai-governance/core/resolver.ts
- src/modules/ai-governance/core/live-catalog.ts
- src/modules/ai-governance/core/usage-db.ts

## Realtime voice
agent/version + org/KB AI settings
→ voice-core/resolve.ts
→ voice-core/config-types.ts
→ provider session/capability
→ browser/relay
→ realtime identity + generation coordinator
→ latency tracker/log
→ usage/metering

Core references:
- src/modules/voice-core/types.ts
- src/modules/voice-core/config-types.ts
- src/modules/voice-core/model-catalog.ts
- src/modules/voice-core/resolve.ts
- src/modules/voice-core/factory.ts
- src/modules/voice-core/providers/elevenlabs.ts
- src/modules/voice-core/providers/sarvam.ts
- src/modules/voice-core/realtime/identity.ts
- src/modules/voice-core/realtime/generation-coordinator.ts
- src/modules/voice-core/realtime/latency-tracker.ts
- src/modules/voice-core/realtime/latency-log.ts
- src/modules/voice-core/realtime/reconnect-policy.ts
- src/modules/voice-core/realtime/ui-state-machine.ts
- src/modules/voice-core/realtime/relay-url.ts
- src/modules/voice-core/api/gemini/realtime-auth.ts
- src/modules/voice-core/api/sarvam/realtime-auth.ts
- src/modules/voice-core/api/elevenlabs/realtime-auth.ts

## Provider-specific realtime implementations
These remain implementation references where coupled to React/Next.js/vendor transport:
- OpenAI: src/modules/assistant/api/openai-realtime.ts and useOpenAIRealtime.ts
- Gemini: useGeminiLive.ts plus relay/auth
- Sarvam: useSarvamVoice.ts plus relay/wire
- ElevenLabs: useElevenLabsVoice.ts plus session/auth/provider

## Chat streaming
agent/public config
→ assistant config/language policy
→ AI resolution
→ RAG retrieval/grounding
→ streaming
→ NDJSON/events
→ usage/audit

References:
- src/modules/assistant/core/config.ts
- src/modules/assistant/core/language-policy.ts
- src/modules/assistant/core/realtime-events.ts
- src/modules/embed/core/ndjson.ts
- src/modules/embed/core/search.ts
- src/modules/rag/grounding.ts
- src/modules/rag/turn-guidance.ts

## RAG and knowledge
Use knowledge-bases/core models, db, config-builder, embedding-index, analytics-db; admin/core vector-store and vector-store-kb; knowledge-bases/core/reindex; rag config/cross-lingual/diversify/knowledge-topics/turn-guidance; and ingest loaders/parsers/chunkers.

## Public embed
public/embed/clara.js
→ public capability/session descriptors
→ NDJSON + realtime events
→ host auth/publication/entitlement adapters

## Performance and usage
Use ai-governance/core/usage-db.ts, voice-core/metering.ts, realtime latency tracker/log, knowledge-bases analytics-db, quota-admission.ts and redact.ts.

## Host boundaries
Normally keep Next.js routes, tenant lookup, auth/session, subscription/plan guards, provider secret management, publication validation, vendor webhooks, phone lifecycle and React application hooks as host references/adapters.

Manifest currently contains 108 immutable entries.

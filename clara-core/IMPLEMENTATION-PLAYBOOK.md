# Clara Core Implementation Playbook

## Goal
Implement another SaaS/agent product on the Clara capability set without losing the behavior that makes Clara chat and realtime voice reliable.

## Phase 1 — inventory
Search the Clara source tree for AI provider configuration, voice configuration, realtime session/auth, browser hooks, relay scripts, chat streaming, RAG, agent version/deployment, usage/latency, tools/MCP, tests and plans.

## Phase 2 — provider-independent core
Use clara-core/source for provider/model types, configuration resolution, governance, RAG grounding, agent version semantics, realtime identity/generation, latency contracts, NDJSON/events and usage/metering. Do not create a second abstraction layer.

## Phase 3 — providers
AI: wire host credential/config adapters into OpenAI, Gemini, Sarvam and TEI.
Voice: preserve separate voice-provider, realtime-provider and AI/chat-provider axes. Do not assume STT, TTS and realtime conversational model must share a vendor.

For each realtime provider preserve session/capability creation, short-lived auth, browser transport, provider event mapping, turn/generation cancellation, reconnect behavior, latency instrumentation and usage accounting.

## Phase 4 — chat + RAG
Preserve:
user turn → language policy → agent/runtime config → provider resolution → RAG embedding/retrieval → grounding → streamed events → usage/audit.

Clara/Qdrant remains the knowledge source; vendor-native KBs are not a replacement.

## Phase 5 — realtime voice
Preserve:
session → identity → provider capability → microphone/audio transport → VAD/transcription → generation coordinator → RAG/turn guidance where applicable → audio response → latency stages → metering.

Reliability properties include stable session/turn IDs, stale-generation protection, cancellation coordination, bounded reconnect, first-wins latency marks, TTFA/stage timing, provider-neutral telemetry and provider-specific event translation.

## Phase 6 — published agents
An agent includes identity, draft/branch/version, active deployment, production configuration, KB snapshot, AI/voice settings, public capability/session token and runtime feature flags.

## Phase 7 — tools/MCP
Search existing Clara integrations/tools/MCP first. Determine whether the contract is provider-neutral. Keep vendor webhook/auth/persistence in adapters. Preserve authorization and tool telemetry. Test allowed and denied paths.

## Phase 8 — verification
Before completion:
- immutable verifier passes
- AI provider resolution tests pass
- voice provider resolution tests pass
- realtime event/generation tests pass
- chat streaming tests pass
- RAG tests pass
- latency/metering tests pass
- provider integration tests pass
- cancelled/stale generations cannot emit duplicate final answers
- disabled/unconfigured providers fail closed with actionable errors

## AI-agent handoff
Every implementation records exact source paths, extracted files and blob SHAs, adapter boundaries, provider matrix, runtime sequence, tests executed, known limitations and next search terms/files.

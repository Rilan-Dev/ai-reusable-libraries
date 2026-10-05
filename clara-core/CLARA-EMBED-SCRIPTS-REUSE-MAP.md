# Clara Embed and Scripts Reuse Map

## Purpose

This document records the reusable contribution of Clara's public embed runtime and the complete `./scripts/*` surface. It prevents a future AI coding agent from treating operational scripts as irrelevant simply because they are not imported by the TypeScript application.

## 1. Public embed runtime — REQUIRED

Source:
- `public/embed/clara.js`
- Reusable copy: `source/public/embed/clara.js`

The reusable-library copy is byte-identical to the current Clara source blob:
- source blob SHA: `1710bd5a54244ab5af95efa51b2a99b7233faeab`
- reusable copy blob SHA: `1710bd5a54244ab5af95efa51b2a99b7233faeab`
- size: 55,024 bytes

### What it contributes

`clara.js` is not merely presentation code. It is Clara's browser-side delivery/runtime boundary:

- floating, inline, and headless embed modes;
- API-key based public-session bootstrap;
- server-configured widget appearance and behavior;
- Shadow-DOM isolation for the floating UI;
- streaming NDJSON chat consumption;
- conversation history/session handling;
- source-event propagation;
- realtime voice lifecycle and browser media handling;
- WebSocket/WebRTC relay interaction;
- provider-aware voice behavior;
- interruption/barge-in state;
- voice transcript/audio scheduling;
- host-page events and headless SDK events;
- launcher/header/custom CSS/custom branding hooks;
- failure/loading/voice state UX.

Therefore it must remain in the reusable Clara reference source. A downstream agent building an embedded AI assistant, website copilot, voice widget, or headless AI SDK can reuse the runtime contract instead of reinventing the browser protocol.

## 2. `./scripts/*` classification

The scripts are intentionally classified rather than blindly deleted. The reusable library should preserve implementation references where they contain portable AI/runtime behavior, while clearly identifying host/deployment-only scripts.

### A. Core reusable AI/runtime scripts — preserve as source references

These contain functionality that can directly help another project:

- `scripts/voice-relay.mjs` — server-side OpenAI/Gemini realtime voice relay, server-secret isolation, browser framing, audio/transcript/status transport.
- `scripts/gemini-relay.mjs` — Gemini Live WebSocket relay, HMAC session authentication, transparent protocol passthrough.
- `scripts/elevenlabs-relay.mjs` — ElevenLabs realtime STT/TTS relay, authenticated sessions, provider resolution, metering and lifecycle caps.
- `scripts/sarvam-relay.mjs` — Sarvam realtime STT relay with HMAC authentication, allow-listed browser protocol and server-side provider configuration.
- `scripts/sarvam-tts-relay.mjs` — Sarvam Bulbul streaming TTS relay, warm connection reuse, language switching and interruption.
- `scripts/sarvam-wire.mjs` — shared Sarvam realtime STT/TTS wire contract.
- `scripts/phone-stream.mjs` — phone/realtime audio transport reference.
- `scripts/dev-relay.mjs` — local relay/runtime development harness.
- `scripts/ingest.ts` — local document ingestion pipeline using Clara loaders/chunking/vector storage.
- `scripts/ingest-web.ts` — web-page ingestion pipeline.
- `scripts/bench-run-matrix.mjs` — provider/question-class realtime benchmark aggregation.
- `scripts/voice-benchmark/run.mjs` — browser-based realtime latency/TTFA benchmark harness.
- `scripts/validate-model-config.mjs` — model capability/configuration safety validator.
- `scripts/verify-agent-resolution.ts` — end-to-end agent-owned AI configuration resolution verification.
- `scripts/scan-blocked-domains.ts` — outbound content/domain safety scanner.

### B. Reusable verification/test references — preserve as implementation examples

These are valuable to AI agents because they demonstrate executable contracts and production verification patterns:

- `scripts/e2e-agents.js`
- `scripts/e2e-elevenlabs.js`
- `scripts/e2e-elevenlabs-modeb.js`
- `scripts/e2e-sarvam.js`
- `scripts/e2e-ingest-queue.js`
- `scripts/e2e-org-workspace.js`
- `scripts/e2e-phase2-3.js`
- `scripts/e2e-phase4.js`
- `scripts/e2e-phase5.js`
- `scripts/e2e-phase6.js`
- `scripts/e2e-plan-limits.js`
- `scripts/e2e-expiry-sweep.js`
- `scripts/visitor-tests/*`
- `scripts/verify-ai-platform-ui.mjs`
- `scripts/verify-ai-platform-ui-2.mjs`
- `scripts/verify-default-assistant-ui.mjs`
- `scripts/verify-explore-link-ui.mjs`
- `scripts/verify-explore-link-ui-2.mjs`
- `scripts/verify-voice-provider-and-micmute.mjs`
- `scripts/test-crawl.ts`
- `scripts/test-document-ingestion.ts`
- `scripts/test-extract.ts`
- `scripts/probe-site.ts`
- `scripts/scrape-benchmark.ts`

### C. Performance/diagnostic references — preserve when building AI infrastructure

- `scripts/bench-gemini-relay-live.mjs`
- `scripts/bench-gen-wavs.mjs`
- `scripts/bench-prod-run.mjs`
- `scripts/bench-prod-wavs.mjs`
- `scripts/bench-server.sh`
- `scripts/bench-set-provider.mjs`
- `scripts/loadtest-elevenlabs-tts.js`
- `scripts/check-elevenlabs-settings.mjs`
- `scripts/diagnose-extract.ts`
- `scripts/validate-model-config.mjs`
- `scripts/voice-benchmark/*`

These show latency measurement, provider comparison discipline, audio fixtures, relay diagnostics, and configuration validation.

### D. Data/knowledge-base utilities — reusable patterns, host adapter required

- `scripts/seed-docs-content-omen.mjs`
- `scripts/seed-docs-content-techvision.mjs`
- `scripts/seed-demo.ts`
- `scripts/seed.ts`
- `scripts/db-clean-demo.ts`
- `scripts/db-reset.ts`
- `scripts/bench-ingest.ts`

The implementation patterns can help another project, but demo data, database names, and tenant assumptions are host-owned.

### E. Host/deployment/database migration operations — retain as historical/reference material, do not treat as portable runtime APIs

- `scripts/apply-migration-037.mjs`
- `scripts/apply-migration-038.mjs`
- `scripts/apply-migration-040.mjs`
- `scripts/apply-migration-042.mjs`
- `scripts/migrate-ai-configuration.mjs`
- `scripts/migrate.ts`
- `scripts/backup-ai-configuration.mjs`
- `scripts/docker-start.sh`
- `scripts/start.mjs`
- `scripts/vps-doctor.sh`
- `scripts/update-demo-org-voice-elevenlabs.mjs`
- `scripts/update-orgs-tts-flash.mjs`
- `scripts/generate-seed-docs.mjs`
- `scripts/sync-monaco-assets.mjs`

These may contain useful operational techniques, but their database schema, environment, deployment, organization, or infrastructure assumptions must not be copied into a downstream host without adaptation.

## 3. Architectural conclusion

The important extraction boundary is:

`public/embed/clara.js`
→ browser delivery/runtime contract
→ embed session/public-token boundary
→ chat streaming / NDJSON
→ realtime voice events and media
→ server relay
→ provider runtime
→ RAG / AI configuration / usage

The `scripts/*` directory supplies the operational side of that architecture: realtime relays, vendor wire protocols, ingestion, benchmark/latency instrumentation, safety checks, verification, and deployment/maintenance tooling.

A future AI agent should therefore consult this map before deciding that a requested Clara capability is "missing". The application modules provide the typed/core implementation; `public/embed/clara.js` and the reusable script references provide the browser and operational contracts that make those capabilities usable end-to-end.

## 4. Current extraction status

- `public/embed/clara.js`: **INCLUDED and byte-identical**.
- `scripts/sarvam-wire.mjs`: **INCLUDED and byte-identical**.
- Other scripts: **classified for downstream reuse/reference**; they are not silently considered missing.
- Host-only scripts remain reference material rather than being promoted into host-neutral core APIs.

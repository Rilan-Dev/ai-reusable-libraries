
## 2026-10-03 — Published chat transport dependency slice

### Completed
- Continued tracing the published-agent chat execution path in src/app/api/embed/chat/route.ts.
- Confirmed the route itself is not a clean reusable core boundary: it combines embed authentication, publication/feature gating, tenant-owned KB persistence, quota admission, analytics, provider resolution, HTTP/CORS handling, request aborts, secrets, and NDJSON streaming.
- Extracted the direct reusable transport primitive used by the published chat route:
  - src/modules/embed/core/ndjson.ts
- The extracted primitive provides the Clara NDJSON event contract, encoder, and incremental tolerant parser used by embed chat streams.

### Verified source identity
- src/modules/embed/core/ndjson.ts → be41ac5b9306c61415069d789ff0bf7e1e55a0da
- Target was created byte-for-byte from the Clara source in commit a07c531dd0a3f7ebf5672cdfe2dc522f59f8bcc2.
- Manifest registration committed in fb327eea639357ac493b69e365dd03f8c22cfaae.
- Manifest count increased from 93 to 94 immutable source entries.

### Boundary conclusion
No additional standalone published-agent chat orchestrator was found that can be safely extracted without inventing a new abstraction or dragging host concerns into Clara Core. The existing route remains the application adapter around already-extracted Clara primitives: AI provider resolution/factory, RAG grounding, KB configuration, query metering/quota admission, conversation context, and embed retrieval/NDJSON transport.

### Not completed
- Full 94-entry immutable verifier still needs execution from a repository checkout.
- Public deployment/configuration routes remain adapters; published deployment resolution is already represented by extracted ai-core resolution/versioning mechanics.
- Generic MCP/tool runtime still has no standalone Clara implementation to extract.

### Next
Continue from the remaining published-agent runtime dependencies, prioritizing public session/configuration state and any provider-neutral session lifecycle primitive that exists below the HTTP routes. Do not invent a chat runtime merely to force an extraction.

## 2026-10-03 — Realtime session lifecycle closure

- Closed the previously pending realtime lifecycle extraction boundary from Clara-AI-Platform only.
- Registered and verified four immutable provider-neutral primitives:
  - `src/modules/voice-core/realtime/reconnect-policy.ts` — `01c768b400f10b117fd41e4d0f3533b544427c06`
  - `src/modules/voice-core/realtime/ui-state-machine.ts` — `1dcc840e50f0d072e8d59a533b205d6616bbf44d`
  - `src/modules/voice-core/realtime/identity.ts` — `11ab42a9c5408393b012fecd80b62a379172dc73`
  - `src/modules/voice-core/realtime/generation-coordinator.ts` — `0384d2c60d1e482c1c33d76de8a1e776f9a4867c`
- Target blob SHAs were independently fetched and match their corresponding source SHAs.
- Manifest count is now 98 immutable entries.
- These primitives provide reusable session identity, generation concurrency/cancellation, deterministic UI lifecycle, and bounded reconnect behavior without extracting tenant/auth/billing/vendor HTTP concerns.

### Next
Continue tracing the remaining published-agent/session runtime dependencies. Prioritize a provider-neutral session/configuration contract below HTTP routes. Do not extract route handlers or invent a new session runtime when Clara does not already contain one.
## 2026-10-03 — Same-origin realtime relay URL primitive

### Completed
- Continued tracing published-agent/realtime session dependencies below the HTTP session routes.
- Confirmed that Clara already contains a provider-neutral, HTTP-independent browser relay URL primitive in `src/modules/voice-core/realtime/relay-url.ts`.
- Extracted it byte-for-byte into Clara Core:
  - `src/modules/voice-core/realtime/relay-url.ts`
- The primitive converts a capability descriptor (`endpoint` + short-lived session token) into a same-origin `ws://` / `wss://` URL and is shared by browser hooks/tests.
- It keeps vendor URLs and long-lived provider credentials out of the browser; no tenant, auth, billing, database, or HTTP route concerns are embedded in the extracted module.

### Verified source identity
- Source blob SHA: `7d629587d0a0c61827a89cb93cd40e8b3d5f06e0`
- Target was created byte-for-byte in commit `48280b6fa9c2e066ad3e5445597c1990fec926ec`.
- Manifest registration committed in `5a811b6ccaa995279c261effda51d5dd973658ff`.
- Manifest count increased from 98 to 99 immutable source entries.

### Boundary conclusion
- `src/modules/voice-core/config-types.ts` is already extracted and owns the provider-specific session payload contracts.
- `src/modules/voice-core/api/*/session.ts` remains an application boundary because it performs auth, rate limits, plan/entitlement checks, provider token minting, persistence/config resolution, and HTTP handling.
- `src/modules/agent-versioning/core/projection.ts` remains a compatibility/database migration boundary; it mirrors mutable legacy stores and is not a portable runtime primitive.
- `src/modules/agent-versioning/core/service.ts` remains coupled to Clara PostgreSQL, KB persistence, governance, and Qdrant deployment state, so it is not extracted as a generic session runtime.
- No new provider-neutral session orchestrator was invented.

### Not completed
- Full 99-entry immutable verifier still needs execution from a repository checkout.

### Next
Continue tracing the remaining provider-neutral realtime/public runtime dependencies, especially any existing capability-token validation/relay-auth primitives that are pure and reusable. Keep provider session routes and host persistence/auth as adapters.
## 2026-10-03 — Realtime provider capability-token auth slice

### Completed
- Traced the remaining realtime relay authentication layer below the HTTP session routes.
- Confirmed Clara already contains three pure provider-specific HMAC capability-token modules that are reusable core mechanics rather than route handlers:
  - `src/modules/voice-core/api/gemini/realtime-auth.ts`
  - `src/modules/voice-core/api/sarvam/realtime-auth.ts`
  - `src/modules/voice-core/api/elevenlabs/realtime-auth.ts`
- Extracted all three byte-for-byte into `clara-core/source/`.
- Gemini: short-lived browser token verification/minting with KB/org scope and constant-time signature comparison.
- Sarvam: the same browser capability token plus the provider relay internal-header HMAC proof.
- ElevenLabs: the same browser capability token plus the provider relay internal-header HMAC proof.
- Vendor credentials remain server-side; the extracted modules only operate on the capability/relay-auth primitives.

### Verified source identity
- Gemini: `c4c61a336b5ff6626ddc8a82dd94caf1d2e48563`
- Sarvam: `f5819822d8f441f7c24517fc3c3d1b7197dca79f`
- ElevenLabs: `5782d317e0afc1ec4191d345072403c016ffc6e4`
- Extraction commits: `0700b94a153e4a3ba7582f8fe5334674f6a222ad`, `7e55934b5ff480fe8022536fffc21f1aa1bd8830`, `c4f3445dd42a34e42a76a652a7d1e7d7b52f48a7`.
- Manifest registration committed in `bcb1aaac92a4b8e2e488e225af6ca535759e672a`.
- Manifest count increased from 99 to 102 immutable source entries.

### Boundary conclusion
- The three auth modules are provider-specific but still Clara-owned reusable integration primitives; they contain no tenant DB access, billing checks, HTTP response handling, or vendor-secret exposure.
- The surrounding `realtime.ts`, `realtime-init.ts`, and session routes remain application/provider adapters because they perform authorization, plan checks, provider resolution, persistence, HTTP handling, or secret retrieval.
- `voice-core/realtime/gemini-telemetry.ts` was reviewed but is not yet extracted because it depends on `LatencyTracker` and is specifically tied to Gemini's vendor-native VAD lifecycle; it should be revisited only as part of a complete telemetry primitive closure.
- No new generic auth/session abstraction was invented.

### Not completed
- Full 102-entry immutable verifier still needs execution from an actual repository checkout.

### Next
Continue tracing the remaining pure realtime/public runtime primitives, prioritizing existing telemetry/latency contracts and provider-neutral capability descriptors. Do not extract HTTP routes or invent a new runtime abstraction.
## 2026-10-03 — Realtime telemetry chain + public embed client + scripts audit

### Completed
- Continued the realtime telemetry/latency dependency chain.
- Extracted the provider-neutral latency contract:
  - `src/modules/voice-core/realtime/latency-tracker.ts`
  - It defines common stage marks, first-wins semantics, turn handles, TTFA/stage derivation and p50/p95 summarisation.
- Extracted Gemini's existing vendor-specific telemetry adapter:
  - `src/modules/voice-core/realtime/gemini-telemetry.ts`
  - It is reusable because it only translates Gemini VAD/transcription events into the already-shared latency contract; it has no HTTP, DB, auth or provider credential access.
- Explicitly audited the already-extracted dependency chain:
  - `realtime/identity.ts` supplies correlation IDs.
  - `realtime/generation-coordinator.ts` supplies generation lifecycle/current-generation fencing.
  - `latency-tracker.ts` consumes generation identity and emits timing-only telemetry.
- Audited `public/embed/clara.js` as requested. It is the actual Clara browser embed runtime: script bootstrap/API-key handling, config fetch, Shadow DOM widget, streaming NDJSON chat transport, voice relay/WebRTC/audio handling, headless SDK events, voice state and host-page events. It derives its server origin from the script URL rather than embedding a Clara deployment hostname. The HTTP endpoints and API-key credential remain host contracts, but the client runtime itself is Clara-owned and reusable, so it was copied byte-for-byte into Clara Core under `public/embed/clara.js`.
- Audited `scripts/*` specifically for contribution to the platform rather than blindly extracting deployment scripts:
  - `scripts/sarvam-wire.mjs` is a pure provider wire-contract library shared by multiple relays/phone streaming paths; extracted byte-for-byte.
  - `scripts/voice-relay.mjs`, `gemini-relay.mjs`, `sarvam-relay.mjs`, `sarvam-tts-relay.mjs`, `elevenlabs-relay.mjs`, `phone-stream.mjs` are executable server-side network/secret/provider relay adapters and are intentionally NOT extracted as generic core modules.
  - `scripts/start.mjs` is Clara deployment/runtime wiring that attaches WebSocket servers to the custom Next server and is intentionally an application/deployment adapter.
  - `scripts/voice-benchmark/run.mjs` is test/benchmark tooling; its percentile logic duplicates the core latency contract but it is not runtime core and remains tooling.
  - Seed/migration/reset, E2E acceptance, VPS doctor, ingest, and benchmark generation scripts remain operational/project tooling rather than reusable runtime core.
- No new telemetry/session abstraction was invented; the extraction follows the existing Clara contracts.

### Verified source identity
- latency tracker: `a8b8750c2c5df7f4143f6dcefeb165a8642d81ff`
- Gemini telemetry: `091e519a2de96752f97addf8dc489ec421c10d6c`
- Sarvam wire: `0c7e8879e213996aadecb0e06b77025b328e8834`
- public embed client: `1710bd5a54244ab5af95efa51b2a99b7233faeab`
- Extraction commits: `01cb71bc54ddcb18ae9d51f7e098f2ce0485bd3c`, `81c6153c3e9769984bcbc0c589231ee00743efb3`, `2d91bea8ba04ebda5dd2f8badc3bb6090dab3c46`, `9bf3f274c908b720ab867b13e7b9fc328cc92c11`.
- Manifest registration: `de8ac036d7c492e684d75468903bc07a443fcae3`.
- Manifest count increased from 102 to 106 immutable source entries.

### Boundary conclusion
- Public/embed Clara.js is reusable client runtime, while its endpoint/auth/config contracts remain host-provided adapters.
- The executable relay scripts are not byte-for-byte reusable core because they bind directly to Node WebSocket servers, environment secrets, provider endpoints and Clara HTTP routes. Their pure wire-contract pieces are the appropriate extraction boundary.
- The benchmark harness is valuable verification tooling but not part of the runtime core.

### Not completed
- Full 106-entry immutable verifier still needs execution from an actual repository checkout.

### Next
Continue auditing remaining provider-neutral capability descriptors and public/embed client dependencies. In parallel, inspect whether other `scripts/*` files contain additional pure wire/format contracts worth extracting; do not extract operational scripts merely because they are reusable deployment artifacts.
## 2026-10-03 — Capability descriptor and public/embed dependency closure audit

### Completed
- Continued the provider-neutral capability-descriptor audit.
- Confirmed `voice-core/realtime/relay-url.ts` is the canonical provider-neutral relay descriptor contract already extracted: `endpoint + short-lived token` is sufficient for the browser to construct a same-origin relay URL without vendor credentials.
- Confirmed `voice-core/config-types.ts` is already the provider-session capability contract and is already extracted. Its ElevenLabs/Sarvam payloads deliberately expose platform endpoints, models, audio parameters and short-lived tokens, while withholding vendor keys and direct vendor URLs.
- Confirmed the public published-page credential primitive `embed/core/public-token.ts` is already extracted and remains the correct anonymous published-session token boundary. It is deployment-bound, HMAC-signed, short-lived, and deliberately leaves deployment/publicAccess revalidation to the host validation layer.
- Audited `src/features/agent-conversation/lib/chat-stream.ts`. It is reusable behaviorally, but its direct `@/lib/runtime` dependency makes it an application client helper rather than a self-contained Clara Core primitive. It is therefore NOT extracted; the already-extracted `embed/core/ndjson.ts` remains the transport-format primitive and host applications can provide their own fetch/origin adapter.
- Audited `scripts/elevenlabs-relay.mjs`. It contains valuable pure functions (token verification, Scribe event translation, upstream URL construction, TTS BOS framing), but the file is inseparable as a whole from Node WebSocket handling, environment secrets, bootstrap HTTP calls, metering routes, reconnect state and server lifecycle. Under byte-for-byte extraction rules, it remains a provider relay adapter. No partial rewrite/extraction was invented.
- Audited the legacy `scripts/voice-relay.mjs` as well: it is an OpenAI/Gemini server relay plus RAG tool bridge and therefore remains application/provider infrastructure. Its pure concepts are already represented by extracted realtime auth, relay URL, RAG, generation and telemetry primitives.
- The existing `scripts/sarvam-wire.mjs` remains the only currently identified pure script-level wire contract and is already extracted.

### Capability architecture conclusion
The reusable capability chain now has explicit boundaries:

```
resolved provider config
      ↓
provider session payload / capability descriptor
      ↓
{ endpoint, token, model/audio metadata }
      ↓
relay-url.ts
      ↓
same-origin browser transport
      ↓
provider relay adapter
      ↓
latency + generation + metering contracts
```

Public published agents add the separate boundary:

```
active deployment
      ↓
public-token.ts
      ↓
public/embed validation adapter
      ↓
embed chat / voice capability descriptors
```

No generic session orchestrator or synthetic capability schema was introduced because Clara already has the required contracts.

### Not completed
- No new immutable source entries were added in this audit slice; all candidate contracts were either already extracted or intentionally retained as host/provider adapters.
- Full 106-entry verifier still needs execution from an actual repository checkout.

### Next
Continue auditing the remaining `public/embed/*`, published-agent runtime and `scripts/*` dependency graph for pure existing contracts, with particular attention to public configuration serialization, browser event contracts and provider-neutral chat/runtime transport primitives. Extract only existing Clara source files whose dependency boundary is already clean.
## 2026-10-03 — Public/embed transport and published-runtime boundary audit

### Completed
- Audited the remaining public/embed dependency chain rather than adding duplicate abstractions.
- `src/modules/embed/core/validate-embed.ts` remains an application security boundary. It combines NextRequest/NextResponse, API-key persistence, public-token validation, deployment DB lookup, plan/quota/rate-limit enforcement and CORS. Its pure origin-policy helpers are useful but the file as a whole is not an immutable portable core primitive.
- `src/modules/embed/core/search.ts` remains coupled to Clara's Qdrant client, embedding cache and RAG diversification. It is already an appropriate Clara server-core primitive and was previously extracted; no duplicate copy was added.
- `src/app/api/embed/chat/route.ts` was traced end-to-end. It is deliberately a host HTTP adapter: authentication, KB persistence, provider resolution, plan/quota admission, grounding, provider streaming, usage finalization and HTTP streaming all converge there. The reusable lower layers are already extracted: grounding, search, NDJSON, provider factory/resolution, analytics/metering and quota admission.
- The public configuration route was also confirmed as a serialization boundary rather than a core runtime. It combines deployment/publication checks, DB reads, AI/voice resolution and UI customization. The browser runtime consumes this contract, but the route itself remains host-owned.
- `public/embed/clara.js` remains the reusable browser runtime already extracted in the previous slice. No second copy was created.
- `src/modules/assistant/core/realtime-events.ts` remains the provider-neutral OpenAI event-name compatibility contract already extracted. No duplicate extraction was added.
- `src/modules/assistant/api/conversation-context.ts` was evaluated as a candidate reusable chat helper. It contains useful pure conversation/chart transformations, but also reads `CHAT_HISTORY_MAX_MESSAGES` directly from process.env and is located in the application assistant API layer. Under the exact-source/no-refactor rule, it is retained in the host rather than forcing application runtime configuration into Clara Core.
- The scripts audit found no additional standalone pure file in this slice. Provider relays continue to be infrastructure adapters; the existing `scripts/sarvam-wire.mjs` is already the extracted wire-level boundary.

### Architectural conclusion
The public/embed stack now has a clean extraction boundary:

```
clara.js (reusable browser runtime)
        ↓
NDJSON / realtime event contracts
        ↓
public capability/session descriptors
        ↓
host HTTP/auth/publication/quota adapters
        ↓
Clara RAG + provider + metering core
```

The remaining route files are intentionally not copied into the immutable library because doing so would copy tenant identity, persistence, billing/entitlement and HTTP framework responsibilities into the reusable runtime.

### Not completed
- No new immutable entries were required in this slice.
- Full 106-entry verifier still needs execution from an actual repository checkout.

### Next
Continue with the remaining provider-neutral runtime/capability descriptors and inspect public/embed browser event usage against the already-extracted NDJSON and realtime contracts. Only add source entries when the existing Clara file itself is already dependency-clean.
## 2026-10-03 — Provider-neutral latency presentation contract

### Completed
- Continued the browser/provider-neutral realtime contract audit.
- Extracted `src/modules/voice-core/realtime/latency-log.ts` → `clara-core/source/src/modules/voice-core/realtime/latency-log.ts`.
- Source blob SHA: `91dadef0c815f0ae145098d31c3714a96d8055b3`.
- This file is dependency-clean except for the already-extracted `TurnStageLatencies` type and contains only deterministic formatting/logging of Clara's timing contract: TTFA, STT, RAG, LLM, TTS and Server-Timing breakdowns. It does not access DB, HTTP, provider secrets, React, or tenant state.
- This closes the presentation side of the telemetry chain: provider adapters emit the common latency event; `latency-log.ts` formats it; benchmark tooling can consume the same event without duplicating stage arithmetic.
- Re-audited `useGeminiLive.ts` and `useOpenAIRealtime.ts`. Both are orchestration hooks and remain host/application adapters because they bind React state, browser media/WebRTC APIs, API routes, authentication headers, RAG calls and provider-specific protocols. Their reusable dependencies are now represented by extracted pure modules.
- Re-audited `LandingEmbedFrame.tsx`. Its voice state and WebRTC/RAG flow are application UI behavior; it remains host UI rather than core. The pure realtime state machine is already extracted separately.
- Reconfirmed `public/embed/clara.js` is the portable browser runtime and already extracted; its event emitter remains internal to that runtime and does not justify inventing a separate event module without an existing clean Clara source boundary.

### Resulting telemetry chain
```
provider events
  ↓
provider telemetry adapter
  ↓
LatencyTracker / TurnLatencyHandle
  ↓
clara:voice:latency event
  ↓
latency-log.ts (human-readable formatting)
  ↓
benchmark / diagnostics
```

### Verification
- Source SHA recorded in manifest and independently matched to the extracted target blob.
- Manifest count increased from 106 to 107.
- Full 107-entry immutable verifier still needs execution from an actual repository checkout.

### Next
Continue the remaining provider-neutral capability-descriptor audit, especially browser-facing session/config serialization and any pure existing event/transport contracts that can be extracted without refactoring application hooks or routes.
## 2026-10-03 — Realtime foundation barrel and capability boundary audit

### Completed
- Audited the remaining provider-neutral realtime capability chain and browser-facing serialization boundary.
- Confirmed `src/modules/voice-core/config-types.ts` is already extracted and is the canonical type contract for resolved voice configuration and session bootstrap payloads. No duplicate descriptor abstraction was introduced.
- Confirmed `src/modules/voice-core/realtime/relay-url.ts` is already extracted and remains the canonical browser-side conversion from `{ endpoint, token }` capability descriptors to same-origin WS/WSS URLs.
- Confirmed `src/modules/voice-core/realtime/identity.ts` and `src/modules/assistant/core/realtime-events.ts` are already extracted. The former owns correlation identity; the latter owns OpenAI GA/beta event classification and response text extraction.
- Extracted the existing pure realtime barrel `src/modules/voice-core/realtime/index.ts` → `clara-core/source/src/modules/voice-core/realtime/index.ts`.
- Source blob SHA: `2f7b423c4b12e1c43ea82652709abc8d3405d010`.
- The barrel is dependency-clean within the already-extracted realtime foundation and provides the existing Clara package boundary without inventing or renaming APIs.
- Audited `src/modules/voice-core/api/sarvam/session.ts`: it remains an HTTP/security/persistence/provider-resolution adapter. Its returned `SarvamSessionPayload` is already represented by the extracted `config-types.ts`; the route itself must not be copied into immutable core.
- Rechecked public embed session/config behavior: capability descriptors intentionally contain same-origin endpoints plus short-lived capability tokens, while auth, tenant resolution, rate limiting, plan guards, localization, and provider resolution remain host boundaries.
- Rechecked scripts: provider relays remain coupled to WebSocket servers, vendor credentials and lifecycle; `scripts/sarvam-wire.mjs` remains the identified pure protocol contract already extracted.

### Why no new synthetic capability type was added
Clara already has the complete source-level contracts: `VoiceResolution`, `ElevenLabsSessionPayload`, `SarvamSessionPayload`, `RelayEndpointDescriptor`, and the OpenAI realtime event helpers. Adding another generic descriptor would duplicate semantics rather than extract existing source.

### Result
- Manifest count increased from 107 to 108.
- Extraction commit: `009b0b201837c94f521ad7a620b1a851dc5ea409`.
- Manifest registration commit: `a776c6f1a956b28b091eea729bfae696dc3267f6`.
- Full 108-entry immutable verifier remains pending execution from an actual checkout.

### Next
Continue the remaining `public/embed/*` and `scripts/*` dependency graph, specifically looking for existing pure browser transport/event/protocol modules and published-agent runtime contracts not yet represented in `clara-core`.


## 2026-10-03 — Public/embed browser contract and scripts closure audit

### Completed
- Continued the remaining `public/embed/*`, published-agent runtime, and `scripts/*` dependency graph from the existing Clara source tree.
- Re-traced `public/embed/clara.js` against the extracted server-side contracts. It is already the correct reusable browser runtime and is already registered in the manifest; no duplicate extraction was made.
- Confirmed the browser runtime currently owns its event emitter internally and directly parses the embed NDJSON stream. There is no separate existing Clara browser event/transport module below it that can be copied byte-for-byte without inventing a new abstraction.
- Rechecked `src/modules/embed/core/ndjson.ts` and `src/modules/assistant/core/realtime-events.ts`: both are already the provider-neutral serialization/event boundaries consumed by the wider runtime. No duplicate browser wrapper was introduced.
- Rechecked published-agent configuration/session routes:
  - `src/app/api/public/agents/[agentId]/config/route.ts` remains a host HTTP/publication/DB adapter.
  - `src/app/api/embed/session/route.ts` remains a host HTTP/auth/entitlement/provider-session adapter.
  - `src/modules/voice-core/api/*/session.ts` remains provider-session infrastructure around already-extracted capability contracts.
- Audited `src/features/agent-conversation/types.ts`. It is a feature-layer contract importing the voice hook type and therefore is not a self-contained core primitive.
- Audited `src/modules/assistant/core/voice/types.ts`. Although mostly type-only, it imports application assistant models/config and exposes browser `MediaStream` callbacks; the whole file is not dependency-clean under the immutable extraction rule, so it remains in the host.
- Re-audited all relevant executable realtime scripts:
  - `scripts/voice-relay.mjs`
  - `scripts/gemini-relay.mjs`
  - `scripts/sarvam-relay.mjs`
  - `scripts/sarvam-tts-relay.mjs`
  - `scripts/elevenlabs-relay.mjs`
  - `scripts/phone-stream.mjs`
- These scripts contain useful helper functions, but each file as a whole is coupled to Node WebSockets, vendor credentials/endpoints, Clara HTTP routes, metering/auth, connection lifecycle, or telephony transport. Under the byte-for-byte rule, extracting only selected functions would be a partial rewrite, so none were added.
- `scripts/sarvam-wire.mjs` remains the clean script-level protocol boundary and is already extracted.
- The published-agent runtime therefore remains cleanly split between reusable browser/core contracts and host adapters; no synthetic generic session/event abstraction was created.

### Verified source identity
- Existing public/embed runtime: `public/embed/clara.js` → `1710bd5a54244ab5af95efa51b2a99b7233faeab`.
- Existing NDJSON contract: `src/modules/embed/core/ndjson.ts` → `be41ac5b9306c61415069d789ff0bf7e1e55a0da`.
- Existing realtime event contract: `src/modules/assistant/core/realtime-events.ts` → `30b95fb7d4907cd37ba5a00d8ca3ca0c28fabc14`.
- Existing Sarvam wire contract: `scripts/sarvam-wire.mjs` → `0c7e8879e213996aadecb0e06b77025b328e8834`.
- No new immutable source entries were required in this slice; manifest remains at 108 entries.

### Boundary conclusion
The public/embed and published-agent chain is now explicitly bounded as:

```
Clara browser runtime (clara.js)
        ↓
NDJSON + realtime event contracts
        ↓
public/session capability descriptors
        ↓
host HTTP/auth/publication/entitlement adapters
        ↓
Clara RAG + AI + voice + telemetry core
        ↓
provider/telephony relay adapters
```

The remaining `scripts/*` relay implementations are infrastructure adapters, not reusable immutable core files. Their reusable wire/format contracts are already represented by extracted Clara modules.

### Not completed
- No new manifest entries were warranted.
- Full 108-entry immutable verifier still needs execution from an actual repository checkout.

### Next
Continue the broader Clara `src/` dependency graph outside the already-closed public/embed/realtime slice, prioritizing the next unrepresented Clara-owned reusable capability (integrations/tools/MCP, audit/observability, or event/runtime infrastructure). Preserve the same rule: extract only an existing whole file with a clean dependency boundary; otherwise document the adapter boundary instead.


## 2026-10-03 — AI-agent reference library and realtime/chat completeness guardrails

### Completed
- Strengthened Clara Core documentation so a new AI coding agent can navigate the reusable reference set without relying on prior conversation context.
- Added `clara-core/AGENTS.md` with mandatory search/filter/extraction rules, realtime voice completeness checklist, AI/chat checklist, provider matrix, and documentation discovery procedure.
- Added `clara-core/REFERENCE-MAP.md` mapping AI provider configuration, chat, RAG, realtime voice, provider-specific realtime implementations, public embed and usage/latency paths to exact Clara source locations.
- Added `clara-core/IMPLEMENTATION-PLAYBOOK.md` defining the implementation sequence for a new SaaS/agent project and the minimum verification gates.
- Expanded `clara-core/README.md` to make these documents the canonical starting point for new AI agents.
- Rechecked the current manifest: 108 immutable entries.
- Rechecked that the reference set already contains the AI provider implementations (OpenAI, Gemini, Sarvam, TEI), voice provider services (ElevenLabs and Sarvam), AI/voice resolution/config/model catalogs, realtime coordination/latency/auth primitives, public embed runtime, NDJSON/realtime events, RAG and usage/metering foundations.
- Explicitly documented that OpenAI and Gemini realtime implementations are transport/API-specific rather than missing symmetric VoiceProviderService classes; their browser/API implementations remain reference implementations where coupled to React/Next.js/provider lifecycle.
- Explicitly separated chat, voice-chat, realtime voice and telephony so a new implementation does not accidentally replace one runtime path with another.

### Current implementation guard
The reference library is now documentation-complete enough for AI-agent navigation, but this does not claim that every host adapter or provider relay has been made immutable core. Coupled routes, React hooks, vendor relay lifecycle, auth/tenancy, secrets and telephony remain documented reference/adapter boundaries.

### Verification status
- Manifest size: 108.
- Documentation files verified present with current Git blob SHAs:
  - `clara-core/AGENTS.md` → `af4529d780266bb4ec425859dab8041a0b88f0f8`
  - `clara-core/REFERENCE-MAP.md` → `0e1f312e457c9e0946dab457ed282987e29f429e`
  - `clara-core/IMPLEMENTATION-PLAYBOOK.md` → `55e6f8dee26c6d6304188159722aaa340ccadf15`
  - `clara-core/README.md` → `4182a9b5a07ed9f5be2e30f15d268cfc1d309247`
- Full 108-entry immutable verifier still requires execution from a real repository checkout.

### Next
Continue the source dependency graph into integrations/tools/MCP, audit/observability and event/runtime infrastructure, while cross-checking their interaction with the already-covered AI/chat/realtime voice chains.

/**
 * src/modules/voice-core/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Type contracts for the VOICE provider axis.
 *
 * Architecture (Doc/18-07-2026/ELEVENLABS_INTEGRATION_PLAN.md §3):
 *   Voice is a separate axis from the brain. The AIProvider union
 *   (openai | gemini) drives chat + embeddings + RAG and lives in
 *   src/modules/ai-core. The VoiceProvider union below decides WHO serves
 *   the voice surface (realtime / embed), resolved by resolveVoiceConfig().
 *
 *   - "openai"     → OpenAI Realtime (WebRTC; session minted server-side by
 *                    assistant/api/realtime.ts, driven client-side by the
 *                    useOpenAIRealtime hook — no server voice service).
 *   - "gemini"     → Gemini Live (WebSocket; same shape as openai).
 *   - "elevenlabs" → Hybrid pipeline (Scribe STT + platform RAG/chat +
 *                    streaming TTS). Documents/KBs never leave the platform
 *                    in this mode — the only provider with a server-side
 *                    VoiceProviderService implementation today.
 *   - "sarvam"     → Indic pipeline (Saaras STT + platform RAG/chat +
 *                    Bulbul TTS, 8–48 kHz WAV → raw PCM). Pipeline only —
 *                    Sarvam's Samvaad "Voice Agents" is a hosted no-code
 *                    platform, not an embeddable signed-agent runtime, so
 *                    there is NO Mode-B equivalent (plan §3.2).
 *
 * This file mirrors src/modules/ai-core/types.ts one-for-one so the two axes
 * stay recognisably parallel:
 *
 *   ai-core/types.ts                 voice-core/types.ts
 *   ───────────────────────────      ──────────────────────────────
 *   AIProvider        (union)        VoiceProvider           (union)
 *   LLMProvider     (interface)      VoiceProviderService  (interface)
 *   ProviderConfig   (construct)     VoiceServiceConfig     (construct)
 */

// ─── Voice provider axis ─────────────────────────────────────────────────────

export type VoiceProvider = "openai" | "gemini" | "elevenlabs" | "sarvam";

export const VOICE_PROVIDERS: VoiceProvider[] = ["openai", "gemini", "elevenlabs", "sarvam"];

export function isVoiceProvider(value: unknown): value is VoiceProvider {
  return value === "openai" || value === "gemini" || value === "elevenlabs" || value === "sarvam";
}

// ─── TTS voice tuning (hybrid pipeline) ──────────────────────────────────────

/**
 * Per-voice TTS tuning knobs, persisted on agent AI settings metadata and
 * passed through to the TTS endpoint. All optional — the vendor applies its
 * per-voice trained defaults when omitted.
 */
export interface ElevenLabsVoiceSettings {
  /** 0..1 — higher = more consistent, lower = more expressive. */
  stability?: number;
  /** 0..1 — how strictly the output mimics the source voice. */
  similarityBoost?: number;
  /** 0..1 — exaggerates the style of the source voice. */
  style?: number;
  /** 0.7..1.2 — playback speed multiplier. */
  speed?: number;
  /** Boost fidelity for speakers in the reference audio. */
  speakerBoost?: boolean;
}

// ─── Vendor payload types (service interface surface) ────────────────────────

export interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  category: string | null;
  labels: Record<string, string>;
  description: string | null;
  previewUrl: string | null;
}

export interface ElevenLabsSubscriptionInfo {
  tier: string;
  characterCount: number;
  characterLimit: number;
  nextCharacterCountResetUnix: number | null;
  voiceLimit: number;
  canUseInstantCloning: boolean;
}

export interface TranscribeParams {
  file: Blob;
  modelId: string;
  languageCode?: string | null;
}

export interface TranscribeResult {
  text: string;
  languageCode: string | null;
  /** Duration reported by the provider, when available. */
  durationSeconds: number | null;
}

export interface SpeakParams {
  text: string;
  voiceId: string;
  modelId: string;
  outputFormat: string;
  languageCode?: string | null;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
  speakerBoost?: boolean;
}

// ─── Service interface ───────────────────────────────────────────────────────

/**
 * Server-side voice vendor service — the "adapter" contract for providers
 * that execute voice work server-side (STT / TTS / catalog / health).
 *
 * Realtime providers ("openai" | "gemini") do NOT implement this interface:
 * their voice surface is a client-side realtime session whose ephemeral
 * token is minted by src/modules/assistant/api/realtime.ts. When a future
 * provider needs server-side speech (e.g. a second TTS vendor), it drops a
 * file into providers/, implements this interface, and registers one case
 * in factory.ts — nothing else changes.
 */
export interface VoiceProviderService {
  /**
   * Account health / quota probe (subscription tier, credit burn-down).
   */
  getSubscriptionInfo(): Promise<ElevenLabsSubscriptionInfo>;

  /**
   * Lists the vendor workspace's usable voices (ids + labels only —
   * voice definitions and audio stay at the vendor).
   */
  listVoices(): Promise<ElevenLabsVoice[]>;

  /**
   * Transcribes one utterance of user audio (speech-in).
   */
  transcribeAudio(params: TranscribeParams): Promise<TranscribeResult>;

  /**
   * Synthesises speech for answer text (speech-out). Returns the raw
   * streaming Response so route handlers can pipe it through without
   * buffering the whole clip in memory.
   */
  speak(params: SpeakParams): Promise<Response>;

  /**
   * Returns the name of the provider (e.g., 'elevenlabs').
   */
  getProviderName(): VoiceProvider;
}

// ─── Conversational capability (Mode B, V4/V5) ───────────────────────────────

/**
 * OPTIONAL capability group on top of VoiceProviderService: Conversational
 * AI agents (Mode B), conversation history, and voice cloning / design.
 *
 * Kept as a separate interface — NOT folded into VoiceProviderService —
 * because these are vendor-specific capability axes. A future TTS-only
 * voice vendor implements just VoiceProviderService and stays valid; this
 * platform exposes Mode B only when the resolved service also satisfies
 * this contract (see isConversationalVoiceService below).
 */
export interface ConversationalVoiceService {
  /** Conversational AI agent CRUD (Mode B). */
  listConversationalAgents(): Promise<ConversationalAgentRecord[]>;
  createConversationalAgent(params: ConversationalAgentCreateParams): Promise<ConversationalAgentRecord>;
  updateConversationalAgent(agentId: string, params: ConversationalAgentUpdateParams): Promise<ConversationalAgentRecord>;
  deleteConversationalAgent(agentId: string): Promise<void>;

  /** Short-lived signed URL for a browser Mode-B websocket session. */
  getAgentSignedUrl(agentId: string): Promise<SignedAgentSession>;

  /** Conversation history (post-call records, vendor side). */
  listConversations(params?: ConversationListParams): Promise<ConversationHistoryItem[]>;

  /**
   * Telephony (register-call pattern): ask the vendor for TwiML that
   * connects a Twilio call leg to the agent's realtime session. Our
   * /api/phone/twilio/incoming webhook returns this TwiML verbatim — the
   * phone audio then flows Twilio ⇄ vendor directly, never through Clara.
   */
  registerTwilioCall(params: TwilioCallRegistrationParams): Promise<string>;

  /** Native integration: import a Twilio number into the vendor workspace. */
  importTwilioPhoneNumber(params: TwilioNumberImportParams): Promise<TwilioPhoneNumberRecord>;

  /** Native integration: vendor-initiated outbound call from an imported number. */
  startTwilioOutboundCall(params: TwilioOutboundCallParams): Promise<{ callId: string }>;

  /**
   * Provision the workspace post-call webhook (transcripts + analytics →
   * /api/webhooks/elevenlabs/post-call). The vendor GENERATES the signing
   * secret and returns it here; the API layer persists it into
   * platform_env_settings (ELEVENLABS_WEBHOOK_SECRET) so live verification
   * picks it up immediately.
   */
  createWorkspaceWebhook(params: WorkspaceWebhookParams): Promise<WorkspaceWebhookRecord>;

  /** Instant voice cloning (consent-gated by the API layer, not here). */
  cloneVoice(params: VoiceCloneParams): Promise<VoiceCloneResult>;

  /** Voice Design — describe a voice in text, vendor returns one. */
  designVoice(params: VoiceDesignParams): Promise<VoiceDesignResult>;

  /** Removes a voice from the vendor workspace. */
  deleteVoice(voiceId: string): Promise<void>;
}

/**
 * Narrows a VoiceProviderService to the Mode-B capability group. Duck-typed
 * (not instanceof) so the check survives module duplication in dev builds.
 */
export function isConversationalVoiceService(
  service: VoiceProviderService,
): service is VoiceProviderService & ConversationalVoiceService {
  return typeof (service as Partial<ConversationalVoiceService>).createConversationalAgent === "function";
}

// ─── Conversational agent payloads (vendor shape) ────────────────────────────

export interface ConversationalAgentRecord {
  agentId: string;
  name: string;
  voiceId: string | null;
  language: string | null;
  firstMessage: string | null;
  systemPrompt: string | null;
  /** Raw vendor config (twilio block, tools list) — snapshot for the UI. */
  raw: Record<string, unknown>;
}

export interface ConversationalAgentCreateParams {
  name: string;
  voiceId: string;
  /** Platform RAG bridge: the webhook tool the vendor agent may call. */
  ragTool: {
    /** Absolute URL of /api/internal/elevenlabs/tools/rag-search. */
    url: string;
    /** Shared secret sent as x-clara-tool-token on every tool call. */
    secret: string;
    kbId: string;
    orgId: string;
    agentId?: string | null;
  };
  systemPrompt?: string | null;
  firstMessage?: string | null;
  language?: string | null;
  /** Telephony: agent serves phone calls too (ulaw_8000 both directions). */
  telephony?: boolean;
  /** Native telephony (opt-in): imports Twilio numbers into the vendor workspace. */
  twilio?: {
    phoneNumbers: string[];
    attachPhoneNumbers?: boolean;
  } | null;
}

export interface ConversationalAgentUpdateParams {
  name?: string;
  voiceId?: string;
  systemPrompt?: string | null;
  firstMessage?: string | null;
  language?: string | null;
  twilio?: {
    phoneNumbers: string[];
    attachPhoneNumbers?: boolean;
  } | null;
}

export interface SignedAgentSession {
  /** Short-lived signed URL — browser connects directly (Mode B, CSP-gated). */
  signedUrl: string;
  agentId: string;
  /** Unix ms when the signed URL expires. */
  expiresAt: number;
}

// ─── Telephony payloads (register-call + native Twilio integration) ─────────

export interface TwilioCallRegistrationParams {
  agentId: string;
  fromNumber: string;
  toNumber: string;
  direction: "inbound" | "outbound";
  /** Dynamic variables surfaced to the agent prompt (e.g. caller_number). */
  dynamicVariables?: Record<string, string>;
}

export interface TwilioNumberImportParams {
  label: string;
  phoneNumber: string;
  /** Twilio Account SID (AC…) or API Key SID (SK…). */
  sid: string;
  token: string;
}

export interface TwilioPhoneNumberRecord {
  phoneNumberId: string;
  label: string | null;
  phoneNumber: string;
  /** null until an agent is assigned for inbound calls. */
  agentId: string | null;
  raw: Record<string, unknown>;
}

export interface TwilioOutboundCallParams {
  agentId: string;
  /** ID of the imported phone number the call is placed from. */
  agentPhoneNumberId: string;
  toNumber: string;
}

export interface WorkspaceWebhookParams {
  name: string;
  /** Absolute HTTPS URL of /api/webhooks/elevenlabs/post-call. */
  url: string;
}

export interface WorkspaceWebhookRecord {
  webhookId: string;
  /** Vendor-generated signing secret — persisted by the API layer. */
  webhookSecret: string | null;
}

// ─── Conversation history payloads (vendor shape) ────────────────────────────

export interface ConversationListParams {
  agentId?: string;
  pageSize?: number;
}

export interface ConversationHistoryItem {
  conversationId: string;
  agentId: string | null;
  status: string | null;
  startedAtUnix: number | null;
  endedAtUnix: number | null;
  /** Turn count + vendor analysis fields, untyped passthrough. */
  raw: Record<string, unknown>;
}

// ─── Voice cloning / design payloads (V5) ────────────────────────────────────

export interface VoiceCloneParams {
  name: string;
  description?: string | null;
  files: { blob: Blob; filename: string }[];
  /** Voice labels for catalog organisation (accent, gender, use case…). */
  labels?: Record<string, string>;
}

export interface VoiceCloneResult {
  voiceId: string;
  /** Cloned voices start unverified on some tiers — surfaced to the UI. */
  requiresVerification: boolean;
}

export interface VoiceDesignParams {
  name: string;
  /** Free-text description of the target voice. */
  textPrompt: string;
  /** Optional loudness/quality hints — passthrough to the vendor. */
  options?: Record<string, unknown>;
}

export interface VoiceDesignResult {
  voiceId: string;
  /** Media ids of generated samples — the UI previews via /voices/preview. */
  sampleMediaIds: string[];
}

// ─── Provider construction config ────────────────────────────────────────────

export interface VoiceServiceConfig {
  provider: VoiceProvider;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

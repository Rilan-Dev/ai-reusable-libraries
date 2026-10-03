/**
 * src/modules/voice-core/config-types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolution types for the voice-provider axis — mirrors
 * src/modules/ai-core/config-types.ts (the brain axis equivalent).
 *
 * Consumers: organisations / knowledge-bases core DB layers (row shapes),
 * voice-core/resolve.ts (resolution contract), and the voice API handlers
 * (session bootstrap payload).
 */

import type { ResolvedAIConfig } from "@/modules/ai-core/config-types";
import type { ElevenLabsVoiceSettings, VoiceProvider } from "./types";

// ─── Resolution input ────────────────────────────────────────────────────────

export interface ResolveVoiceConfigInput {
  kbId?: string;
  orgId?: string;
  surface: "voice_chat" | "realtime" | "embed";
  /** Optional pre-resolved brain config to avoid duplicate AI resolution in composite callers. */
  brainConfig?: ResolvedAIConfig;
  /**
   * Draft-preview mode (authenticated preview surface only): resolve the
   * voice axes against the CURRENT Main-branch DRAFT instead of the
   * immutable production version; KB overrides (draft-only state) apply.
   * Never set this on public/embed surfaces.
   */
  preferDraft?: boolean;
}

// ─── Resolution output ───────────────────────────────────────────────────────

export interface ElevenLabsResolvedConfig {
  /** TTS model id (eleven_flash_v2_5 | eleven_turbo_v2_5 | eleven_multilingual_v2 | eleven_v3). */
  ttsModel: string;
  /** STT model id (scribe_v2 for Voice Chat; scribe_v2_realtime for Clara Realtime). */
  sttModel: string;
  /** Voice id — validated against the org catalog or platform default. */
  voiceId: string;
  voiceSettings: ElevenLabsVoiceSettings;
  /** BCP-47-ish language hint derived from the agent language chain. */
  language: string;
  /**
   * Speech-recognition language under the assistant's language policy: set
   * only when replies are pinned to one language; null = auto-detect (a
   * multi-language assistant must not transcribe everyone as the default).
   */
  sttLanguage?: string | null;
}

/** Sarvam specifics resolved when either voice purpose selects "sarvam". */
export interface SarvamResolvedConfig {
  /** Voice Chat TTS model id (bulbul:v3 | bulbul:v2 legacy). */
  ttsModel: string;
  voiceChatTtsModel: string;
  /** STT model id (saaras:v3 | saaras:v4). */
  sttModel: string;
  /** Voice Chat speaker id. */
  speaker: string;
  voiceChatSpeaker: string;
  /** BCP-47-ish language hint derived from the agent language chain (hi-IN, ta-IN, …). */
  language: string;
  /** Speech-recognition language code; "unknown" = Sarvam auto-detect (multi-language assistants). */
  sttLanguage?: string;
  /** Playback sample rate for the shared PCM queue (16000 default). */
  sampleRate: number;
  /** Exact Sarvam realtime WebSocket STT model. */
  realtimeSttModel: string;
  /** Exact realtime Bulbul TTS model. */
  realtimeTtsModel: string;
  /** Exact realtime speaker. */
  realtimeSpeaker: string;
  /** Exact LLM model used by the realtime voice-agent phone path. */
  realtimeLlmModel: string;
  /** Phone-call streaming TTS switch (SARVAM_REALTIME_TTS_ENABLED). The
   *  browser realtime agent always streams. */
  realtimeTtsEnabled: boolean;
}

/**
 * OpenAI specifics resolved when either voice purpose selects "openai".
 *
 * The native realtime transport (model / output voice / transcription) is a
 * VOICE-axis concern, deliberately independent of the brain provider: a
 * Sarvam or Gemini brain with an OpenAI realtime voice selection must still
 * receive a fully valid OpenAI Realtime session descriptor. Every fallback
 * is validated against the OpenAI Realtime API contract (fixed voice set,
 * realtime model ids) so a stale agent/org value from another provider can
 * never leak into the session (e.g. a Bulbul speaker id as output voice).
 */
export interface OpenAIRealtimeResolvedConfig {
  /** Validated OpenAI Realtime output voice ("alloy" when nothing valid is configured). */
  voiceId: string;
  /** OpenAI Realtime model id (validated realtime family, platform env default). */
  realtimeModel: string;
  /** Input-audio transcription model (whisper/transcribe family). */
  transcriptionModel: string;
}

/**
 * Result of resolveVoiceConfig(): which provider serves each voice PURPOSE,
 * the (untouched) brain config, and the ElevenLabs specifics when selected.
 *
 * Two purposes are resolved in one pass:
 *   • voiceProvider (voice-chat purpose) — the chat-window voice-chat
 *     experience (Mode A pipeline for ElevenLabs; the provider's realtime
 *     socket for OpenAI/Gemini, which have no separate STT/TTS pipeline).
 *   • realtimeProvider (realtime purpose) — the real-time voice assistant
 *     surfaces (floating voice modal, embed voice, Agents, phone).
 *     NULL-configured at every level = inherit the voice-chat value, so
 *     picking ONE provider keeps everything native to it.
 */
export interface VoiceResolution {
  voiceProvider: VoiceProvider;
  source: "kb_override" | "agent_settings" | "agent" | "org" | "env";
  /** Realtime-assistant purpose (inherits voiceProvider when unset everywhere). */
  realtimeProvider: VoiceProvider;
  realtimeSource: "kb_override" | "agent_settings" | "agent" | "org" | "voice_chat";
  /** Brain config resolved via the existing resolveAIConfig() — unchanged. */
  brain: ResolvedAIConfig;
  elevenlabs: ElevenLabsResolvedConfig | null;
  /** Sarvam specifics — non-null when either voice purpose selects "sarvam". */
  sarvam: SarvamResolvedConfig | null;
  /** OpenAI specifics — non-null when either voice purpose selects "openai". */
  openai: OpenAIRealtimeResolvedConfig | null;
}

// ─── Session bootstrap payload (hybrid pipeline, Mode A) ─────────────────────

/**
 * Returned by POST /api/voice/elevenlabs/session. Capability descriptors
 * ONLY — never keys. The browser drives the pipeline through platform
 * endpoints; it never talks to the voice vendor directly in Mode A.
 */
export interface ElevenLabsSessionPayload {
  /** Welcome message in the assistant's default language (spoken first). */
  greeting?: string;
  /** "clara-stream" when the Clara-controlled realtime relay is enabled. */
  mode: "pipeline" | "clara-stream";
  stt: {
    endpoint: string;
    model: string;
    language: string;
    sampleRate: number;
    maxAudioSeconds: number;
    /**
     * Mode C (Clara realtime, plan Task 6.2): Scribe realtime relay —
     * present when platform-admin realtime setting is on for the platform.
     * Its presence tells useElevenLabsClaraStream to run the realtime path
     * instead of the Mode A utterance pipeline.
     */
    realtime?: {
      endpoint: string;
      /** Session-minted HMAC token (?token= on both WS upgrades). */
      token: string;
      /** Also the TTS relay endpoint (same token). */
      ttsEndpoint: string;
      sampleRate: number;
      encoding: string;
      model: string;
    };
  };
  tts: {
    endpoint: string;
    model: string;
    voiceId: string;
    outputFormat: string;
    voiceSettings: ElevenLabsVoiceSettings;
  };
  chat: {
    endpoint: string;
    kbId: string | null;
    ragMode: string;
  };
  provider: "elevenlabs";
  kbId: string | null;
  ragMode: string;
}

/**
 * Returned by POST /api/voice/sarvam/session. Same capability-descriptor-only
 * posture as the ElevenLabs payload: never keys, never vendor URLs — the
 * browser drives the pipeline through platform endpoints.
 */
export interface SarvamSessionPayload {
  /** Welcome message in the assistant's default language (spoken first). */
  greeting?: string;
  mode: "pipeline" | "clara-stream";
  stt: {
    endpoint: string;
    model: string;
    language: string;
    sampleRate: number;
    maxAudioSeconds: number;
    /** Realtime relays — the realtime voice agent always streams. */
    realtime: {
      endpoint: string;
      /** Bulbul streaming TTS relay (same session token). */
      ttsEndpoint: string;
      /** Session-minted HMAC token (?token= on the WS upgrade). */
      token: string;
      sampleRate: number;
      encoding: string;
      vadSilenceMs: number;
      /** Exact vendor realtime STT model. */
      model: string;
    };
  };
  tts: {
    endpoint: string;
    model: string;
    speaker: string;
    outputFormat: string;
    language: string;
  };
  chat: {
    endpoint: string;
    kbId: string | null;
    ragMode: string;
  };
  provider: "sarvam";
  kbId: string | null;
  ragMode: string;
  languages: string[];
  /** Explicit realtime model identities for observability/config UIs. */
  realtime: {
    sttModel: string;
    llmModel: string;
    ttsModel: string;
    ttsEnabled: boolean;
  };
}

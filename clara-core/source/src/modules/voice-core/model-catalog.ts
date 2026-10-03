/**
 * src/modules/voice-core/model-catalog.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical TTS/STT model catalogue, request caps, and env-default parsing
 * for the voice-provider axis — mirrors the role of
 * src/modules/ai-core/model-catalog.ts on the brain axis.
 *
 * This module is the single source of truth used by:
 *   • the settings UIs      — dropdowns only offer catalogued TTS models
 *                             (components/admin/PlatformEnvPanel,
 *                              components/admin/OrgAIConfigEditor)
 *   • the settings APIs     — writes are rejected when an unsupported
 *                             ElevenLabs TTS model id is stored
 *                             (organisations/api/ai-settings.ts)
 *   • voice-core/resolve    — provider governance + default models + voice
 *                             id shape validation during resolution
 *   • voice-core/pricing    — per-model price list → cost per invocation
 *
 * Sarvam section (V0 foundations, Doc/SARVAM_AI_INTEGRATION_PLAN.md §5.1):
 * the Bulbul speaker catalogue is STATIC (37 enumerable string speakers —
 * no DB sync, no sarvam_voices table), so this file doubles as the vendor
 * voice registry until the pipeline provider lands in V2.
 *
 * All configuration is SERVER-ONLY. ELEVENLABS_API_KEY never appears in any
 * NEXT_PUBLIC_ variable, never crosses an API boundary, and is scrubbed from
 * logs via src/lib/redact.ts.
 */

import type { VoiceProvider } from "./types";

// ─── Catalogue entries ───────────────────────────────────────────────────────

export interface ElevenLabsTTSModel {
  modelId: string;
  name: string;
  /** Rough relative latency class for UI hints. */
  latencyClass: "low" | "medium" | "high";
  maxCharactersPerRequest: number;
  /** USD per 1,000 characters — see pricing.ts for overrides. */
  usdPer1kChars: number;
  multilingual: boolean;
}

export const ELEVENLABS_TTS_MODELS: ElevenLabsTTSModel[] = [
  {
    modelId: "eleven_flash_v2_5",
    name: "Eleven Flash v2.5",
    latencyClass: "low",
    maxCharactersPerRequest: 40_000,
    usdPer1kChars: 0.06,
    multilingual: true,
  },
  {
    modelId: "eleven_turbo_v2_5",
    name: "Eleven Turbo v2.5",
    latencyClass: "low",
    maxCharactersPerRequest: 40_000,
    usdPer1kChars: 0.08,
    multilingual: true,
  },
  {
    modelId: "eleven_multilingual_v2",
    name: "Eleven Multilingual v2",
    latencyClass: "medium",
    maxCharactersPerRequest: 10_000,
    usdPer1kChars: 0.15,
    multilingual: true,
  },
  {
    modelId: "eleven_v3",
    name: "Eleven v3 (alpha)",
    latencyClass: "medium",
    maxCharactersPerRequest: 10_000,
    usdPer1kChars: 0.15,
    multilingual: true,
  },
];

export function findTTSModel(modelId: string): ElevenLabsTTSModel | undefined {
  return ELEVENLABS_TTS_MODELS.find((model) => model.modelId === modelId.trim());
}

export function isSupportedTTSModel(modelId: string): boolean {
  return findTTSModel(modelId) != null;
}

// ─── Request caps (abuse guards — see plan §11.8) ────────────────────────────

export const TTS_MAX_CHARS_PER_REQUEST = 2_000;
export const TTS_PREVIEW_MAX_CHARS = 300;
export const STT_MAX_AUDIO_SECONDS = 120;
export const STT_MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const TTS_OUTPUT_FORMAT = "pcm_16000";

// ─── Provider availability ───────────────────────────────────────────────────

/** Mode B (Conversational AI agents) — separate platform feature setting. */
export function isConversationalAIEnabled(): boolean {
  return (process.env.ELEVENLABS_CONVERSATIONAL_AI_ENABLED ?? "false").toLowerCase() === "true";
}

/**
 * Scribe realtime model id for the /v1/speech-to-text/realtime WebSocket.
 * Validated against the current docs (client-side streaming guide): the
 * realtime endpoint takes scribe_v2_realtime (NOT the batch scribe_v1).
 */
export function getElevenLabsRealtimeSttModel(): string {
  // The realtime WebSocket accepts the dedicated Scribe v2 Realtime model.
  // Ignore stale batch/deprecated ids rather than shipping an invalid socket
  // configuration to the relay.
  return getPlatformDefaultRealtimeSTTModel();
}

export function isVoiceCloningEnabled(): boolean {
  return (process.env.ELEVENLABS_VOICE_CLONING_ENABLED ?? "false").toLowerCase() === "true";
}

/** Voice Design (prompt → voice) — V5, off by default. */
export function isVoiceDesignEnabled(): boolean {
  return (process.env.ELEVENLABS_VOICE_DESIGN_ENABLED ?? "false").toLowerCase() === "true";
}

// ─── Mode-B callback secrets ────────────────────────────────────────────────

/**
 * HMAC secret for the internal RAG server-tool callback
 * (/api/internal/elevenlabs/tools/rag-search). REQUIRED before any Mode-B
 * agent can be created — the agent's server tool is registered with this
 * secret at the vendor, and every callback is verified against it.
 */
export function getToolHmacSecret(): string | undefined {
  const value = process.env.ELEVENLABS_TOOL_HMAC_SECRET?.trim();
  return value || undefined;
}

/**
 * Signing secret for ElevenLabs post-call webhooks
 * (/api/webhooks/elevenlabs/post-call). REQUIRED before the webhook URL is
 * handed to the vendor.
 */
export function getWebhookSecret(): string | undefined {
  const value = process.env.ELEVENLABS_WEBHOOK_SECRET?.trim();
  return value || undefined;
}

// ─── V6 credit-burn alerting ────────────────────────────────────────────────

/**
 * Alert threshold for the ElevenLabs character budget, in percent consumed
 * (V6). 0 disables alerting.
 */
export function getCreditAlertThresholdPct(): number {
  const value = Number(process.env.ELEVENLABS_CREDIT_ALERT_THRESHOLD_PCT ?? "80");
  return Number.isFinite(value) && value > 0 && value <= 100 ? Math.round(value) : 80;
}

// ─── Core connection settings ────────────────────────────────────────────────

export function getElevenLabsApiKey(): string | undefined {
  const value = process.env.ELEVENLABS_API_KEY?.trim();
  return value || undefined;
}

/**
 * Fixed base URL — an SSRF guard. No request field ever becomes a URL;
 * voice ids are opaque strings validated against the DB catalog first.
 */
export function getElevenLabsBaseUrl(): string {
  // `?.trim() ||` (NOT `??`): an env var that is set-but-empty ("" — e.g. a
  // platform-settings save of a blank field, or `KEY=` in .env) must fall
  // back to the default. `??` kept "" and every vendor URL collapsed to a
  // bare path → "Failed to parse URL".
  return (process.env.ELEVENLABS_API_BASE_URL?.trim() || "https://api.elevenlabs.io").replace(/\/+$/, "");
}

export function getElevenLabsTimeoutMs(): number {
  const value = Number(process.env.ELEVENLABS_TIMEOUT_MS ?? "30000");
  return Number.isFinite(value) && value > 0 ? value : 30_000;
}

// ─── Platform default models / voice ─────────────────────────────────────────

export const DEFAULT_TTS_MODEL = "eleven_flash_v2_5";
export const DEFAULT_STT_MODEL = "scribe_v2";

export function getPlatformDefaultTTSModel(): string {
  return process.env.ELEVENLABS_DEFAULT_TTS_MODEL?.trim() || DEFAULT_TTS_MODEL;
}

export function getPlatformDefaultSTTModel(): string {
  const configured = process.env.ELEVENLABS_DEFAULT_STT_MODEL?.trim();
  // scribe_v1 was removed by ElevenLabs in July 2026. Treat an old env value
  // as a stale configuration rather than sending an invalid vendor request.
  return configured === "scribe_v1" ? DEFAULT_STT_MODEL : configured || DEFAULT_STT_MODEL;
}

/** Realtime TTS default is intentionally separate from Voice Chat.
 * Explicit realtime agent/org settings still win; this fallback stays on
 * Flash v2.5 so an old Turbo voice-chat setting cannot slow the realtime path.
 */
export function getPlatformDefaultRealtimeTTSModel(): string {
  const configured = process.env.ELEVENLABS_REALTIME_TTS_MODEL?.trim();
  if (configured && isSupportedTTSModel(configured)) return configured;
  return DEFAULT_TTS_MODEL;
}

/** Realtime STT must be the dedicated Scribe v2 Realtime model. */
export function getPlatformDefaultRealtimeSTTModel(): string {
  const configured = process.env.ELEVENLABS_REALTIME_STT_MODEL?.trim();
  return configured === "scribe_v2_realtime"
    ? configured
    : "scribe_v2_realtime";
}

export function getPlatformDefaultVoiceId(): string | null {
  return process.env.ELEVENLABS_DEFAULT_VOICE_ID?.trim() || null;
}

// ─── Voice id shape validation ───────────────────────────────────────────────

/**
 * Well-formed vendor voice ids are 17–25 char alphanumeric slugs. Unlike
 * OPENAI_REALTIME_VOICES (a fixed enumerable set), vendor voice ids are not
 * enumerable, so resolution validates shape + org-catalog membership instead.
 */
const VOICE_ID_PATTERN = /^[A-Za-z0-9]{17,25}$/;

export function looksLikeElevenLabsVoiceId(value: string): boolean {
  return VOICE_ID_PATTERN.test(value.trim());
}

// ─── Request id shape validation ─────────────────────────────────────────────

/**
 * kb/org/agent ids are Postgres UUIDs — a malformed one must die as a 400
 * BEFORE any DB query, or the driver surfaces "invalid input syntax for type
 * uuid" as a 500 (guard-discipline violation, caught by the V6 load test).
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

// ─── Provider registry metadata ──────────────────────────────────────────────

/**
 * Human-facing provider descriptors for settings UIs. Kept beside the
 * catalogue so a new voice provider is registered in exactly one place.
 */
export const VOICE_PROVIDER_LABELS: Record<VoiceProvider, string> = {
  openai: "OpenAI Realtime",
  gemini: "Gemini Live",
  elevenlabs: "ElevenLabs (hybrid)",
  sarvam: "Sarvam AI (Indic pipeline)",
};

// ─────────────────────────────────────────────────────────────────────────────
// Sarvam AI — Indic voice pipeline (Saaras STT + Bulbul TTS)
//
// Static catalogue only in V0 (dark launch): the pipeline provider
// (providers/sarvam.ts), routes, and resolve arm land in V2. Prices are the
// vendor INR list converted at SARVAM_INR_TO_USD = 0.012 (operator-tunable
// via env; see getSarvamInrToUsd below):
//   Bulbul TTS   ₹30 / 10K chars  → $0.036 per 1K chars
//   Saaras STT   ₹30 / hour       → $0.36 per hour = $0.006 per minute
// ─────────────────────────────────────────────────────────────────────────────

export interface SarvamTTSModel {
  modelId: string;
  name: string;
  /** Vendor per-request character cap (REST). */
  maxCharactersPerRequest: number;
  /** USD per 1,000 characters (INR list price converted at catalogue build). */
  usdPer1kChars: number;
  /** Vendor default output sample rate; the platform requests 16 kHz WAV. */
  defaultSampleRateHz: number;
  supportedSampleRatesHz: number[];
  /** BCP-47 codes the TTS pre-normalization model understands. */
  supportedLanguages: string[];
  /** Legacy model kept for backward compatibility only. */
  legacy?: boolean;
}

export interface SarvamSTTModel {
  modelId: string;
  name: string;
  /** Vendor REST cap per request (batch API handles longer; out of scope). */
  maxAudioSecondsPerRequest: number;
  /** USD per audio-minute (₹30/hour converted at catalogue build). */
  usdPerMinute: number;
  /** Language auto-detection with confidence score when no code is given. */
  autoDetectLanguage: boolean;
}

export interface SarvamSpeaker {
  /** Vendor speaker id — an enumerable lowercase string, NOT an opaque slug. */
  id: string;
  name: string;
  gender: "male" | "female";
  isDefault?: boolean;
}

// Bulbul language coverage: 10 Indian languages + Indian English.
export const SARVAM_TTS_LANGUAGES: string[] = [
  "hi-IN", "bn-IN", "ta-IN", "te-IN", "gu-IN",
  "kn-IN", "ml-IN", "mr-IN", "pa-IN", "od-IN", "en-IN",
];

// Saaras language coverage: 22 Indian languages + English (auto-detected).
export const SARVAM_STT_LANGUAGES: string[] = [
  "hi-IN", "bn-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN",
  "te-IN", "en-IN", "gu-IN", "as-IN", "ur-IN", "ne-IN", "kok-IN", "ks-IN",
  "sd-IN", "sa-IN", "sat-IN", "mni-IN", "brx-IN", "mai-IN", "doi-IN",
];

export const SARVAM_TTS_MODELS: SarvamTTSModel[] = [
  {
    modelId: "bulbul:v3",
    name: "Bulbul v3",
    maxCharactersPerRequest: 2_500,
    usdPer1kChars: 0.036,
    defaultSampleRateHz: 24_000,
    supportedSampleRatesHz: [8_000, 16_000, 22_050, 24_000],
    supportedLanguages: SARVAM_TTS_LANGUAGES,
  },
  {
    modelId: "bulbul:v2",
    name: "Bulbul v2 (legacy)",
    maxCharactersPerRequest: 2_500,
    usdPer1kChars: 0.036,
    defaultSampleRateHz: 22_050,
    supportedSampleRatesHz: [8_000, 16_000, 22_050],
    supportedLanguages: SARVAM_TTS_LANGUAGES,
    legacy: true,
  },
];

export const SARVAM_STT_MODELS: SarvamSTTModel[] = [
  {
    modelId: "saaras:v3",
    name: "Saaras v3 (default)",
    maxAudioSecondsPerRequest: 30,
    usdPerMinute: 0.006,
    autoDetectLanguage: true,
  },
  {
    modelId: "saaras:v4",
    name: "Saaras v4 (latest — Global English)",
    maxAudioSecondsPerRequest: 30,
    usdPerMinute: 0.006,
    autoDetectLanguage: true,
  },
];

// Static Bulbul v3 speaker catalogue (vendor docs, 37 named voices).
// Deliberately NOT a DB table: speakers are enumerable strings, so there is
// no sync job and no per-org catalogue — contrast elevenlabs_voices (033).
export const SARVAM_SPEAKERS: SarvamSpeaker[] = [
  { id: "shubh",     name: "Shubh",     gender: "male",   isDefault: true },
  { id: "aditya",    name: "Aditya",    gender: "male"   },
  { id: "ritu",      name: "Ritu",      gender: "female" },
  { id: "priya",     name: "Priya",     gender: "female" },
  { id: "neha",      name: "Neha",      gender: "female" },
  { id: "rahul",     name: "Rahul",     gender: "male"   },
  { id: "pooja",     name: "Pooja",     gender: "female" },
  { id: "rohan",     name: "Rohan",     gender: "male"   },
  { id: "simran",    name: "Simran",    gender: "female" },
  { id: "kavya",     name: "Kavya",     gender: "female" },
  { id: "amit",      name: "Amit",      gender: "male"   },
  { id: "dev",       name: "Dev",       gender: "male"   },
  { id: "ishita",    name: "Ishita",    gender: "female" },
  { id: "shreya",    name: "Shreya",    gender: "female" },
  { id: "ratan",     name: "Ratan",     gender: "male"   },
  { id: "varun",     name: "Varun",     gender: "male"   },
  { id: "manan",     name: "Manan",     gender: "male"   },
  { id: "sumit",     name: "Sumit",     gender: "male"   },
  { id: "roopa",     name: "Roopa",     gender: "female" },
  { id: "kabir",     name: "Kabir",     gender: "male"   },
  { id: "aayan",     name: "Aayan",     gender: "male"   },
  { id: "ashutosh",  name: "Ashutosh",  gender: "male"   },
  { id: "advait",    name: "Advait",    gender: "male"   },
  { id: "anand",     name: "Anand",     gender: "male"   },
  { id: "tanya",     name: "Tanya",     gender: "female" },
  { id: "tarun",     name: "Tarun",     gender: "male"   },
  { id: "sunny",     name: "Sunny",     gender: "male"   },
  { id: "mani",      name: "Mani",      gender: "female" },
  { id: "gokul",     name: "Gokul",     gender: "male"   },
  { id: "vijay",     name: "Vijay",     gender: "male"   },
  { id: "shruti",    name: "Shruti",    gender: "female" },
  { id: "suhani",    name: "Suhani",    gender: "female" },
  { id: "mohit",     name: "Mohit",     gender: "male"   },
  { id: "kavitha",   name: "Kavitha",   gender: "female" },
  { id: "rehan",     name: "Rehan",     gender: "male"   },
  { id: "soham",     name: "Soham",     gender: "male"   },
  { id: "rupali",    name: "Rupali",    gender: "female" },
];

export function findSarvamTTSModel(modelId: string): SarvamTTSModel | undefined {
  return SARVAM_TTS_MODELS.find((model) => model.modelId === modelId.trim());
}

export function isSupportedSarvamTTSModel(modelId: string): boolean {
  return findSarvamTTSModel(modelId) != null;
}

export function findSarvamSTTModel(modelId: string): SarvamSTTModel | undefined {
  return SARVAM_STT_MODELS.find((model) => model.modelId === modelId.trim());
}

export function isSupportedSarvamSTTModel(modelId: string): boolean {
  return findSarvamSTTModel(modelId) != null;
}

// ─── Saaras realtime model mapping ──────────────────────────────────────────
//
// The catalogue carries the BATCH REST ids (saaras:v3 | saaras:v4) that
// /speech-to-text accepts, but the realtime WebSocket
// (/speech-to-text-realtime/ws) ONLY accepts 'saaras:v3-realtime' and
// 'saaras:v4' — the vendor rejects every other id with a fatal
// "Invalid model '<id>'" error right after the socket opens. Resolved voice
// configs (org columns, platform defaults) store the batch ids, so the
// realtime leg must translate before building the upstream URL.

/** Vendor-supported realtime Saaras model ids (in preference order). */
export const SARVAM_REALTIME_STT_MODEL_IDS: string[] = ["saaras:v3-realtime", "saaras:v4-realtime", "saaras:v4"];

/** Safe fallback when a config carries an unknown/blank STT model. */
export const SARVAM_REALTIME_STT_MODEL_FALLBACK = "saaras:v3-realtime";
/** Explicit realtime voice-agent defaults, separate from batch STT settings. */
export const DEFAULT_SARVAM_REALTIME_STT_MODEL = "saaras:v3-realtime";
export const DEFAULT_SARVAM_REALTIME_LLM_MODEL = "sarvam-105b-conversations";

export function getPlatformDefaultSarvamRealtimeSttModel(): string {
  const configured = process.env.SARVAM_REALTIME_STT_MODEL?.trim();
  return configured && SARVAM_REALTIME_STT_MODEL_IDS.includes(configured)
    ? configured
    : DEFAULT_SARVAM_REALTIME_STT_MODEL;
}

export function getPlatformDefaultSarvamRealtimeLlmModel(): string {
  return process.env.SARVAM_REALTIME_LLM_MODEL?.trim() || DEFAULT_SARVAM_REALTIME_LLM_MODEL;
}

export function isSarvamRealtimeTtsEnabled(): boolean {
  return (process.env.SARVAM_REALTIME_TTS_ENABLED ?? "true").toLowerCase() === "true";
}

function clampedEnv(key: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && process.env[key]?.trim() ? Math.min(max, Math.max(min, value)) : fallback;
}

/**
 * Realtime voice tuning (Settings → AI → Sarvam), shipped to the relays by
 * realtime-init / the phone session so Vercel's separate WebSocket function
 * sees the platform admin's values too:
 *   SARVAM_REALTIME_VAD_THRESHOLD   speech probability threshold (0.3)
 *   SARVAM_REALTIME_SILENCE_MS      end-of-turn silence (500 ms)
 *   SARVAM_REALTIME_MIN_SPEECH_MS   minimum speech to open a turn (250 ms)
 *   SARVAM_TTS_PACE                 Bulbul speaking pace (1.0; v3 0.5–2.0)
 */
export function getSarvamRealtimeTuning(): {
  vad: { threshold: number; silenceMs: number; minSpeechMs: number };
  ttsPace: number;
} {
  return {
    vad: {
      threshold: clampedEnv("SARVAM_REALTIME_VAD_THRESHOLD", 0.3, 0.05, 0.95),
      silenceMs: Math.round(clampedEnv("SARVAM_REALTIME_SILENCE_MS", 500, 100, 3000)),
      minSpeechMs: Math.round(clampedEnv("SARVAM_REALTIME_MIN_SPEECH_MS", 250, 50, 2000)),
    },
    ttsPace: clampedEnv("SARVAM_TTS_PACE", 1, 0.5, 2),
  };
}


/**
 * Map a catalogued Saaras STT id to the vendor realtime-WebSocket model id.
 * Idempotent: already-realtime ids pass through untouched.
 */
export function toSarvamRealtimeSttModel(modelId: string): string {
  const id = modelId.trim();
  if (SARVAM_REALTIME_STT_MODEL_IDS.includes(id)) return id;
  // saaras:v3 (batch) and anything unknown → the realtime v3 variant.
  return SARVAM_REALTIME_STT_MODEL_FALLBACK;
}

export function findSarvamSpeaker(speakerId: string): SarvamSpeaker | undefined {
  return SARVAM_SPEAKERS.find((speaker) => speaker.id === speakerId.trim().toLowerCase());
}

export function isSupportedSarvamSpeaker(speakerId: string): boolean {
  return findSarvamSpeaker(speakerId) != null;
}

// ─── Sarvam request caps (abuse guards — see plan §11/§18) ──────────────────

/** Vendor REST cap for Saaras speech-to-text (batch API excluded). */
export const SARVAM_STT_VENDOR_MAX_AUDIO_SECONDS = 30;
/** Platform cap — matches the provider-agnostic STT_MAX_AUDIO_SECONDS. */
export const SARVAM_STT_MAX_AUDIO_SECONDS = 120;
/** Vendor REST cap for Bulbul text-to-speech. */
export const SARVAM_TTS_VENDOR_MAX_CHARS = 2_500;
/** Platform cap — matches the provider-agnostic TTS_MAX_CHARS_PER_REQUEST. */
export const SARVAM_TTS_MAX_CHARS = 2_000;
/** Studio preview cap (same contract as TTS_PREVIEW_MAX_CHARS). */
export const SARVAM_PREVIEW_MAX_CHARS = 300;
/** Platform playback sample rate — Bulbul returns 16 kHz WAV; the RIFF
 *  container is stripped server-side to raw PCM for the shared queue. */
export const SARVAM_TTS_SAMPLE_RATE_HZ = 16_000;

// ─── Sarvam connection settings ────────────────────────────────────────────

/**
 * Credential availability only. Platform-wide provider activation is owned by
 * the AI provider registry and must be changed from Platform Admin → AI Platform.
 */
export function isSarvamEnabled(): boolean {
  return Boolean(getSarvamApiKey());
}

export function getSarvamApiKey(): string | undefined {
  const value = process.env.SARVAM_API_KEY?.trim();
  return value || undefined;
}

/**
 * Fixed base URL — an SSRF guard, exactly like getElevenLabsBaseUrl().
 * Override exists for SageMaker self-hosted deployments only.
 */
export function getSarvamBaseUrl(): string {
  // `?.trim() ||` (NOT `??`): an env var that is set-but-empty ("" — e.g. a
  // platform-settings save of a blank Base URL field, or `KEY=` in .env)
  // must fall back to the default. `??` kept "" and every Sarvam URL —
  // chat /v1/chat/completions, TTS /text-to-speech, STT /speech-to-text,
  // realtime-init baseUrl — collapsed to a bare path, failing with
  // "Failed to parse URL from <path>" platform-wide.
  return (process.env.SARVAM_BASE_URL?.trim() || "https://api.sarvam.ai").replace(/\/+$/, "");
}

export function getSarvamTimeoutMs(): number {
  const value = Number(process.env.SARVAM_TIMEOUT_MS ?? "30000");
  return Number.isFinite(value) && value > 0 ? value : 30_000;
}

// ─── Sarvam platform defaults (env-backed; org columns override in V2) ──────

export const DEFAULT_SARVAM_TTS_MODEL = "bulbul:v3";
export const DEFAULT_SARVAM_STT_MODEL = "saaras:v3";
export const DEFAULT_SARVAM_SPEAKER = "shubh";

export function getPlatformDefaultSarvamTTSModel(): string {
  return process.env.SARVAM_TTS_MODEL?.trim() || DEFAULT_SARVAM_TTS_MODEL;
}

export function getPlatformDefaultSarvamSttModel(): string {
  return process.env.SARVAM_STT_MODEL?.trim() || DEFAULT_SARVAM_STT_MODEL;
}

export function getPlatformDefaultSarvamSpeaker(): string {
  return process.env.SARVAM_DEFAULT_SPEAKER?.trim() || DEFAULT_SARVAM_SPEAKER;
}

/**
 * INR→USD FX rate for Sarvam cost estimation (default 0.012). Chat catalogue
 * prices are converted at build time; the V3 pricing module consults this
 * getter for STT/TTS/translation so dashboards stay honest when the rupee
 * moves. Env override wins over the default.
 */
export function getSarvamInrToUsd(): number {
  const value = Number(process.env.SARVAM_INR_TO_USD ?? "0.012");
  return Number.isFinite(value) && value > 0 ? value : 0.012;
}

// ─── Sarvam speaker id shape validation ─────────────────────────────────────

/**
 * Bulbul speaker ids are enumerable lowercase given names ("shubh",
 * "priya", …), unlike the opaque 17–25 char ElevenLabs voice slugs. Shape
 * validation is a first-line 400 guard; catalogue membership is the strong
 * check (findSarvamSpeaker).
 */
const SARVAM_SPEAKER_PATTERN = /^[a-z]{2,12}$/;

export function looksLikeSarvamSpeaker(value: string): boolean {
  return SARVAM_SPEAKER_PATTERN.test(value.trim().toLowerCase());
}

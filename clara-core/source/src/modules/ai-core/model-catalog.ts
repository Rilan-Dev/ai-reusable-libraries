/**
 * src/modules/ai-core/model-catalog.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical model catalogue for the Clara AI Platform (WS-0.4).
 *
 * The model console previously let operators pick a *chat* model (e.g.
 * gpt-4o-2024-08-06) as the *embedding* model. Because both fields were
 * free-text, nothing stopped the mix-up — and once saved, every retrieval for
 * that tenant silently degraded (chat models cannot embed).
 *
 * This module is the single source of truth used by:
 *   • the settings UIs      — dropdowns only offer models from the correct
 *                              catalogue, with dimension metadata shown
 *   • the settings APIs     — writes are rejected when a chat-model id lands
 *                              in an embedding field (and vice versa)
 *   • resolveAIConfig       — a legacy bad row self-heals to the provider
 *                              default instead of corrupting retrieval
 *   • scripts/validate-model-config.mjs — CI / ops audit of stored config
 *   • usage metering        — per-model price list → estimated cost per call
 */

import type { AIProvider } from "./types";
import { isSarvamEnabled } from "@/modules/voice-core/model-catalog";

// ─── Catalogue entries ────────────────────────────────────────────────────────

export type ChatModelEntry = {
  id: string;
  provider: AIProvider;
  /** Human label for dropdowns (defaults to id). */
  label?: string;
  /** Context window in tokens, when known. */
  contextTokens?: number;
  /** Price per 1M prompt tokens, USD. */
  inputUsdPerMTokens?: number;
  /** Price per 1M completion tokens, USD. */
  outputUsdPerMTokens?: number;
  /** Beta / rolling-release vendor model — hidden unless SARVAM_BETA_MODELS_ENABLED. */
  beta?: boolean;
};

export type EmbeddingModelEntry = {
  id: string;
  provider: AIProvider;
  /** Output vector dimension. Drives Qdrant collection compatibility. */
  dimension: number;
  /** Price per 1M input tokens, USD. */
  inputUsdPerMTokens?: number;
  /** Matryoshka models can emit fewer dims via outputDimensionality. */
  matryoshkaMaxDimension?: number;
};

// ─── OpenAI ───────────────────────────────────────────────────────────────────

export const OPENAI_CHAT_MODELS: ChatModelEntry[] = [
  { id: "gpt-5.6-luna",   provider: "openai", contextTokens: 400_000, inputUsdPerMTokens: 1.25, outputUsdPerMTokens: 10 },
  { id: "gpt-5.6-terra",  provider: "openai", contextTokens: 400_000, inputUsdPerMTokens: 1.25, outputUsdPerMTokens: 10 },
  { id: "gpt-5.6-sol",    provider: "openai", contextTokens: 400_000, inputUsdPerMTokens: 2.5,  outputUsdPerMTokens: 20 },
  { id: "gpt-4o",               provider: "openai", contextTokens: 128_000, inputUsdPerMTokens: 2.5, outputUsdPerMTokens: 10 },
  { id: "gpt-4o-mini",          provider: "openai", contextTokens: 128_000, inputUsdPerMTokens: 0.15, outputUsdPerMTokens: 0.6 },
  { id: "gpt-4o-2024-08-06",    provider: "openai", contextTokens: 128_000, inputUsdPerMTokens: 2.5, outputUsdPerMTokens: 10 },
  { id: "gpt-4o-2024-11-20",    provider: "openai", contextTokens: 128_000, inputUsdPerMTokens: 2.5, outputUsdPerMTokens: 10 },
  { id: "gpt-4-turbo",          provider: "openai", contextTokens: 128_000, inputUsdPerMTokens: 10, outputUsdPerMTokens: 30 },
  { id: "gpt-4-turbo-preview",  provider: "openai", contextTokens: 128_000, inputUsdPerMTokens: 10, outputUsdPerMTokens: 30 },
  { id: "gpt-4-0125-preview",   provider: "openai", contextTokens: 128_000, inputUsdPerMTokens: 10, outputUsdPerMTokens: 30 },
  { id: "gpt-3.5-turbo",        provider: "openai", contextTokens: 16_385, inputUsdPerMTokens: 0.5, outputUsdPerMTokens: 1.5 },
  { id: "gpt-3.5-turbo-0125",   provider: "openai", contextTokens: 16_385, inputUsdPerMTokens: 0.5, outputUsdPerMTokens: 1.5 },
];

export const OPENAI_EMBEDDING_MODELS: EmbeddingModelEntry[] = [
  { id: "text-embedding-3-small",  provider: "openai", dimension: 1536, inputUsdPerMTokens: 0.02 },
  { id: "text-embedding-3-large",  provider: "openai", dimension: 3072, inputUsdPerMTokens: 0.13 },
  { id: "text-embedding-ada-002",  provider: "openai", dimension: 1536, inputUsdPerMTokens: 0.1 },
];

// ─── Gemini ───────────────────────────────────────────────────────────────────

export const GEMINI_CHAT_MODELS: ChatModelEntry[] = [
  { id: "gemini-2.5-flash", provider: "gemini", contextTokens: 1_048_576, inputUsdPerMTokens: 0.3,  outputUsdPerMTokens: 2.5 },
  { id: "gemini-2.5-pro",   provider: "gemini", contextTokens: 1_048_576, inputUsdPerMTokens: 1.25, outputUsdPerMTokens: 10 },
  { id: "gemini-2.0-flash", provider: "gemini", contextTokens: 1_048_576, inputUsdPerMTokens: 0.1,  outputUsdPerMTokens: 0.4 },
  { id: "gemini-2.0-pro",   provider: "gemini", contextTokens: 2_097_152, inputUsdPerMTokens: 3.5,  outputUsdPerMTokens: 10.5 },
  { id: "gemini-1.5-flash", provider: "gemini", contextTokens: 1_048_576, inputUsdPerMTokens: 0.075, outputUsdPerMTokens: 0.3 },
  { id: "gemini-1.5-pro",   provider: "gemini", contextTokens: 2_097_152, inputUsdPerMTokens: 1.25, outputUsdPerMTokens: 5 },
  { id: "gemini-1.5-flash-8b", provider: "gemini", contextTokens: 1_048_576, inputUsdPerMTokens: 0.0375, outputUsdPerMTokens: 0.15 },
];

export const GEMINI_EMBEDDING_MODELS: EmbeddingModelEntry[] = [
  // Matryoshka: any dimension ≤ 3072 can be requested; the platform pins a
  // compatible dimension via outputDimensionality when switching providers.
  { id: "gemini-embedding-001", provider: "gemini", dimension: 3072, inputUsdPerMTokens: 0.075, matryoshkaMaxDimension: 3072 },
  { id: "text-embedding-004",   provider: "gemini", dimension: 768,  inputUsdPerMTokens: 0.075 },
  { id: "embedding-001",        provider: "gemini", dimension: 768,  inputUsdPerMTokens: 0.075 },
];

// ─── Sarvam (Indic-first brain — chat ONLY, no embeddings) ──────────────────
//
// Vendor INR list prices converted at SARVAM_INR_TO_USD = 0.012 (default;
// operator-tunable via env, see voice-core/model-catalog getSarvamInrToUsd):
//   sarvam-105b(-conversations)  ₹29.28 in / ₹73.2 out  per 1M → $0.35 / $0.88
//   gemma4  (beta)               ₹36.6  in / ₹91.5  out per 1M → $0.44 / $1.10
//   deepseekv4-flash (beta)      ₹19.8  in / ₹59.4  out per 1M → $0.24 / $0.71
//   glm5.3  (beta)               ₹126   in / ₹396   out per 1M → $1.51 / $4.75
// Sarvam publishes NO embeddings API: an entry can never appear in the
// embedding catalogues — orgs on the sarvam brain keep embeddings on the
// platform backbone (SARVAM_EMBEDDING_FALLBACK_PROVIDER, resolve split in V1).

export const SARVAM_CHAT_MODELS: ChatModelEntry[] = [
  { id: "sarvam-105b",              provider: "sarvam", label: "Sarvam 105B (128K)",             contextTokens: 128_000, inputUsdPerMTokens: 0.35, outputUsdPerMTokens: 0.88 },
  { id: "sarvam-105b-conversations", provider: "sarvam", label: "Sarvam 105B Conversations (32K)", contextTokens: 32_000,  inputUsdPerMTokens: 0.35, outputUsdPerMTokens: 0.88 },
  { id: "gemma4",                   provider: "sarvam", label: "Gemma 4 31B (beta)",              inputUsdPerMTokens: 0.44, outputUsdPerMTokens: 1.1,  beta: true },
  { id: "deepseekv4-flash",         provider: "sarvam", label: "DeepSeek V4 Flash (beta)",        inputUsdPerMTokens: 0.24, outputUsdPerMTokens: 0.71, beta: true },
  { id: "glm5.3",                   provider: "sarvam", label: "GLM 5.3 (beta, reasons)",         inputUsdPerMTokens: 1.51, outputUsdPerMTokens: 4.75, beta: true },
];

/**
 * Exposes the beta open-source chat models (gemma4, glm5.3,
 * deepseekv4-flash) in option lists. Off by default — beta models roll out
 * gradually at the vendor and reasoning tokens bill as output (glm5.3).
 */
export function isSarvamBetaModelsEnabled(): boolean {
  return (process.env.SARVAM_BETA_MODELS_ENABLED ?? "false").toLowerCase() === "true";
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

const CHAT_BY_ID = new Map<string, ChatModelEntry>();
for (const entry of [...OPENAI_CHAT_MODELS, ...GEMINI_CHAT_MODELS, ...SARVAM_CHAT_MODELS]) {
  CHAT_BY_ID.set(entry.id.toLowerCase(), entry);
}

const EMBEDDING_BY_ID = new Map<string, EmbeddingModelEntry>();
for (const entry of [...OPENAI_EMBEDDING_MODELS, ...GEMINI_EMBEDDING_MODELS]) {
  EMBEDDING_BY_ID.set(entry.id.toLowerCase(), entry);
}

export function findChatModel(id: string): ChatModelEntry | undefined {
  return CHAT_BY_ID.get(id.trim().toLowerCase());
}

export function findEmbeddingModel(id: string): EmbeddingModelEntry | undefined {
  return EMBEDDING_BY_ID.get(id.trim().toLowerCase());
}

// ─── Pattern heuristics ───────────────────────────────────────────────────────
//
// The catalogue is extended with every release; the heuristics below catch
// *unknown* ids so a new model (e.g. gpt-5.7-nova) is still classified
// correctly without waiting for a catalogue update.

const CHAT_MODEL_PATTERNS: RegExp[] = [
  /^gpt-\d/,                       // gpt-4o, gpt-4-turbo, gpt-5.6-luna…
  /^gpt-realtime/,                 // gpt-realtime-2.1-mini…
  /^o[1-9](-|$)/,                  // o1, o3, o4-mini reasoning models
  /^chat-bison/,                   // legacy PaLM chat
  /^sarvam-/,                      // sarvam-105b, sarvam-105b-conversations, future releases
];

const EMBEDDING_MODEL_PATTERNS: RegExp[] = [
  /embedding/,                     // text-embedding-3-*, gemini-embedding-001…
  /^embed-?gecko/,                 // legacy PaLM embedding
];

// Voice-axis model ids (Bulbul TTS / Saaras STT). They must never be stored
// in a brain-axis field — a TTS model cannot chat and cannot embed. Trapped
// by validateModelField below with a dedicated error code.
const VOICE_MODEL_PATTERNS: RegExp[] = [
  /^bulbul:/,                      // bulbul:v3, bulbul:v2 (Sarvam TTS)
  /^saaras:/,                      // saaras:v3, saaras:v4 (Sarvam STT)
];

/** True when the id looks like a voice-surface model (TTS/STT, not brain). */
export function looksLikeVoiceModel(id: string): boolean {
  const value = id.trim().toLowerCase();
  if (!value) return false;
  return VOICE_MODEL_PATTERNS.some((p) => p.test(value));
}

/** True when the id is *known* to be a chat model OR matches a chat pattern. */
export function looksLikeChatModel(id: string): boolean {
  const value = id.trim().toLowerCase();
  if (!value) return false;
  if (CHAT_BY_ID.has(value)) return true;
  if (EMBEDDING_BY_ID.has(value)) return false;   // exact embedding match wins
  return CHAT_MODEL_PATTERNS.some((p) => p.test(value));
}

/** True when the id is *known* to be an embedding model OR matches a pattern. */
export function looksLikeEmbeddingModel(id: string): boolean {
  const value = id.trim().toLowerCase();
  if (!value) return false;
  if (EMBEDDING_BY_ID.has(value)) return true;
  if (CHAT_BY_ID.has(value)) return false;        // exact chat match wins
  return EMBEDDING_MODEL_PATTERNS.some((p) => p.test(value));
}

// ─── Dimension metadata ───────────────────────────────────────────────────────

/**
 * Canonical output dimension for an embedding model id, or null when unknown.
 * Mirrors the per-provider getEmbeddingDimension() logic but catalog-wide.
 */
export function embeddingDimensionFor(id: string): number | null {
  return findEmbeddingModel(id)?.dimension ?? null;
}

// ─── Field validation ─────────────────────────────────────────────────────────

export type ModelField = "chat" | "embedding";

export type ModelValidation =
  | { ok: true }
  | { ok: false; code: string; message: string };

const REINDEX_DOC_HINT =
  "Vectors must be rebuilt with the new model before retrieval is trustworthy — " +
  "use “Save & Reprocess Docs” so existing documents are re-embedded.";

/**
 * Validate a model value destined for a chat or embedding config field.
 *
 * Rules (WS-0.4):
 *   • A chat-model id in the embedding field is REJECTED (the reported defect).
 *   • An embedding-model id in the chat field is REJECTED (the inverse trap).
 *   • A voice-surface model id (bulbul:/saaras:) in EITHER brain field is
 *     REJECTED (Sarvam V0 — same trap class, caught before it ships).
 *   • Unknown ids are accepted (forward-compatibility with new releases) —
 *     they fail neither pattern class.
 *   • An explicit provider cross-check catches e.g. a Gemini embedding model
 *     configured for the OpenAI provider.
 */
export function validateModelField(opts: {
  field: ModelField;
  model: string | null | undefined;
  provider?: AIProvider;
}): ModelValidation {
  const model = opts.model?.trim() ?? "";
  if (!model) return { ok: true };   // blank = inherit / unset is always valid

  if (looksLikeVoiceModel(model)) {
    return {
      ok: false,
      code: "voice_model_in_brain_field",
      message:
        `“${model}” is a voice model (TTS/STT), not a brain model — it cannot ` +
        `hold a conversation or generate embeddings. Voice models are ` +
        `configured in the voice-provider settings, not here.`,
    };
  }

  if (opts.field === "embedding") {
    if (looksLikeChatModel(model)) {
      return {
        ok: false,
        code: "chat_model_in_embedding_field",
        message:
          `“${model}” is a chat model — it cannot generate embeddings. ` +
          `Choose an embedding model (e.g. text-embedding-3-small, 1536 dims). ` +
          REINDEX_DOC_HINT,
      };
    }
    const entry = findEmbeddingModel(model);
    if (entry && opts.provider && entry.provider !== opts.provider) {
      return {
        ok: false,
        code: "provider_model_mismatch",
        message:
          `“${model}” is a ${entry.provider} embedding model and cannot run on the ` +
          `${opts.provider} provider. Pick a ${opts.provider} embedding model.`,
      };
    }
    return { ok: true };
  }

  // chat field
  if (looksLikeEmbeddingModel(model)) {
    return {
      ok: false,
      code: "embedding_model_in_chat_field",
      message:
        `“${model}” is an embedding model — it cannot hold a conversation. ` +
        `Choose a chat model (e.g. the gpt-5.6 family or gpt-4o variants).`,
    };
  }
  const entry = findChatModel(model);
  if (entry && opts.provider && entry.provider !== opts.provider) {
    return {
      ok: false,
      code: "provider_model_mismatch",
      message:
        `“${model}” is a ${entry.provider} chat model and cannot run on the ` +
        `${opts.provider} provider. Pick a ${opts.provider} chat model.`,
    };
  }
  return { ok: true };
}

// ─── Cost estimation (WS-1.1 usage metering) ──────────────────────────────────

/**
 * Estimated cost in integer micro-dollars (1e-6 USD) for a model invocation.
 * Returns 0 for unknown models — usage rows stay append-only and honest even
 * when a brand-new model is configured before the catalogue is updated.
 */
export function estimateChatCostUsdMicros(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const entry = findChatModel(model);
  if (!entry) return 0;
  const input = entry.inputUsdPerMTokens ?? 0;
  const output = entry.outputUsdPerMTokens ?? 0;
  const usd =
    (promptTokens / 1_000_000) * input +
    (completionTokens / 1_000_000) * output;
  return Math.max(0, Math.round(usd * 1_000_000));
}

/** Estimated cost in micro-dollars for an embedding batch. */
export function estimateEmbeddingCostUsdMicros(
  model: string,
  promptTokens: number,
): number {
  const entry = findEmbeddingModel(model);
  if (!entry) return 0;
  const usd = (promptTokens / 1_000_000) * (entry.inputUsdPerMTokens ?? 0);
  return Math.max(0, Math.round(usd * 1_000_000));
}

// ─── Dropdown option lists (UI helpers) ───────────────────────────────────────

// Dark-launch gate: Sarvam entries join the option lists ONLY when the
// provider kill switch is on (SARVAM_ENABLED + key present) — with the kill
// switch off, every dropdown renders exactly as before V0. Beta entries
// additionally require SARVAM_BETA_MODELS_ENABLED.
export function visibleSarvamChatModels(): ChatModelEntry[] {
  if (!isSarvamEnabled()) return [];
  return isSarvamBetaModelsEnabled()
    ? SARVAM_CHAT_MODELS
    : SARVAM_CHAT_MODELS.filter((m) => !m.beta);
}

export function chatModelOptions(provider?: AIProvider): ChatModelEntry[] {
  const all = [...OPENAI_CHAT_MODELS, ...GEMINI_CHAT_MODELS, ...visibleSarvamChatModels()];
  return provider ? all.filter((m) => m.provider === provider) : all;
}

export function embeddingModelOptions(provider?: AIProvider): EmbeddingModelEntry[] {
  const all = [...OPENAI_EMBEDDING_MODELS, ...GEMINI_EMBEDDING_MODELS];
  return provider ? all.filter((m) => m.provider === provider) : all;
}

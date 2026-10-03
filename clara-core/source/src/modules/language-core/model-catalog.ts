/**
 * src/modules/language-core/model-catalog.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Catalogue, kill switches, and caps for the language axis (plan §7/§9.3).
 *
 * Prices (Sarvam list, converted at SARVAM_INR_TO_USD = 0.012):
 *   translate / transliterate  ₹20 / 10K chars  ≈ $0.024 / 1K chars
 *   language identification    ₹3.5 / 10K chars ≈ $0.0042 / 1K chars
 */

export interface TranslateModel {
  modelId: string;
  name: string;
  /** USD per 1,000 characters. */
  usdPer1kChars: number;
  /** Supported language count (vendor docs). */
  languageCount: number;
  /** Cheap alternative kept in the catalogue for operator choice. */
  secondary?: boolean;
}

export const SARVAM_TRANSLATE_MODELS: TranslateModel[] = [
  { modelId: "sarvam-translate:v1", name: "Sarvam Translate v1", usdPer1kChars: 0.024, languageCount: 22 },
  { modelId: "mayura:v1", name: "Mayura v1", usdPer1kChars: 0.024, languageCount: 11, secondary: true },
];

// ─── Caps (plan §9.3 cost control) ───────────────────────────────────────────

/** Query translation cap — the user question must never exceed this. */
export const TRANSLATION_QUERY_MAX_CHARS = 2_000;
/** Answer translation cap per request (sentence-wise chunks stay far below). */
export const TRANSLATION_ANSWER_MAX_CHARS = 4_000;
/** Identify / transliterate share the query cap. */
export const TRANSLITERATION_MAX_CHARS = 2_000;

// ─── Kill switches / connection settings ─────────────────────────────────────

export function getSarvamTranslationEnabled(): boolean {
  return (process.env.SARVAM_TRANSLATION_ENABLED ?? "false").toLowerCase() === "true";
}

export function getSarvamLanguageApiKey(): string | undefined {
  const value = process.env.SARVAM_API_KEY?.trim();
  return value || undefined;
}

export function getSarvamLanguageBaseUrl(): string {
  return (process.env.SARVAM_BASE_URL?.trim() || "https://api.sarvam.ai").replace(/\/+$/, "");
}

export function getSarvamLanguageTimeoutMs(): number {
  const parsed = Number(process.env.SARVAM_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
}

export function getPlatformDefaultTranslateModel(): string {
  return process.env.SARVAM_TRANSLATE_MODEL?.trim() || "sarvam-translate:v1";
}

export function findTranslateModel(modelId: string): TranslateModel | undefined {
  return SARVAM_TRANSLATE_MODELS.find((model) => model.modelId === modelId.trim());
}

export function isSupportedTranslateModel(modelId: string): boolean {
  return findTranslateModel(modelId) != null;
}

/** Combined availability gate: flag AND key (same posture as isSarvamEnabled). */
export function isLanguageServiceEnabled(): boolean {
  return getSarvamTranslationEnabled() && Boolean(getSarvamLanguageApiKey());
}

// ─── Language catalogue (BCP-47 codes the vendors understand) ────────────────

/** Sarvam translate v1 coverage — 22 languages (vendor docs). */
export const TRANSLATE_LANGUAGES: string[] = [
  "en-IN", "hi-IN", "bn-IN", "ta-IN", "te-IN", "gu-IN", "kn-IN", "ml-IN",
  "mr-IN", "pa-IN", "od-IN", "ur-IN", "as-IN", "ne-IN", "kok-IN", "ks-IN",
  "sd-IN", "sa-IN", "sat-IN", "mni-IN", "brx-IN", "mai-IN", "doi-IN",
];

/** 2-letter base → BCP-47 Indic mapping used by the chat pipeline. */
export function toTranslateLanguageCode(language: string | null | undefined): string {
  const base = (language ?? "").trim().toLowerCase().split("-")[0] ?? "";
  if (!base) return "en-IN";
  if (base === "en") return "en-IN";
  const match = TRANSLATE_LANGUAGES.find((code) => code.split("-")[0] === base);
  return match ?? "en-IN";
}

/** Map a translate language code back to the platform 2-letter form. */
export function fromTranslateLanguageCode(code: string | null | undefined): string {
  return (code ?? "").trim().toLowerCase().split("-")[0] || "en";
}

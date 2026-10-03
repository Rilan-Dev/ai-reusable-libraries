/**
 * src/modules/language-core/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Type contracts for the LANGUAGE provider axis — translation,
 * transliteration, and language identification (Sarvam AI, V4).
 *
 * The third provider axis after ai-core (brain) and voice-core (voice):
 * a platform capability with its own lifecycle (org opt-in via
 * translation_mode, its own metering kind TRANSLATION, its own kill switch
 * SARVAM_TRANSLATION_ENABLED) — never an if-statement inside the chat route
 * (plan §3.3).
 *
 *   ai-core/types.ts            voice-core/types.ts       language-core/types.ts
 *   ────────────────            ───────────────────       ─────────────────────
 *   AIProvider (union)          VoiceProvider (union)     LanguageProvider (union)
 *   LLMProvider (interface)     VoiceProviderService      LanguageService
 *   ProviderConfig              VoiceServiceConfig        LanguageServiceConfig
 */

// ─── Language provider axis ──────────────────────────────────────────────────

export type LanguageProvider = "sarvam";

export const LANGUAGE_PROVIDERS: LanguageProvider[] = ["sarvam"];

export function isLanguageProvider(value: unknown): value is LanguageProvider {
  return value === "sarvam";
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface TranslateParams {
  input: string;
  /** Source BCP-47-ish code ("hi-IN", "en-IN"); vendors also accept "auto". */
  sourceLanguageCode: string;
  targetLanguageCode: string;
  /** sarvam-translate:v1 | mayura:v1 (catalogue-validated). */
  model?: string;
  /** Speaker gender hint some vendors use for pronoun choice (passthrough). */
  speakerGender?: "male" | "female";
}

export interface TranslationResult {
  translatedText: string;
  model: string;
}

export interface TransliterateParams {
  input: string;
  /** e.g. "hi-IN" — romanized or native input the vendor normalizes. */
  languageCode: string;
  /** "romanized" (native → roman) | "native" (roman → native script). */
  targetScript: "romanized" | "native";
}

export interface TransliterationResult {
  transliteratedText: string;
}

export interface LanguageIdentificationResult {
  /** BCP-47-ish code, e.g. "hi-IN", "en-IN". */
  languageCode: string;
  /** 0..1 vendor confidence. */
  confidence: number;
}

// ─── Service interface ────────────────────────────────────────────────────────

export interface LanguageService {
  translate(params: TranslateParams): Promise<TranslationResult>;
  transliterate(params: TransliterateParams): Promise<TransliterationResult>;
  identifyLanguage(text: string): Promise<LanguageIdentificationResult>;
  getProviderName(): LanguageProvider;
}

export interface LanguageServiceConfig {
  provider: LanguageProvider;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

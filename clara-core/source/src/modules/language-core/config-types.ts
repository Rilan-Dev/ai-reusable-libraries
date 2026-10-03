/**
 * src/modules/language-core/config-types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared config types for the language axis.
 */

/** Org-level cross-lingual RAG posture (org_ai_settings.translation_mode). */
export type TranslationMode = "off" | "query" | "query+answer";

export function isTranslationMode(value: unknown): value is TranslationMode {
  return value === "off" || value === "query" || value === "query+answer";
}

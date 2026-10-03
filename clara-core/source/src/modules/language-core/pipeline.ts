/**
 * src/modules/language-core/pipeline.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-lingual RAG pipeline helpers (V4) — the feature no incumbent provider
 * mix gives Clara: a tenant's KB lives in one language; users ask in another
 * (incl. code-mixed Hinglish); Clara identifies, normalizes, translates the
 * query, retrieves, and answers in the USER's language.
 *
 *   User query (any language)
 *     ├─ identifyLanguage()                (one cheap call — the user language
 *     │                                      is genuinely unknown server-side)
 *     ├─ transliterate()                   (romanized Indic → native script —
 *     │                                      translation quality depends on it)
 *     ├─ translate(query → KB language)    (org opt-in via translation_mode)
 *     ├─ RAG retrieval + chat              (unchanged, in the KB language)
 *     └─ translate(answer → user language) (query+answer mode — sentence-wise)
 *
 * Discipline:
 *   • Every failure degrades GRACEFULLY to the untranslated path — a vendor
 *     hiccup must never break a chat turn (console.warn, continue).
 *   • Zero vendor calls when translation_mode='off' or the kill switch is
 *     off (asserted by unit test — the default posture for every org).
 *   • planGuard("translation") is enforced BEFORE the first vendor call.
 *   • Every call is metered (TRANSLATION usage rows, char-counted).
 */

import { planGuard } from "@/lib/plan-guard";
import { splitSentences } from "@/modules/assistant/core/voice/sentence-split";
import {
  isLanguageServiceEnabled,
  toTranslateLanguageCode,
  fromTranslateLanguageCode,
  TRANSLATION_QUERY_MAX_CHARS,
  TRANSLATION_ANSWER_MAX_CHARS,
  getPlatformDefaultTranslateModel,
} from "./model-catalog";
import { LanguageProviderFactory } from "./factory";
import { logTranslationUsage } from "./pricing";
import type { TranslationMode } from "./config-types";

export type { TranslationMode };

export interface CrossLingualQueryResult {
  /** The query to use for retrieval AND the LLM (KB language). */
  effectiveQuery: string;
  /** Original, untouched user text (echoed in the conversation history). */
  originalQuery: string;
  /** Detected user language (2-letter platform form) — null when untranslated. */
  userLanguage: string | null;
  /** BCP-47 source code that was translated FROM (null when untranslated). */
  sourceLanguageCode: string | null;
  /** BCP-47 target code that was translated TO (null when untranslated). */
  targetLanguageCode: string | null;
  /** True when at least one translation/transliteration call executed. */
  translated: boolean;
}

/** Indic script ranges — used to detect romanized (Latin) Indic input. */
const NATIVE_SCRIPT_RE = /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0D80-\u0DFF\u0E00-\u0E7F\u0F00-\u0FFF]/;

/**
 * Identify + normalize + translate the user's question into the KB language.
 * Returns the effective query plus the translation context for answer-mode.
 * NEVER throws — all failures degrade to the untranslated path.
 */
export async function translateQueryForRag(params: {
  query: string;
  translationMode: TranslationMode;
  /** KB/answer language (assistant defaultLanguage / alwaysRespondIn). */
  targetLanguage: string | null;
  orgId: string | null;
  kbId: string | null;
  agentId: string | null;
}): Promise<CrossLingualQueryResult> {
  const untouched: CrossLingualQueryResult = {
    effectiveQuery: params.query,
    originalQuery: params.query,
    userLanguage: null,
    sourceLanguageCode: null,
    targetLanguageCode: null,
    translated: false,
  };

  if (params.translationMode === "off") return untouched;
  if (!isLanguageServiceEnabled()) return untouched;
  const query = params.query.trim();
  if (!query || query.length > TRANSLATION_QUERY_MAX_CHARS) return untouched;

  try {
    // Budget gate BEFORE the first vendor call.
    if (params.orgId) {
      const guard = await planGuard(params.orgId, "translation");
      if (!guard.allowed) {
        console.warn("[language-pipeline] translation budget reached — query passes untranslated");
        return untouched;
      }
    }

    const service = LanguageProviderFactory.getLanguageService();

    // 1. Identify the user's language (the platform genuinely does not know it).
    const identifyStarted = Date.now();
    const identified = await service.identifyLanguage(query);
    void logTranslationUsage({
      orgId: params.orgId,
      kbId: params.kbId,
      agentId: params.agentId,
      model: "identify-language",
      latencyMs: Date.now() - identifyStarted,
      characters: query.length,
    }).catch(() => {});

    const userLanguageCode = toTranslateLanguageCode(identified.languageCode);
    const targetLanguageCode = toTranslateLanguageCode(params.targetLanguage ?? "en");

    // Same language → nothing to translate (the common fast path).
    if (userLanguageCode === targetLanguageCode) return untouched;

    // 2. Romanized Indic input (Hinglish et al.): transliterate to native
    //    script first — translation quality depends on it.
    let normalizedQuery = query;
    if (
      userLanguageCode !== "en-IN" &&
      !NATIVE_SCRIPT_RE.test(query)
    ) {
      try {
        const translitStarted = Date.now();
        const transliteration = await service.transliterate({
          input: query,
          languageCode: userLanguageCode,
          targetScript: "native",
        });
        void logTranslationUsage({
          orgId: params.orgId,
          kbId: params.kbId,
          agentId: params.agentId,
          model: "transliterate",
          latencyMs: Date.now() - translitStarted,
          characters: query.length,
        }).catch(() => {});
        if (transliteration.transliteratedText.trim()) {
          normalizedQuery = transliteration.transliteratedText.trim();
        }
      } catch (translitErr) {
        console.warn("[language-pipeline] transliteration failed — continuing with raw query:", (translitErr as Error).message);
      }
    }

    // 3. Translate the (normalized) query into the KB language.
    const translateStarted = Date.now();
    const translation = await service.translate({
      input: normalizedQuery,
      sourceLanguageCode: userLanguageCode,
      targetLanguageCode,
      model: getPlatformDefaultTranslateModel(),
    });
    void logTranslationUsage({
      orgId: params.orgId,
      kbId: params.kbId,
      agentId: params.agentId,
      model: getPlatformDefaultTranslateModel(),
      latencyMs: Date.now() - translateStarted,
      characters: normalizedQuery.length,
      sourceLanguageCode: userLanguageCode,
      targetLanguageCode,
    }).catch(() => {});

    if (!translation.translatedText.trim()) return untouched;

    return {
      effectiveQuery: translation.translatedText.trim(),
      originalQuery: params.query,
      userLanguage: fromTranslateLanguageCode(userLanguageCode),
      sourceLanguageCode: userLanguageCode,
      targetLanguageCode,
      translated: true,
    };
  } catch (error) {
    console.warn("[language-pipeline] query translation failed — passing untranslated:", (error as Error).message);
    return untouched;
  }
}

/**
 * Sentence-wise answer translator for query+answer mode. Buffers streamed
 * tokens, translates each COMPLETE sentence into the user's language, and
 * emits translated text in order. Trailing text is flushed on finish().
 * All failures degrade to emitting the original sentence untranslated.
 */
export class SentenceTranslator {
  private buffer = "";
  private closed = false;
  private inflight: Promise<void> = Promise.resolve();

  constructor(private readonly params: {
    /** KB/answer language — the sentence's source (translate FROM). */
    sourceLanguageCode: string;
    /** The USER's detected language — the translation target (translate TO). */
    targetLanguageCode: string;
    orgId: string | null;
    kbId: string | null;
    agentId: string | null;
  }) {}

  /**
   * Feed a token delta; returns translated text chunks ready to emit (may be
   * empty — sentences only materialize when punctuation lands).
   */
  push(delta: string, emit: (text: string) => void): void {
    if (this.closed) return;
    this.buffer += delta;
    const { sentences, rest } = splitSentences(this.buffer);
    this.buffer = rest;
    for (const sentence of sentences) {
      this.inflight = this.inflight.then(() => this.translateSentence(sentence, emit));
    }
  }

  /** Flush any trailing text; resolves when all in-flight translations land. */
  async finish(emit: (text: string) => void): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const trailing = this.buffer.trim();
    this.buffer = "";
    if (trailing) {
      await this.translateSentence(trailing, emit);
    }
    await this.inflight;
  }

  private async translateSentence(sentence: string, emit: (text: string) => void): Promise<void> {
    const trimmed = sentence.trim();
    if (!trimmed) return;
    if (trimmed.length > TRANSLATION_ANSWER_MAX_CHARS) {
      emit(sentence); // cap: untranslated passthrough beats truncation
      return;
    }
    try {
      const service = LanguageProviderFactory.getLanguageService();
      const startedAt = Date.now();
      const translation = await service.translate({
        input: trimmed,
        sourceLanguageCode: this.params.sourceLanguageCode,
        targetLanguageCode: this.params.targetLanguageCode,
        model: getPlatformDefaultTranslateModel(),
      });
      void logTranslationUsage({
        orgId: this.params.orgId,
        kbId: this.params.kbId,
        agentId: this.params.agentId,
        model: getPlatformDefaultTranslateModel(),
        latencyMs: Date.now() - startedAt,
        characters: trimmed.length,
        sourceLanguageCode: this.params.sourceLanguageCode,
        targetLanguageCode: this.params.targetLanguageCode,
      }).catch(() => {});
      emit(translation.translatedText.trim() || sentence);
    } catch (error) {
      console.warn("[language-pipeline] answer translation failed — emitting original:", (error as Error).message);
      emit(sentence);
    }
  }
}

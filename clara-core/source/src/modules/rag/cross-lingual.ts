/**
 * src/modules/rag/cross-lingual.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-lingual retrieval for the grounding path: a visitor may ask in any
 * language (Tamil, Hindi, Arabic, …) while the knowledge base documents are
 * written in another (usually English).
 *
 * Why it is needed: Qdrant ranks by cosine similarity of embeddings. A Tamil
 * question and the English FAQ that answers it embed far apart — well under
 * the 0.25 score threshold — so the search returns nothing and the turn is
 * reported `grounded: false`. OpenAI's embedding guide recommends searching
 * in the language of the indexed content; translating the query is the
 * reliable fix, and it keeps the threshold (weak matches must never become
 * grounding context).
 *
 * The grounding service searches with BOTH the original query and its
 * translation, in parallel, and keeps the best score per chunk — so a
 * same-language KB, or a KB that mixes languages, loses nothing.
 *
 * Translation order:
 *   1. Sarvam (identify → transliterate → translate) when the organisation
 *      enabled query translation in its AI settings — the org's choice wins.
 *   2. Otherwise one short completion on the tenant's embedding provider
 *      (OpenAI / Gemini — the same account that already embeds the query).
 * Every failure or timeout degrades to the untranslated search; results are
 * cached so a repeated question costs nothing.
 */

import type { ProviderConfig } from "@/modules/ai-core/types";
import { ProviderFactory } from "@/modules/ai-core/factory";
import { translateQueryForRag, type TranslationMode } from "@/modules/language-core/pipeline";

// Script detection lives in the client-safe language policy module so the
// browser voice hooks and the server share one table.
import { NON_LATIN_LANGUAGES, detectVisitorLanguage, scriptLanguages } from "@/modules/assistant/core/language-policy";
export { scriptLanguages };

/** "en-IN" → "en". */
export function baseLanguage(code: string | null | undefined): string {
  return (code ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

/**
 * Best guess of the language the knowledge base documents are written in,
 * from their titles (the only per-document language signal stored). Latin
 * titles → the assistant's default language when that is Latin-script,
 * otherwise English.
 */
export function inferKnowledgeLanguage(
  documentTitles: string[],
  defaultLanguage: string | null | undefined,
): string {
  const counts = new Map<string, number>();
  let latin = 0;
  for (const title of documentTitles) {
    const candidates = scriptLanguages(title);
    if (candidates) counts.set(candidates[0], (counts.get(candidates[0]) ?? 0) + 1);
    else if (/[a-z]/i.test(title)) latin += 1;
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [language, count] of counts) {
    if (count > bestCount) { best = language; bestCount = count; }
  }
  if (best && bestCount > latin) return best;

  const fallback = baseLanguage(defaultLanguage);
  if (documentTitles.length === 0 && fallback) return fallback;
  return fallback && !NON_LATIN_LANGUAGES.has(fallback) ? fallback : "en";
}

/**
 * Does searching `query` against a `kbLanguage` knowledge base need a
 * translated query too?
 *   • non-Latin script not written in the KB language → yes
 *   • Latin script against a non-Latin KB → yes
 *   • Latin script flagged by the romanized heuristic (e.g. "enakku … venum")
 *     as a language other than the KB's → yes
 */
export function needsRetrievalTranslation(params: {
  query: string;
  kbLanguage: string;
  /** Language detected from the query by the response-language heuristic. */
  detectedLanguage?: string | null;
}): boolean {
  const kb = baseLanguage(params.kbLanguage) || "en";
  const candidates = scriptLanguages(params.query);
  if (candidates) return !candidates.includes(kb);
  if (NON_LATIN_LANGUAGES.has(kb)) return true;
  const detected = baseLanguage(params.detectedLanguage);
  return !!detected && detected !== kb && NON_LATIN_LANGUAGES.has(detected);
}

// ── Translation ──────────────────────────────────────────────────────────────

const TRANSLATION_CACHE_MAX = 500;
const TRANSLATION_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 2500;

const translationCache = new Map<string, { value: string; expiresAt: number }>();

export type RetrievalTranslation = {
  /** The query in the KB language, or null when no translation was made. */
  query: string | null;
  method: "cache" | "sarvam" | "llm" | "none";
  ms: number;
};

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function translationEnabled(): boolean {
  const flag = process.env.RAG_QUERY_TRANSLATION?.trim().toLowerCase();
  return !(flag === "off" || flag === "false" || flag === "0");
}

function timeoutMs(): number {
  const value = Number(process.env.RAG_QUERY_TRANSLATION_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });
}

function cleanTranslation(raw: string, original: string): string | null {
  const text = raw
    .replace(/^["'“”‘’`\s]+|["'“”‘’`\s]+$/g, "")
    .replace(/^(translation|translated question)\s*:\s*/i, "")
    .trim();
  if (!text || text.length > Math.max(400, original.length * 4)) return null;
  if (text.toLowerCase() === original.trim().toLowerCase()) return null;
  return text;
}

async function translateWithModel(
  query: string,
  kbLanguage: string,
  providerConfig: ProviderConfig | undefined,
): Promise<string | null> {
  if (providerConfig?.provider === "sarvam") return null;
  const config: ProviderConfig | undefined = providerConfig
    ? {
        ...providerConfig,
        chatModel: process.env.RAG_QUERY_TRANSLATION_MODEL?.trim() || providerConfig.chatModel,
      }
    : undefined;
  const provider = ProviderFactory.getProvider(config);
  const target = languageName(kbLanguage);
  let output = "";
  for await (const chunk of provider.chatStream(
    [
      {
        role: "system",
        content:
          `Translate the user's question into ${target} so it can be used to search a ${target} knowledge base. ` +
          `Keep product names, brand names, numbers and codes. English words written in another script ` +
          `(transliterated) must become the original words (for example Tamil-script "ஹோம்" → "home"). ` +
          `Reply with the translated question only — no quotes, notes or answer.`,
      },
      { role: "user", content: query },
    ],
    // A mechanical rewrite: no reasoning needed, and it is on the retrieval
    // critical path — ask every provider for its fastest mode.
    { temperature: 0, maxTokens: 160, reasoningEffort: null },
  )) {
    output += chunk;
  }
  return cleanTranslation(output, query);
}

/**
 * Translate `query` into the KB language for retrieval. Never throws; returns
 * `{ query: null }` when translation is off, fails, or times out.
 */
export async function translateQueryForRetrieval(params: {
  query: string;
  kbLanguage: string;
  translationMode?: TranslationMode | null;
  orgId?: string | null;
  kbId?: string | null;
  agentId?: string | null;
  /** The tenant's embedding provider config — reused for the completion. */
  providerConfig?: ProviderConfig;
}): Promise<RetrievalTranslation> {
  const started = Date.now();
  const kbLanguage = baseLanguage(params.kbLanguage) || "en";
  const query = params.query.trim();
  if (!query || !translationEnabled()) return { query: null, method: "none", ms: 0 };

  const key = `${kbLanguage}|${query.normalize("NFKC").replace(/\s+/g, " ").toLowerCase()}`;
  const cached = translationCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { query: cached.value, method: "cache", ms: Date.now() - started };
  }

  const remember = (value: string) => {
    translationCache.set(key, { value, expiresAt: Date.now() + TRANSLATION_CACHE_TTL_MS });
    while (translationCache.size > TRANSLATION_CACHE_MAX) {
      const oldest = translationCache.keys().next().value;
      if (oldest === undefined) break;
      translationCache.delete(oldest);
    }
  };

  const budget = timeoutMs();

  // 1. The organisation's own translation service choice (Sarvam).
  if (params.translationMode && params.translationMode !== "off") {
    const sarvam = await withTimeout(
      translateQueryForRag({
        query,
        translationMode: params.translationMode,
        targetLanguage: kbLanguage,
        orgId: params.orgId ?? null,
        kbId: params.kbId ?? null,
        agentId: params.agentId ?? null,
      }),
      budget,
    );
    const translated = sarvam?.translated ? cleanTranslation(sarvam.effectiveQuery, query) : null;
    if (translated) {
      remember(translated);
      return { query: translated, method: "sarvam", ms: Date.now() - started };
    }
  }

  // 2. One short completion on the tenant's embedding provider.
  try {
    const remaining = Math.max(500, budget - (Date.now() - started));
    const translated = await withTimeout(
      translateWithModel(query, kbLanguage, params.providerConfig),
      remaining,
    );
    if (translated) {
      remember(translated);
      return { query: translated, method: "llm", ms: Date.now() - started };
    }
  } catch (err) {
    console.warn("[cross-lingual] query translation failed:", (err as Error).message);
  }
  return { query: null, method: "none", ms: Date.now() - started };
}

/** Test hook. */
export function clearRetrievalTranslationCache(): void {
  translationCache.clear();
}

// ── Text translation (messages, greetings) ─────────────────────────────────

const localizeCache = new Map<string, { value: string; expiresAt: number }>();

/**
 * Translate `text` into `targetLanguage` with one completion on the given
 * chat provider (the tenant's own). Markdown, numbers, names and links are
 * preserved. Returns null on failure or timeout; cached.
 */
export async function translateText(
  text: string,
  targetLanguage: string,
  options: { providerConfig?: ProviderConfig; timeoutMs?: number; maxTokens?: number } = {},
): Promise<string | null> {
  const source = text.trim();
  const target = baseLanguage(targetLanguage) || "en";
  if (!source) return null;
  const key = `${target}|${source}`;
  const cached = localizeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const run = async (): Promise<string | null> => {
    const provider = ProviderFactory.getProvider(options.providerConfig);
    let output = "";
    for await (const chunk of provider.chatStream(
      [
        {
          role: "system",
          content:
            `Translate the message into ${languageName(target)} with the same meaning and tone. ` +
            "Keep Markdown formatting, numbers, names, product terms, links and citation markers such as [S1] unchanged. " +
            `If it is already in ${languageName(target)}, return it unchanged. Reply with the translation only.`,
        },
        { role: "user", content: source },
      ],
      {
        temperature: 0,
        maxTokens: options.maxTokens ?? Math.min(4000, Math.max(300, Math.ceil(source.length * 1.5))),
        reasoningEffort: null,
      },
    )) {
      output += chunk;
    }
    const value = output.trim();
    return value && value.length <= Math.max(1200, source.length * 6) ? value : null;
  };
  const value = await withTimeout(run(), options.timeoutMs ?? 20_000);
  if (value) localizeCache.set(key, { value, expiresAt: Date.now() + TRANSLATION_CACHE_TTL_MS });
  return value;
}

// ── Text localisation (greetings) ────────────────────────────────────────────

/**
 * `text` in `targetLanguage` — used so voices that speak the welcome message
 * verbatim (ElevenLabs, Sarvam) still start in the assistant's DEFAULT
 * language when the admin wrote the welcome in another one. Skips the call
 * when the text is already in the target language; never throws; cached.
 */
export async function localizeText(
  text: string,
  targetLanguage: string,
  providerConfig?: ProviderConfig,
  timeoutMs = 2500,
): Promise<string> {
  const source = text.trim();
  const target = baseLanguage(targetLanguage) || "en";
  if (!source) return text;
  const detected = detectVisitorLanguage(source, [target]);
  if (detected === target) return text;
  if (!detected && target === "en") return text; // Latin text, English target
  if (!translationEnabled()) return text;
  if (providerConfig?.provider === "sarvam") return text;
  return (await translateText(source, target, { providerConfig, timeoutMs, maxTokens: 300 })) ?? text;
}

/**
 * src/modules/assistant/core/language-policy.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE language policy for every channel (OpenAI Realtime, Gemini Live,
 * ElevenLabs, Sarvam, text chat, widget, phone). Pure and client-safe.
 *
 *   1. The conversation starts in the DEFAULT language (greeting included).
 *   2. If the visitor speaks/writes one of the ALLOWED languages, reply in
 *      that language.
 *   3. If the visitor uses a language that is NOT allowed, reply in the
 *      DEFAULT language.
 *   4. "Always respond in" (when set and allowed) overrides 2–3.
 *   5. Never reply in any language outside the allowed list.
 *
 * Speech-to-text follows the same policy: with more than one allowed
 * language the recogniser auto-detects (forcing the default language would
 * transcribe a Tamil speaker as English); with exactly one it is pinned.
 */

export type LanguagePolicyInput = {
  defaultLanguage?: string | null;
  allowedLanguages?: string[] | null;
  alwaysRespondIn?: string | null;
};

export type LanguagePolicy = {
  /** Language the conversation starts in and falls back to. */
  defaultLanguage: string;
  /** Allowed reply languages (always includes the default). */
  allowedLanguages: string[];
  /** Fixed reply language ("Always respond in"), when set and allowed. */
  fixedLanguage: string | null;
};

export type ReplyLanguageDecision = {
  /** The language to reply in, or null when the model must decide from the policy. */
  language: string | null;
  reason: "fixed" | "visitor" | "not-allowed" | "undetected";
  /** The visitor's detected language (may be outside the allowed list). */
  detected: string | null;
};

/** "en-IN" / "EN" → "en". */
export function baseLanguageCode(code: string | null | undefined): string {
  return (code ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

export function normalizeLanguagePolicy(input: LanguagePolicyInput): LanguagePolicy {
  const allowed = [
    ...new Set((input.allowedLanguages ?? []).map(baseLanguageCode).filter(Boolean)),
  ];
  const requestedDefault = baseLanguageCode(input.defaultLanguage);
  const defaultLanguage = requestedDefault || allowed[0] || "en";
  if (!allowed.includes(defaultLanguage)) allowed.unshift(defaultLanguage);
  const fixed = baseLanguageCode(input.alwaysRespondIn);
  return {
    defaultLanguage,
    allowedLanguages: allowed,
    fixedLanguage: fixed && allowed.includes(fixed) ? fixed : null,
  };
}

/**
 * Decide the reply language for one turn from the visitor's detected
 * language (null when the text gives no reliable signal).
 */
export function resolveReplyLanguage(
  policy: LanguagePolicy,
  detected: string | null | undefined,
): ReplyLanguageDecision {
  const visitor = baseLanguageCode(detected) || null;
  if (policy.fixedLanguage) return { language: policy.fixedLanguage, reason: "fixed", detected: visitor };
  if (visitor && policy.allowedLanguages.includes(visitor)) {
    return { language: visitor, reason: "visitor", detected: visitor };
  }
  if (visitor) return { language: policy.defaultLanguage, reason: "not-allowed", detected: visitor };
  // No reliable signal (e.g. Latin script shared by several languages). With
  // a single allowed language the answer is certain; otherwise the model
  // applies the policy itself from the words it sees.
  if (policy.allowedLanguages.length === 1) {
    return { language: policy.defaultLanguage, reason: "undetected", detected: null };
  }
  return { language: null, reason: "undetected", detected: null };
}

export function languageDisplayName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function list(codes: string[]): string {
  return codes.map((code) => `${languageDisplayName(code)} (${code})`).join(", ");
}

/** Session-level instruction, identical for every provider and surface. */
export function languagePolicyInstruction(policy: LanguagePolicy): string {
  if (policy.fixedLanguage) {
    return (
      `Language policy: always speak and write in ${languageDisplayName(policy.fixedLanguage)}, ` +
      "whatever language the visitor uses. Never use any other language."
    );
  }
  const defaultName = languageDisplayName(policy.defaultLanguage);
  if (policy.allowedLanguages.length === 1) {
    return (
      `Language policy: always speak and write in ${defaultName}, whatever language the visitor uses. ` +
      "Never use any other language."
    );
  }
  return (
    `Language policy: start the conversation (including any greeting) in ${defaultName}. ` +
    `After that, reply in the language the visitor is using when it is one of these allowed languages: ${list(policy.allowedLanguages)}. ` +
    `If the visitor uses any other language, reply in ${defaultName}. ` +
    "Never speak or write in a language outside the allowed list, and do not switch languages mid-reply."
  );
}

/** Per-turn directive for the decided reply language. */
export function replyLanguageDirective(policy: LanguagePolicy, decision: ReplyLanguageDecision): string {
  if (decision.language) {
    const name = languageDisplayName(decision.language);
    if (decision.reason === "not-allowed" && decision.detected) {
      return (
        `Reply in ${name}. The visitor is using ${languageDisplayName(decision.detected)}, which is not an enabled language, ` +
        `so answer in the default language (${name}).`
      );
    }
    return `Reply in ${name}, even though the knowledge-base passages may be in another language.`;
  }
  return (
    `Reply in the visitor's language if it is one of: ${list(policy.allowedLanguages)}; ` +
    `otherwise reply in ${languageDisplayName(policy.defaultLanguage)}.`
  );
}

/**
 * Speech-to-text language: pinned only when the reply language is fixed or
 * a single language is allowed; otherwise null = auto-detect.
 */
export function speechRecognitionLanguage(policy: LanguagePolicy): string | null {
  if (policy.fixedLanguage) return policy.fixedLanguage;
  return policy.allowedLanguages.length === 1 ? policy.defaultLanguage : null;
}

/** Instruction for the opening greeting (spoken or written). */
export function greetingInstruction(policy: LanguagePolicy, welcome: string): string {
  const language = languageDisplayName(policy.fixedLanguage ?? policy.defaultLanguage);
  return (
    `Greet the visitor in ${language} with this welcome message. ` +
    `If it is written in another language, say it in ${language} with the same meaning; otherwise say it as written:\n${welcome}`
  );
}

// ── Visitor language detection (pure, client-safe) ───────────────────────────

// Order matters: kana is checked before Han so Japanese is not read as Chinese.
const SCRIPT_LANGUAGES: Array<{ re: RegExp; languages: string[] }> = [
  { re: /[஀-௿]/, languages: ["ta"] },
  { re: /[ఀ-౿]/, languages: ["te"] },
  { re: /[ಀ-೿]/, languages: ["kn"] },
  { re: /[ഀ-ൿ]/, languages: ["ml"] },
  { re: /[ঀ-৿]/, languages: ["bn", "as"] },
  { re: /[઀-૿]/, languages: ["gu"] },
  { re: /[਀-੿]/, languages: ["pa"] },
  { re: /[଀-୿]/, languages: ["or"] },
  { re: /[ऀ-ॿ]/, languages: ["hi", "mr", "ne"] },
  { re: /[඀-෿]/, languages: ["si"] },
  { re: /[؀-ۿݐ-ݿ]/, languages: ["ar", "ur", "fa"] },
  { re: /[֐-׿]/, languages: ["he"] },
  { re: /[฀-๿]/, languages: ["th"] },
  { re: /[぀-ヿ]/, languages: ["ja"] },
  { re: /[가-힯ᄀ-ᇿ]/, languages: ["ko"] },
  { re: /[一-鿿]/, languages: ["zh", "ja"] },
  { re: /[Ѐ-ӿ]/, languages: ["ru", "uk", "bg", "sr"] },
  { re: /[Ͱ-Ͽ]/, languages: ["el"] },
];

export const NON_LATIN_LANGUAGES: ReadonlySet<string> = new Set(SCRIPT_LANGUAGES.flatMap((s) => s.languages));

/**
 * Candidate languages for the non-Latin script used in `text`, or null when
 * the text is Latin-script only (English, Spanish, romanized Tamil …).
 */
export function scriptLanguages(text: string): string[] | null {
  for (const { re, languages } of SCRIPT_LANGUAGES) {
    if (re.test(text)) return languages;
  }
  return null;
}

// Language names the visitor may ask for ("answer in Hindi", "reply in French").
const NAMED_LANGUAGE_CODES = [
  "en", "ta", "hi", "te", "kn", "ml", "bn", "gu", "pa", "mr", "or", "ur", "as", "ne", "si",
  "ar", "fa", "he", "tr", "fr", "es", "pt", "de", "it", "nl", "ru", "uk", "pl", "zh", "ja",
  "ko", "th", "vi", "id", "ms", "tl", "sw",
];
let namedLanguages: Map<string, string> | null = null;
function languageNameMap(): Map<string, string> {
  if (namedLanguages) return namedLanguages;
  namedLanguages = new Map();
  for (const code of NAMED_LANGUAGE_CODES) {
    const name = languageDisplayName(code).toLowerCase();
    if (name && name !== code) namedLanguages.set(name, code);
  }
  return namedLanguages;
}

// Native-script phrasing of "in <language>" requests.
const NATIVE_REQUESTS: Array<{ re: RegExp; code: string }> = [
  { re: /(தமிழில்|தமிழ்ல|தமிழாக)/, code: "ta" },
  { re: /(हिंदी में|हिन्दी में|हिंदीमे)/, code: "hi" },
  { re: /(తెలుగులో)/, code: "te" },
  { re: /(ಕನ್ನಡದಲ್ಲಿ)/, code: "kn" },
  { re: /(മലയാളത്തിൽ)/, code: "ml" },
];

// Romanized Indic words that do not occur in English. ("help" is English —
// it used to be in this list and turned English questions into Tamil ones.)
const ROMANIZED_HINTS: Array<{ re: RegExp; code: string }> = [
  { re: /\b(enakku|ungalukku|eppadi|sollunga|sollu|venum|pannanum|irukku|theriyum)\b/, code: "ta" },
  { re: /\b(mujhe|kaise|batao|chahiye|madad|kripya|kya hai)\b/, code: "hi" },
  { re: /\b(naaku|meeku|cheppandi|cheppu|kavali|sahayam)\b/, code: "te" },
];

/**
 * The language the visitor is using or explicitly asks for, or null when the
 * text gives no reliable signal. `preferred` (the allowed languages) breaks
 * ties between languages that share a script (Devanagari → hi/mr/ne).
 */
export function detectVisitorLanguage(text: string, preferred: string[] = []): string | null {
  const normalized = text.normalize("NFKC").toLowerCase();
  const preferredSet = new Set(preferred.map(baseLanguageCode));

  // 1. Explicit requests win: "answer in Tamil", "reply in french", "தமிழில்".
  const explicit = /\b(?:answer|reply|respond|speak|talk|tell|write|explain)\b[^.?!\n]{0,24}?\bin ([a-z]+)\b/.exec(normalized);
  const named = explicit ? languageNameMap().get(explicit[1]) : undefined;
  if (named) return named;
  for (const { re, code } of NATIVE_REQUESTS) if (re.test(normalized)) return code;

  // 2. Script.
  const candidates = scriptLanguages(normalized);
  if (candidates) return candidates.find((code) => preferredSet.has(code)) ?? candidates[0];

  // 3. Romanized Indic — only for enabled languages (too ambiguous otherwise).
  for (const { re, code } of ROMANIZED_HINTS) {
    if (preferredSet.has(code) && re.test(normalized)) return code;
  }

  // 4. Latin script without a signal: English only when it is the sole
  //    Latin-script option; otherwise let the model apply the policy.
  const latinOptions = [...preferredSet].filter((code) => !NON_LATIN_LANGUAGES.has(code));
  if (/[a-z]/.test(normalized) && latinOptions.length === 1 && latinOptions[0] === "en") return "en";
  return null;
}

/** The language policy from a resolved AI config (server surfaces). */
export function policyFromResolvedConfig(config: {
  defaultLanguage?: string | null;
  allowedLanguages?: string[] | null;
  assistantConfig?: { alwaysRespondIn?: string | null } | null;
}): LanguagePolicy {
  return normalizeLanguagePolicy({
    defaultLanguage: config.defaultLanguage,
    allowedLanguages: config.allowedLanguages,
    alwaysRespondIn: config.assistantConfig?.alwaysRespondIn,
  });
}

const SARVAM_TTS_LANGUAGES = new Set(["en", "hi", "bn", "gu", "kn", "ml", "mr", "or", "pa", "ta", "te"]);

/**
 * Sarvam text-to-speech language for one reply sentence (Bulbul needs the
 * text's own language). Script-detected; Latin text → English; anything
 * Sarvam cannot voice keeps the session default.
 */
export function sarvamSpeechLanguage(text: string, fallback: string): string {
  const candidates = scriptLanguages(text);
  const code = candidates ? candidates[0] : /[a-z]/i.test(text) ? "en" : null;
  if (!code || !SARVAM_TTS_LANGUAGES.has(code)) return fallback;
  return code === "or" ? "od-IN" : `${code}-IN`;
}

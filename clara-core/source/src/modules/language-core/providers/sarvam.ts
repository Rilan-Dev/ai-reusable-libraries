/**
 * src/modules/language-core/providers/sarvam.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Sarvam AI implementation of the LanguageService interface — translation,
 * transliteration, and language identification.
 *
 * Wire truth (plan §5.4):
 *   POST /translate           {input, source_language_code, target_language_code, model}
 *   POST /transliterate       {input, language_code, target_script?}
 *   POST /identify-language   {input}
 *   Auth: `api-subscription-key: <key>` header.
 *
 * Plain-fetch adapter (no SDK), sanitized errors, AbortController timeouts,
 * single connect-level retry — the same transport discipline as the
 * voice-core ElevenLabs/Sarvam adapters.
 */

import {
  getSarvamLanguageApiKey,
  getSarvamLanguageBaseUrl,
  getSarvamLanguageTimeoutMs,
} from "../model-catalog";
import type {
  LanguageIdentificationResult,
  LanguageProvider,
  LanguageService,
  LanguageServiceConfig,
  TranslateParams,
  TranslationResult,
  TransliterateParams,
  TransliterationResult,
} from "../types";

export class SarvamLanguageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SarvamLanguageError";
  }
}

const CONNECT_RETRY_BACKOFF_MS = 250;

const CONNECT_FAILURE_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
]);

function isConnectLevelFailure(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const cause = (error as { cause?: unknown }).cause;
  if (cause == null || typeof cause !== "object") return false;
  if (CONNECT_FAILURE_CODES.has(String((cause as { code?: unknown }).code ?? ""))) return true;
  if (Array.isArray((cause as { errors?: unknown }).errors)) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SarvamLanguageProvider implements LanguageService {
  private config: LanguageServiceConfig;
  private apiKey: string | undefined;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(config?: LanguageServiceConfig) {
    this.config = config ?? { provider: "sarvam" };
    // Lazy key discipline — the status probe constructs keyless services.
    this.apiKey = this.config.apiKey ?? getSarvamLanguageApiKey();
    this.baseUrl = this.config.baseUrl ?? getSarvamLanguageBaseUrl();
    const timeout = this.config.timeoutMs ?? getSarvamLanguageTimeoutMs();
    this.timeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout : 30_000;
  }

  private requireApiKey(): string {
    if (!this.apiKey) {
      throw new SarvamLanguageError(
        "SARVAM_API_KEY is not set. Add it in Platform Admin → Settings → AI (Sarvam section).",
        503,
      );
    }
    return this.apiKey;
  }

  private async sarvamFetch(
    path: string,
    init: RequestInit & { timeoutMs?: number } = {},
    allowConnectRetry = true,
  ): Promise<Response> {
    const { timeoutMs = this.timeoutMs, ...rest } = init;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...rest,
        signal: controller.signal,
        headers: {
          "api-subscription-key": this.requireApiKey(),
          ...(rest.headers ?? {}),
        },
      });
      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        console.error(
          `[sarvam-language] API error ${response.status} on ${path}: ${bodyText.slice(0, 300)}`,
        );
        throw new SarvamLanguageError(
          `Sarvam language API error (${response.status} ${response.statusText}) on ${path}`,
          response.status,
        );
      }
      return response;
    } catch (error) {
      if (error instanceof SarvamLanguageError) throw error;
      if ((error as Error).name === "AbortError") {
        throw new SarvamLanguageError(`Sarvam request timed out after ${timeoutMs}ms on ${path}`, 504);
      }
      if (allowConnectRetry && isConnectLevelFailure(error)) {
        await sleep(CONNECT_RETRY_BACKOFF_MS);
        return this.sarvamFetch(path, init, false);
      }
      throw new SarvamLanguageError(`Sarvam request failed on ${path}: ${(error as Error).message}`, 502);
    } finally {
      clearTimeout(timer);
    }
  }

  async translate(params: TranslateParams): Promise<TranslationResult> {
    const response = await this.sarvamFetch("/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: params.input,
        source_language_code: params.sourceLanguageCode,
        target_language_code: params.targetLanguageCode,
        model: params.model ?? "sarvam-translate:v1",
        ...(params.speakerGender ? { speaker_gender: params.speakerGender } : {}),
      }),
    });
    const data = (await response.json()) as Record<string, unknown>;
    return {
      translatedText: String(data.translated_text ?? data.translation ?? data.output ?? ""),
      model: String(data.model ?? params.model ?? "sarvam-translate:v1"),
    };
  }

  async transliterate(params: TransliterateParams): Promise<TransliterationResult> {
    const response = await this.sarvamFetch("/transliterate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: params.input,
        language_code: params.languageCode,
        target_script: params.targetScript === "romanized" ? "romanized" : "native",
      }),
    });
    const data = (await response.json()) as Record<string, unknown>;
    return {
      transliteratedText: String(
        data.transliterated_text ?? data.transliteration ?? data.output ?? "",
      ),
    };
  }

  async identifyLanguage(text: string): Promise<LanguageIdentificationResult> {
    const response = await this.sarvamFetch("/identify-language", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: text }),
    });
    const data = (await response.json()) as Record<string, unknown>;
    // Vendor field variants: language / language_code / detected_language.
    const code = data.language ?? data.language_code ?? data.detected_language;
    const probability = Number(data.confidence ?? data.language_probability ?? 1);
    return {
      languageCode: typeof code === "string" ? code : "en-IN",
      confidence: Number.isFinite(probability) ? Math.min(1, Math.max(0, probability)) : 1,
    };
  }

  getProviderName(): LanguageProvider {
    return "sarvam";
  }
}

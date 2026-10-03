/**
 * Sarvam AI brain-axis provider — chat only, via plain fetch.
 *
 * Wire truth (Doc/SARVAM_AI_INTEGRATION_PLAN.md §5.4):
 *   POST {SARVAM_BASE_URL}/v1/chat/completions        — sarvam-105b / -conversations
 *   POST {SARVAM_BASE_URL}/v2/chat/completions        — beta open-source models
 *   Auth: `api-subscription-key: <key>` header (NOT Bearer).
 *   Response: OpenAI-compatible SSE. Usage arrives in the FINAL chunk with an
 *   EMPTY `choices` array — the parser guards before indexing (vendor docs).
 *
 * A plain-fetch adapter (no `sarvamai` SDK) for the same reason the ElevenLabs
 * program dropped @elevenlabs/client: self-contained, dependency-free,
 * trivially mockable in vitest, immune to SDK breaking changes.
 *
 * EMBEDDINGS: Sarvam publishes no embeddings API. embedText/embedBatch throw
 * the typed EMBEDDING_UNSUPPORTED error. The resolver's embedding capability
 * split (resolve.ts, V1) routes embedding surfaces to the platform backbone
 * (SARVAM_EMBEDDING_FALLBACK_PROVIDER), so the factory never hands this
 * provider embedding work — the throw is a guardrail, not a behaviour.
 */

import type {
  ChatMessage,
  ChatOptions,
  EmbedOptions,
  LLMProvider,
  ProviderConfig,
} from "../types";
import {
  getSarvamApiKey,
  getSarvamBaseUrl,
  getSarvamTimeoutMs,
} from "@/modules/voice-core/model-catalog";

const DEFAULT_CHAT_MODEL = process.env.SARVAM_CHAT_MODEL ?? "sarvam-105b";

/**
 * Chat headroom on the default 30 s vendor timeout (plan §12.6). The explicit
 * SARVAM_CHAT_TIMEOUT_MS knob lets operators (and tests) shorten the floor.
 * Read per-request so env changes (and test setups) apply without a reload.
 */
function chatTimeoutMs(): number {
  const explicit = Number(process.env.SARVAM_CHAT_TIMEOUT_MS);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Math.max(getSarvamTimeoutMs(), 60_000);
}

/** Beta open-source models live on /v2 and are flag-gated OFF by default. */
const BETA_MODEL_IDS = new Set(["gemma4", "deepseekv4-flash", "glm5.3"]);

export function isSarvamBetaChatModel(model: string): boolean {
  return BETA_MODEL_IDS.has(model.trim().toLowerCase());
}

function sarvamChatPath(model: string): string {
  return isSarvamBetaChatModel(model) ? "/v2/chat/completions" : "/v1/chat/completions";
}

/**
 * Typed guardrail for the embedding capability split. Exported so unit tests
 * can assert the resolver NEVER routes an embedding surface to Sarvam.
 */
export class SarvamEmbeddingUnsupportedError extends Error {
  readonly code = "EMBEDDING_UNSUPPORTED";
  constructor() {
    super(
      "Sarvam publishes no embeddings API. Embeddings execute on the platform " +
      "backbone (SARVAM_EMBEDDING_FALLBACK_PROVIDER) via the resolver's " +
      "embedding capability split — an embedding call on SarvamProvider is a " +
      "routing bug, not a runtime condition.",
    );
    this.name = "SarvamEmbeddingUnsupportedError";
  }
}

/** Sanitized transport error — vendor bodies never reach the client. */
export class SarvamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SarvamError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SarvamStreamChunk {
  choices?: Array<{ delta?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class SarvamProvider implements LLMProvider {
  private config: ProviderConfig;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config?: ProviderConfig) {
    this.config = config ?? { provider: "sarvam" };
    const apiKey = this.config.apiKey ?? getSarvamApiKey();
    if (!apiKey) {
      throw new Error(
        "SARVAM_API_KEY is not set. Add it in Platform Admin → Settings → AI (Sarvam section) " +
        "or provide it in the config.",
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = getSarvamBaseUrl();
  }

  async *chatStream(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<string, void, unknown> {
    const model = this.config.chatModel ?? DEFAULT_CHAT_MODEL;
    const path = sarvamChatPath(model);

    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    };
    if (options?.maxTokens != null) body.max_tokens = options.maxTokens;
    if (options?.temperature != null) body.temperature = options.temperature;
    if (options?.stop?.length) body.stop = options.stop;
    if (options?.reasoningEffort !== undefined) body.reasoning_effort = options.reasoningEffort;

    const response = await this.sarvamFetch(
      path,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      chatTimeoutMs(),
    );

    yield* this.parseSseStream(response, options);
  }

  /**
   * Hand-rolled SSE parse (the vendor wire is OpenAI-compatible JSON lines).
   * `data: [DONE]` terminates. The final chunk may carry `usage` with an
   * EMPTY `choices` array — indexing without the guard is the classic bug.
   */
  private async *parseSseStream(
    response: Response,
    options?: ChatOptions,
  ): AsyncGenerator<string, void, unknown> {
    if (!response.body) {
      throw new SarvamError("Sarvam returned an empty stream body.", 502);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let usageReported = false;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process every complete line in the buffer.
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          let chunk: SarvamStreamChunk;
          try {
            chunk = JSON.parse(payload) as SarvamStreamChunk;
          } catch {
            continue; // tolerate keep-alives / comment frames
          }

          // Guard: the usage chunk has EMPTY choices.
          const delta = chunk.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) yield delta;

          if (chunk.usage && !usageReported) {
            usageReported = true;
            options?.onUsage?.({
              promptTokens: chunk.usage.prompt_tokens ?? 0,
              completionTokens: chunk.usage.completion_tokens ?? 0,
            });
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async embedText(_text: string, _options?: EmbedOptions): Promise<number[]> {
    throw new SarvamEmbeddingUnsupportedError();
  }

  async embedBatch(_texts: string[], _options?: EmbedOptions): Promise<number[][]> {
    throw new SarvamEmbeddingUnsupportedError();
  }

  getProviderName(): string {
    return "sarvam";
  }

  getModelName(type: "chat" | "embedding"): string {
    if (type === "chat") return this.config.chatModel ?? DEFAULT_CHAT_MODEL;
    throw new SarvamEmbeddingUnsupportedError();
  }

  getEmbeddingDimension(): number {
    throw new SarvamEmbeddingUnsupportedError();
  }

  /**
   * Transport: AbortController timeout, single retry on 429/503 honouring
   * Retry-After, sanitized errors (vendor bodies logged server-side only).
   */
  private async sarvamFetch(
    path: string,
    init: RequestInit,
    timeoutMs: number,
    allowThrottleRetry = true,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "api-subscription-key": this.apiKey,
          ...(init.headers ?? {}),
        },
      });

      if (!response.ok) {
        if (allowThrottleRetry && (response.status === 429 || response.status === 503)) {
          const retryAfterHeader = Number(response.headers.get("retry-after"));
          const backoffMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
            ? Math.min(retryAfterHeader * 1000, 10_000)
            : 750;
          await sleep(backoffMs);
          return this.sarvamFetch(path, init, timeoutMs, false);
        }
        // Vendor body can echo request payloads — read for the server log only.
        const bodyText = await response.text().catch(() => "");
        console.error(
          `[sarvam] API error ${response.status} on ${path}: ${bodyText.slice(0, 400)}`,
        );
        const reason =
          response.status === 401 || response.status === 403
            ? "Sarvam rejected the API subscription key."
            : response.status === 429
              ? "Sarvam rate limit reached."
              : `Sarvam API error (${response.status}).`;
        throw new SarvamError(reason, response.status === 401 || response.status === 403 ? 502 : 502);
      }

      return response;
    } catch (error) {
      if (error instanceof SarvamError) throw error;
      if ((error as Error).name === "AbortError") {
        throw new SarvamError(`Sarvam request timed out after ${timeoutMs}ms on ${path}.`, 504);
      }
      throw new SarvamError(`Sarvam request failed on ${path}: ${(error as Error).message}`, 502);
    } finally {
      clearTimeout(timer);
    }
  }
}

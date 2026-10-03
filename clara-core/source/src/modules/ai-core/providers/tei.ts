/**
 * src/modules/ai-core/providers/tei.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Embedding-only provider for the multilingual knowledge index.
 *
 * Talks to any Text Embeddings Inference (TEI) or OpenAI-compatible
 * /v1/embeddings endpoint — the platform admin's MULTILINGUAL_EMBEDDINGS_*
 * settings (self-hosted TEI on the VPS, or a hosted endpoint on Vercel).
 *
 *   embedText(text)    → a QUERY   (E5: "Instruct: …\nQuery: …")
 *   embedBatch(texts)  → DOCUMENTS (E5 instruct: raw passage text)
 *
 * Vectors are L2-normalised so cosine scores match the model card.
 */

import type { ChatMessage, ChatOptions, EmbedOptions, LLMProvider, ProviderConfig } from "../types";
import {
  embeddingsEndpoint,
  findMultilingualModel,
  formatEmbeddingInput,
  getMultilingualSettings,
} from "../multilingual-embeddings";

const DEFAULT_TIMEOUT_MS = 30_000;

function normalise(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  return norm > 0 ? vector.map((value) => value / norm) : vector;
}

export class TeiEmbeddingProvider implements LLMProvider {
  private readonly model: string;
  private readonly dimension: number;
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(config: ProviderConfig) {
    const settings = getMultilingualSettings();
    this.model = config.embeddingModel?.trim() || settings.model;
    this.dimension =
      config.embeddingDimension ?? findMultilingualModel(this.model)?.dimension ?? settings.dimension;
    this.baseUrl = config.baseUrl?.trim() || settings.baseUrl;
    this.apiKey = config.apiKey ?? settings.apiKey;
    if (!this.baseUrl) {
      throw new Error(
        "The multilingual embeddings endpoint is not configured. Set MULTILINGUAL_EMBEDDINGS_BASE_URL in Settings → AI.",
      );
    }
  }

  async *chatStream(_messages: ChatMessage[], _options?: ChatOptions): AsyncGenerator<string, void, unknown> {
    void _messages;
    void _options;
    throw new Error("The multilingual embeddings provider serves embeddings only.");
  }

  async embedText(text: string, options?: EmbedOptions): Promise<number[]> {
    const [vector] = await this.request([formatEmbeddingInput(text, "query", this.model)], options);
    if (!vector) throw new Error("The multilingual embeddings endpoint returned no vector.");
    return vector;
  }

  async embedBatch(texts: string[], options?: EmbedOptions): Promise<number[][]> {
    if (texts.length === 0) return [];
    return this.request(texts.map((text) => formatEmbeddingInput(text, "document", this.model)), options);
  }

  getProviderName(): string {
    return "tei";
  }

  getModelName(type: "chat" | "embedding"): string {
    return type === "embedding" ? this.model : "";
  }

  getEmbeddingDimension(): number {
    return this.dimension;
  }

  private async request(inputs: string[], options?: EmbedOptions): Promise<number[][]> {
    const timeout = Number(process.env.MULTILINGUAL_EMBEDDINGS_TIMEOUT_MS);
    const response = await fetch(embeddingsEndpoint(this.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: this.model, input: inputs, encoding_format: "float" }),
      signal: AbortSignal.timeout(Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      const error = new Error(`Multilingual embeddings request failed (HTTP ${response.status}): ${detail}`) as Error & {
        status?: number;
      };
      error.status = response.status;
      throw error;
    }
    const body = (await response.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>;
      usage?: { prompt_tokens?: number; total_tokens?: number };
    };
    const rows = [...(body.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (rows.length !== inputs.length || rows.some((row) => !Array.isArray(row.embedding))) {
      throw new Error(
        `Multilingual embeddings endpoint returned ${rows.length} vectors for ${inputs.length} inputs.`,
      );
    }
    const vectors = rows.map((row) => normalise(row.embedding!));
    if (this.dimension > 0 && vectors[0] && vectors[0].length !== this.dimension) {
      throw new Error(
        `Model "${this.model}" returned ${vectors[0].length}-dimensional vectors; the platform expects ${this.dimension}. ` +
          "Set MULTILINGUAL_EMBEDDINGS_DIMENSION or pick a supported model.",
      );
    }
    const tokens = body.usage?.prompt_tokens ?? body.usage?.total_tokens;
    if (typeof tokens === "number") options?.onUsage?.({ promptTokens: tokens, completionTokens: 0 });
    return vectors;
  }
}

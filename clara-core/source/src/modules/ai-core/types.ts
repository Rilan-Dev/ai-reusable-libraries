/**
 * Brain-axis provider union.
 *
 * "sarvam" joins the union in V0 (catalogue + migration only — dark launch):
 * the runtime machinery (factory case, resolve embedding split, env key
 * validation) lands in V1 per Doc/SARVAM_AI_INTEGRATION_PLAN.md. Nothing can
 * produce a "sarvam" resolution until an operator flips SARVAM_ENABLED and
 * the settings UI offers the provider, so behaviour is unchanged on deploy.
 * Sarvam serves CHAT ONLY — it publishes no embeddings API; embeddings run
 * on the platform backbone (SARVAM_EMBEDDING_FALLBACK_PROVIDER, V1).
 */
export type AIProvider = "openai" | "gemini" | "sarvam";

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Token usage reported by the provider for one invocation (WS-1.1 metering).
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  /**
   * Reasoning effort. undefined = model default; null = fastest turn
   * (Sarvam: reasoning off; OpenAI reasoning models: "low"; Gemini Flash:
   * thinking off) for latency-sensitive voice turns and query translation.
   */
  reasoningEffort?: "low" | "medium" | "high" | null;
  /**
   * Called exactly once when the provider reports final usage for the
   * stream. Usage-event metering hangs off this — never off guesswork.
   */
  onUsage?: (usage: TokenUsage) => void;
}

export interface EmbedOptions {
  /** Usage callback for embedding batches (ingestion metering). */
  onUsage?: (usage: TokenUsage) => void;
}

export interface LLMProvider {
  /**
   * Generates a chat completion stream.
   */
  chatStream(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncGenerator<string, void, unknown>;

  /**
   * Generates an embedding for a single text string.
   */
  embedText(text: string, options?: EmbedOptions): Promise<number[]>;

  /**
   * Generates embeddings for an array of text strings.
   */
  embedBatch(texts: string[], options?: EmbedOptions): Promise<number[][]>;

  /**
   * Returns the name of the provider (e.g., 'openai', 'gemini').
   */
  getProviderName(): string;

  /**
   * Returns the model name being used for the specified type.
   */
  getModelName(type: 'chat' | 'embedding'): string;

  /**
   * Returns the output dimension of the embedding model.
   */
  getEmbeddingDimension(): number;
}

/**
 * Embedding transports. "tei" is the multilingual knowledge index endpoint
 * (Text Embeddings Inference / OpenAI-compatible) — embeddings only, never a
 * chat brain, so it is deliberately NOT part of AIProvider.
 */
export type EmbeddingProviderId = AIProvider | "tei";

export interface ProviderConfig {
  provider: EmbeddingProviderId;
  apiKey?: string;
  /** Endpoint override (multilingual embeddings); defaults to platform settings. */
  baseUrl?: string;
  chatModel?: string;
  embeddingModel?: string;
  embeddingDimension?: number;
}

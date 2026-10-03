import { LLMProvider, ProviderConfig } from "./types";
import { OpenAIProvider } from "./providers/openai";
import { GeminiProvider } from "./providers/gemini";
import { SarvamProvider } from "./providers/sarvam";
import { TeiEmbeddingProvider } from "./providers/tei";

export class ProviderFactory {
  private static defaultInstance: LLMProvider | null = null;
  private static configuredInstances = new Map<string, LLMProvider>();

  private static getCacheKey(config: ProviderConfig): string {
    return JSON.stringify({
      provider: config.provider,
      apiKey: config.apiKey ?? null,
      chatModel: config.chatModel ?? null,
      embeddingModel: config.embeddingModel ?? null,
      embeddingDimension: config.embeddingDimension ?? null,
      baseUrl: config.baseUrl ?? null,
    });
  }

  private static createProvider(config: ProviderConfig): LLMProvider {
    switch (config.provider.toLowerCase()) {
      case "openai":
        return new OpenAIProvider(config);
      case "gemini":
        return new GeminiProvider(config);
      case "sarvam":
        return new SarvamProvider(config);
      case "tei":
        return new TeiEmbeddingProvider(config);
      default:
        throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
  }

  /**
   * Returns a singleton instance of the configured LLM Provider.
   * If no config is provided, it reads from environment variables.
   *
   * FIX: Changed from NEXT_PUBLIC_AI_PROVIDER to AI_PROVIDER.
   *
   * NEXT_PUBLIC_ variables are statically inlined into the browser JS bundle at
   * build time by Next.js. ProviderFactory is used exclusively in server-side
   * code (chat.ts, vector-store.ts, hybrid-search.ts). Exposing the provider
   * name in the client bundle is unnecessary. AI_PROVIDER is server-only.
   *
   * For client-side provider routing (useVoiceClient), NEXT_PUBLIC_AI_PROVIDER
   * is still appropriate — it's the provider name, not an API key, so exposure
   * is acceptable. But the factory itself should never run in the browser.
   */
  static getProvider(config?: ProviderConfig): LLMProvider {
    if (!config) {
      if (this.defaultInstance) {
        return this.defaultInstance;
      }

      const providerType = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
      // NOTE: the DEFAULT instance keeps serving openai/gemini even when
      // AI_PROVIDER=sarvam — the config-less call sites (hybrid-search,
      // vector-store admin paths) are embedding-heavy, and Sarvam has no
      // embeddings API. Sarvam brain tenants resolve through resolveAIConfig()
      // → toProviderConfig() with an explicit config, so the factory only
      // ever builds a SarvamProvider for CHAT work.
      this.defaultInstance = this.createProvider({
        provider: providerType === "gemini" ? "gemini" : "openai",
      });
      return this.defaultInstance;
    }

    const cacheKey = this.getCacheKey(config);
    const cached = this.configuredInstances.get(cacheKey);
    if (cached) {
      return cached;
    }

    const provider = this.createProvider(config);
    this.configuredInstances.set(cacheKey, provider);
    return provider;
  }

  /**
   * Forces the factory to create a new instance on the next call.
   * Useful for testing or dynamic configuration changes.
   */
  static reset() {
    this.defaultInstance = null;
    this.configuredInstances.clear();
  }
}

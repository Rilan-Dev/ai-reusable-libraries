/**
 * src/modules/language-core/factory.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton factory for the language axis — mirrors ai-core/voice-core.
 * Server-only; the API key never reaches the browser.
 */

import { LanguageService, LanguageServiceConfig } from "./types";
import { SarvamLanguageProvider } from "./providers/sarvam";

export class LanguageProviderFactory {
  private static defaultInstance: LanguageService | null = null;
  private static configuredInstances = new Map<string, LanguageService>();

  private static getCacheKey(config: LanguageServiceConfig): string {
    return JSON.stringify({
      provider: config.provider,
      apiKey: config.apiKey ?? null,
      baseUrl: config.baseUrl ?? null,
      timeoutMs: config.timeoutMs ?? null,
    });
  }

  private static createProvider(config: LanguageServiceConfig): LanguageService {
    switch (config.provider.toLowerCase()) {
      case "sarvam":
        return new SarvamLanguageProvider(config);
      default:
        throw new Error(`Unsupported language provider: ${config.provider}`);
    }
  }

  static getLanguageService(config?: LanguageServiceConfig): LanguageService {
    if (!config) {
      if (this.defaultInstance) return this.defaultInstance;
      this.defaultInstance = this.createProvider({ provider: "sarvam" });
      return this.defaultInstance;
    }
    const cacheKey = this.getCacheKey(config);
    const cached = this.configuredInstances.get(cacheKey);
    if (cached) return cached;
    const provider = this.createProvider(config);
    this.configuredInstances.set(cacheKey, provider);
    return provider;
  }

  static reset(): void {
    this.defaultInstance = null;
    this.configuredInstances.clear();
  }
}

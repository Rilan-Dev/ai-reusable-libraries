import { VoiceProviderService, VoiceServiceConfig } from "./types";
import { ElevenLabsVoiceProvider } from "./providers/elevenlabs";
import { SarvamVoiceProvider } from "./providers/sarvam";

/**
 * src/modules/voice-core/factory.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton factory for server-side voice provider services — the voice-axis
 * counterpart of src/modules/ai-core/factory.ts (ProviderFactory).
 *
 * Adding a voice provider that executes speech server-side is a two-step
 * change, exactly like the brain axis:
 *   1. implement VoiceProviderService in providers/<name>.ts
 *   2. register one case in createProvider() below
 *
 * Realtime providers ("openai" | "gemini") intentionally have no case here:
 * their voice surface is a client-side realtime session whose ephemeral
 * token is minted by src/modules/assistant/api/realtime.ts — there is no
 * server-side vendor client to construct for them.
 *
 * Server-only. API keys resolved here never reach the browser.
 */
export class VoiceProviderFactory {
  private static defaultInstance: VoiceProviderService | null = null;
  private static configuredInstances = new Map<string, VoiceProviderService>();

  private static getCacheKey(config: VoiceServiceConfig): string {
    return JSON.stringify({
      provider: config.provider,
      apiKey: config.apiKey ?? null,
      baseUrl: config.baseUrl ?? null,
      timeoutMs: config.timeoutMs ?? null,
    });
  }

  private static createProvider(config: VoiceServiceConfig): VoiceProviderService {
    switch (config.provider.toLowerCase()) {
      case "elevenlabs":
        return new ElevenLabsVoiceProvider(config);
      case "sarvam":
        return new SarvamVoiceProvider(config);
      case "openai":
      case "gemini":
        throw new Error(
          `Voice provider '${config.provider}' serves voice through client-side Realtime sessions ` +
          "(minted by src/modules/assistant/api/realtime.ts) — it has no server-side VoiceProviderService.",
        );
      default:
        throw new Error(`Unsupported voice provider: ${config.provider}`);
    }
  }

  /**
   * Returns a singleton instance of the requested voice provider service.
   * With no config, the default ElevenLabs provider is built from
   * environment variables (ELEVENLABS_API_KEY / BASE_URL / TIMEOUT_MS —
   * stable per process because runtime env settings load once at startup,
   * see src/lib/db/migrate.ts loadRuntimeSettings).
   */
  static getVoiceService(config?: VoiceServiceConfig): VoiceProviderService {
    if (!config) {
      if (this.defaultInstance) {
        return this.defaultInstance;
      }
      this.defaultInstance = this.createProvider({ provider: "elevenlabs" });
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
   * Forces the factory to create new instances on the next call.
   * Useful for testing or dynamic configuration changes.
   */
  static reset() {
    this.defaultInstance = null;
    this.configuredInstances.clear();
  }
}

import { getAgentById } from "@/modules/organisations/core/db";
import { getOrgAISettings } from "@/modules/organisations/core/ai-settings-db";
import { getAgentAISettings } from "@/modules/organisations/core/agent-ai-settings-db";
import { getAssistantConfigByAgent, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { getKbAIOverrides } from "@/modules/knowledge-bases/core/ai-overrides-db";
import type { ProviderConfig } from "@/modules/ai-core/types";
import { looksLikeChatModel, looksLikeEmbeddingModel } from "@/modules/ai-core/model-catalog";
import {
  getActiveDeploymentCached,
  getAgentDraftConfigCached,
  getProductionVersionConfigCached,
} from "@/modules/agent-versioning/core/db";
import { validateAgentAISelection } from "@/modules/ai-governance/core/resolver";
import { getPlatformAIRegistry } from "@/modules/ai-governance/core/registry-db";
import type { AssistantConfig } from "@/modules/knowledge-bases/core/models";
import type { AgentVersionConfig } from "@/modules/agent-versioning/core/types";
import type {
  AIProvider,
  AISurface,
  PlatformAIDefaults,
  ProviderScopedList,
  ResolveAIConfigInput,
  ResolvedAIConfig,
} from "./config-types";
import type { AgentAISettings } from "@/modules/organisations/core/agent-ai-types";
import { resolveAgentRuntimeSelection } from "@/modules/organisations/core/agent-ai-types";

export class AIConfigResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIConfigResolutionError";
  }
}

/**
 * Parse SARVAM_EMBEDDING_FALLBACK_PROVIDER (default "openai"). Only "openai"
 * and "gemini" are valid backbones — a fallback of "sarvam" is rejected with
 * a clear operator-facing message (Sarvam has no embeddings API).
 */
export function parseSarvamEmbeddingFallbackProvider(): "openai" | "gemini" {
  const raw = (process.env.SARVAM_EMBEDDING_FALLBACK_PROVIDER ?? "openai").trim().toLowerCase();
  if (raw === "gemini") return "gemini";
  if (raw === "openai" || raw === "") return "openai";
  console.error(
    `[ai-config] SARVAM_EMBEDDING_FALLBACK_PROVIDER="${raw}" is not a valid embedding backbone ` +
    `(openai | gemini) — falling back to "openai".`,
  );
  return "openai";
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNumber(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getPlatformAIDefaults(): PlatformAIDefaults {
  const provider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  const normalizedProvider: AIProvider =
    provider === "gemini" ? "gemini" : provider === "sarvam" ? "sarvam" : "openai";

  return {
    provider: normalizedProvider,
    models: {
      openai: {
        chat: process.env.OPENAI_CHAT_MODEL?.trim() || null,
        embedding: process.env.OPENAI_EMBEDDING_MODEL?.trim() || null,
        realtime: process.env.OPENAI_REALTIME_MODEL?.trim() || null,
        transcription: process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || null,
        defaultVoice: process.env.OPENAI_DEFAULT_VOICE?.trim() || null,
      },
      gemini: {
        chat: process.env.GEMINI_CHAT_MODEL?.trim() || null,
        embedding: process.env.GEMINI_EMBEDDING_MODEL?.trim() || null,
        realtime: process.env.GEMINI_REALTIME_MODEL?.trim() || null,
        transcription: process.env.GEMINI_TRANSCRIPTION_MODEL?.trim() || null,
        defaultVoice: process.env.GEMINI_DEFAULT_VOICE?.trim() || null,
      },
      // Sarvam is chat-only: no embedding / realtime / transcription models.
      // Embedding surfaces run on the backbone via the embedding split below.
      sarvam: {
        chat: process.env.SARVAM_CHAT_MODEL?.trim() || null,
        embedding: null,
        realtime: null,
        transcription: null,
        defaultVoice: null,
      },
    },
    limits: {
      chatMaxTokens: parsePositiveInt(process.env.AI_MAX_CHAT_TOKENS),
      realtimeMaxTokens: parsePositiveInt(process.env.AI_MAX_REALTIME_TOKENS),
      maxTemperature: parseNumber(process.env.AI_MAX_TEMPERATURE),
    },
  };
}

function getAllowedValues(map: ProviderScopedList | undefined, provider: AIProvider): string[] | null {
  const values = map?.[provider];
  return Array.isArray(values) && values.length > 0 ? values : null;
}

function pickAllowedString(
  candidate: string | null | undefined,
  allowed: string[] | null,
  fallback: string | null,
): string | null {
  if (!allowed || allowed.length === 0) return candidate ?? fallback ?? null;
  if (candidate && allowed.includes(candidate)) return candidate;
  if (fallback && allowed.includes(fallback)) return fallback;
  return allowed[0] ?? null;
}

function clampNumber(value: number | null, max: number | null): number | null {
  if (value == null || max == null) return value;
  return Math.min(value, max);
}

// OpenAI Realtime `audio.output.voice` accepts voice IDs, not model names.
// Keep this validation at the shared AI configuration boundary so every
// Realtime/embed caller is protected from stale or invalid agent settings.
const OPENAI_REALTIME_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
]);

function normalizeRealtimeVoice(
  provider: AIProvider,
  candidate: string | null,
  organisationVoices: string[],
  platformVoice: string | null,
): string | null {
  if (provider !== "openai") return candidate;

  if (candidate && OPENAI_REALTIME_VOICES.has(candidate)) return candidate;

  const configuredFallback = organisationVoices.find((voice) => OPENAI_REALTIME_VOICES.has(voice));
  if (configuredFallback) return configuredFallback;

  if (platformVoice && OPENAI_REALTIME_VOICES.has(platformVoice)) return platformVoice;

  // Safe OpenAI Realtime fallback. This is deliberately only used when no
  // valid OpenAI voice is configured; values such as `gpt-realtime-whisper`
  // are model identifiers and must never be sent as output voices.
  return "alloy";
}

// ── Dual-read instrumentation (migration plan Stage H) ──────────────────────
// Counts resolutions that still fall back to the LEGACY chain (no production
// deployment / version config). Target after the data migration: 0.
let legacyResolutionCount = 0;
function noteLegacyResolutionFallback(agentId: string | null): void {
  legacyResolutionCount++;
  if (legacyResolutionCount === 1 || legacyResolutionCount % 200 === 0) {
    console.warn(
      `[ai-config] legacy resolution fallback used (count=${legacyResolutionCount}, last agent=${agentId ?? "n/a"}) — ` +
      `publish the agent or run the AI configuration data migration to converge on immutable versions.`,
    );
  }
}

function assertSurfaceEnabled(surface: AISurface, flags: ResolvedAIConfig["flags"]): void {
  if (surface === "realtime" || surface === "embed") {
    if (!flags.voiceEnabled) throw new AIConfigResolutionError("Voice is disabled for this knowledge base.");
    if (!flags.realtimeEnabled) throw new AIConfigResolutionError("Realtime is disabled for this organisation.");
  }
  if (surface === "embed" && !flags.publicEmbedEnabled) {
    throw new AIConfigResolutionError("Public embed is disabled for this knowledge base.");
  }
}

/**
 * Resolve tenant AI settings.
 *
 * NEW architecture (migration plan Stage H/L dual-read):
 *   1. production deployment → immutable agent version → configuration
 *      (assistant persona + AI model selections + runtime toggles)
 *   2. platform provider registry + entitlement gate (ai-governance resolver)
 *   3. LEGACY fallback (kb overrides → agent_ai_settings → org_ai_settings →
 *      env) for agents that have no deployment yet — every fallback is
 *      counted (noteLegacyResolutionFallback) and the target after the data
 *      migration is zero.
 *
 * Knowledge bases never carry assistant configuration — a kbId input is
 * resolved through its owning agent.
 */
export async function resolveAIConfig(input: ResolveAIConfigInput): Promise<ResolvedAIConfig> {
  const defaults = getPlatformAIDefaults();
  const kb = input.kbId ? await getKnowledgeBaseById(input.kbId) : null;
  const agent = kb ? await getAgentById(kb.agentId) : null;
  const orgId = input.orgId ?? agent?.orgId ?? null;

  // ── Production immutable version (Stage H: new-first dual-read) ──────────
  // Draft-preview mode (authenticated preview surface) substitutes the
  // CURRENT Main-branch draft for the immutable production version: the
  // preview must test exactly what the user is editing — persona, models,
  // runtime toggles — against the LIVE knowledge-base collection. When no
  // draft exists yet the resolution falls back to the published version
  // (deterministic, never fabricated).
  const draft = input.preferDraft && agent?.id
    ? await getAgentDraftConfigCached(agent.id)
    : null;
  const productionVersion = agent?.id ? await getProductionVersionConfigCached(agent.id) : null;
  const deployment = agent?.id ? await getActiveDeploymentCached(agent.id) : null;
  const knowledgeCollection = !input.preferDraft && agent?.id && input.kbId && deployment
    ? await (await import("@/modules/agent-versioning/core/db")).getActiveDeploymentKbCollection(agent.id, input.kbId)
    : null;
  const versionConfig: AgentVersionConfig | null =
    draft?.configuration ?? productionVersion?.configuration ?? null;
  const versionAI = versionConfig?.ai ?? null;
  const versionRuntime = versionConfig?.runtime ?? null;
  const [orgSettings, agentSettings, kbOverrides, liveAssistantConfig] = await Promise.all([
    orgId ? getOrgAISettings(orgId) : Promise.resolve(null),
    agent?.id ? getAgentAISettings(agent.id) : Promise.resolve(null),
    input.kbId ? getKbAIOverrides(input.kbId) : Promise.resolve(null),
    agent?.id ? getAssistantConfigByAgent(agent.id) : Promise.resolve(null),
  ]);

  // Published versions are immutable: mutable KB overrides cannot leak into
  // runtime resolution. Draft-preview mode is the deliberate exception — KB
  // overrides are draft-only state, so they DO apply while previewing.
  const effectiveKbOverrides = versionConfig && !input.preferDraft ? null : kbOverrides;

  if (agentSettings && agent && agentSettings.orgId !== agent.orgId) {
    throw new AIConfigResolutionError("Agent AI configuration belongs to another organisation.");
  }

  // The effective persona comes from the deployed immutable version when one
  // exists; unpublished agents keep reading their live config (legacy path).
  // Draft-preview mode reads the draft persona instead.
  const assistantConfig: AssistantConfig | null = versionConfig && agent
    ? {
        ...versionConfig.assistant,
        id: draft ? `draft:${draft.id}` : `version:${productionVersion!.id}`,
        agentId: agent.id,
        createdAt: draft?.createdAt ?? productionVersion!.createdAt,
        updatedAt: draft?.updatedAt ?? productionVersion!.createdAt,
      }
    : liveAssistantConfig;

  if (versionConfig) {
    // Served from the immutable version — nothing legacy below the overrides.
  } else if (agent?.id) {
    noteLegacyResolutionFallback(agent.id);
  }

  // Platform capability default (Settings → AI Platform → Providers & Models):
  // consulted when neither the version config, agent settings nor the legacy
  // org default selected a provider — BEFORE the env fallback.
  const registry = await getPlatformAIRegistry();
  const chatDefault = registry.defaults.find((d) => d.capability === "chat") ?? null;
  const platformDefaultProvider =
    chatDefault?.providerId === "openai" || chatDefault?.providerId === "gemini" || chatDefault?.providerId === "sarvam"
      ? chatDefault.providerId
      : null;

  // Per-slot default models from the governance catalogue (the is_default row
  // for each (provider, capability, kind), enabled). These keep the platform
  // default affecting EVERY AI feature: when a tenant pins nothing and the
  // env var is unset, the registry default model serves the slot instead of
  // the resolution failing.
  const registryDefaultModel = (
    providerId: AIProvider,
    capability: "chat" | "voice_chat" | "realtime_voice",
    kind: "chat" | "embedding" | "realtime" | "transcription" | "voice",
  ): string | null =>
    (registry.defaultModels ?? []).find(
      (m) => m.providerId === providerId && m.capability === capability && m.kind === kind,
    )?.modelId ?? null;

  let provider: AIProvider =
    versionAI?.provider ??
    agentSettings?.provider ??
    orgSettings?.defaultProvider ??
    platformDefaultProvider ??
    defaults.provider;
  let providerSource: ResolvedAIConfig["sources"]["provider"] = effectiveKbOverrides?.provider
    ? "kb_override"
    : versionAI?.provider
      ? "agent"
      : agentSettings?.provider
        ? "agent_settings"
        : orgSettings?.defaultProvider
          ? "org"
          : platformDefaultProvider
            ? "platform"
            : "env";

  if (effectiveKbOverrides?.provider) {
    provider = effectiveKbOverrides.provider;
    providerSource = "kb_override";
  }

  const allowedProviders = orgSettings?.allowedProviders?.length
    ? orgSettings.allowedProviders
    : (["openai", "gemini", "sarvam"] as AIProvider[]);

  if (!allowedProviders.includes(provider)) {
    throw new AIConfigResolutionError(`Agent provider ${provider} is not enabled for this organisation.`);
  }

  // A broken platform default must not take the entire tenant/embed surface
  // down. If the provider came from the platform default and has no usable
  // credential, select another enabled/configured chat provider. Explicit
  // agent/org/KB selections remain strict and still fail loudly.
  if (providerSource === "platform") {
    const selected = registry.providers.find((candidate) =>
      candidate.enabled &&
      candidate.configured &&
      allowedProviders.includes(candidate.providerId as AIProvider) &&
      candidate.capabilities.some((cap) => cap.capability === "chat" && cap.supported),
    );
    const selectedProvider = selected?.providerId as AIProvider | undefined;
    if (selectedProvider && selectedProvider !== provider) {
      console.error(
        `[ai-config] platform default provider "${provider}" is not configured; falling back to configured provider "${selectedProvider}". Configure the platform default in Settings → AI.`,
      );
      provider = selectedProvider;
      providerSource = "platform";
    } else if (!selectedProvider) {
      throw new AIConfigResolutionError(
        `Platform AI provider ${provider} has no configured credentials and no configured chat provider is available.`,
      );
    }
  }

  // ── Platform governance gate (registry + entitlement, §4 resolver) ────────
  // The SAME gate the agent workspace UI uses — UI and runtime can never
  // disagree about provider availability.
  const governanceGate = await validateAgentAISelection({
    organizationId: orgId,
    provider,
    capability: "chat",
    modelId: null,
  });
  if (!governanceGate.ok) {
    throw new AIConfigResolutionError(governanceGate.reason);
  }

  // ── Embedding capability split (V1) ──────────────────────────────────
  // Sarvam publishes no embeddings API. When the brain is Sarvam, embedding
  // work runs on the platform backbone; Qdrant collections stay byte-identical
  // (dimensions are pinned to the backbone — 1536/3072/768 — unchanged).
  // Embeddings are a dedicated platform setting. This prevents document
  // ingestion from accidentally inheriting a chat/realtime provider that has
  // no embedding API (for example Sarvam). The legacy env fallback is used
  // only if the migration has no row yet.
  const embeddingProvider: AIProvider =
    registry.embeddingDefault?.providerId ??
    (provider === "sarvam" ? parseSarvamEmbeddingFallbackProvider() : provider);

  // Platform default chat model (when it belongs to the resolved provider).
  const platformDefaultChatModel =
    chatDefault?.modelId && chatDefault.providerId === provider ? chatDefault.modelId : null;
  const defaultChat = platformDefaultChatModel ?? registryDefaultModel(provider, "chat", "chat") ?? defaults.models[provider].chat;
  // Embedding defaults ALWAYS come from the backbone record — for openai/gemini
  // brains this is identical to the previous behaviour. The registry's default
  // embedding model (catalogued under the chat capability) is consulted before
  // the env var so the platform catalogue governs when env is unset.
  const defaultEmbedding =
    registry.embeddingDefault?.modelId ??
    registryDefaultModel(embeddingProvider, "chat", "embedding") ??
    defaults.models[embeddingProvider].embedding;
  const defaultRealtime =
    registryDefaultModel(provider, "realtime_voice", "realtime") ?? defaults.models[provider].realtime;
  const defaultTranscription =
    registryDefaultModel(provider, "realtime_voice", "transcription") ?? defaults.models[provider].transcription;
  const defaultVoice =
    registryDefaultModel(provider, "realtime_voice", "voice") ?? defaults.models[provider].defaultVoice;

  const chatCandidate =
    effectiveKbOverrides?.chatModel ?? versionAI?.chatModel ?? agentSettings?.chatModel ?? orgSettings?.defaultChatModel ?? defaultChat;
  const embeddingCandidate =
    effectiveKbOverrides?.embeddingModel ?? versionAI?.embeddingModel ?? agentSettings?.embeddingModel ?? orgSettings?.defaultEmbeddingModel ?? defaultEmbedding;
  const realtimeCandidate =
    effectiveKbOverrides?.realtimeModel ??
    versionAI?.realtimeLlmModel ??
    versionAI?.realtimeModel ??
    agentSettings?.realtimeModel ??
    orgSettings?.defaultRealtimeModel ??
    defaultRealtime;
  const transcriptionCandidate =
    effectiveKbOverrides?.transcriptionModel ??
    versionAI?.transcriptionModel ??
    agentSettings?.transcriptionModel ??
    orgSettings?.defaultTranscriptionModel ??
    defaultTranscription;

  const chatModel = pickAllowedString(
    chatCandidate,
    getAllowedValues(orgSettings?.allowedChatModels, provider),
    defaultChat,
  );
  let embeddingModel = pickAllowedString(
    embeddingCandidate,
    getAllowedValues(orgSettings?.allowedEmbeddingModels, embeddingProvider),
    defaultEmbedding,
  );

  // ── WS-0.4 runtime self-heal ─────────────────────────────────────────────
  // Legacy rows can still carry a chat model id in the embedding field (the
  // reported defect: gpt-4o-2024-08-06 configured as the embedding model).
  // The write path now rejects this, but reads must not silently corrupt
  // retrieval: fall back to the provider default and log loudly instead.
  if (embeddingModel && looksLikeChatModel(embeddingModel)) {
    const fallback =
      getAllowedValues(orgSettings?.allowedEmbeddingModels, embeddingProvider)?.find(
        (m) => !looksLikeChatModel(m),
      ) ?? defaultEmbedding ?? null;
    console.error(
      `[ai-config] embedding model "${embeddingModel}" (source: ${input.kbId ? "kb/agent/org config" : "env"}) ` +
      `is a chat model — falling back to "${fallback ?? "provider default"}". ` +
      `Fix the stored configuration (Settings → AI / KB runtime overrides).`,
    );
    embeddingModel = fallback;
  }

  // Inverse trap: an embedding model id configured as the chat model.
  if (chatModel && looksLikeEmbeddingModel(chatModel)) {
    console.error(
      `[ai-config] chat model "${chatModel}" is an embedding model — ` +
      `requests for this tenant would fail. Ask the operator to fix the stored configuration.`,
    );
  }
  const realtimeModel = pickAllowedString(
    realtimeCandidate,
    getAllowedValues(orgSettings?.allowedRealtimeModels, provider),
    defaultRealtime,
  );

  const fallbackLanguageCode = process.env.DEFAULT_LANGUAGE_CODE?.trim().toLowerCase() || "en";

  // Keep the complete organisation voice allow-list available so an assistant
  // can select any valid configured voice, not only the first organisation voice.
  const organisationFallbackVoices = getAllowedValues(orgSettings?.allowedVoices, provider) ?? [];
  const fallbackVoiceId = organisationFallbackVoices[0] ?? defaultVoice;

  const runtimeAgentSettings: AgentAISettings = agentSettings
    ? {
        ...agentSettings,
        voices:
          agentSettings.voices.length > 0 || !fallbackVoiceId
            ? agentSettings.voices
            : [
                {
                  id: "platform-default-voice",
                  orgId: orgId ?? "",
                  provider,
                  voiceId: fallbackVoiceId,
                  name: fallbackVoiceId,
                  enabled: true,
                  metadata: { source: organisationFallbackVoices.length > 0 ? "organisation-default" : "platform-default" },
                },
              ],
      }
    : {
        id: "platform-default",
        agentId: agent?.id ?? "",
        orgId: orgId ?? "",
        provider,
        voiceProvider: null,
        voiceChatSttModel: null,
        voiceChatTtsModel: null,
        voiceChatVoiceId: null,
        realtimeVoiceProvider: null,
        realtimeLlmModel: null,
        realtimeSttModel: null,
        realtimeTtsModel: null,
        realtimeVoiceId: null,
        chatModel: null,
        embeddingModel: null,
        realtimeModel: null,
        transcriptionModel: null,
        defaultLanguageId: "platform-default-language",
        defaultVoiceId: fallbackVoiceId ? "platform-default-voice" : null,
        languages: [
          {
            id: "platform-default-language",
            orgId: orgId ?? "",
            code: fallbackLanguageCode,
            name: fallbackLanguageCode === "en" ? "English" : fallbackLanguageCode,
            nativeName: null,
            enabled: true,
          },
        ],
        voices: fallbackVoiceId
          ? [
              {
                id: "platform-default-voice",
                orgId: orgId ?? "",
                provider,
                voiceId: fallbackVoiceId,
                name: fallbackVoiceId,
                enabled: true,
                metadata: { source: organisationFallbackVoices.length > 0 ? "organisation-default" : "platform-default" },
              },
            ]
          : [],
      };

  const agentSelection = resolveAgentRuntimeSelection({
    provider,
    assistantLanguage: assistantConfig?.alwaysRespondIn ?? assistantConfig?.defaultLanguage,
    assistantAllowedLanguages: assistantConfig?.allowedLanguages,
    assistantVoice: assistantConfig?.voiceId,
    assignedLanguages: runtimeAgentSettings.languages,
    assignedVoices: runtimeAgentSettings.voices,
    defaultLanguageCode:
      runtimeAgentSettings.languages.find(
        (item) => item.id === runtimeAgentSettings.defaultLanguageId,
      )?.code ?? null,
    defaultVoice: (() => {
      const item = runtimeAgentSettings.voices.find(
        (voice) => voice.id === runtimeAgentSettings.defaultVoiceId,
      );
      return item ? { provider: item.provider, voiceId: item.voiceId } : null;
    })(),
  });

  if (agentSelection.allowedLanguages.length === 0) {
    throw new AIConfigResolutionError("No languages are configured for this assistant.");
  }

  // The realtime voice/model requirements only apply when the brain provider
  // serves realtime natively (OpenAI Realtime / Gemini Live). A Sarvam brain
  // has no native realtime voice — the VOICE axis (Sarvam pipeline or
  // ElevenLabs) serves realtime surfaces, so the brain check is skipped.
  const nativeRealtimeBrain = provider !== "sarvam";

  const voiceId =
    input.surface === "realtime" || input.surface === "embed"
      ? nativeRealtimeBrain
        ? normalizeRealtimeVoice(provider, agentSelection.voiceId, organisationFallbackVoices, defaultVoice)
        : null
      : null;

  if (
    (input.surface === "realtime" || input.surface === "embed") &&
    nativeRealtimeBrain &&
    !voiceId
  ) {
    throw new AIConfigResolutionError(`No ${provider} voice is configured for this agent or platform.`);
  }

  if (input.surface === "embed" && agent?.id && !deployment) {
    throw new AIConfigResolutionError("Public embed requires an active published deployment.");
  }

  const flags = {
    // Version runtime toggles are agent-owned (new architecture); org-level
    // toggles remain the legacy fallback during the compat window.
    voiceEnabled: (versionRuntime?.enableVoice ?? orgSettings?.enableVoice ?? true) && !(effectiveKbOverrides?.disableVoice ?? false),
    realtimeEnabled: versionRuntime?.enableRealtime ?? orgSettings?.enableRealtime ?? true,
    publicEmbedEnabled: deployment
      ? deployment.publicAccess && !(effectiveKbOverrides?.disablePublicEmbed ?? false)
      : (orgSettings?.enablePublicEmbed ?? true) && !(effectiveKbOverrides?.disablePublicEmbed ?? false),
  };
  assertSurfaceEnabled(input.surface, flags);

  const temperature = clampNumber(
    assistantConfig?.temperature ?? null,
    orgSettings?.maxTemperature ?? defaults.limits.maxTemperature,
  );
  const maxTokensCap =
    input.surface === "chat"
      ? orgSettings?.maxChatTokens ?? defaults.limits.chatMaxTokens
      : orgSettings?.maxRealtimeTokens ?? defaults.limits.realtimeMaxTokens;
  const maxTokens = clampNumber(assistantConfig?.maxTokens ?? maxTokensCap, maxTokensCap);
  const realtimeMaxOutputTokens =
    orgSettings?.maxRealtimeTokens ?? defaults.limits.realtimeMaxTokens ?? null;

  if (input.surface === "chat" && !chatModel) {
    throw new AIConfigResolutionError("No chat model is configured for this tenant.");
  }
  if (input.surface === "rag-embedding" && !embeddingModel) {
    throw new AIConfigResolutionError("No embedding model is configured for this tenant.");
  }
  if (
    (input.surface === "realtime" || input.surface === "embed") &&
    nativeRealtimeBrain &&
    !realtimeModel
  ) {
    throw new AIConfigResolutionError("No realtime model is configured for this tenant.");
  }

  return {
    orgId,
    agentId: agent?.id ?? null,
    kbId: input.kbId ?? null,
    knowledgeCollection,
    provider,
    embeddingProvider,
    chatModel,
    embeddingModel,
    realtimeModel,
    transcriptionModel: transcriptionCandidate ?? null,
    voiceId,
    allowedLanguages: agentSelection.allowedLanguages,
    defaultLanguage: agentSelection.defaultLanguage,
    translationMode:
      orgSettings?.translationMode === "query" || orgSettings?.translationMode === "query+answer"
        ? orgSettings.translationMode
        : "off",
    // Production provenance — which immutable version (if any) served this
    // resolution. Public surfaces resolve deployments, never drafts.
    production: productionVersion
      ? {
          versionId: productionVersion.id,
          versionNumber: productionVersion.versionNumber,
          branchName: productionVersion.branchName,
          publicAccess: deployment?.publicAccess ?? false,
        }
      : null,
    temperature,
    maxTokens,
    realtimeMaxOutputTokens,
    assistantConfig,
    flags,
    sources: {
      provider: providerSource,
      embeddingProvider: registry.embeddingDefault ? "platform" : providerSource,
      chatModel:
        effectiveKbOverrides?.chatModel != null
          ? "kb_override"
          : versionAI?.chatModel != null
            ? "agent"
            : agentSettings?.chatModel != null
              ? "agent_settings"
              : orgSettings?.defaultChatModel != null
                ? "org"
                : "env",
      embeddingModel:
        effectiveKbOverrides?.embeddingModel != null
          ? "kb_override"
          : versionAI?.embeddingModel != null
            ? "agent"
            : agentSettings?.embeddingModel != null
              ? "agent_settings"
              : orgSettings?.defaultEmbeddingModel != null
                ? "org"
                : "env",
      realtimeModel:
        effectiveKbOverrides?.realtimeModel != null
          ? "kb_override"
          : versionAI?.realtimeModel != null
            ? "agent"
            : agentSettings?.realtimeModel != null
              ? "agent_settings"
              : orgSettings?.defaultRealtimeModel != null
                ? "org"
                : "env",
      transcriptionModel:
        effectiveKbOverrides?.transcriptionModel != null
          ? "kb_override"
          : versionAI?.transcriptionModel != null
            ? "agent"
            : agentSettings?.transcriptionModel != null
              ? "agent_settings"
              : orgSettings?.defaultTranscriptionModel != null
                ? "org"
                : "env",
      voiceId:
        assistantConfig?.voiceId
          ? "assistant_config"
          : agentSettings?.voices?.length
            ? "agent_settings"
            : organisationFallbackVoices.length > 0
              ? "org"
              : defaultVoice
                ? "env"
                : null,
      temperature:
        assistantConfig?.temperature != null
          ? "assistant_config"
          : orgSettings?.maxTemperature != null
            ? "org"
            : defaults.limits.maxTemperature != null
              ? "env"
              : null,
      maxTokens:
        assistantConfig?.maxTokens != null
          ? "assistant_config"
          : orgSettings?.maxRealtimeTokens != null || orgSettings?.maxChatTokens != null
            ? "org"
            : defaults.limits.realtimeMaxTokens != null || defaults.limits.chatMaxTokens != null
              ? "env"
              : null,
    },
  };
}

export function getProviderApiKey(provider: AIProvider): string | undefined {
  const envKey =
    provider === "openai" ? "OPENAI_API_KEY" : provider === "gemini" ? "GEMINI_API_KEY" : "SARVAM_API_KEY";
  const value = process.env[envKey]?.trim();
  return value || undefined;
}

/**
 * Build a ProviderConfig from a resolved tenant config.
 *
 * `purpose` selects WHICH capability the config feeds (V1 embedding split):
 *  - "chat" (default): the brain provider — chatStream work.
 *  - "embedding": the embedding backbone — embedText/embedBatch work. For
 *    openai/gemini brains this is identical to the previous behaviour; for a
 *    Sarvam brain the factory receives the backbone (never Sarvam), so the
 *    EMBEDDING_UNSUPPORTED guardrail in SarvamProvider is unreachable by
 *    design — callers must pass purpose:"embedding" for embedding work.
 */
export function toProviderConfig(
  resolved: ResolvedAIConfig,
  purpose: "chat" | "embedding" = "chat",
): ProviderConfig {
  if (purpose === "embedding") {
    const embeddingDimension = Number(
      process.env[`${resolved.embeddingProvider.toUpperCase()}_EMBEDDING_DIMENSION`],
    );
    return {
      provider: resolved.embeddingProvider,
      apiKey: getProviderApiKey(resolved.embeddingProvider),
      embeddingModel: resolved.embeddingModel ?? undefined,
      embeddingDimension:
        Number.isFinite(embeddingDimension) && embeddingDimension > 0
          ? embeddingDimension
          : undefined,
    };
  }

  const embeddingDimension = Number(
    process.env[`${resolved.provider.toUpperCase()}_EMBEDDING_DIMENSION`],
  );
  return {
    provider: resolved.provider,
    apiKey: getProviderApiKey(resolved.provider),
    chatModel: resolved.chatModel ?? undefined,
    embeddingModel: resolved.embeddingModel ?? undefined,
    embeddingDimension:
      Number.isFinite(embeddingDimension) && embeddingDimension > 0
        ? embeddingDimension
        : undefined,
  };
}

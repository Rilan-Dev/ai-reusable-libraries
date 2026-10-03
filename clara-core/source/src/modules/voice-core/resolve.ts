/**
 * src/modules/voice-core/resolve.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Voice-provider resolution for the realtime/embed surfaces — the voice-axis
 * counterpart of src/modules/ai-core/resolve.ts (resolveAIConfig).
 *
 * ElevenLabs is a VOICE layer, never a brain layer (see
 * Doc/18-07-2026/ELEVENLABS_INTEGRATION_PLAN.md §3). This resolver picks WHICH provider
 * serves each voice PURPOSE using the same precedence discipline as
 * resolveAIConfig():
 *
 *   voice-chat purpose (chat-window voice-chat / Mode A pipeline):
 *     kb_ai_overrides.voice_provider
 *       → agent_ai_settings.voice_provider
 *         → org_ai_settings.voice_provider
 *           → brain provider (inherit — the default for every existing tenant)
 *
 *   realtime purpose (real-time voice assistant: floating voice modal, embed
 *   voice surfaces, ElevenLabs Agents, phone):
 *     kb_ai_overrides.realtime_voice_provider
 *       → agent_ai_settings.realtime_voice_provider
 *         → org_ai_settings.realtime_voice_provider
 *           → the voice-chat value (inherit — so one provider pick keeps
 *              every surface native to it)
 *
 * The brain config (chat model, embedding model, RAG) is resolved by the
 * UNTOUCHED resolveAIConfig() and returned alongside, so callers get one
 * coherent object without re-querying.
 */

import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { getAgentById } from "@/modules/organisations/core/db";
import { getOrgAISettings } from "@/modules/organisations/core/ai-settings-db";
import { getAgentAISettings } from "@/modules/organisations/core/agent-ai-settings-db";
import { getKbAIOverrides } from "@/modules/knowledge-bases/core/ai-overrides-db";
import { resolveAIConfig } from "@/modules/ai-core/resolve";
import { findChatModel } from "@/modules/ai-core/model-catalog";
import { validateAgentAISelection } from "@/modules/ai-governance/core/resolver";
import { listProviderModels } from "@/modules/ai-governance/core/registry-db";
import {
  getPlatformDefaultSTTModel,
  getPlatformDefaultTTSModel,
  getPlatformDefaultRealtimeTTSModel,
  getPlatformDefaultRealtimeSTTModel,
  getPlatformDefaultVoiceId,
  isSupportedTTSModel,
  looksLikeElevenLabsVoiceId,
  getPlatformDefaultSarvamSttModel,
  getPlatformDefaultSarvamSpeaker,
  getPlatformDefaultSarvamTTSModel,
  getPlatformDefaultSarvamRealtimeSttModel,
  getPlatformDefaultSarvamRealtimeLlmModel,
  isSarvamRealtimeTtsEnabled,
  isSupportedSarvamSpeaker,
  isSupportedSarvamTTSModel,
  SARVAM_TTS_LANGUAGES,
} from "./model-catalog";
import type {
  ElevenLabsResolvedConfig,
  OpenAIRealtimeResolvedConfig,
  ResolveVoiceConfigInput,
  SarvamResolvedConfig,
  VoiceResolution,
} from "./config-types";
import type { VoiceProvider } from "./types";
import { normalizeLanguagePolicy, speechRecognitionLanguage } from "@/modules/assistant/core/language-policy";
import { query } from "@/lib/db";
import { VoiceProviderFactory } from "./factory";
import { isOpenAIRealtimeModel, isSupportedOpenAIRealtimeVoice } from "@/modules/assistant/api/openai-catalog";

export class VoiceConfigResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceConfigResolutionError";
  }
}

export type { ResolveVoiceConfigInput };

/**
 * Map a 2-letter assistant language ("hi", "ta", "en", "si", …) to the
 * BCP-47 code Saaras/Bulbul understand ("hi-IN", …). Bulbul covers 10 Indian
 * languages + Indian English — anything else (Sinhala, Arabic, …) falls back
 * to en-IN so voice stays usable while the brain answers in the assistant's
 * language (text chat is unaffected; only the spoken voice is English).
 */
const SARVAM_TTS_LANGUAGE_BASES = new Set(
  SARVAM_TTS_LANGUAGES.map((code) => code.split("-")[0]!),
);

/** The assistant's language policy from a resolved brain config. */
function brainLanguagePolicy(brain: { defaultLanguage?: string | null; allowedLanguages?: string[] | null; assistantConfig?: { alwaysRespondIn?: string | null } | null }) {
  return normalizeLanguagePolicy({
    defaultLanguage: brain.defaultLanguage,
    allowedLanguages: brain.allowedLanguages,
    alwaysRespondIn: brain.assistantConfig?.alwaysRespondIn,
  });
}

export function toSarvamLanguageCode(language: string | null | undefined): string {
  const base = (language ?? "").trim().toLowerCase().split("-")[0] ?? "";
  if (!base) return "en-IN";
  if (base === "en") return "en-IN";
  if (SARVAM_TTS_LANGUAGE_BASES.has(base)) return `${base}-IN`;
  return "en-IN";
}


// ─── Hot-path resolution cache ─────────────────────────────────────────────────
//
// resolveVoiceConfig walks kb → agent → org settings → AI overrides → voice
// catalog: ~8 remote-DB round trips. The Mode A pipeline calls it on EVERY
// per-sentence TTS request and EVERY utterance STT request (a 10-sentence
// answer repeats the whole walk 10 times), which stacks hundreds of ms of
// pure database latency in front of every vendor call. A 5-second TTL memo
// collapses that to one walk per speaking burst while staying short enough
// that operator/provider switches propagate effectively immediately.

const VOICE_CONFIG_CACHE_TTL_MS = 5_000;

// When ElevenLabs is enabled but no organisation voice has been synced yet,
// resolve the vendor workspace once and use a valid returned voice as a
// process-local fallback. This removes the accidental "Pro is enabled but
// voice resolution always fails" dead-end without hardcoding a vendor voice ID.
// The catalog sync endpoint remains the explicit persistence path.
const ELEVENLABS_DISCOVERY_TTL_MS = 5 * 60_000;
let elevenLabsDiscoveredVoice: { voiceId: string; expiresAt: number } | null = null;

async function discoverElevenLabsFallbackVoice(): Promise<string | null> {
  if (elevenLabsDiscoveredVoice && elevenLabsDiscoveredVoice.expiresAt > Date.now()) {
    return elevenLabsDiscoveredVoice.voiceId;
  }

  try {
    const voices = await VoiceProviderFactory.getVoiceService().listVoices();
    const usable = voices.find((voice) => Boolean(voice.voiceId));
    if (!usable) return null;

    elevenLabsDiscoveredVoice = {
      voiceId: usable.voiceId,
      expiresAt: Date.now() + ELEVENLABS_DISCOVERY_TTL_MS,
    };
    return usable.voiceId;
  } catch {
    return null;
  }
}
const voiceConfigCache = new Map<
  string,
  { expiresAt: number; value: VoiceResolution }
>();

function voiceConfigCacheKey(input: ResolveVoiceConfigInput): string {
  return `${input.surface}|${input.kbId ?? ""}|${input.orgId ?? ""}|${input.preferDraft ? "draft" : "live"}`;
}

/**
 * TTL-cached resolveVoiceConfig for hot per-request routes (provider lookup,
 * session bootstrap, TTS, STT and embed session).
 * Errors are NEVER cached — a failed resolution is retried on the next call.
 * The short TTL keeps provider/model changes responsive while avoiding the
 * repeated multi-query resolver walk on every realtime turn.
 */
export async function resolveVoiceConfigCached(
  input: ResolveVoiceConfigInput,
): Promise<VoiceResolution> {
  const key = voiceConfigCacheKey(input);
  const hit = voiceConfigCache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value;
  }
  const value = await resolveVoiceConfig(input);
  voiceConfigCache.set(key, { expiresAt: Date.now() + VOICE_CONFIG_CACHE_TTL_MS, value });
  if (voiceConfigCache.size > 512) {
    // Cheap periodic sweep — never expected to trigger at this key cardinality.
    const now = Date.now();
    for (const [k, entry] of voiceConfigCache) {
      if (entry.expiresAt <= now) voiceConfigCache.delete(k);
    }
  }
  return value;
}

/**
 * Resolve the voice provider + ElevenLabs specifics for a tenant. The brain
 * config is resolved via the existing resolveAIConfig() with the SAME input
 * so surface flags (voiceEnabled / realtimeEnabled / publicEmbedEnabled)
 * are enforced exactly as before.
 */
export async function resolveVoiceConfig(
  input: ResolveVoiceConfigInput,
): Promise<VoiceResolution> {
  // Reuse a caller-provided brain resolution when available. Composite
  // session/bootstrap routes already resolve the brain once; re-resolving it
  // here doubles DB work and can make provider resolution race itself.
  const brain = input.brainConfig ?? await resolveAIConfig({
    kbId: input.kbId,
    orgId: input.orgId,
    preferDraft: input.preferDraft,
    // AI config has no separate voice-chat surface; keep its existing
    // realtime/embed flag semantics while the voice resolver tracks the
    // provider purpose independently.
    surface: input.surface === "voice_chat" ? "realtime" : input.surface,
  });

  const kb = input.kbId ? await getKnowledgeBaseById(input.kbId) : null;
  const agent = kb ? await getAgentById(kb.agentId) : null;
  const orgId = input.orgId ?? agent?.orgId ?? null;

  // Production immutable version preferences (dual-read: new-first).
  // Draft-preview mode substitutes the CURRENT Main-branch draft — the
  // preview must test the voice providers/models the user is editing. KB
  // overrides (draft-only state) apply in draft mode.
  const versioningDb = await import("@/modules/agent-versioning/core/db");
  const draftConfig = input.preferDraft && agent?.id
    ? await versioningDb.getAgentDraftConfigCached(agent.id)
    : null;
  const productionVersionConfig = agent?.id
    ? await versioningDb.getProductionVersionConfigCached(agent.id)
    : null;
  const versionAIPreferences =
    draftConfig?.configuration?.ai ??
    productionVersionConfig?.configuration?.ai ??
    null;
  const versionVoiceChatSttModel = versionAIPreferences?.voiceChatSttModel ?? null;
  const versionVoiceChatTtsModel = versionAIPreferences?.voiceChatTtsModel ?? null;
  const versionVoiceChatVoiceId = versionAIPreferences?.voiceChatVoiceId ?? null;
  const versionRealtimeLlmModel = versionAIPreferences?.realtimeLlmModel ?? null;
  const versionRealtimeSttModel = versionAIPreferences?.realtimeSttModel ?? null;
  const versionRealtimeTtsModel = versionAIPreferences?.realtimeTtsModel ?? null;
  const versionRealtimeVoiceId = versionAIPreferences?.realtimeVoiceId ?? null;
  const [orgSettings, agentSettings, kbOverrides] = await Promise.all([
    orgId ? getOrgAISettings(orgId) : Promise.resolve(null),
    agent?.id ? getAgentAISettings(agent.id) : Promise.resolve(null),
    input.kbId ? getKbAIOverrides(input.kbId) : Promise.resolve(null),
  ]);

  // Published versions own their voice configuration; mutable KB overrides are draft-only.
  // Draft-preview mode is the deliberate exception: KB overrides apply.
  const effectiveKbOverrides =
    input.preferDraft && draftConfig
      ? kbOverrides
      : productionVersionConfig
        ? null
        : kbOverrides;

  // ── Precedence: kb → version config → agent → org → inherit brain ───────
  let voiceProvider: VoiceProvider | null =
    effectiveKbOverrides?.voiceProvider ?? versionAIPreferences?.voiceProvider ?? agentSettings?.voiceProvider ?? orgSettings?.voiceProvider ?? null;
  let source: VoiceResolution["source"] =
    effectiveKbOverrides?.voiceProvider != null
      ? "kb_override"
      : versionAIPreferences?.voiceProvider != null
        ? "agent"
        : agentSettings?.voiceProvider != null
          ? "agent_settings"
          : orgSettings?.voiceProvider != null
            ? "org"
            : "env";

  if (!voiceProvider) {
    // Platform capability default (Settings → AI Platform) applies before the
    // brain-inherit default; NULL default = inherit (existing behaviour).
    const { getPlatformAIRegistry } = await import("@/modules/ai-governance/core/registry-db");
    const registryDefaults = (await getPlatformAIRegistry()).defaults;
    const platformVoiceChatDefault = registryDefaults.find((d) => d.capability === "voice_chat") ?? null;
    const platformProvider =
      platformVoiceChatDefault?.providerId === "elevenlabs" ||
      platformVoiceChatDefault?.providerId === "sarvam" ||
      platformVoiceChatDefault?.providerId === "openai" ||
      platformVoiceChatDefault?.providerId === "gemini"
        ? platformVoiceChatDefault.providerId
        : null;
    voiceProvider = platformProvider ?? brain.provider; // inherit — default for existing tenants
    source = "env";
  }

  // ── Realtime purpose: kb → version config → agent → org → inherit voice-chat ─
  let realtimeProvider: VoiceProvider | null =
    effectiveKbOverrides?.realtimeVoiceProvider ??
    versionAIPreferences?.realtimeVoiceProvider ??
    agentSettings?.realtimeVoiceProvider ??
    orgSettings?.realtimeVoiceProvider ??
    null;
  let realtimeSource: VoiceResolution["realtimeSource"] =
    effectiveKbOverrides?.realtimeVoiceProvider != null
      ? "kb_override"
      : versionAIPreferences?.realtimeVoiceProvider != null
        ? "agent"
        : agentSettings?.realtimeVoiceProvider != null
          ? "agent_settings"
          : orgSettings?.realtimeVoiceProvider != null
            ? "org"
            : "voice_chat";

  if (!realtimeProvider) {
    // Platform capability default for realtime applies before the
    // voice-chat-inherit default; NULL default = inherit (existing behaviour).
    const { getPlatformAIRegistry } = await import("@/modules/ai-governance/core/registry-db");
    const registryDefaults = (await getPlatformAIRegistry()).defaults;
    const platformRealtimeDefault = registryDefaults.find((d) => d.capability === "realtime_voice") ?? null;
    const platformProvider =
      platformRealtimeDefault?.providerId === "elevenlabs" ||
      platformRealtimeDefault?.providerId === "sarvam" ||
      platformRealtimeDefault?.providerId === "openai" ||
      platformRealtimeDefault?.providerId === "gemini"
        ? platformRealtimeDefault.providerId
        : null;
    realtimeProvider = platformProvider ?? voiceProvider;
    realtimeSource = "voice_chat";
  }

  // ── Org allow-list (mirrors the allowedProviders check in resolveAIConfig) ─
  const allowedVoiceProviders = orgSettings?.allowedVoiceProviders?.length
    ? orgSettings.allowedVoiceProviders
    : (["openai", "gemini", "elevenlabs", "sarvam"] as VoiceProvider[]);

  if (!allowedVoiceProviders.includes(voiceProvider)) {
    throw new VoiceConfigResolutionError(
      `Voice provider ${voiceProvider} is not enabled for this organisation.`,
    );
  }
  if (
    realtimeProvider !== voiceProvider &&
    !allowedVoiceProviders.includes(realtimeProvider)
  ) {
    throw new VoiceConfigResolutionError(
      `Realtime voice provider ${realtimeProvider} is not enabled for this organisation.`,
    );
  }

  // ── Platform availability: registry gate + fallback (not a hard error) ──
  // An org may have explicitly selected a voice provider (e.g. ElevenLabs)
  // that the platform operator has since disabled platform-wide
  // the provider registry can disable it platform-wide). Hard-
  // failing every voice surface for that org makes the whole platform look
  // broken, which is exactly what happens when an operator retires a vendor:
  // embeds, the floating assistant, and the realtime modal all 400. Instead
  // the selection DEGRADES to the brain provider (the inherit default every
  // pre-voice-axis tenant already uses) and the event is logged loudly for
  // the operator. The org-level selection stays in the DB untouched, so
  // re-enabling the provider restores the org's choice instantly.
  const platformUnavailable = async (
    p: VoiceProvider,
    capability: "voice_chat" | "realtime_voice",
  ): Promise<boolean> => {
    // Provider availability is checked against the PURPOSE being resolved.
    // ElevenLabs and Sarvam can serve both axes; using voice_chat as a proxy
    // for realtime would make an explicitly selected ElevenLabs realtime
    // provider disappear when only the wrong capability is disabled.
    const gate = await validateAgentAISelection({
      organizationId: orgId,
      provider: p,
      capability,
    });
    return !gate.ok;
  };

  const unavailableError = (p: VoiceProvider): VoiceConfigResolutionError =>
    new VoiceConfigResolutionError(
      p === "elevenlabs"
        ? "ElevenLabs voice is not available on this platform (disabled, not configured, or unavailable), and no fallback voice provider is enabled for this organisation."
        : "Sarvam voice is not available on this platform (disabled, not configured, or unavailable), and no fallback voice provider is enabled for this organisation.",
    );

  // Voice-chat purpose. The brain provider is the natural fallback — the
  // org's chat already runs on it — and when the brain itself is the disabled
  // provider (a Sarvam brain before the operator enables Sarvam), the
  // terminal fallback is OpenAI, matching the platform's default-provider
  // posture.
  if (await platformUnavailable(voiceProvider, "voice_chat")) {
    const fallback: VoiceProvider = (await platformUnavailable(brain.provider, "voice_chat"))
      ? "openai"
      : brain.provider;
    if (!allowedVoiceProviders.includes(fallback)) {
      // Genuinely no usable voice provider for this org — surface the
      // operator-actionable message instead of silently violating the org's
      // explicit allow-list.
      throw unavailableError(voiceProvider);
    }
    console.warn(
      `[voice-core] ${voiceProvider} is disabled at platform level — degrading voice-chat for org ${orgId ?? "(unknown)"} to ${fallback}. Re-enable the provider or change the org's voice provider setting to restore the selection.`,
    );
    voiceProvider = fallback;
    source = "env";
  }

  // Realtime purpose — degrades to the (possibly already degraded)
  // voice-chat provider, mirroring the null-inherit semantics above.
  if (await platformUnavailable(realtimeProvider, "realtime_voice")) {
    // Realtime is its own provider axis. Fall back to the voice-chat provider
    // only when that provider is itself usable for realtime; otherwise use the
    // platform's realtime-capable brain provider if permitted.
    const realtimeFallback =
      (await platformUnavailable(voiceProvider, "realtime_voice"))
        ? ((await platformUnavailable(brain.provider, "realtime_voice")) ? null : brain.provider)
        : voiceProvider;
    if (!realtimeFallback || !allowedVoiceProviders.includes(realtimeFallback)) {
      throw unavailableError(realtimeProvider);
    }
    console.warn(
      `[voice-core] ${realtimeProvider} is unavailable for realtime_voice for org ${orgId ?? "(unknown)"} — degrading realtime voice to ${realtimeFallback}. Re-enable the provider or change the realtime voice provider setting to restore the selection.`,
    );
    realtimeProvider = realtimeFallback;
    realtimeSource = "voice_chat";
  }

  // ── ElevenLabs specifics ──────────────────────────────────────────────────
  // Voice Chat and Realtime Voice are independent purposes. Their provider
  // selection and model/voice settings must remain independent too. Published
  // agent-version preferences are authoritative, then agent/org settings,
  // then platform defaults.
  let elevenlabs: ElevenLabsResolvedConfig | null = null;
  if ((input.surface === "voice_chat" && voiceProvider === "elevenlabs") ||
      (input.surface !== "voice_chat" && realtimeProvider === "elevenlabs")) {
    const isRealtime = input.surface !== "voice_chat";
    const ttsModel =
      (isRealtime ? versionRealtimeTtsModel : versionVoiceChatTtsModel) ??
      (isRealtime ? agentSettings?.realtimeTtsModel : agentSettings?.voiceChatTtsModel) ??
      orgSettings?.elevenlabsTtsModel ??
      (isRealtime ? getPlatformDefaultRealtimeTTSModel() : getPlatformDefaultTTSModel());

    if (!isSupportedTTSModel(ttsModel)) {
      throw new VoiceConfigResolutionError(
        `Unsupported ElevenLabs TTS model: ${ttsModel}`,
      );
    }

    // Batch voice-chat uses Scribe v2; Clara realtime always uses the
    // dedicated Scribe v2 Realtime model from realtime-init.
    // The realtime socket only accepts Scribe v2 Realtime, so stale batch ids
    // stored on the version/agent/org are ignored for that surface.
    const sttModel = isRealtime
      ? getPlatformDefaultRealtimeSTTModel()
      : versionVoiceChatSttModel ??
        agentSettings?.voiceChatSttModel ??
        orgSettings?.elevenlabsSttModel ??
        getPlatformDefaultSTTModel();

    const configuredVoiceId =
      (isRealtime ? versionRealtimeVoiceId : versionVoiceChatVoiceId) ??
      (isRealtime ? agentSettings?.realtimeVoiceId : agentSettings?.voiceChatVoiceId) ??
      null;

    const voiceId = await resolveElevenLabsVoiceId({
      orgId,
      agentId: agent?.id ?? null,
      agentSettings,
      configuredVoiceId,
      assistantVoiceId: configuredVoiceId ?? brain.assistantConfig?.voiceId ?? null,
      orgDefaultVoice: orgSettings?.defaultElevenlabsVoice ?? null,
    });

    elevenlabs = {
      ttsModel,
      sttModel,
      voiceId,
      voiceSettings: {},
      language:
        brain.defaultLanguage ??
        brain.assistantConfig?.alwaysRespondIn ??
        "en",
      sttLanguage: speechRecognitionLanguage(brainLanguagePolicy(brain)),
    };
  }

  // ── Sarvam specifics ──────────────────────────────────────────────────────
  // Resolved when EITHER purpose selects Sarvam — both purposes share the
  // same org-level models / speaker configuration. Speakers are a STATIC
  // catalogue (no DB round-trip, no sync job — contrast ElevenLabs above).
  let sarvam: SarvamResolvedConfig | null = null;
  if ((input.surface === "voice_chat" && voiceProvider === "sarvam") ||
      (input.surface !== "voice_chat" && realtimeProvider === "sarvam")) {
    const sarvamTtsModel =
      (voiceProvider === "sarvam" ? versionVoiceChatTtsModel : null) ??
      orgSettings?.sarvamTtsModel ??
      getPlatformDefaultSarvamTTSModel();
    if (!isSupportedSarvamTTSModel(sarvamTtsModel)) {
      throw new VoiceConfigResolutionError(
        `Unsupported Sarvam TTS model: ${sarvamTtsModel}`,
      );
    }

    const sarvamSttModel =
      (voiceProvider === "sarvam" ? versionVoiceChatSttModel : null) ??
      orgSettings?.sarvamSttModel ??
      getPlatformDefaultSarvamSttModel();

    sarvam = {
      ttsModel: sarvamTtsModel,
      voiceChatTtsModel: sarvamTtsModel,
      sttModel: sarvamSttModel,
      voiceChatSpeaker: resolveSarvamSpeaker({
        assistantVoiceId: versionVoiceChatVoiceId ?? brain.assistantConfig?.voiceId ?? null,
        orgDefaultSpeaker: orgSettings?.defaultSarvamSpeaker ?? null,
      }),
      speaker: resolveSarvamSpeaker({
        assistantVoiceId: versionVoiceChatVoiceId ?? brain.assistantConfig?.voiceId ?? null,
        orgDefaultSpeaker: orgSettings?.defaultSarvamSpeaker ?? null,
      }),
      realtimeSttModel:
        versionRealtimeSttModel ??
        getPlatformDefaultSarvamRealtimeSttModel(),
      realtimeTtsModel:
        versionRealtimeTtsModel ??
        sarvamTtsModel,
      realtimeSpeaker: resolveSarvamSpeaker({
        assistantVoiceId: versionRealtimeVoiceId ?? brain.assistantConfig?.voiceId ?? null,
        orgDefaultSpeaker: orgSettings?.defaultSarvamSpeaker ?? null,
      }),
      realtimeLlmModel:
        versionRealtimeLlmModel ??
        (orgSettings?.defaultRealtimeModel &&
        findChatModel(orgSettings.defaultRealtimeModel)?.provider === "sarvam"
          ? orgSettings.defaultRealtimeModel
          : getPlatformDefaultSarvamRealtimeLlmModel()),
      realtimeTtsEnabled: isSarvamRealtimeTtsEnabled(),
      language: toSarvamLanguageCode(
        brain.defaultLanguage ?? brain.assistantConfig?.alwaysRespondIn ?? "en",
      ),
      // "unknown" is Sarvam's auto-detect code (Speech-to-Text WS reference).
      sttLanguage: (() => {
        const pinned = speechRecognitionLanguage(brainLanguagePolicy(brain));
        return pinned ? toSarvamLanguageCode(pinned) : "unknown";
      })(),
      sampleRate: 16_000,
    };
  }

  // ── OpenAI specifics ──────────────────────────────────────────────────────
  // Resolved when EITHER purpose selects OpenAI. The native realtime
  // transport (model / output voice / transcription) is a VOICE-axis concern:
  // it must never depend on the brain provider, because a Sarvam or Gemini
  // brain with an OpenAI realtime voice selection still needs a fully valid
  // OpenAI Realtime session. Voice candidates are validated against the
  // fixed OpenAI Realtime voice contract so cross-provider leftovers (a
  // Bulbul speaker, a Gemini voice name) are skipped instead of sent to the
  // vendor. Precedence mirrors the Sarvam/ElevenLabs arms:
  //   version realtime voice → agent realtime voice → agent voice-chat voice
  //     → assistant-config voice → org allow-list → platform env → "alloy".
  let openai: OpenAIRealtimeResolvedConfig | null = null;
  if ((input.surface === "voice_chat" && voiceProvider === "openai") ||
      (input.surface !== "voice_chat" && realtimeProvider === "openai")) {
    const orgOpenAIVoices =
      (orgSettings?.allowedVoices && Array.isArray(orgSettings.allowedVoices.openai)
        ? orgSettings.allowedVoices.openai
        : []) ?? [];
    const voiceCandidates = [
      versionRealtimeVoiceId,
      realtimeProvider === "openai" ? agentSettings?.realtimeVoiceId ?? null : null,
      voiceProvider === "openai" ? agentSettings?.voiceChatVoiceId ?? null : null,
      brain.assistantConfig?.voiceId ?? null,
      orgOpenAIVoices[0] ?? null,
      process.env.OPENAI_DEFAULT_VOICE?.trim() || null,
      process.env.OPENAI_REALTIME_VOICE?.trim() || null,
    ];
    const voiceId =
      voiceCandidates.find(
        (candidate): candidate is string =>
          !!candidate && isSupportedOpenAIRealtimeVoice(candidate.trim()),
      )?.trim() ?? "alloy";

    const modelCandidates = [
      versionAIPreferences?.realtimeModel ?? null,
      agentSettings?.realtimeModel ?? null,
      orgSettings?.defaultRealtimeModel ?? null,
    ];
    const realtimeModel =
      modelCandidates.find(
        (candidate): candidate is string =>
          !!candidate && isOpenAIRealtimeModel(candidate.trim()),
      )?.trim() ||
      process.env.OPENAI_REALTIME_MODEL?.trim() ||
      "gpt-realtime-mini";

    const transcriptionCandidates = [
      versionAIPreferences?.transcriptionModel ?? null,
      agentSettings?.transcriptionModel ?? null,
      orgSettings?.defaultTranscriptionModel ?? null,
    ];
    const transcriptionModel =
      transcriptionCandidates.find(
        (candidate): candidate is string =>
          !!candidate && /(?:^|[-_])(?:whisper|transcribe)/i.test(candidate),
      )?.trim() ||
      process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL?.trim() ||
      "gpt-4o-mini-transcribe";

    openai = { voiceId, realtimeModel, transcriptionModel };
  }

  return {
    voiceProvider,
    source,
    realtimeProvider,
    realtimeSource,
    brain,
    elevenlabs,
    sarvam,
    openai,
  };
}

/**
 * Speaker selection for the Sarvam axis. Bulbul speakers are a fixed
 * enumerable set, so validation is a catalogue lookup — no org catalog, no
 * sync job. Precedence:
 *
 *   assistant config voiceId (when it is a known Bulbul speaker)
 *     → org default Sarvam speaker
 *       → platform default (env SARVAM_DEFAULT_SPEAKER)
 *         → "shubh" (the vendor default)
 */
function resolveSarvamSpeaker(params: {
  assistantVoiceId: string | null;
  orgDefaultSpeaker: string | null;
}): string {
  if (params.assistantVoiceId && isSupportedSarvamSpeaker(params.assistantVoiceId)) {
    return params.assistantVoiceId.trim().toLowerCase();
  }
  if (params.orgDefaultSpeaker && isSupportedSarvamSpeaker(params.orgDefaultSpeaker)) {
    return params.orgDefaultSpeaker.trim().toLowerCase();
  }
  const platformDefault = getPlatformDefaultSarvamSpeaker();
  if (isSupportedSarvamSpeaker(platformDefault)) {
    return platformDefault;
  }
  return "shubh";
}

/**
 * Voice-id selection for the ElevenLabs axis. Vendor voice ids are NOT a
 * fixed enumerable set (unlike OPENAI_REALTIME_VOICES), so validation runs
 * against the org's synced catalog + a shape check. Precedence:
 *
 *   voice explicitly selected for this surface (realtime / voice chat) on the
 *   ElevenLabs axis — honoured even before the org catalog is synced
 *     → assistant config voiceId (if it is an ElevenLabs voice id in the org catalog)
 *     → agent's assigned ElevenLabs voices (first enabled)
 *       → org default ElevenLabs voice
 *         → platform default (env)
 */
async function resolveElevenLabsVoiceId(params: {
  orgId: string | null;
  agentId: string | null;
  agentSettings: Awaited<ReturnType<typeof getAgentAISettings>>;
  /** Voice the admin selected for this surface (version / agent settings). */
  configuredVoiceId?: string | null;
  assistantVoiceId: string | null;
  orgDefaultVoice: string | null;
}): Promise<string> {
  const { orgId, agentSettings, assistantVoiceId, orgDefaultVoice } = params;

  // Org's ElevenLabs catalog (elevenlabs_voices table + organisation_voices
  // rows with provider='elevenlabs').
  const catalogVoiceIds = orgId ? await listOrgElevenLabsVoiceIds(orgId) : [];

  // 0. The voice selected for this surface wins when it is an ElevenLabs
  //    voice id (in the catalog, or ElevenLabs-shaped). A stale id from
  //    another provider's axis (e.g. an OpenAI voice name kept after the
  //    realtime provider changed) falls through to the chain below.
  const configured = params.configuredVoiceId?.trim();
  if (
    configured &&
    !isSupportedOpenAIRealtimeVoice(configured) &&
    (catalogVoiceIds.includes(configured) || looksLikeElevenLabsVoiceId(configured))
  ) {
    return configured;
  }

  // 1. Assistant-config voice id, when it is a known ElevenLabs voice.
  if (assistantVoiceId && catalogVoiceIds.includes(assistantVoiceId)) {
    return assistantVoiceId;
  }

  // 2. Agent's assigned voices on the elevenlabs provider axis.
  const assignedElevenLabsVoices = (agentSettings?.voices ?? []).filter(
    (voice) => voice.enabled && voice.provider === "elevenlabs",
  );
  if (assignedElevenLabsVoices.length > 0) {
    return assignedElevenLabsVoices[0].voiceId;
  }

  // 3. Org default.
  if (orgDefaultVoice && (catalogVoiceIds.includes(orgDefaultVoice) || looksLikeElevenLabsVoiceId(orgDefaultVoice))) {
    return orgDefaultVoice;
  }

  // 4. Platform default.
  const platformDefault = getPlatformDefaultVoiceId();
  if (platformDefault && (catalogVoiceIds.includes(platformDefault) || looksLikeElevenLabsVoiceId(platformDefault))) {
    return platformDefault;
  }

  // 5. First catalog voice — better than failing when an org HAS voices synced.
  if (catalogVoiceIds.length > 0) {
    return catalogVoiceIds[0];
  }

  // 6. Last-resort vendor discovery. This is intentionally process-cached and
  // read-only: it does not copy the workspace catalog into the organisation.
  // The admin sync endpoint remains responsible for persistent catalog sync.
  const discoveredVoice = await discoverElevenLabsFallbackVoice();
  if (discoveredVoice) {
    return discoveredVoice;
  }

  throw new VoiceConfigResolutionError(
    "No usable ElevenLabs voice is available. Sync an ElevenLabs voice in Settings → AI, configure ELEVENLABS_DEFAULT_VOICE_ID, or verify the platform ElevenLabs workspace has at least one usable voice.",
  );
}

/**
 * Union of ElevenLabs voice ids the org may use: the dedicated
 * elevenlabs_voices catalog plus organisation_voices rows stored with
 * provider='elevenlabs'.
 */
export async function listOrgElevenLabsVoiceIds(orgId: string): Promise<string[]> {
  try {
    const rows = await query<{ voice_id: string }>(
      `SELECT voice_id FROM elevenlabs_voices WHERE org_id = $1
       UNION
       SELECT voice_id FROM organisation_voices
        WHERE org_id = $1 AND provider = 'elevenlabs'`,
      [orgId],
    );
    return rows.map((row) => row.voice_id);
  } catch {
    // Table not yet migrated (first boot before 033 applies) — degrade to
    // empty catalog rather than breaking resolution.
    return [];
  }
}

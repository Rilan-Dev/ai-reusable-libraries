/**
 * src/modules/ai-governance/core/resolver.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * THE capability resolver.
 *
 *   resolveAvailableAIOptions({ organizationId, agentId, capability })
 *
 * Resolution order (docs/superpowers/plans/2026-09-20-clara-ai-configuration-platform-agent.md §4):
 *
 *   Platform provider (configured + enabled + healthy + supports capability)
 *     → Subscription entitlement
 *       → Agent capability
 *         → Available provider/model list
 *
 * The resolver returns ONLY currently-usable choices. It must never return:
 * disabled providers, providers without credentials, unavailable models,
 * non-entitled capabilities, or cross-tenant resources.
 *
 * The SAME gate is applied by the runtime (resolveAIConfig / resolveVoiceConfig
 * via validateAgentAISelection) so UI and runtime can never disagree.
 */

import { query } from "@/lib/db";
import { getPlatformAIRegistry } from "./registry-db";
import { resolvePlanAIEntitlements } from "./entitlements-db";
import { listProviderModels } from "./registry-db";
import type {
  AICapability,
  GovernanceProviderId,
  PlanAIEntitlements,
  ResolvedAIProviderOption,
  ResolvedAIOptionBlocked,
  ResolvedAIModelOption,
  ResolveAvailableAIOptionsResult,
} from "./types";

export interface ResolveAvailableAIOptionsInput {
  organizationId?: string | null;
  agentId?: string | null;
  capability: AICapability;
}

/** Which provider serves the agent's chat brain today (legacy store read). */
async function readAgentCurrentSelection(
  agentId: string | null | undefined,
): Promise<{ providerId: string | null; modelId: string | null; voiceId: string | null } | null> {
  if (!agentId) return null;
  try {
    const { getAgentAISettings } = await import("@/modules/organisations/core/agent-ai-settings-db");
    const { getAssistantConfigByAgent } = await import("@/modules/knowledge-bases/core/db");
    const [aiSettings, assistant] = await Promise.all([
      getAgentAISettings(agentId),
      getAssistantConfigByAgent(agentId),
    ]);
    return {
      providerId: aiSettings?.provider ?? null,
      modelId: aiSettings?.chatModel ?? aiSettings?.realtimeModel ?? null,
      voiceId: assistant?.voiceId ?? null,
    };
  } catch {
    return null;
  }
}

function providerUsable(
  provider: Awaited<ReturnType<typeof getPlatformAIRegistry>>["providers"][number],
  capability: AICapability,
): { usable: true } | { usable: false; reason: ResolvedAIOptionBlocked["reason"] } {
  if (!provider.enabled) return { usable: false, reason: "provider_disabled" };
  if (!provider.configured) return { usable: false, reason: "provider_not_configured" };
  const cap = provider.capabilities.find((c) => c.capability === capability);
  if (!cap?.supported) return { usable: false, reason: "provider_capability_unsupported" };
  // Health posture: 'healthy'/'unknown' pass; 'degraded'/'down' are surfaced as
  // unavailable with the health reason (operator runs a connection test).
  if (provider.health?.status === "down" || provider.health?.status === "degraded") {
    return { usable: false, reason: "provider_unhealthy" };
  }
  return { usable: true };
}

function toModelOptions(
  models: Awaited<ReturnType<typeof listProviderModels>>,
  entitlements: PlanAIEntitlements,
  providerId: GovernanceProviderId,
  capability: AICapability,
  kinds: ResolvedAIModelOption["kind"][],
): ResolvedAIModelOption[] {
  return models
    .filter((m) => m.enabled && kinds.includes(m.kind))
    .filter((m) => {
      const exception = entitlements.modelExceptions.find(
        (x) =>
          x.providerId === providerId &&
          x.capability === capability &&
          x.kind === m.kind &&
          x.modelId === m.modelId,
      );
      return exception ? exception.allowed : true;
    })
    .map((m) => ({
      modelId: m.modelId,
      displayName: m.displayName,
      kind: m.kind,
      isDefault: m.isDefault,
    }));
}

/**
 * Resolve the usable provider/model options for one capability.
 * organisationId is REQUIRED for entitlement gating; a null organisationId
 * (platform-admin context) resolves platform availability only.
 */
export async function resolveAvailableAIOptions(
  input: ResolveAvailableAIOptionsInput,
): Promise<ResolveAvailableAIOptionsResult> {
  const capability = input.capability;

  // Fan out the three independent lookups concurrently: the registry (an
  // internally parallel, cached batch), plan entitlements, and the agent's
  // current selection. Previously all three ran sequentially.
  const [registry, entitlements, currentSelectionBase] = await Promise.all([
    getPlatformAIRegistry(),
    input.organizationId != null
      ? resolvePlanAIEntitlements(input.organizationId)
      : Promise.resolve(null),
    readAgentCurrentSelection(input.agentId),
  ]);

  const capabilityEnabled = entitlements
    ? entitlements.capabilities[capability] ?? false
    : true; // no org context → platform-only view

  const defaultProviderId = registry.defaults.find((d) => d.capability === capability)?.providerId ?? null;

  const available: ResolvedAIProviderOption[] = [];
  const blocked: ResolvedAIOptionBlocked[] = [];

  // Resolve every provider concurrently. The previous sequential loop issued
  // one listProviderModels round trip per provider (plus the ElevenLabs voice
  // query) one after another — with 4 providers that alone was 5+ serial round
  // trips and dominated the multi-second ai-options latency.
  const providerResults = await Promise.all(
    registry.providers.map(async (provider): Promise<{ blocked: ResolvedAIOptionBlocked } | { available: ResolvedAIProviderOption }> => {
      const gate = providerUsable(provider, capability);
      if (!gate.usable) {
        return { blocked: { providerId: provider.providerId, displayName: provider.displayName, reason: gate.reason } };
      }
      if (entitlements) {
        if (!capabilityEnabled) {
          return { blocked: { providerId: provider.providerId, displayName: provider.displayName, reason: "plan_not_entitled" } };
        }
        if (entitlements.allowedProviders[provider.providerId] === false) {
          return { blocked: { providerId: provider.providerId, displayName: provider.displayName, reason: "plan_provider_not_allowed" } };
        }
      }

      const models = await listProviderModels(provider.providerId, capability);
      const modelKinds: ResolvedAIModelOption["kind"][] =
        capability === "chat"
          ? ["chat"]
          : capability === "voice_chat"
            ? ["tts", "stt"]
            : // Realtime tab: native realtime models, realtime STT, transcription
              // and conversational TTS (ElevenLabs Mode B serves realtime via its
              // conversational TTS models).
              ["realtime", "stt", "transcription", "tts"];
      const voiceKinds: ResolvedAIModelOption["kind"][] = capability === "chat" ? [] : ["voice"];

      const modelOptions = toModelOptions(models, entitlements ?? emptyEntitlements(), provider.providerId, capability, modelKinds);
      let voiceOptions = toModelOptions(models, entitlements ?? emptyEntitlements(), provider.providerId, capability, voiceKinds);

      // ElevenLabs voices are vendor-owned and tenant-scoped, so they cannot be
      // represented as a static platform model row. Merge the organisation's
      // synced ElevenLabs voice catalog into both speech capability pickers.
      if (provider.providerId === "elevenlabs" && input.organizationId != null && capability !== "chat") {
        const elevenVoices = await query<{
          voice_id: string;
          name: string;
        }>(
          `SELECT voice_id, name
             FROM elevenlabs_voices
            WHERE org_id = $1
            UNION
            SELECT voice_id, name
              FROM organisation_voices
             WHERE org_id = $1
               AND provider = 'elevenlabs'
               AND enabled = TRUE
             ORDER BY name`,
          [input.organizationId],
        );
        const seenVoiceIds = new Set(voiceOptions.map((voice) => voice.modelId));
        voiceOptions = [
          ...voiceOptions,
          ...elevenVoices
            .filter((voice) => !seenVoiceIds.has(voice.voice_id))
            .map((voice) => ({
              modelId: voice.voice_id,
              displayName: voice.name,
              kind: "voice" as const,
              isDefault: false,
            })),
        ];
      }

      return {
        available: {
          providerId: provider.providerId,
          displayName: provider.displayName,
          health: provider.health?.status ?? "unknown",
          isDefault: defaultProviderId === provider.providerId,
          models: modelOptions,
          voices: voiceOptions,
        },
      };
    }),
  );

  for (const result of providerResults) {
    if ("blocked" in result && result.blocked) blocked.push(result.blocked);
    else if ("available" in result && result.available) available.push(result.available);
  }

  const currentSelection: ResolveAvailableAIOptionsResult["currentSelection"] = currentSelectionBase
    ? {
        ...currentSelectionBase,
        stillAvailable:
          currentSelectionBase.providerId == null ||
          available.some((p) => p.providerId === currentSelectionBase.providerId),
      }
    : null;

  return {
    capability,
    organizationId: input.organizationId ?? null,
    agentId: input.agentId ?? null,
    available,
    blocked,
    entitlement: {
      planId: entitlements?.planId ?? null,
      planName: entitlements?.planName ?? null,
      capabilityEnabled,
    },
    currentSelection,
    resolvedAt: new Date().toISOString(),
  };
}

function emptyEntitlements(): PlanAIEntitlements {
  return {
    planId: "",
    planName: "",
    capabilities: { chat: true, voice_chat: true, realtime_voice: true },
    allowedProviders: { openai: true, gemini: true, sarvam: true, elevenlabs: true },
    modelExceptions: [],
  };
}

// ─── Runtime validation gate ──────────────────────────────────────────────────

export type AgentAISelectionValidation =
  | { ok: true }
  | { ok: false; reason: string; code: string };

/**
 * Runtime gate used by resolveAIConfig / resolveVoiceConfig: does the
 * platform currently permit this provider (+ optional model) for this
 * organisation + capability? Registry not yet populated (pre-data-migration
 * boot) → allow through (legacy posture, logged by the caller as a
 * dual-read fallback).
 */
export async function validateAgentAISelection(input: {
  organizationId: string | null;
  provider: string;
  capability: AICapability;
  modelId?: string | null;
}): Promise<AgentAISelectionValidation> {
  const registry = await getPlatformAIRegistry();
  const provider = registry.providers.find((p) => p.providerId === input.provider);
  if (!provider) {
    // Registry row missing → pre-migration provider (e.g. legacy env default).
    // Distinguish "registry not seeded" from "unknown provider id": unknown ids
    // are rejected, known-but-unseeded fall through to legacy.
    if (["openai", "gemini", "sarvam", "elevenlabs"].includes(input.provider)) {
      return { ok: true };
    }
    return {
      ok: false,
      code: "PROVIDER_UNKNOWN",
      reason: `Unknown AI provider "${input.provider}".`,
    };
  }

  const gate = providerUsable(provider, input.capability);
  if (!gate.usable) {
    const label =
      gate.reason === "provider_disabled"
        ? `Provider ${provider.displayName} is disabled by the platform.`
        : gate.reason === "provider_not_configured"
          ? `Provider ${provider.displayName} has no configured credentials.`
          : gate.reason === "provider_capability_unsupported"
            ? `Provider ${provider.displayName} does not support ${input.capability.replace("_", " ")}.`
            : `Provider ${provider.displayName} is currently unhealthy.`;
    return { ok: false, code: gate.reason.toUpperCase(), reason: label };
  }

  if (input.organizationId != null) {
    const entitlements = await resolvePlanAIEntitlements(input.organizationId);
    if (entitlements.capabilities[input.capability] === false) {
      return {
        ok: false,
        code: "PLAN_NOT_ENTITLED",
        reason: `The ${entitlements.planName} plan does not include ${input.capability.replace("_", " ")}.`,
      };
    }
    if (entitlements.allowedProviders[provider.providerId] === false) {
      return {
        ok: false,
        code: "PLAN_PROVIDER_NOT_ALLOWED",
        reason: `Provider ${provider.displayName} is not available on the ${entitlements.planName} plan.`,
      };
    }
    if (input.modelId) {
      const exception = entitlements.modelExceptions.find(
        (x) =>
          x.providerId === provider.providerId &&
          x.capability === input.capability &&
          x.modelId === input.modelId &&
          x.allowed === false,
      );
      if (exception) {
        return {
          ok: false,
          code: "PLAN_MODEL_NOT_ALLOWED",
          reason: `Model ${input.modelId} is not available on the ${entitlements.planName} plan.`,
        };
      }
    }
  }

  return { ok: true };
}

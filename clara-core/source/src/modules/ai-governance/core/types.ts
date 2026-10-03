/**
 * src/modules/ai-governance/core/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Types for the platform AI provider governance domain:
 * provider registry, capabilities, model catalogue, health, usage and the
 * capability resolver (resolveAvailableAIOptions).
 *
 * Ownership contract (docs/superpowers/plans/2026-09-20-clara-ai-configuration-platform-agent.md §1):
 *   Platform Admin owns provider credentials, enable state, health, capability
 *   detection, model catalogue and platform defaults. Organisations and agents
 *   only ever CONSUME resolved availability — never raw infrastructure state.
 */

export type AICapability = "chat" | "voice_chat" | "realtime_voice";

export const AI_CAPABILITIES: readonly AICapability[] = ["chat", "voice_chat", "realtime_voice"] as const;

export type AIModelKind =
  | "chat"
  | "embedding"
  | "realtime"
  | "transcription"
  | "tts"
  | "stt"
  | "voice";

export type GovernanceProviderId = "openai" | "gemini" | "sarvam" | "elevenlabs";

export type ProviderHealthStatus = "healthy" | "degraded" | "down" | "unknown";

export interface ProviderModelRow {
  id: string;
  providerId: GovernanceProviderId;
  capability: AICapability;
  kind: AIModelKind;
  modelId: string;
  displayName: string;
  enabled: boolean;
  isDefault: boolean;
  metadata: Record<string, unknown>;
}

export interface ProviderCredentialState {
  providerId: GovernanceProviderId;
  envKey: string;
  baseUrlEnvKey: string | null;
  maskedHint: string | null;
  configured: boolean;
  updatedAt: string | null;
}

export interface ProviderHealthRecord {
  providerId: GovernanceProviderId;
  status: ProviderHealthStatus;
  latencyMs: number | null;
  errorMessage: string | null;
  checkedAt: string | null;
  checkedBy: string | null;
}

export interface ProviderUsageSummary {
  providerId: GovernanceProviderId;
  periodStart: string;
  requests: number;
  costUsdMicros: number;
}

export interface PlatformAIProvider {
  providerId: GovernanceProviderId;
  displayName: string;
  description: string | null;
  /** EFFECTIVE enablement (admin switch AND operational kill-switch). */
  enabled: boolean;
  /** ElevenLabs-only realtime transport switch controlled from Platform Admin. */
  realtimeEnabled: boolean;
  /** "kill_switch" when the admin switch is on but an env kill-switch is off. */
  disabledReason: "kill_switch" | null;
  configured: boolean;
  capabilities: Array<{ capability: AICapability; supported: boolean }>;
  health: ProviderHealthRecord | null;
  monthlyBudgetUsd: number | null;
  warningThresholdPct: number;
  credential: ProviderCredentialState | null;
  modelCounts: Partial<Record<AICapability, number>>;
}

export interface PlatformAIRegistry {
  providers: PlatformAIProvider[];
  /** Dedicated embedding backbone used by document ingestion/scraping. */
  embeddingDefault: {
    providerId: "openai" | "gemini";
    modelId: string;
    updatedAt: string | null;
  } | null;
  defaults: Array<{ capability: AICapability; providerId: string | null; modelId: string | null }>;
  /** Enabled models marked is_default per (provider, capability, kind) — the
   *  per-slot fallbacks the runtime uses when a tenant pinned nothing and the
   *  capability default carries no explicit model. */
  defaultModels: Array<{
    providerId: GovernanceProviderId;
    capability: AICapability;
    kind: AIModelKind;
    modelId: string;
  }>;
}

/** Plan-level AI entitlement state for one organisation. */
export interface PlanAIEntitlements {
  planId: string;
  planName: string;
  capabilities: Partial<Record<AICapability, boolean>>;
  allowedProviders: Partial<Record<GovernanceProviderId, boolean>>;
  /** Model-level exceptions (absent model → allowed). */
  modelExceptions: Array<{
    providerId: GovernanceProviderId;
    capability: AICapability;
    kind: AIModelKind;
    modelId: string;
    allowed: boolean;
  }>;
}

/** A single selectable option returned by the capability resolver. */
export interface ResolvedAIModelOption {
  modelId: string;
  displayName: string;
  kind: AIModelKind;
  isDefault: boolean;
}

export interface ResolvedAIProviderOption {
  providerId: GovernanceProviderId;
  displayName: string;
  health: ProviderHealthStatus;
  isDefault: boolean;
  models: ResolvedAIModelOption[];
  voices: ResolvedAIModelOption[];
}

export interface ResolvedAIOptionBlocked {
  providerId: GovernanceProviderId;
  displayName: string;
  reason:
    | "provider_disabled"
    | "provider_not_configured"
    | "provider_capability_unsupported"
    | "provider_unhealthy"
    | "plan_not_entitled"
    | "plan_provider_not_allowed";
}

export interface ResolveAvailableAIOptionsResult {
  capability: AICapability;
  organizationId: string | null;
  agentId: string | null;
  available: ResolvedAIProviderOption[];
  blocked: ResolvedAIOptionBlocked[];
  /** Entitlement + registry state the UI surfaces as "Plan ✓ Included". */
  entitlement: {
    planId: string | null;
    planName: string | null;
    capabilityEnabled: boolean;
  };
  /** The agent's CURRENT selection for this capability, when known. */
  currentSelection: {
    providerId: string | null;
    modelId: string | null;
    voiceId: string | null;
    stillAvailable: boolean;
  } | null;
  resolvedAt: string;
}

/**
 * src/modules/agent-versioning/core/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Git-like agent version control model (database-backed — NOT a physical Git
 * repository per agent):
 *
 *   draft  (mutable, one per branch)
 *   version (immutable, numbered per branch)
 *   branch (permanent Main + experiment branches forked from exact versions)
 *   deployment (production pointer at ONE exact immutable version)
 *
 * The versioned configuration is a superset of the legacy per-agent stores:
 *   - `assistant`: every AssistantConfig field except id/agentId
 *   - `ai`:        the agent's AI model selections (from agent_ai_settings)
 *   - `runtime`:   per-agent runtime capability toggles
 *   - `knowledge`: informational KB attachment snapshot (diffs only — never
 *                  re-applied on restore; knowledge content stays live)
 */

import type { AssistantConfig } from "@/modules/knowledge-bases/core/models";
import type { AIProvider } from "@/modules/ai-core/config-types";
import type { VoiceProvider } from "@/modules/voice-core/types";

export type AssistantConfigData = Omit<AssistantConfig, "id" | "agentId" | "createdAt" | "updatedAt">;

export type AgentAISelection = {
  provider: AIProvider | null;
  chatModel: string | null;
  embeddingModel: string | null;
  realtimeModel: string | null;
  transcriptionModel: string | null;
  /** Voice-chat axis. Model/voice slots are independent from Chat. */
  voiceProvider: VoiceProvider | null;
  voiceChatSttModel: string | null;
  voiceChatTtsModel: string | null;
  voiceChatVoiceId: string | null;
  /** Realtime voice axis. Nothing here is inherited from Voice Chat. */
  realtimeVoiceProvider: VoiceProvider | null;
  realtimeLlmModel: string | null;
  realtimeSttModel: string | null;
  realtimeTtsModel: string | null;
  realtimeVoiceId: string | null;
};

export type AgentRuntimeSettings = {
  enableVoice: boolean;
  enableRealtime: boolean;
  enablePublicEmbed: boolean;
};

export type AgentKnowledgeSnapshot = {
  kbIds: string[];
};

export type AgentVersionConfig = {
  assistant: AssistantConfigData;
  /**
   * AI model selections. NULL on imported legacy-snapshot versions where the
   * historical selection is UNKNOWN — uncertainty is preserved, never
   * fabricated (migration plan Stage G); runtime then falls back to the
   * legacy resolution chain.
   */
  ai: AgentAISelection | null;
  /** Per-agent runtime capability toggles. NULL = inherit (legacy chain). */
  runtime: AgentRuntimeSettings | null;
  knowledge?: AgentKnowledgeSnapshot;
};

export type AgentBranch = {
  id: string;
  agentId: string;
  orgId: string;
  name: string;
  description: string | null;
  isMain: boolean;
  isArchived: boolean;
  forkedFromVersionId: string | null;
  forkedFromVersionNumber: number | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  latestVersionNumber: number | null;
  draftUpdatedAt: string | null;
};

export type AgentVersion = {
  id: string;
  agentId: string;
  orgId: string;
  branchId: string;
  branchName: string;
  versionNumber: number;
  parentVersionId: string | null;
  configuration: AgentVersionConfig;
  changeSummary: string | null;
  source:
    | "draft"
    | "restore"
    | "merge"
    | "rebase"
    | "legacy_snapshot"
    | "default_assistant"
    | "migration";
  createdByName: string | null;
  createdBy: string | null;
  createdAt: string;
  publishedAt: string | null;
};

export type AgentDraft = {
  id: string;
  agentId: string;
  orgId: string;
  branchId: string;
  branchName: string;
  userId: string | null;
  configuration: AgentVersionConfig;
  parentVersionId: string | null;
  parentVersionNumber: number | null;
  updatedAt: string;
  createdAt: string;
};

export type AgentDeployment = {
  id: string;
  agentId: string;
  orgId: string;
  branchId: string;
  branchName: string;
  versionId: string;
  versionNumber: number;
  environment: string;
  status: "active" | "superseded" | "failed";
  publicAccess: boolean;
  publishedByName: string | null;
  publishedBy: string | null;
  publishedAt: string;
  changeSummary: string | null;
};

// ─── Semantic diff model ──────────────────────────────────────────────────────

export type DiffChangeKind = "added" | "removed" | "changed" | "toggled_on" | "toggled_off";

export type DiffFieldChange = {
  /** Stable field path, e.g. "assistant.systemPrompt". */
  field: string;
  /** Human label, e.g. "System prompt". */
  label: string;
  kind: DiffChangeKind;
  before: string | null;
  after: string | null;
  /** For list fields: item-level additions/removals. */
  addedItems?: string[];
  removedItems?: string[];
};

export type DiffSection = {
  /** Section key: identity | behaviour | language | voice | ai | tools | branding | knowledge. */
  key: string;
  title: string;
  changes: DiffFieldChange[];
};

export type SemanticDiff = {
  from: { versionNumber: number | null; label: string };
  to: { versionNumber: number | null; label: string };
  sections: DiffSection[];
  changeCount: number;
  hasChanges: boolean;
};

// ─── Merge model ──────────────────────────────────────────────────────────────

export type MergeConflictField = DiffFieldChange & {
  /** The two competing values. */
  ours: string | null;
  theirs: string | null;
};

export type MergeReview = {
  sourceBranch: { id: string; name: string };
  targetBranch: { id: string; name: string };
  baseVersionNumber: number | null;
  sourceVersionNumber: number | null;
  targetVersionNumber: number | null;
  incoming: DiffSection[];
  outgoing: DiffSection[];
  conflicts: Array<{
    section: string;
    sectionTitle: string;
    field: MergeConflictField;
  }>;
  compatibleChangeCount: number;
  conflictCount: number;
};

export type MergeResolution = {
  field: string;
  /** "theirs" (source branch) | "ours" (target/Main head). */
  pick: "theirs" | "ours";
};

export type PublishValidation = {
  ok: boolean;
  checks: Array<{
    key: string;
    label: string;
    passed: boolean;
    detail: string | null;
  }>;
}

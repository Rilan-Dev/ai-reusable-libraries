/**
 * src/modules/agent-versioning/core/service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Agent version-control orchestration: ensure-versioning, drafts, versions,
 * branches, restore, merge, publish + validation.
 *
 * Guarantees (implementation plan §8/§9, ElevenLabs alignment §19):
 *   - every agent has a permanent Main branch;
 *   - versions are immutable (insert-only at the db layer);
 *   - restore creates a NEW version — history is never destroyed;
 *   - branches fork from an exact immutable version;
 *   - merge requires review and creates a new Main version;
 *   - publishing references an exact immutable version and flips production.
 */

import {
  AgentVersioningError,
  createBranch,
  ensureMainBranch,
  getBranch,
  getDraft,
  getLatestVersion,
  getMainBranch,
  getVersion,
  insertDeployment,
  insertVersion,
  invalidateProductionVersionCache,
  listBranches,
  listVersions,
  putDraft,
  setBranchArchived,
} from "./db";
import { buildMergeReview, applyMerge, diffAgentConfigs } from "./diff";
// Re-exported for the API barrel — handlers import everything from ./service.
export { changeTagsForVersion, CHANGE_TAG_LIMIT } from "./diff";
import { buildVersionConfigFromLive, projectDraftToLegacyStores } from "./projection";
import type {
  AgentBranch,
  AgentDeployment,
  AgentDraft,
  AgentVersion,
  AgentVersionConfig,
  AssistantConfigData,
  MergeResolution,
  MergeReview,
  PublishValidation,
  SemanticDiff,
} from "./types";
import { validateAgentAISelection } from "@/modules/ai-governance/core/resolver";
import { randomUUID } from "node:crypto";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { cloneKbCollection } from "@/modules/admin/core/vector-store-kb";

// ─── Ensure / bootstrap ───────────────────────────────────────────────────────

/**
 * Idempotently bring an agent into the versioned world:
 * Main branch + a draft seeded from the current live configuration (or, for a
 * brand-new agent without a config row, the platform default assistant).
 */
export async function ensureAgentVersioning(
  agentId: string,
  userId?: string | null,
): Promise<{ main: AgentBranch; draft: AgentDraft }> {
  let main = await getMainBranch(agentId);
  if (!main) {
    // Only the (rare) first-time seeding path needs the agent row — the
    // permission layer already validated agent existence on the request path,
    // so the steady-state flow skips this extra round trip.
    const { getAgentById } = await import("@/modules/organisations/core/db");
    const agent = await getAgentById(agentId);
    if (!agent) throw new AgentVersioningError("Agent not found.", "AGENT_NOT_FOUND");
    main = await ensureMainBranch(agentId, agent.orgId, userId ?? null);
  }

  let draft = await getDraft(agentId, main.id);
  if (!draft) {
    const live = await buildVersionConfigFromLive(agentId);
    const config =
      live ??
      (await seedFromPlatformDefault());
    if (live) {
      await recordDefaultAssistantProvenanceIfMissing(agentId);
    }
    draft = await putDraft({
      agentId,
      orgId: main.orgId,
      branchId: main.id,
      configuration: config,
      userId: userId ?? null,
    });
  }
  return { main, draft };
}

async function seedFromPlatformDefault(): Promise<AgentVersionConfig> {
  const { getPlatformAssistantDefaultVersion } = await import(
    "@/modules/ai-core/assistant-defaults-versions-db"
  );
  const version = await getPlatformAssistantDefaultVersion("current");
  const FALLBACK_ASSISTANT: AssistantConfigData = {
    assistantName: "Clara",
    avatarUrl: null,
    systemPrompt: "You are Clara, a helpful voice assistant. Answer ONLY using the context provided.",
    welcomeMessage: "Hello! How can I help you today?",
    outOfScopeReply: "I don't have enough information in the configured knowledge base to answer that accurately.",
    rules: [],
    defaultLanguage: "en",
    allowedLanguages: ["en"],
    alwaysRespondIn: null,
    voiceId: "alloy",
    speed: 1,
    temperature: 0.2,
    maxTokens: 2048,
    citeSources: true,
    strictMode: true,
    primaryColour: "#6d5efc",
    accentColour: "#00d4b1",
    launcherColour: "#6d5efc",
    widgetTheme: "light" as const,
    widgetPosition: "bottom-right" as const,
    widgetButtonSize: 56,
    widgetBorderRadius: 20,
    widgetFontFamily: "system-ui,sans-serif",
    widgetChatHeight: 580,
    widgetShowBranding: true,
    widgetLauncherLabel: null,
    widgetMode: "floating" as const,
    headerBg: null,
    headerTextColor: "#ffffff",
    headerHeight: 64,
    headerBlur: true,
    showStatusDot: true,
    statusDotColor: "#22c55e",
    avatarShape: "circle" as const,
    chatAreaBg: null,
    userBubbleBg: null,
    userBubbleText: "#ffffff",
    userBubbleRadius: "16px",
    userBubblePadding: "10px 14px",
    userBubbleShadow: "0 1px 2px rgba(0,0,0,.12)",
    botBubbleBg: null,
    botBubbleText: null,
    botBubbleRadius: "16px",
    botBubbleBorder: null,
    botBubblePadding: "10px 14px",
    botBubbleShadow: "0 1px 2px rgba(0,0,0,.12)",
    messageGap: 12,
    messageMaxWidth: 78,
    messageFontSize: 14,
    messageLineHeight: 1.5,
    showTimestamps: true,
    timestampColor: "#94a3b8",
    timestampFontSize: 10,
    typingDotColor: "#94a3b8",
    typingDotSize: 6,
    inputBg: null,
    inputBorder: null,
    inputBorderFocus: null,
    inputRadius: 12,
    inputTextColor: null,
    inputPlaceholderColor: null,
    inputPadding: "10px 14px",
    inputAreaBg: null,
    inputAreaBorder: null,
    sendBtnBg: null,
    sendBtnHoverBg: null,
    sendBtnTextColor: "#ffffff",
    sendBtnRadius: 10,
    sendBtnSize: 36,
    scrollbarWidth: 6,
    scrollbarColor: "#cbd5e1",
    scrollbarTrackColor: "transparent",
    footerBg: null,
    footerTextColor: null,
    animationsEnabled: true,
    messageAnimationStyle: "fade" as const,
    customCss: null,
    customLauncherSvg: null,
    customHeaderHtml: null,
    customFooterHtml: null,
    customThemeCss: null,
    customInjectJs: null,
    customPoweredBy: null,
    voiceBtnBg: null,
    voiceBtnSize: 44,
    voiceBtnRadius: 999,
    voiceBtnActiveColor: null,
    voicePanelBg: null,
    voiceWaveColor: null,
  };
  // The platform default carries PERSONA only — widget/generation fields keep
  // the safe template above (persona fields win when the version carries
  // them — migration 042 extended the persona with generation/branding).
  const persona = version?.configuration.assistant;
  const assistant: AssistantConfigData = persona
    ? {
        ...FALLBACK_ASSISTANT,
        assistantName: persona.assistantName,
        avatarUrl: persona.avatarUrl,
        systemPrompt: persona.systemPrompt,
        welcomeMessage: persona.welcomeMessage,
        outOfScopeReply: persona.outOfScopeReply,
        rules: persona.rules,
        temperature: persona.temperature ?? FALLBACK_ASSISTANT.temperature,
        maxTokens: persona.maxTokens ?? FALLBACK_ASSISTANT.maxTokens,
        citeSources: persona.citeSources ?? FALLBACK_ASSISTANT.citeSources,
        strictMode: persona.strictMode ?? FALLBACK_ASSISTANT.strictMode,
        defaultLanguage: persona.defaultLanguage,
        allowedLanguages: persona.allowedLanguages,
        alwaysRespondIn: persona.alwaysRespondIn,
        voiceId: persona.voiceId ?? FALLBACK_ASSISTANT.voiceId,
        speed: persona.voiceSpeed ?? FALLBACK_ASSISTANT.speed,
        primaryColour: persona.primaryColour ?? FALLBACK_ASSISTANT.primaryColour,
        accentColour: persona.accentColour ?? FALLBACK_ASSISTANT.accentColour,
        launcherColour: persona.launcherColour ?? FALLBACK_ASSISTANT.launcherColour,
      }
    : FALLBACK_ASSISTANT;
  return {
    assistant,
    ai: {
      provider: null,
      chatModel: null,
      embeddingModel: null,
      realtimeModel: null,
      transcriptionModel: null,
      voiceProvider: null,
      voiceChatSttModel: null,
      voiceChatTtsModel: null,
      voiceChatVoiceId: null,
      realtimeVoiceProvider: null,
      realtimeLlmModel: null,
      realtimeSttModel: null,
      realtimeTtsModel: null,
      realtimeVoiceId: null,
    },
    runtime: { enableVoice: true, enableRealtime: true, enablePublicEmbed: true },
    knowledge: { kbIds: [] },
  };
}

/** Record which platform default version the agent was created from (Stage F). */
export async function recordDefaultAssistantProvenanceIfMissing(agentId: string): Promise<void> {
  const { queryOne } = await import("@/lib/db");
  await queryOne(
    `UPDATE agents SET default_assistant_version = COALESCE(default_assistant_version, (
       SELECT max(version_number) FROM platform_assistant_default_versions
     ))
     WHERE id = $1 AND default_assistant_version IS NULL`,
    [agentId],
  );
}

// ─── Drafts ───────────────────────────────────────────────────────────────────

export async function getAgentDraft(
  agentId: string,
  branchId: string,
): Promise<AgentDraft> {
  const { main, draft } = await ensureAgentVersioning(agentId);
  if (branchId !== main.id) {
    const branch = await getBranch(agentId, branchId);
    if (!branch) throw new AgentVersioningError("Branch not found.", "BRANCH_NOT_FOUND");
    const branchDraft = await getDraft(agentId, branchId);
    if (!branchDraft) throw new AgentVersioningError("Branch has no draft.", "DRAFT_NOT_FOUND");
    return branchDraft;
  }
  return draft;
}

/**
 * Save a draft. Main-branch saves are ALSO projected to the legacy stores
 * (compatibility projection) so rollback stays safe and legacy UI stays
 * coherent during the rollout window.
 */
export async function saveAgentDraft(
  agentId: string,
  branchId: string,
  configuration: AgentVersionConfig,
  userId: string | null,
): Promise<AgentDraft> {
  const { main } = await ensureAgentVersioning(agentId);
  const branch = branchId === main.id ? main : await getBranch(agentId, branchId);
  if (!branch) throw new AgentVersioningError("Branch not found.", "BRANCH_NOT_FOUND");
  if (branch.isArchived) throw new AgentVersioningError("Branch is archived.", "BRANCH_ARCHIVED");

  const parent = await getLatestVersion(agentId, branchId);
  const draft = await putDraft({
    agentId,
    orgId: branch.orgId,
    branchId,
    configuration,
    parentVersionId: parent?.id ?? null,
    userId,
  });

  if (branch.isMain) {
    await projectDraftToLegacyStores(agentId, branch.orgId, configuration);
  }
  return draft;
}

// ─── Versions ─────────────────────────────────────────────────────────────────

export async function listAgentVersions(agentId: string, branchId?: string): Promise<AgentVersion[]> {
  return listVersions(agentId, branchId);
}

/** Save a NEW immutable version from the branch draft (Save version ≠ Publish). */
export async function saveVersionFromDraft(
  agentId: string,
  branchId: string,
  input: { changeSummary?: string | null },
  userId: string | null,
): Promise<AgentVersion> {
  const { main } = await ensureAgentVersioning(agentId);
  const branch = branchId === main.id ? main : await getBranch(agentId, branchId);
  if (!branch) throw new AgentVersioningError("Branch not found.", "BRANCH_NOT_FOUND");
  const draft = await getDraft(agentId, branchId);
  if (!draft) throw new AgentVersioningError("Branch has no draft to save.", "DRAFT_NOT_FOUND");

  return insertVersion({
    agentId,
    orgId: branch.orgId,
    branchId,
    configuration: draft.configuration,
    changeSummary: input.changeSummary ?? null,
    source: "draft",
    parentVersionId: draft.parentVersionId,
    createdBy: userId,
  });
}

/** Restore an immutable version by creating a NEW version with its config. */
export async function restoreVersion(
  agentId: string,
  versionId: string,
  userId: string | null,
): Promise<AgentVersion> {
  const { main } = await ensureAgentVersioning(agentId);
  const source = await getVersion(agentId, versionId);
  if (!source) throw new AgentVersioningError("Version not found.", "VERSION_NOT_FOUND");

  const restored = await insertVersion({
    agentId,
    orgId: main.orgId,
    branchId: source.branchId,
    configuration: source.configuration,
    changeSummary: `Restore of ${source.branchName} v${source.versionNumber}`,
    source: "restore",
    parentVersionId: source.id,
    createdBy: userId,
  });

  // The restored state also becomes the branch draft going forward.
  await putDraft({
    agentId,
    orgId: main.orgId,
    branchId: source.branchId,
    configuration: source.configuration,
    parentVersionId: restored.id,
    userId,
  });
  if (source.branchId === main.id) {
    await projectDraftToLegacyStores(agentId, main.orgId, source.configuration);
  }
  return restored;
}

/** Semantic diff between two versions (or draft ↔ version when a="draft"). */
export async function diffAgentVersionConfigs(
  agentId: string,
  a: string,
  b: string,
  branchId?: string,
): Promise<SemanticDiff> {
  const { main } = await ensureAgentVersioning(agentId);
  const effectiveBranch = branchId ?? main.id;
  const draft = await getDraft(agentId, effectiveBranch);

  const resolveSide = async (ref: string): Promise<{ config: AgentVersionConfig; versionNumber: number | null; label: string }> => {
    if (ref === "draft") {
      if (!draft) throw new AgentVersioningError("Branch has no draft.", "DRAFT_NOT_FOUND");
      return { config: draft.configuration, versionNumber: null, label: "Draft" };
    }
    const version = await getVersion(agentId, ref);
    if (!version) throw new AgentVersioningError(`Version ${ref} not found.`, "VERSION_NOT_FOUND");
    return {
      config: version.configuration,
      versionNumber: version.versionNumber,
      label: `${version.branchName} v${version.versionNumber}`,
    };
  };

  const before = await resolveSide(a);
  const after = await resolveSide(b);
  return diffAgentConfigs(before.config, after.config,
    { versionNumber: before.versionNumber, label: before.label },
    { versionNumber: after.versionNumber, label: after.label },
  );
}

// ─── Branches ─────────────────────────────────────────────────────────────────

export async function listAgentBranches(agentId: string): Promise<AgentBranch[]> {
  await ensureAgentVersioning(agentId);
  return listBranches(agentId);
}

/** Create a branch from an EXACT immutable version; switch its draft to it. */
export async function createBranchFromVersion(
  agentId: string,
  input: { name: string; description?: string | null; fromVersionId: string },
  userId: string | null,
): Promise<{ branch: AgentBranch; draft: AgentDraft }> {
  const { main } = await ensureAgentVersioning(agentId);
  const source = await getVersion(agentId, input.fromVersionId);
  if (!source) throw new AgentVersioningError("Source version not found.", "VERSION_NOT_FOUND");

  const branch = await createBranch({
    agentId,
    orgId: main.orgId,
    name: input.name,
    description: input.description ?? null,
    forkedFromVersionId: source.id,
    createdBy: userId,
  });

  // Branch creation copies the source version config as the starting draft.
  const draft = await putDraft({
    agentId,
    orgId: main.orgId,
    branchId: branch.id,
    configuration: source.configuration,
    parentVersionId: source.id,
    userId,
  });
  return { branch, draft };
}

export async function archiveAgentBranch(agentId: string, branchId: string, archived: boolean): Promise<void> {
  await setBranchArchived(agentId, branchId, archived);
}

// ─── Merge ────────────────────────────────────────────────────────────────────

/** Three-way merge review: source branch → Main. */
export async function reviewMerge(
  agentId: string,
  sourceBranchId: string,
): Promise<MergeReview> {
  const { main } = await ensureAgentVersioning(agentId);
  const source = await getBranch(agentId, sourceBranchId);
  if (!source) throw new AgentVersioningError("Branch not found.", "BRANCH_NOT_FOUND");
  if (source.isMain) throw new AgentVersioningError("Cannot merge Main into itself.", "MERGE_SELF");
  if (source.isArchived) throw new AgentVersioningError("Branch is archived.", "BRANCH_ARCHIVED");

  const theirsVersion = await getLatestVersion(agentId, sourceBranchId);
  const oursVersion = await getLatestVersion(agentId, main.id);
  const theirsDraft = await getDraft(agentId, sourceBranchId);

  const theirs = theirsDraft?.configuration ?? theirsVersion?.configuration;
  if (!theirs) throw new AgentVersioningError("Source branch has no configuration to merge.", "MERGE_EMPTY_SOURCE");

  const ours = oursVersion?.configuration ?? (await getDraft(agentId, main.id))?.configuration;
  if (!ours) throw new AgentVersioningError("Main has no configuration to merge into.", "MERGE_EMPTY_TARGET");

  let base: AgentVersionConfig;
  let baseVersionNumber: number | null = null;
  if (source.forkedFromVersionId) {
    const baseVersion = await getVersion(agentId, source.forkedFromVersionId);
    if (baseVersion) {
      base = baseVersion.configuration;
      baseVersionNumber = baseVersion.versionNumber;
    } else {
      base = ours; // fork point version lost — conservative: base = ours
    }
  } else {
    // Unknown fork point: base = ours, every incoming change is either clean
    // (identical on both sides) or conflicting — never silently chosen.
    base = ours;
  }

  return buildMergeReview({
    base,
    ours,
    theirs,
    baseVersionNumber,
    oursVersionNumber: oursVersion?.versionNumber ?? null,
    theirsVersionNumber: theirsVersion?.versionNumber ?? null,
    sourceBranch: { id: source.id, name: source.name },
    targetBranch: { id: main.id, name: main.name },
  });
}

/**
 * Execute a merge into Main. Creates a NEW immutable Main version — the source
 * branch history is never rewritten. Unresolved conflicts abort the merge.
 */
export async function executeMergeToMain(
  agentId: string,
  sourceBranchId: string,
  resolutions: MergeResolution[],
  userId: string | null,
): Promise<{ version: AgentVersion; review: MergeReview }> {
  const review = await reviewMerge(agentId, sourceBranchId);

  const resolvedFields = new Set(resolutions.map((r) => r.field));
  const unresolved = review.conflicts.filter((c) => !resolvedFields.has(c.field.field));
  if (unresolved.length > 0) {
    throw new AgentVersioningError(
      `Merge has ${unresolved.length} unresolved conflict(s): ${unresolved.map((c) => c.field.label).join(", ")}.`,
      "MERGE_CONFLICTS_UNRESOLVED",
    );
  }

  const { main } = await ensureAgentVersioning(agentId);
  const source = (await getBranch(agentId, sourceBranchId))!;
  const theirsVersion = await getLatestVersion(agentId, sourceBranchId);
  const theirsDraft = await getDraft(agentId, sourceBranchId);
  const oursVersion = await getLatestVersion(agentId, main.id);
  const oursDraft = await getDraft(agentId, main.id);

  if (!theirsVersion && !theirsDraft) {
    throw new AgentVersioningError("Source branch has no configuration to merge.", "MERGE_EMPTY_SOURCE");
  }
  if (!oursVersion && !oursDraft) {
    throw new AgentVersioningError("Main has no configuration to merge into.", "MERGE_EMPTY_TARGET");
  }
  const theirs = theirsDraft?.configuration ?? theirsVersion?.configuration ?? ({} as AgentVersionConfig);
  const ours = oursVersion?.configuration ?? oursDraft?.configuration ?? ({} as AgentVersionConfig);
  let base: AgentVersionConfig;
  if (source.forkedFromVersionId) {
    const baseVersion = await getVersion(agentId, source.forkedFromVersionId);
    base = baseVersion?.configuration ?? ours;
  } else {
    base = ours;
  }

  const merged = applyMerge({ base, ours, theirs, resolutions });

  const version = await insertVersion({
    agentId,
    orgId: main.orgId,
    branchId: main.id,
    configuration: merged,
    changeSummary: `Merge ${source.name} into Main`,
    source: "merge",
    parentVersionId: oursVersion?.id ?? null,
    createdBy: userId,
  });

  // Main draft advances to the merged state (+ legacy projection).
  await putDraft({
    agentId,
    orgId: main.orgId,
    branchId: main.id,
    configuration: merged,
    parentVersionId: version.id,
    userId,
  });
  await projectDraftToLegacyStores(agentId, main.orgId, merged);

  return { version, review };
}

// ─── Publishing ───────────────────────────────────────────────────────────────

export async function getPublishContext(
  agentId: string,
  versionId: string,
): Promise<{
  version: AgentVersion;
  deployment: AgentDeployment | null;
  changesSinceDeployment: SemanticDiff | null;
  validation: PublishValidation;
}> {
  const version = await getVersion(agentId, versionId);
  if (!version) throw new AgentVersioningError("Version not found.", "VERSION_NOT_FOUND");

  const { getActiveDeployment } = await import("./db");
  const deployment = await getActiveDeployment(agentId);

  let changesSinceDeployment: SemanticDiff | null = null;
  if (deployment && deployment.versionId !== version.id) {
    const deployed = await getVersion(agentId, deployment.versionId);
    if (deployed) {
      changesSinceDeployment = diffAgentConfigs(
        deployed.configuration,
        version.configuration,
        { versionNumber: deployed.versionNumber, label: `${deployed.branchName} v${deployed.versionNumber}` },
        { versionNumber: version.versionNumber, label: `${version.branchName} v${version.versionNumber}` },
      );
    }
  }

  const validation = await validateVersionForPublish(agentId, version);
  return { version, deployment, changesSinceDeployment, validation };
}

/** Pre-publish validation: provider/model/voice availability + entitlements. */
export async function validateVersionForPublish(
  agentId: string,
  version: AgentVersion,
): Promise<PublishValidation> {
  const { getAgentById } = await import("@/modules/organisations/core/db");
  const agent = await getAgentById(agentId);
  const orgId = agent?.orgId ?? null;

  const checks: PublishValidation["checks"] = [];
  const ai = version.configuration.ai;

  // Chat provider/model gate.
  const chatCheck = await validateAgentAISelection({
    organizationId: orgId,
    provider: ai?.provider ?? "openai",
    capability: "chat",
    modelId: ai?.chatModel ?? null,
  });
  checks.push({
    key: "chat_provider",
    label: "Chat provider available",
    passed: chatCheck.ok,
    detail: chatCheck.ok ? null : chatCheck.reason,
  });
  checks.push({
    key: "chat_model",
    label: "Chat model available",
    passed: chatCheck.ok && (ai?.chatModel != null || true),
    detail: ai?.chatModel ?? "Platform default",
  });

  // Voice-chat gate (only when the agent uses voice).
  if (version.configuration.runtime?.enableVoice !== false) {
    const voiceProvider = ai?.voiceProvider ?? ai?.provider ?? null;
    const voiceCheck = voiceProvider
      ? await validateAgentAISelection({
          organizationId: orgId,
          provider: voiceProvider,
          capability: "voice_chat",
        })
      : { ok: true as const };
    checks.push({
      key: "voice_provider",
      label: "Voice chat available",
      passed: voiceCheck.ok,
      detail: voiceCheck.ok ? null : voiceCheck.reason,
    });
  }

  // Realtime gate (only when the agent uses realtime).
  if (version.configuration.runtime?.enableRealtime !== false) {
    const realtimeProvider = ai?.realtimeVoiceProvider ?? ai?.voiceProvider ?? ai?.provider ?? null;
    const realtimeCheck = realtimeProvider
      ? await validateAgentAISelection({
          organizationId: orgId,
          provider: realtimeProvider,
          capability: "realtime_voice",
        })
      : { ok: true as const };
    checks.push({
      key: "realtime_provider",
      label: "Realtime voice available",
      passed: realtimeCheck.ok,
      detail: realtimeCheck.ok ? null : realtimeCheck.reason,
    });
  }

  // Persona sanity.
  const assistant = version.configuration.assistant;
  checks.push({
    key: "persona",
    label: "Assistant identity configured",
    passed: Boolean(assistant?.assistantName?.trim()) && Boolean(assistant?.defaultLanguage?.trim()),
    detail: assistant?.assistantName ? null : "Assistant name is empty",
  });
  checks.push({
    key: "languages",
    label: "At least one allowed language",
    passed: Array.isArray(assistant?.allowedLanguages) && (assistant?.allowedLanguages?.length ?? 0) > 0,
    detail: null,
  });

  return { ok: checks.every((c) => c.passed), checks };
}

/**
 * Publish an exact immutable version. Public access and embed access are
 * SEPARATE concepts: publicAccess only controls the public deployment flag;
 * embed access continues to be governed by the embed API key workflow.
 */
export async function publishVersion(
  agentId: string,
  versionId: string,
  input: { publicAccess: boolean },
  userId: string | null,
): Promise<{ deployment: AgentDeployment; validation: PublishValidation }> {
  const version = await getVersion(agentId, versionId);
  if (!version) throw new AgentVersioningError("Version not found.", "VERSION_NOT_FOUND");

  const validation = await validateVersionForPublish(agentId, version);
  if (!validation.ok) {
    throw new AgentVersioningError(
      `Publish validation failed: ${validation.checks.filter((c) => !c.passed).map((c) => c.label).join(", ")}.`,
      "PUBLISH_VALIDATION_FAILED",
    );
  }

  const { main } = await ensureAgentVersioning(agentId);

  // Capture KB content before switching production. Each published deployment
  // gets its own Qdrant collection, so later document edits cannot change the
  // content seen by an already-published version.
  const configuredKbIds = version.configuration.knowledge?.kbIds?.filter(Boolean) ?? [];
  const kbRows = configuredKbIds.length > 0
    ? await Promise.all(configuredKbIds.map((kbId) => getKnowledgeBaseById(kbId)))
    : await import("@/lib/db").then(({ query }) => query<{ id: string; qdrant_collection: string }>(
        "SELECT id, qdrant_collection FROM knowledge_bases WHERE agent_id = $1 AND status = 'active' ORDER BY created_at ASC",
        [agentId],
      ));
  const kbSnapshots: Array<{ kbId: string; collectionName: string }> = [];
  for (const kb of kbRows) {
    if (!kb) continue;
    if ("agentId" in kb && kb.agentId !== agentId) {
      throw new AgentVersioningError("Published version references a knowledge base owned by another agent.", "PUBLISH_KB_OWNERSHIP");
    }
    const sourceCollection = "qdrantCollection" in kb ? kb.qdrantCollection : kb.qdrant_collection;
    const collectionName = `pub_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    await cloneKbCollection(sourceCollection, collectionName);
    kbSnapshots.push({ kbId: kb.id, collectionName });
  }

  const deployment = await insertDeployment({
    agentId,
    orgId: main.orgId,
    branchId: version.branchId,
    versionId: version.id,
    publicAccess: input.publicAccess,
    publishedBy: userId,
    kbSnapshots,
  });
  invalidateProductionVersionCache();
  return { deployment, validation };
}

/** Rollback = publish a PREVIOUS immutable version (never deletes anything). */
export async function rollbackToVersion(
  agentId: string,
  versionId: string,
  userId: string | null,
): Promise<AgentDeployment> {
  const result = await publishVersion(agentId, versionId, { publicAccess: true }, userId);
  return result.deployment;
}

// ─── New-default notification (§22) ──────────────────────────────────────────

/** Should this agent be offered "New platform default available"? */
export async function checkDefaultAssistantUpdate(agentId: string): Promise<{
  updateAvailable: boolean;
  agentDefaultVersion: number | null;
  currentPlatformVersion: number | null;
} | null> {
  const { queryOne } = await import("@/lib/db");
  const agentRow = await queryOne<{ default_assistant_version: number | null }>(
    "SELECT default_assistant_version FROM agents WHERE id = $1",
    [agentId],
  );
  if (!agentRow) return null;
  const currentRow = await queryOne<{ current_version: number | null }>(
    "SELECT current_version FROM platform_assistant_defaults WHERE id = '30000000-0000-0000-0000-000000000001'",
  );
  const agentDefaultVersion =
    agentRow.default_assistant_version == null ? null : Number(agentRow.default_assistant_version);
  const currentPlatformVersion =
    currentRow?.current_version == null ? null : Number(currentRow.current_version);
  return {
    updateAvailable:
      agentDefaultVersion != null &&
      currentPlatformVersion != null &&
      currentPlatformVersion > agentDefaultVersion,
    agentDefaultVersion,
    currentPlatformVersion,
  };
}

/**
 * Explicit "review & apply" of a newer platform default: applies the default's
 * PERSONA fields onto the agent's Main draft (model selections and runtime
 * toggles stay agent-owned) and refreshes provenance.
 */
export async function applyPlatformDefaultUpdate(
  agentId: string,
  userId: string | null,
): Promise<AgentDraft> {
  const { getPlatformAssistantDefaultVersion } = await import(
    "@/modules/ai-core/assistant-defaults-versions-db"
  );
  const version = await getPlatformAssistantDefaultVersion("current");
  if (!version) throw new AgentVersioningError("No platform default version exists.", "DEFAULT_MISSING");

  const { main, draft } = await ensureAgentVersioning(agentId);
  const persona = version.configuration.assistant;
  const merged: AgentVersionConfig = {
    ...draft.configuration,
    assistant: {
      ...draft.configuration.assistant,
      assistantName: persona.assistantName,
      avatarUrl: persona.avatarUrl,
      systemPrompt: persona.systemPrompt,
      welcomeMessage: persona.welcomeMessage,
      outOfScopeReply: persona.outOfScopeReply,
      rules: persona.rules,
      temperature: persona.temperature ?? draft.configuration.assistant.temperature,
      maxTokens: persona.maxTokens ?? draft.configuration.assistant.maxTokens,
      citeSources: persona.citeSources ?? draft.configuration.assistant.citeSources,
      strictMode: persona.strictMode ?? draft.configuration.assistant.strictMode,
      defaultLanguage: persona.defaultLanguage,
      allowedLanguages: persona.allowedLanguages,
      alwaysRespondIn: persona.alwaysRespondIn,
      voiceId: persona.voiceId ?? draft.configuration.assistant.voiceId,
      speed: persona.voiceSpeed ?? draft.configuration.assistant.speed,
      primaryColour: persona.primaryColour ?? draft.configuration.assistant.primaryColour,
      accentColour: persona.accentColour ?? draft.configuration.assistant.accentColour,
      launcherColour: persona.launcherColour ?? draft.configuration.assistant.launcherColour,
    },
  };
  const saved = await saveAgentDraft(agentId, main.id, merged, userId);
  await recordDefaultAssistantProvenanceIfMissing(agentId);
  return saved;
}

// ─── Header context (§19.2) ───────────────────────────────────────────────────

/** Everything the persistent agent header must answer at a glance. */
export async function getAgentWorkspaceContext(agentId: string): Promise<{
  agent: { id: string; name: string; orgId: string; status: string };
  branches: AgentBranch[];
  main: AgentBranch;
  currentVersion: AgentVersion | null;
  draftUpdatedAt: string | null;
  deployment: AgentDeployment | null;
  defaultAssistantUpdate: Awaited<ReturnType<typeof checkDefaultAssistantUpdate>>;
}> {
  const { getAgentById } = await import("@/modules/organisations/core/db");
  const agent = await getAgentById(agentId);
  if (!agent) throw new AgentVersioningError("Agent not found.", "AGENT_NOT_FOUND");

  const { main, draft } = await ensureAgentVersioning(agentId);
  const [branches, currentVersion, deployment, defaultAssistantUpdate] = await Promise.all([
    listBranches(agentId),
    getLatestVersion(agentId, main.id),
    (await import("./db")).getActiveDeployment(agentId),
    checkDefaultAssistantUpdate(agentId),
  ]);

  return {
    agent: { id: agent.id, name: agent.name, orgId: agent.orgId, status: agent.status },
    branches,
    main,
    currentVersion,
    draftUpdatedAt: draft.updatedAt,
    deployment,
    defaultAssistantUpdate,
  };
}

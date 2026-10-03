/**
 * src/modules/agent-versioning/core/diff.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Field-aware semantic diff for agent version configurations.
 *
 * Diffs are SEMANTIC (Identity / Behaviour / Language / Voice / AI / Tools /
 * Branding / Knowledge sections with per-field human-readable changes), never
 * raw JSON. The raw JSON comparison only backs an optional advanced view.
 */

import type {
  AgentVersionConfig,
  DiffFieldChange,
  DiffSection,
  MergeReview,
  MergeResolution,
  SemanticDiff,
} from "./types";

type FieldSpec = {
  path: string;
  label: string;
  get: (config: AgentVersionConfig) => unknown;
  /** Render a value for display; null → "not set". */
  render?: (value: unknown) => string | null;
  /** Treat as a list (added/removed item rendering). */
  list?: boolean;
};

const asString = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === "string") return value.length > 0 ? value : null;
  return String(value);
};

const renderTruncated = (value: unknown): string | null => {
  const str = asString(value);
  if (str == null) return null;
  return str.length > 120 ? `${str.slice(0, 117)}…` : str;
};

const FIELD_SPECS: Array<{ section: DiffSection["key"]; sectionTitle: string; fields: FieldSpec[] }> = [
  {
    section: "identity",
    sectionTitle: "Identity",
    fields: [
      { path: "assistant.assistantName", label: "Assistant name", get: (c) => c.assistant.assistantName },
      { path: "assistant.avatarUrl", label: "Avatar", get: (c) => c.assistant.avatarUrl, render: renderTruncated },
    ],
  },
  {
    section: "behaviour",
    sectionTitle: "Behaviour",
    fields: [
      { path: "assistant.systemPrompt", label: "System prompt", get: (c) => c.assistant.systemPrompt, render: renderTruncated },
      { path: "assistant.welcomeMessage", label: "Welcome message", get: (c) => c.assistant.welcomeMessage, render: renderTruncated },
      { path: "assistant.outOfScopeReply", label: "Out-of-scope reply", get: (c) => c.assistant.outOfScopeReply, render: renderTruncated },
      { path: "assistant.rules", label: "Rules", get: (c) => c.assistant.rules, list: true },
      { path: "assistant.strictMode", label: "Strict mode", get: (c) => c.assistant.strictMode },
      { path: "assistant.citeSources", label: "Cite sources", get: (c) => c.assistant.citeSources },
      { path: "assistant.temperature", label: "Temperature", get: (c) => c.assistant.temperature },
      { path: "assistant.maxTokens", label: "Max tokens", get: (c) => c.assistant.maxTokens },
    ],
  },
  {
    section: "language",
    sectionTitle: "Language",
    fields: [
      { path: "assistant.defaultLanguage", label: "Default language", get: (c) => c.assistant.defaultLanguage },
      { path: "assistant.allowedLanguages", label: "Allowed languages", get: (c) => c.assistant.allowedLanguages, list: true },
      { path: "assistant.alwaysRespondIn", label: "Always respond in", get: (c) => c.assistant.alwaysRespondIn },
    ],
  },
  {
    section: "voice",
    sectionTitle: "Voice",
    fields: [
      { path: "assistant.voiceId", label: "Voice", get: (c) => c.assistant.voiceId },
      { path: "assistant.speed", label: "Voice speed", get: (c) => c.assistant.speed },
    ],
  },
  {
    section: "ai",
    sectionTitle: "AI Models",
    fields: [
      { path: "ai.provider", label: "Chat provider", get: (c) => c.ai?.provider ?? null },
      { path: "ai.chatModel", label: "Chat model", get: (c) => c.ai?.chatModel ?? null },
      { path: "ai.embeddingModel", label: "Embedding model", get: (c) => c.ai?.embeddingModel ?? null },
      { path: "ai.realtimeModel", label: "Realtime model", get: (c) => c.ai?.realtimeModel ?? null },
      { path: "ai.transcriptionModel", label: "Transcription model", get: (c) => c.ai?.transcriptionModel ?? null },
      { path: "ai.voiceProvider", label: "Voice-chat provider", get: (c) => c.ai?.voiceProvider ?? null },
      { path: "ai.voiceChatSttModel", label: "Voice Chat STT model", get: (c) => c.ai?.voiceChatSttModel ?? null },
      { path: "ai.voiceChatTtsModel", label: "Voice Chat TTS model", get: (c) => c.ai?.voiceChatTtsModel ?? null },
      { path: "ai.voiceChatVoiceId", label: "Voice Chat speaker", get: (c) => c.ai?.voiceChatVoiceId ?? null },
      { path: "ai.realtimeVoiceProvider", label: "Realtime voice provider", get: (c) => c.ai?.realtimeVoiceProvider ?? null },
      { path: "ai.realtimeLlmModel", label: "Realtime LLM", get: (c) => c.ai?.realtimeLlmModel ?? null },
      { path: "ai.realtimeSttModel", label: "Realtime STT model", get: (c) => c.ai?.realtimeSttModel ?? null },
      { path: "ai.realtimeTtsModel", label: "Realtime TTS model", get: (c) => c.ai?.realtimeTtsModel ?? null },
      { path: "ai.realtimeVoiceId", label: "Realtime speaker", get: (c) => c.ai?.realtimeVoiceId ?? null },
    ],
  },
  {
    section: "tools",
    sectionTitle: "Tools",
    fields: [
      { path: "runtime.enableVoice", label: "Voice chat", get: (c) => c.runtime?.enableVoice ?? null },
      { path: "runtime.enableRealtime", label: "Realtime voice", get: (c) => c.runtime?.enableRealtime ?? null },
      { path: "runtime.enablePublicEmbed", label: "Public embed", get: (c) => c.runtime?.enablePublicEmbed ?? null },
    ],
  },
  {
    section: "branding",
    sectionTitle: "Branding & Widget",
    fields: [
      { path: "assistant.primaryColour", label: "Primary colour", get: (c) => c.assistant.primaryColour },
      { path: "assistant.accentColour", label: "Accent colour", get: (c) => c.assistant.accentColour },
      { path: "assistant.launcherColour", label: "Launcher colour", get: (c) => c.assistant.launcherColour },
      { path: "assistant.widgetTheme", label: "Widget theme", get: (c) => c.assistant.widgetTheme },
      { path: "assistant.widgetPosition", label: "Widget position", get: (c) => c.assistant.widgetPosition },
      { path: "assistant.widgetMode", label: "Widget mode", get: (c) => c.assistant.widgetMode },
    ],
  },
  {
    section: "knowledge",
    sectionTitle: "Knowledge",
    fields: [
      { path: "knowledge.kbIds", label: "Attached knowledge bases", get: (c) => c.knowledge?.kbIds ?? null, list: true },
    ],
  },
];

function diffField(spec: FieldSpec, before: AgentVersionConfig, after: AgentVersionConfig): DiffFieldChange | null {
  const beforeValue = spec.get(before);
  const afterValue = spec.get(after);
  const render = spec.render ?? asString;

  if (spec.list) {
    const beforeList = Array.isArray(beforeValue) ? beforeValue.map((v) => String(v)) : [];
    const afterList = Array.isArray(afterValue) ? afterValue.map((v) => String(v)) : [];
    const added = afterList.filter((v) => !beforeList.includes(v));
    const removed = beforeList.filter((v) => !afterList.includes(v));
    if (added.length === 0 && removed.length === 0) return null;
    return {
      field: spec.path,
      label: spec.label,
      kind: added.length > 0 ? "added" : "removed",
      before: beforeList.length > 0 ? beforeList.join(", ") : null,
      after: afterList.length > 0 ? afterList.join(", ") : null,
      addedItems: added,
      removedItems: removed,
    };
  }

  const beforeStr = beforeValue == null ? null : render(beforeValue);
  const afterStr = afterValue == null ? null : render(afterValue);
  if (beforeStr === afterStr) return null;

  let kind: DiffFieldChange["kind"] = "changed";
  if (typeof beforeValue === "boolean" || typeof afterValue === "boolean") {
    kind = afterValue === true ? "toggled_on" : "toggled_off";
  } else if (beforeStr == null) {
    kind = "added";
  } else if (afterStr == null) {
    kind = "removed";
  }

  return {
    field: spec.path,
    label: spec.label,
    kind,
    before: beforeStr,
    after: afterStr,
  };
}

/** Semantic diff between two version configurations. */
export function diffAgentConfigs(
  before: AgentVersionConfig,
  after: AgentVersionConfig,
  fromLabel: { versionNumber: number | null; label: string },
  toLabel: { versionNumber: number | null; label: string },
): SemanticDiff {
  const sections: DiffSection[] = [];
  let changeCount = 0;

  for (const group of FIELD_SPECS) {
    const changes: DiffFieldChange[] = [];
    for (const spec of group.fields) {
      const change = diffField(spec, before, after);
      if (change) {
        changes.push(change);
        changeCount++;
      }
    }
    sections.push({ key: group.section, title: group.sectionTitle, changes });
  }

  return {
    from: fromLabel,
    to: toLabel,
    sections,
    changeCount,
    hasChanges: changeCount > 0,
  };
}

/** Section keys that actually contain changes (for compact review surfaces). */
export function changedSections(diff: SemanticDiff): DiffSection[] {
  return diff.sections.filter((s) => s.changes.length > 0);
}

// ─── Change tags (branch-history rows) ────────────────────────────────────────

/**
 * Short per-version change tags for the branch-history list — the compact
 * pills shown next to each history row ("System prompt", "Voice", "LLM"…).
 *
 * Section keys map to short labels; the behaviour section additionally
 * promotes its two signature fields (system prompt / first message) so the
 * pills read like ElevenLabs' history entries. Ordered by FIELD_SPECS order.
 */
const SECTION_TAG: Record<string, string> = {
  identity: "Identity",
  language: "Language",
  voice: "Voice",
  ai: "LLM",
  tools: "Tools",
  branding: "Widget",
  knowledge: "Knowledge base",
};

const FIELD_TAG: Record<string, string> = {
  "assistant.systemPrompt": "System prompt",
  "assistant.welcomeMessage": "First message",
  "assistant.rules": "Rules",
  "assistant.outOfScopeReply": "Behaviour",
  "assistant.strictMode": "Behaviour",
  "assistant.citeSources": "Behaviour",
  "assistant.temperature": "Behaviour",
  "assistant.maxTokens": "Behaviour",
};

/** Maximum tags kept per version before collapsing into "+n". */
export const CHANGE_TAG_LIMIT = 5;

export function changeTagsForVersion(
  before: AgentVersionConfig | null,
  after: AgentVersionConfig,
): string[] {
  if (!before) return ["Initial"];

  const tags: string[] = [];
  const push = (tag: string) => {
    if (!tags.includes(tag)) tags.push(tag);
  };

  for (const group of FIELD_SPECS) {
    let sectionChanged = false;
    for (const spec of group.fields) {
      if (diffField(spec, before, after)) {
        sectionChanged = true;
        const fieldTag = FIELD_TAG[spec.path];
        if (fieldTag) push(fieldTag);
      }
    }
    if (sectionChanged && group.section !== "behaviour") {
      push(SECTION_TAG[group.section] ?? group.sectionTitle);
    }
  }

  return tags.slice(0, CHANGE_TAG_LIMIT);
}

// ─── Three-way merge review ───────────────────────────────────────────────────

function readField(config: AgentVersionConfig, path: string): unknown {
  for (const group of FIELD_SPECS) {
    for (const spec of group.fields) {
      if (spec.path === path) return spec.get(config);
    }
  }
  return undefined;
}

/**
 * Three-way merge review: base = the version the source branch forked from,
 * ours = target (Main) head, theirs = source branch head.
 *
 * - only-theirs changed → incoming change (applies cleanly)
 * - only-ours changed → stays as-is
 * - both changed differently → conflict requiring explicit resolution
 */
export function buildMergeReview(params: {
  base: AgentVersionConfig;
  ours: AgentVersionConfig;
  theirs: AgentVersionConfig;
  baseVersionNumber: number | null;
  oursVersionNumber: number | null;
  theirsVersionNumber: number | null;
  sourceBranch: { id: string; name: string };
  targetBranch: { id: string; name: string };
}): MergeReview {
  const incoming: DiffSection[] = [];
  const conflicts: MergeReview["conflicts"] = [];
  let compatibleChangeCount = 0;

  for (const group of FIELD_SPECS) {
    const incomingChanges: DiffFieldChange[] = [];
    for (const spec of group.fields) {
      const baseValue = readField(params.base, spec.path);
      const oursValue = readField(params.ours, spec.path);
      const theirsValue = readField(params.theirs, spec.path);

      const render = spec.render ?? asString;
      const baseStr = baseValue == null ? null : render(baseValue);
      const oursStr = oursValue == null ? null : render(oursValue);
      const theirsStr = theirsValue == null ? null : render(theirsValue);

      const oursChanged = oursStr !== baseStr;
      const theirsChanged = theirsStr !== baseStr;

      if (!theirsChanged) continue;

      if (oursChanged && oursStr !== theirsStr) {
        conflicts.push({
          section: group.section,
          sectionTitle: group.sectionTitle,
          field: {
            field: spec.path,
            label: spec.label,
            kind: "changed",
            before: baseStr,
            after: theirsStr,
            ours: oursStr,
            theirs: theirsStr,
          },
        });
      } else {
        incomingChanges.push({
          field: spec.path,
          label: spec.label,
          kind: theirsStr == null ? "removed" : baseStr == null ? "added" : "changed",
          before: baseStr,
          after: theirsStr,
        });
        compatibleChangeCount++;
      }
    }
    if (incomingChanges.length > 0) {
      incoming.push({ key: group.section, title: group.sectionTitle, changes: incomingChanges });
    }
  }

  return {
    sourceBranch: params.sourceBranch,
    targetBranch: params.targetBranch,
    baseVersionNumber: params.baseVersionNumber,
    sourceVersionNumber: params.theirsVersionNumber,
    targetVersionNumber: params.oursVersionNumber,
    incoming,
    outgoing: [],
    conflicts,
    compatibleChangeCount,
    conflictCount: conflicts.length,
  };
}

/** Apply merge resolutions to produce the merged configuration. */
export function applyMerge(params: {
  base: AgentVersionConfig;
  ours: AgentVersionConfig;
  theirs: AgentVersionConfig;
  resolutions: MergeResolution[];
}): AgentVersionConfig {
  const merged: AgentVersionConfig = JSON.parse(JSON.stringify(params.ours));
  const resolutionByField = new Map(params.resolutions.map((r) => [r.field, r.pick]));

  const setField = (config: AgentVersionConfig, path: string, value: unknown): void => {
    const parts = path.split(".");
    let target: Record<string, unknown> = config as unknown as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]!;
      if (typeof target[key] !== "object" || target[key] === null) target[key] = {};
      target = target[key] as Record<string, unknown>;
    }
    const leaf = parts[parts.length - 1]!;
    target[leaf] = value;
  };

  for (const group of FIELD_SPECS) {
    for (const spec of group.fields) {
      const baseValue = readField(params.base, spec.path);
      const oursValue = readField(params.ours, spec.path);
      const theirsValue = readField(params.theirs, spec.path);

      const render = spec.render ?? asString;
      const baseStr = baseValue == null ? null : render(baseValue);
      const oursStr = oursValue == null ? null : render(oursValue);
      const theirsStr = theirsValue == null ? null : render(theirsValue);

      if (theirsStr === baseStr) continue; // no incoming change

      if (oursStr === baseStr || oursStr === theirsStr) {
        // Clean apply — take theirs.
        setField(merged, spec.path, theirsValue === undefined ? null : JSON.parse(JSON.stringify(theirsValue)));
        continue;
      }

      // Conflict — only apply when explicitly resolved to theirs.
      const pick = resolutionByField.get(spec.path);
      if (pick === "theirs") {
        setField(merged, spec.path, theirsValue === undefined ? null : JSON.parse(JSON.stringify(theirsValue)));
      }
      // "ours" (or unresolved) keeps the Main head value already in `merged`.
    }
  }

  return merged;
}

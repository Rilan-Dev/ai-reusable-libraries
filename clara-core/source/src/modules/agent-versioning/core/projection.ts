/**
 * src/modules/agent-versioning/core/projection.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Compatibility projection (migration plan Stage I — "Optional compatibility
 * projection").
 *
 * New configuration is AUTHORITATIVE: agent_drafts (Main branch) and
 * agent_versions. While the rollout is proven, every Main-branch draft save is
 * ALSO projected into the legacy stores (assistant_configs + agent_ai_settings)
 * so:
 *   - pre-migration runtime paths keep working unchanged (rollback safety),
 *   - the legacy ConfigEditor / SnapshotHistory UI stays coherent during the
 *     transition window.
 *
 * Rules honoured (migration plan §11):
 *   - provider secrets are NEVER mirrored (nothing here touches credentials);
 *   - no provider infrastructure records are created in organisation storage;
 *   - this projection has a removal deadline (Stage M) tracked in the plan.
 */

import { getAssistantConfigByAgent, patchAssistantConfig } from "@/modules/knowledge-bases/core/db";
import { getAgentAISettings, upsertAgentAISettings } from "@/modules/organisations/core/agent-ai-settings-db";
import { getOrgAISettings } from "@/modules/organisations/core/ai-settings-db";
import { query } from "@/lib/db";
import type { AgentVersionConfig } from "./types";

/**
 * Build the versioned configuration from the agent's CURRENT live stores.
 * Used by the data migration (Stage E) and by ensureAgentVersioning when an
 * agent enters the versioned world without a draft yet.
 */
export async function buildVersionConfigFromLive(agentId: string): Promise<AgentVersionConfig | null> {
  const { getAgentById } = await import("@/modules/organisations/core/db");
  const agent = await getAgentById(agentId);
  if (!agent) return null;

  const [assistant, aiSettings, orgSettings] = await Promise.all([
    getAssistantConfigByAgent(agentId),
    getAgentAISettings(agentId),
    getOrgAISettings(agent.orgId),
  ]);

  // Knowledge attachments are captured for informational diffs only.
  let kbIds: string[] = [];
  try {
    const rows = await query<{ id: string }>(
      "SELECT id FROM knowledge_bases WHERE agent_id = $1 AND status = 'active' ORDER BY created_at",
      [agentId],
    );
    kbIds = rows.map((r) => r.id);
  } catch {
    kbIds = [];
  }

  // No assistant row yet (brand-new agent) → null caller falls back to the
  // platform default assistant version.
  if (!assistant) return null;

  const { id: _ignoredId, agentId: _ignoredAgentId, createdAt: _c, updatedAt: _u, ...assistantData } = assistant;

  return {
    assistant: assistantData,
    ai: {
      provider: aiSettings?.provider ?? null,
      chatModel: aiSettings?.chatModel ?? null,
      embeddingModel: aiSettings?.embeddingModel ?? null,
      realtimeModel: aiSettings?.realtimeModel ?? null,
      transcriptionModel: aiSettings?.transcriptionModel ?? null,
      voiceProvider: aiSettings?.voiceProvider ?? null,
      voiceChatSttModel: aiSettings?.voiceChatSttModel ?? null,
      voiceChatTtsModel: aiSettings?.voiceChatTtsModel ?? null,
      voiceChatVoiceId: aiSettings?.voiceChatVoiceId ?? null,
      realtimeVoiceProvider: aiSettings?.realtimeVoiceProvider ?? null,
      realtimeLlmModel: aiSettings?.realtimeLlmModel ?? null,
      realtimeSttModel: aiSettings?.realtimeSttModel ?? null,
      realtimeTtsModel: aiSettings?.realtimeTtsModel ?? null,
      realtimeVoiceId: aiSettings?.realtimeVoiceId ?? null,
    },
    runtime: {
      enableVoice: orgSettings?.enableVoice ?? true,
      enableRealtime: orgSettings?.enableRealtime ?? true,
      enablePublicEmbed: orgSettings?.enablePublicEmbed ?? true,
    },
    knowledge: { kbIds },
  };
}

/**
 * Project a Main-branch configuration into the legacy stores.
 * Best-effort: projection failures are logged but never break the draft save
 * (the new stores stay authoritative either way).
 */
export async function projectDraftToLegacyStores(
  agentId: string,
  orgId: string,
  config: AgentVersionConfig,
): Promise<void> {
  try {
    const a = config.assistant;
    await patchAssistantConfig(agentId, {
      assistantName: a.assistantName,
      avatarUrl: a.avatarUrl,
      systemPrompt: a.systemPrompt,
      welcomeMessage: a.welcomeMessage,
      outOfScopeReply: a.outOfScopeReply,
      rules: a.rules,
      faqItems: a.faqItems ?? [],
      defaultLanguage: a.defaultLanguage,
      allowedLanguages: a.allowedLanguages,
      alwaysRespondIn: a.alwaysRespondIn,
      voiceId: a.voiceId,
      speed: a.speed,
      temperature: a.temperature,
      maxTokens: a.maxTokens,
      citeSources: a.citeSources,
      strictMode: a.strictMode,
      primaryColour: a.primaryColour,
      accentColour: a.accentColour,
      launcherColour: a.launcherColour,
      widgetTheme: a.widgetTheme,
      widgetPosition: a.widgetPosition,
      widgetButtonSize: a.widgetButtonSize,
      widgetBorderRadius: a.widgetBorderRadius,
      widgetFontFamily: a.widgetFontFamily,
      widgetChatHeight: a.widgetChatHeight,
      widgetShowBranding: a.widgetShowBranding,
      widgetLauncherLabel: a.widgetLauncherLabel,
      widgetMode: a.widgetMode,
      headerBg: a.headerBg,
      headerTextColor: a.headerTextColor,
      headerHeight: a.headerHeight,
      headerBlur: a.headerBlur,
      showStatusDot: a.showStatusDot,
      statusDotColor: a.statusDotColor,
      avatarShape: a.avatarShape,
      chatAreaBg: a.chatAreaBg,
      userBubbleBg: a.userBubbleBg,
      userBubbleText: a.userBubbleText,
      userBubbleRadius: a.userBubbleRadius,
      userBubblePadding: a.userBubblePadding,
      userBubbleShadow: a.userBubbleShadow,
      botBubbleBg: a.botBubbleBg,
      botBubbleText: a.botBubbleText,
      botBubbleRadius: a.botBubbleRadius,
      botBubbleBorder: a.botBubbleBorder,
      botBubblePadding: a.botBubblePadding,
      botBubbleShadow: a.botBubbleShadow,
      messageGap: a.messageGap,
      messageMaxWidth: a.messageMaxWidth,
      messageFontSize: a.messageFontSize,
      messageLineHeight: a.messageLineHeight,
      showTimestamps: a.showTimestamps,
      timestampColor: a.timestampColor,
      timestampFontSize: a.timestampFontSize,
      typingDotColor: a.typingDotColor,
      typingDotSize: a.typingDotSize,
      inputBg: a.inputBg,
      inputBorder: a.inputBorder,
      inputBorderFocus: a.inputBorderFocus,
      inputRadius: a.inputRadius,
      inputTextColor: a.inputTextColor,
      inputPlaceholderColor: a.inputPlaceholderColor,
      inputPadding: a.inputPadding,
      inputAreaBg: a.inputAreaBg,
      inputAreaBorder: a.inputAreaBorder,
      sendBtnBg: a.sendBtnBg,
      sendBtnHoverBg: a.sendBtnHoverBg,
      sendBtnTextColor: a.sendBtnTextColor,
      sendBtnRadius: a.sendBtnRadius,
      sendBtnSize: a.sendBtnSize,
      scrollbarWidth: a.scrollbarWidth,
      scrollbarColor: a.scrollbarColor,
      scrollbarTrackColor: a.scrollbarTrackColor,
      footerBg: a.footerBg,
      footerTextColor: a.footerTextColor,
      animationsEnabled: a.animationsEnabled,
      messageAnimationStyle: a.messageAnimationStyle,
      customCss: a.customCss,
      customLauncherSvg: a.customLauncherSvg,
      customHeaderHtml: a.customHeaderHtml,
      customFooterHtml: a.customFooterHtml,
      customThemeCss: a.customThemeCss,
      customInjectJs: a.customInjectJs,
      customPoweredBy: a.customPoweredBy,
      voiceBtnBg: a.voiceBtnBg ?? null,
      voiceBtnSize: a.voiceBtnSize ?? null,
      voiceBtnRadius: a.voiceBtnRadius ?? null,
      voiceBtnActiveColor: a.voiceBtnActiveColor ?? null,
      voicePanelBg: a.voicePanelBg ?? null,
      voiceWaveColor: a.voiceWaveColor ?? null,
    });
  } catch (err) {
    console.warn(
      `[agent-versioning] legacy assistant_configs projection failed for agent ${agentId}:`,
      (err as Error).message,
    );
  }

  try {
    if (config.ai) {
      await upsertAgentAISettings(agentId, orgId, {
        provider: config.ai.provider ?? null,
        chatModel: config.ai.chatModel ?? null,
        embeddingModel: config.ai.embeddingModel ?? null,
        realtimeModel: config.ai.realtimeModel ?? null,
        transcriptionModel: config.ai.transcriptionModel ?? null,
        voiceProvider: config.ai.voiceProvider ?? null,
        voiceChatSttModel: config.ai.voiceChatSttModel ?? null,
        voiceChatTtsModel: config.ai.voiceChatTtsModel ?? null,
        voiceChatVoiceId: config.ai.voiceChatVoiceId ?? null,
        realtimeVoiceProvider: config.ai.realtimeVoiceProvider ?? null,
        realtimeLlmModel: config.ai.realtimeLlmModel ?? null,
        realtimeSttModel: config.ai.realtimeSttModel ?? null,
        realtimeTtsModel: config.ai.realtimeTtsModel ?? null,
        realtimeVoiceId: config.ai.realtimeVoiceId ?? null,
      });
    }
  } catch (err) {
    console.warn(
      `[agent-versioning] legacy agent_ai_settings projection failed for agent ${agentId}:`,
      (err as Error).message,
    );
  }
}

/**
 * Reverse projection (legacy-first editors during the compat window):
 * a PATCH via the legacy /api/agents/:id/config route is mirrored into the
 * Main-branch draft so the new and old stores never diverge.
 */
export async function syncDraftFromLegacyPatch(agentId: string): Promise<void> {
  const { getMainBranch, getDraft, putDraft } = await import("./db");
  const main = await getMainBranch(agentId);
  if (!main) return; // agent not yet in the versioned world
  const live = await buildVersionConfigFromLive(agentId);
  if (!live) return;
  const current = await getDraft(agentId, main.id);
  // Only sync when the draft has no newer intent than the legacy store —
  // i.e. always take the freshly-patched live values, preserving knowledge.
  await putDraft({
    agentId,
    orgId: main.orgId,
    branchId: main.id,
    configuration: { ...live, knowledge: current?.configuration.knowledge ?? live.knowledge },
    parentVersionId: current?.parentVersionId ?? null,
    userId: current?.userId ?? null,
  });
}

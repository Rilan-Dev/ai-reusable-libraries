import { ProviderFactory } from "@/modules/ai-core/factory";
import { toProviderConfig } from "@/modules/ai-core/resolve";
import { resolveAIConfigCached } from "@/modules/ai-core/resolve-cache";
import type { ResolvedAIConfig } from "@/modules/ai-core/config-types";
import { resolveVoiceConfigCached } from "@/modules/voice-core/resolve";
import { groundClaraContext } from "@/modules/rag/grounding";
import { buildConversationAwareSearchQuery, buildRecentConversationContextBlock, recentMessages } from "@/modules/assistant/api/conversation-context";
import type { ChatMessage } from "@/modules/ai-core/types";

export interface ClaraRuntimeContext {
  orgId: string | null;
  agentId: string | null;
  kbId: string;
  userId?: string | null;
  sessionId?: string | null;
}

export interface ClaraAgentTurnRequest extends ClaraRuntimeContext {
  messages: ChatMessage[];
  surface?: "chat" | "realtime" | "embed";
  ragMode?: "classic" | "hybrid" | "agentic";
}

export interface ClaraAgentTurn {
  config: ResolvedAIConfig;
  providerName: string;
  model: string;
  stream: AsyncGenerator<string, void, unknown>;
  grounding: Awaited<ReturnType<typeof groundClaraContext>>;
}

/**
 * Concrete host binding for the reusable AI Platform Core.
 * It is intentionally outside the extracted Doable source.
 */
export const claraRuntime = {
  async resolveProvider(ctx: ClaraRuntimeContext, surface: "chat" | "realtime" | "embed" = "chat") {
    return resolveAIConfigCached({ kbId: ctx.kbId, orgId: ctx.orgId ?? undefined, surface });
  },

  async resolveVoice(ctx: ClaraRuntimeContext) {
    return resolveVoiceConfigCached({ kbId: ctx.kbId, orgId: ctx.orgId ?? undefined, surface: "realtime" });
  },

  async retrieve(
    ctx: ClaraRuntimeContext,
    query: string,
    options?: { topK?: number; ragMode?: "classic" | "hybrid" | "agentic"; channel?: "chat" | "voice" },
  ) {
    return groundClaraContext({
      kbId: ctx.kbId,
      query,
      searchQuery: query,
      topK: options?.topK ?? 8,
      ragMode: options?.ragMode ?? "hybrid",
      surface: options?.channel === "voice" ? "voice" : "search",
      sessionId: ctx.sessionId ?? null,
      userId: ctx.userId ?? null,
      admission: "external",
      channel: options?.channel ?? "chat",
    });
  },

  async createChatTurn(request: ClaraAgentTurnRequest): Promise<ClaraAgentTurn> {
    const config = await resolveAIConfigCached({
      kbId: request.kbId,
      orgId: request.orgId ?? undefined,
      surface: request.surface ?? "chat",
    });

    const messages = request.messages.filter((message) => message.content.trim());
    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
    if (!lastUserMessage) throw new Error("A user message is required.");

    const retrievalQuery = buildConversationAwareSearchQuery(messages, lastUserMessage.content);
    const grounding = await groundClaraContext({
      kbId: request.kbId,
      query: lastUserMessage.content,
      searchQuery: retrievalQuery,
      topK: request.surface === "realtime" ? 4 : 8,
      ragMode: request.ragMode ?? "hybrid",
      surface: request.surface === "embed" ? "embed" : request.surface === "realtime" ? "voice" : "workspace",
      sessionId: request.sessionId ?? null,
      userId: request.userId ?? null,
      admission: "external",
      channel: request.surface === "realtime" ? "voice" : "chat",
    });

    const provider = ProviderFactory.getProvider(toProviderConfig(config));
    const model = provider.getModelName("chat");
    const recentContext = buildRecentConversationContextBlock(messages);
    const evidence = grounding.ok
      ? grounding.result.sources.map((source, index) => "[S" + (index + 1) + "] " + source.snippet).join("\n\n")
      : "";

    const system = [
      config.assistantConfig?.systemPrompt ?? "You are Clara, a helpful AI assistant.",
      recentContext,
      evidence ? "Knowledge base context:\n" + evidence : "",
    ].filter(Boolean).join("\n\n");

    const stream = provider.chatStream(
      [{ role: "system", content: system }, ...recentMessages(messages)],
      {
        maxTokens: config.maxTokens ?? undefined,
        temperature: config.temperature ?? undefined,
      },
    );

    return { config, providerName: provider.getProviderName(), model, stream, grounding };
  },

  async startRealtimeSession(ctx: ClaraRuntimeContext) {
    const voice = await resolveVoiceConfigCached({
      kbId: ctx.kbId,
      orgId: ctx.orgId ?? undefined,
      surface: "realtime",
    });

    return {
      provider: voice.realtimeProvider,
      sessionEndpoint: "/api/realtime/session",
      voiceId: voice.openai?.voiceId ?? null,
      model: voice.openai?.realtimeModel ?? null,
    };
  },

  tools: {
    list() {
      return [{
        name: "rag_search",
        description: "Retrieve tenant-bound evidence from Clara's active knowledge base.",
      }];
    },

    async invoke(ctx: ClaraRuntimeContext, name: string, input: unknown) {
      if (name !== "rag_search") throw new Error("Unsupported Clara tool: " + name);
      const payload = input && typeof input === "object" ? input as Record<string, unknown> : {};
      const query = typeof payload.query === "string" ? payload.query.trim() : "";
      if (!query) throw new Error("rag_search requires a query.");
      return claraRuntime.retrieve(ctx, query, {
        ragMode: payload.ragMode === "classic" || payload.ragMode === "agentic" ? payload.ragMode : "hybrid",
        channel: "voice",
      });
    },
  },
} as const;

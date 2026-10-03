/**
 * src/modules/voice-core/providers/elevenlabs.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * ElevenLabs implementation of the VoiceProviderService interface — the
 * voice-axis counterpart of src/modules/ai-core/providers/openai.ts.
 *
 * Deliberately NO vendor SDK: plain fetch against a fixed base URL with an
 * explicit timeout (mirroring the discipline of ai-core providers — timeoutMs
 * + single-retry semantics handled by callers), so streaming endpoints never
 * turn into silent retry storms.
 *
 * Construct via VoiceProviderFactory (voice-core/factory.ts) — never
 * `new ElevenLabsVoiceProvider(...)` at call sites, exactly like LLM
 * providers are only constructed through ProviderFactory.
 */

import {
  getElevenLabsApiKey,
  getElevenLabsBaseUrl,
  getElevenLabsTimeoutMs,
} from "../model-catalog";
import type {
  ConversationalAgentCreateParams,
  ConversationalAgentRecord,
  ConversationalAgentUpdateParams,
  ConversationHistoryItem,
  ConversationListParams,
  ElevenLabsSubscriptionInfo,
  ElevenLabsVoice,
  SignedAgentSession,
  SpeakParams,
  TranscribeParams,
  TranscribeResult,
  TwilioCallRegistrationParams,
  TwilioNumberImportParams,
  TwilioOutboundCallParams,
  TwilioPhoneNumberRecord,
  VoiceCloneParams,
  VoiceCloneResult,
  VoiceDesignParams,
  VoiceDesignResult,
  VoiceProvider,
  VoiceProviderService,
  VoiceServiceConfig,
  WorkspaceWebhookParams,
  WorkspaceWebhookRecord,
} from "../types";

export class ElevenLabsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly bodyText?: string,
  ) {
    super(message);
    this.name = "ElevenLabsError";
  }
}

/** Signed-URL validity window — fixed by the vendor at 15 minutes (the
 *  expiry_seconds query param no longer exists on the endpoint). */
const AGENT_SIGNED_URL_TTL_SEC = 900;

/** Tool-call response budget the vendor waits before timing out the RAG
 *  bridge (vendor range: 5–300 s; RAG search p95 is well under 10 s). */
const RAG_TOOL_RESPONSE_TIMEOUT_SEC = 20;

/** Client events the Mode-B browser session relies on (useElevenLabsConvAI).
 *  Streaming text parts are NOT in the vendor default set, so they are
 *  opted into explicitly here. */
const AGENT_CLIENT_EVENTS = [
  "conversation_initiation_metadata",
  "ping",
  "audio",
  "interruption",
  "user_transcript",
  "agent_response",
  "agent_response_correction",
  "agent_response_complete",
  "agent_chat_response_part",
];

/**
 * Backoff before the single connect-level retry (ms). Short on purpose —
 * the failure mode this targets (undici connect timeout) already burned
 * ~10 s, so the retry must fire promptly to keep sentence TTS viable.
 */
const CONNECT_RETRY_BACKOFF_MS = 250;

/**
 * Node/undici error codes that mean the request NEVER reached the vendor
 * (DNS, routing, TCP connect). Retrying is then side-effect free for every
 * verb — nothing was generated, nothing was billed.
 *
 * Production evidence (HAR, 2026-09-18): bursts of 502
 * "ElevenLabs request failed … fetch failed" at ~10.3–10.6 s = undici's
 * default 10 s connect timeout — exactly this class of failure.
 */
const CONNECT_FAILURE_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
]);

function isConnectLevelFailure(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false; // undici network errors are TypeErrors
  const cause = (error as { cause?: unknown }).cause;
  if (cause == null || typeof cause !== "object") return false;
  if (CONNECT_FAILURE_CODES.has(String((cause as { code?: unknown }).code ?? ""))) return true;
  // Happy-eyeballs parallel connect failure surfaces as AggregateError of
  // per-address errors — retry on IPv6/IPv4 races too.
  if (Array.isArray((cause as { errors?: unknown }).errors)) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ElevenLabsVoiceProvider implements VoiceProviderService {
  private config: VoiceServiceConfig;
  private apiKey: string | undefined;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(config?: VoiceServiceConfig) {
    this.config = config ?? { provider: "elevenlabs" };
    // Config wins, env second — same precedence discipline as
    // OpenAIProvider (config.apiKey ?? process.env.OPENAI_API_KEY). Unlike
    // OpenAIProvider, a missing key does NOT throw here: the admin status
    // endpoint intentionally constructs the service to probe a platform
    // where the key is not yet configured, and the kill switch in
    // voice-core/resolve.ts rejects billable paths first. The key check
    // fires lazily on the first request instead (503 ElevenLabsError).
    this.apiKey = this.config.apiKey ?? getElevenLabsApiKey();
    this.baseUrl = this.config.baseUrl ?? getElevenLabsBaseUrl();
    const timeout = this.config.timeoutMs ?? getElevenLabsTimeoutMs();
    this.timeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout : 30_000;
  }

  // ─── Transport ───────────────────────────────────────────────────────────

  private requireApiKey(): string {
    if (!this.apiKey) {
      throw new ElevenLabsError(
        "ELEVENLABS_API_KEY is not set. Add it to your environment or the platform settings page.",
        503,
      );
    }
    return this.apiKey;
  }

  private async elevenLabsFetch(
    path: string,
    init: RequestInit & { timeoutMs?: number } = {},
    /** Internal: single retry budget for connect-level failures. */
    allowConnectRetry = true,
  ): Promise<Response> {
    const { timeoutMs = this.timeoutMs, ...rest } = init;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...rest,
        signal: controller.signal,
        headers: {
          "xi-api-key": this.requireApiKey(),
          ...(rest.headers ?? {}),
        },
      });
      if (!response.ok) {
        // Do NOT include the response body verbatim — vendor errors can
        // echo request fragments. Keep it short + status-coded.
        throw new ElevenLabsError(
          `ElevenLabs API error (${response.status} ${response.statusText}) on ${path}`,
          response.status,
        );
      }
      return response;
    } catch (error) {
      if (error instanceof ElevenLabsError) throw error;
      if ((error as Error).name === "AbortError") {
        throw new ElevenLabsError(`ElevenLabs request timed out after ${timeoutMs}ms on ${path}`, 504);
      }
      // Connect-level failure: the request never reached the vendor, so ONE
      // bounded retry is safe for every endpoint (no double generation, no
      // double billing). Only our own AbortController timeouts (504 above)
      // and vendor HTTP errors (ElevenLabsError) skip this path.
      if (allowConnectRetry && isConnectLevelFailure(error)) {
        await sleep(CONNECT_RETRY_BACKOFF_MS);
        return this.elevenLabsFetch(path, init, false);
      }
      throw new ElevenLabsError(`ElevenLabs request failed on ${path}: ${(error as Error).message}`, 502);
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── Subscription / connection test ──────────────────────────────────────

  async getSubscriptionInfo(): Promise<ElevenLabsSubscriptionInfo> {
    const response = await this.elevenLabsFetch("/v1/user/subscription");
    const data = (await response.json()) as Record<string, unknown>;
    return {
      tier: String(data.tier ?? "unknown"),
      characterCount: Number(data.character_count ?? 0),
      characterLimit: Number(data.character_limit ?? 0),
      nextCharacterCountResetUnix:
        data.next_character_count_reset_unix != null
          ? Number(data.next_character_count_reset_unix)
          : null,
      voiceLimit: Number(data.voice_limit ?? 0),
      canUseInstantCloning: Boolean(data.can_use_instant_cloning ?? false),
    };
  }

  // ─── Voice catalog ───────────────────────────────────────────────────────

  private normalizeVoice(raw: Record<string, unknown>): ElevenLabsVoice {
    const labels: Record<string, string> = {};
    if (raw.labels && typeof raw.labels === "object" && !Array.isArray(raw.labels)) {
      for (const [key, value] of Object.entries(raw.labels as Record<string, unknown>)) {
        if (typeof value === "string") labels[key] = value;
      }
    }
    return {
      voiceId: String(raw.voice_id ?? ""),
      name: String(raw.name ?? "Unnamed voice"),
      category: typeof raw.category === "string" ? raw.category : null,
      labels,
      description: typeof raw.description === "string" ? raw.description : null,
      previewUrl: typeof raw.preview_url === "string" ? raw.preview_url : null,
    };
  }

  async listVoices(): Promise<ElevenLabsVoice[]> {
    const response = await this.elevenLabsFetch("/v1/voices?page_size=100");
    const data = (await response.json()) as { voices?: Record<string, unknown>[] };
    return (data.voices ?? []).map((raw) => this.normalizeVoice(raw));
  }

  // ─── Speech-to-text (Scribe) ─────────────────────────────────────────────

  async transcribeAudio(params: TranscribeParams): Promise<TranscribeResult> {
    const form = new FormData();
    form.append("file", params.file, "audio.webm");
    form.append("model_id", params.modelId);
    if (params.languageCode) form.append("language_code", params.languageCode);
    form.append("diarize", "false");

    const response = await this.elevenLabsFetch("/v1/speech-to-text", {
      method: "POST",
      body: form,
      // Long audio legitimately needs more headroom than JSON calls.
      timeoutMs: Math.max(this.timeoutMs, 90_000),
    });

    const data = (await response.json()) as Record<string, unknown>;
    const languageProbe = data.language_code ?? data.language;
    return {
      text: String(data.text ?? ""),
      languageCode: typeof languageProbe === "string" ? languageProbe : null,
      durationSeconds:
        data.info && typeof data.info === "object"
          ? Number((data.info as Record<string, unknown>).audio_seconds ?? 0) || null
          : null,
    };
  }

  // ─── Text-to-speech ──────────────────────────────────────────────────────

  async speak(params: SpeakParams): Promise<Response> {
    // Streaming PCM/MP3 response — returned raw so the route handler can pipe
    // it through without buffering the whole clip in memory.
    return this.elevenLabsFetch(
      `/v1/text-to-speech/${encodeURIComponent(params.voiceId)}?output_format=${encodeURIComponent(params.outputFormat)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: params.text,
          model_id: params.modelId,
          ...(params.languageCode ? { language_code: params.languageCode } : {}),
          voice_settings: {
            ...(params.stability != null ? { stability: params.stability } : {}),
            ...(params.similarityBoost != null ? { similarity_boost: params.similarityBoost } : {}),
            ...(params.style != null ? { style: params.style } : {}),
            ...(params.speed != null ? { speed: params.speed } : {}),
            ...(params.speakerBoost != null ? { use_speaker_boost: params.speakerBoost } : {}),
          },
        }),
      },
    );
  }

  // ─── Identity ────────────────────────────────────────────────────────────

  getProviderName(): VoiceProvider {
    return "elevenlabs";
  }

  // ─── Mode B: Conversational AI agents (V4, modernised 2026-09) ────────

  private normalizeAgent(raw: Record<string, unknown>): ConversationalAgentRecord {
    const config = (raw.conversation_config ?? {}) as Record<string, unknown>;
    const tts = (config.tts ?? {}) as Record<string, unknown>;
    const agent = (config.agent ?? {}) as Record<string, unknown>;
    const prompt = (agent.prompt ?? {}) as Record<string, unknown>;
    // Current schema: agent.prompt.prompt + agent.first_message (string).
    // Legacy schema fallback: agent.prompt.system_prompt + prompt.first_message.text.
    const legacyFirst = (prompt.first_message ?? {}) as Record<string, unknown>;
    const language = (agent.language ?? config.language) as unknown;
    const rawFirstMessage = agent.first_message ?? legacyFirst.text;
    return {
      agentId: String(raw.agent_id ?? ""),
      name: String(raw.name ?? "Unnamed agent"),
      voiceId: typeof tts.voice_id === "string" ? tts.voice_id : null,
      language: typeof language === "string" ? language : null,
      firstMessage: typeof rawFirstMessage === "string" ? rawFirstMessage : null,
      systemPrompt: typeof prompt.prompt === "string"
        ? prompt.prompt
        : typeof prompt.system_prompt === "string"
          ? prompt.system_prompt
          : null,
      raw,
    };
  }

  async listConversationalAgents(): Promise<ConversationalAgentRecord[]> {
    const response = await this.elevenLabsFetch("/v1/convai/agents?page_size=100");
    const data = (await response.json()) as { agents?: Record<string, unknown>[] };
    return (data.agents ?? []).map((raw) => this.normalizeAgent(raw));
  }

  /**
   * Current API discipline (2026-09, verified against the official docs):
   *   1. Tools are created SEPARATELY (POST /v1/convai/tools) and attached
   *      to the agent via conversation_config.agent.prompt.tool_ids — the
   *      legacy inline `tools[]` create body is dead and silently dropped.
   *   2. The RAG bridge authenticates with a static secret header
   *      (x-clara-tool-token) — the vendor cannot sign tool calls with our
   *      per-request HMAC scheme. Tenant ids ride along as constant headers
   *      and are re-validated against the elevenlabs_agents binding on every
   *      callback, so a leaked tool config cannot retarget another tenant.
   *   3. platform_settings.auth.enable_auth = true — sessions must be
   *      minted through get-signed-url (never a bare agent_id from the
   *      browser).
   */
  async createConversationalAgent(
    params: ConversationalAgentCreateParams,
  ): Promise<ConversationalAgentRecord> {
    // ── 1. RAG webhook tool (workspace-scoped, reusable across agents) ────
    const toolBody = {
      tool_config: {
        type: "webhook",
        name: "clara_rag_search",
        description:
          "Searches the organisation's Clara knowledge base and returns grounded answer snippets. " +
          "Use it for every question about the organisation, its products, policies, or documents.",
        api_schema: {
          url: params.ragTool.url,
          method: "POST",
          request_headers: {
            "x-clara-tool-token": params.ragTool.secret,
            "x-clara-org-id": params.ragTool.orgId,
            "x-clara-kb-id": params.ragTool.kbId,
            ...(params.ragTool.agentId ? { "x-clara-agent-id": params.ragTool.agentId } : {}),
          },
          request_body_schema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The user's question, phrased as a self-contained search query.",
              },
            },
            required: ["query"],
          },
          response_timeout_secs: RAG_TOOL_RESPONSE_TIMEOUT_SEC,
        },
      },
    };
    const toolResponse = await this.elevenLabsFetch("/v1/convai/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toolBody),
    });
    const toolData = (await toolResponse.json()) as Record<string, unknown>;
    const toolId =
      typeof toolData.id === "string" ? toolData.id
        : typeof toolData.tool_id === "string" ? toolData.tool_id : "";
    if (!toolId) {
      throw new ElevenLabsError("Conversational tool creation did not return a tool id.", 502);
    }

    // ── 2. Agent (references the tool; turn-taking owned by the vendor) ──
    const agentPrompt: Record<string, unknown> = { tool_ids: [toolId] };
    if (params.systemPrompt) agentPrompt.prompt = params.systemPrompt;
    const conversationConfig: Record<string, unknown> = {
      tts: { voice_id: params.voiceId },
      conversation: { client_events: AGENT_CLIENT_EVENTS },
      agent: {
        ...(params.language ? { language: params.language } : {}),
        ...(params.firstMessage != null && params.firstMessage !== ""
          ? { first_message: params.firstMessage }
          : {}),
        prompt: agentPrompt,
      },
    };
    if (params.telephony) {
      // Twilio Media Streams are μ-law 8 kHz in both directions.
      conversationConfig.asr = { user_input_audio_format: "ulaw_8000" };
      conversationConfig.tts = { ...conversationConfig.tts as Record<string, unknown>, agent_output_audio_format: "ulaw_8000" };
    }

    const body = {
      name: params.name,
      conversation_config: conversationConfig,
      platform_settings: { auth: { enable_auth: true } },
    };
    const response = await this.elevenLabsFetch("/v1/convai/agents/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as Record<string, unknown>;

    // ── 3. Native Twilio import (optional; register-call needs no import) ─
    if (params.twilio && params.twilio.phoneNumbers.length > 0) {
      for (const number of params.twilio.phoneNumbers) {
        await this.importTwilioPhoneNumber({
          label: `${params.name} (${number})`,
          phoneNumber: number,
          sid: process.env.TWILIO_ACCOUNT_SID ?? "",
          token: process.env.TWILIO_AUTH_TOKEN ?? "",
        }).catch((err) => {
          // Non-fatal: the agent exists; number import can be retried via
          // the admin panel. Surface but never roll the agent back.
          console.warn("[elevenlabs] Twilio number import failed:", (err as Error).message);
        });
      }
    }

    return this.normalizeAgent(data);
  }

  async updateConversationalAgent(
    agentId: string,
    params: ConversationalAgentUpdateParams,
  ): Promise<ConversationalAgentRecord> {
    const conversationConfig: Record<string, unknown> = {};
    if (params.voiceId != null) conversationConfig.tts = { voice_id: params.voiceId };

    const agent: Record<string, unknown> = {};
    const prompt: Record<string, unknown> = {};
    if (params.systemPrompt !== undefined) prompt.prompt = params.systemPrompt ?? "";
    if (Object.keys(prompt).length > 0) agent.prompt = prompt;
    if (params.firstMessage !== undefined) agent.first_message = params.firstMessage ?? "";
    if (params.language != null) agent.language = params.language;
    if (Object.keys(agent).length > 0) conversationConfig.agent = agent;

    const body: Record<string, unknown> = {};
    if (params.name != null) body.name = params.name;
    if (Object.keys(conversationConfig).length > 0) body.conversation_config = conversationConfig;

    const response = await this.elevenLabsFetch(
      `/v1/convai/agents/${encodeURIComponent(agentId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = (await response.json()) as Record<string, unknown>;
    return this.normalizeAgent(data);
  }

  async deleteConversationalAgent(agentId: string): Promise<void> {
    await this.elevenLabsFetch(`/v1/convai/agents/${encodeURIComponent(agentId)}`, {
      method: "DELETE",
    });
  }

  async getAgentSignedUrl(agentId: string): Promise<SignedAgentSession> {
    // Endpoint moved (2026-09): /v1/convai/conversation/get-signed-url?agent_id=…
    // The legacy per-agent /get-signed-url?expiry_seconds=N path 404s, which
    // used to make every Mode-B session mint fail and fall back to Mode A.
    // The vendor fixes validity at 15 minutes — no expiry parameter exists.
    const response = await this.elevenLabsFetch(
      `/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    );
    const data = (await response.json()) as Record<string, unknown>;
    const signedUrl = typeof data.signed_url === "string" ? data.signed_url : "";
    if (!signedUrl) {
      throw new ElevenLabsError("Signed URL was not returned by the vendor.", 502);
    }
    return {
      signedUrl,
      agentId,
      expiresAt: Date.now() + AGENT_SIGNED_URL_TTL_SEC * 1000,
    };
  }

  // ─── Mode B: telephony (register-call + native Twilio) ───────────────────

  async registerTwilioCall(params: TwilioCallRegistrationParams): Promise<string> {
    const body = {
      agent_id: params.agentId,
      from_number: params.fromNumber,
      to_number: params.toNumber,
      direction: params.direction,
      conversation_initiation_client_data: {
        // Twilio Media Streams are μ-law 8 kHz on the wire; the agent's
        // browser sessions keep PCM 16 kHz. The per-call override pins the
        // phone leg's audio formats without reconfiguring the agent.
        conversation_config_override: {
          asr: { user_input_audio_format: "ulaw_8000" },
          tts: { agent_output_audio_format: "ulaw_8000" },
        },
        ...(params.dynamicVariables && Object.keys(params.dynamicVariables).length > 0
          ? { dynamic_variables: params.dynamicVariables }
          : {}),
      },
    };
    const response = await this.elevenLabsFetch("/v1/convai/twilio/register-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const twiml = await response.text();
    if (!twiml.includes("<Response")) {
      throw new ElevenLabsError("register-call did not return TwiML.", 502);
    }
    return twiml;
  }

  async importTwilioPhoneNumber(params: TwilioNumberImportParams): Promise<TwilioPhoneNumberRecord> {
    if (!params.sid || !params.token) {
      throw new ElevenLabsError(
        "Twilio credentials (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN) are required to import a number.",
        400,
      );
    }
    const body = {
      provider: "twilio",
      label: params.label,
      phone_number: params.phoneNumber,
      sid: params.sid,
      token: params.token,
    };
    const response = await this.elevenLabsFetch("/v1/convai/phone-numbers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as Record<string, unknown>;
    const phoneNumberId =
      typeof data.phone_number_id === "string" ? data.phone_number_id
        : typeof data.id === "string" ? data.id : "";
    if (!phoneNumberId) {
      throw new ElevenLabsError("Phone number import did not return an id.", 502);
    }
    return {
      phoneNumberId,
      label: typeof data.label === "string" ? data.label : null,
      phoneNumber: typeof data.phone_number === "string" ? data.phone_number : params.phoneNumber,
      agentId: typeof data.agent_id === "string" ? data.agent_id : null,
      raw: data,
    };
  }

  async startTwilioOutboundCall(params: TwilioOutboundCallParams): Promise<{ callId: string }> {
    const body = {
      agent_id: params.agentId,
      agent_phone_number_id: params.agentPhoneNumberId,
      to_number: params.toNumber,
    };
    const response = await this.elevenLabsFetch("/v1/convai/twilio/outbound-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as Record<string, unknown>;
    const callId =
      typeof data.call_id === "string" ? data.call_id
        : typeof data.conversation_id === "string" ? data.conversation_id : "";
    if (!callId) {
      throw new ElevenLabsError("Outbound call initiation did not return a call id.", 502);
    }
    return { callId };
  }

  async createWorkspaceWebhook(params: WorkspaceWebhookParams): Promise<WorkspaceWebhookRecord> {
    const body = {
      settings: {
        auth_type: "hmac",
        name: params.name,
        webhook_url: params.url,
      },
    };
    const response = await this.elevenLabsFetch("/v1/workspace/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as Record<string, unknown>;
    const webhookId =
      typeof data.webhook_id === "string" ? data.webhook_id
        : typeof data.id === "string" ? data.id : "";
    if (!webhookId) {
      throw new ElevenLabsError("Workspace webhook creation did not return an id.", 502);
    }
    return {
      webhookId,
      webhookSecret: typeof data.webhook_secret === "string" ? data.webhook_secret : null,
    };
  }

  // ─── Mode B: conversation history (V5) ───────────────────────────────────

  async listConversations(
    params?: ConversationListParams,
  ): Promise<ConversationHistoryItem[]> {
    const search = new URLSearchParams({ page_size: String(params?.pageSize ?? 50) });
    if (params?.agentId) search.set("agent_id", params.agentId);
    const response = await this.elevenLabsFetch(`/v1/convai/conversations?${search.toString()}`);
    const data = (await response.json()) as { conversations?: Record<string, unknown>[] };
    return (data.conversations ?? []).map((raw) => ({
      conversationId: String(raw.conversation_id ?? ""),
      agentId: typeof raw.agent_id === "string" ? raw.agent_id : null,
      status: typeof raw.status === "string" ? raw.status : null,
      startedAtUnix:
        typeof raw.started_at === "number" ? raw.started_at
          : typeof raw.started_at === "string" && !Number.isNaN(Date.parse(raw.started_at))
            ? Math.floor(Date.parse(raw.started_at) / 1000)
            : null,
      endedAtUnix:
        typeof raw.ended_at === "number" ? raw.ended_at
          : typeof raw.ended_at === "string" && !Number.isNaN(Date.parse(raw.ended_at))
            ? Math.floor(Date.parse(raw.ended_at) / 1000)
            : null,
      raw,
    }));
  }

  // ─── Voice cloning / design (V5) ─────────────────────────────────────────

  async cloneVoice(params: VoiceCloneParams): Promise<VoiceCloneResult> {
    if (params.files.length === 0) {
      throw new ElevenLabsError("At least one consented reference audio file is required.", 400);
    }
    const form = new FormData();
    form.append("name", params.name);
    if (params.description) form.append("description", params.description);
    for (const file of params.files) form.append("files", file.blob, file.filename);
    for (const [key, value] of Object.entries(params.labels ?? {})) {
      form.append("labels", JSON.stringify({ [key]: value }));
    }

    const response = await this.elevenLabsFetch("/v1/voices/add", {
      method: "POST",
      body: form,
      timeoutMs: Math.max(this.timeoutMs, 120_000),
    });
    const data = (await response.json()) as Record<string, unknown>;
    const voiceId = typeof data.voice_id === "string" ? data.voice_id : "";
    if (!voiceId) {
      throw new ElevenLabsError("Cloning response did not include a voice id.", 502);
    }
    return {
      voiceId,
      requiresVerification: Boolean(data.requires_verification ?? false),
    };
  }

  async designVoice(params: VoiceDesignParams): Promise<VoiceDesignResult> {
    const response = await this.elevenLabsFetch("/v1/text-to-voice/design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: params.name,
        text_description: params.textPrompt,
        ...(params.options ?? {}),
      }),
      // Design samples take longer than plain TTS calls.
      timeoutMs: Math.max(this.timeoutMs, 120_000),
    });
    const data = (await response.json()) as Record<string, unknown>;
    // Both response shapes are handled: the documented legacy {media_ids}
    // and the newer per-request {voice_id, samples}.
    const voiceId = typeof data.voice_id === "string" ? data.voice_id : "";
    if (!voiceId) {
      throw new ElevenLabsError("Voice Design response did not include a voice id.", 502);
    }
    const mediaIds = Array.isArray(data.media_ids)
      ? data.media_ids.filter((id): id is string => typeof id === "string")
      : [];
    return { voiceId, sampleMediaIds: mediaIds };
  }

  async deleteVoice(voiceId: string): Promise<void> {
    await this.elevenLabsFetch(`/v1/voices/${encodeURIComponent(voiceId)}`, {
      method: "DELETE",
    });
  }
}

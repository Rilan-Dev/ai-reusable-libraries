export type OpenAIRealtimeFunctionTool = {
  type: "function";
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

export type OpenAIRealtimeTurnDetection = {
  type: "server_vad";
  threshold?: number;
  prefix_padding_ms?: number;
  silence_duration_ms?: number;
  create_response?: boolean;
  interrupt_response?: boolean;
};

type OpenAIRealtimeTranscription = {
  model: string;
  language?: string;
  prompt?: string;
};

export type OpenAIRealtimeSessionOptions = {
  model: string;
  voice?: string;
  instructions?: string;
  maxOutputTokens?: number | "inf" | null;
  transcription?: OpenAIRealtimeTranscription | null;
  turnDetection?: OpenAIRealtimeTurnDetection | null;
  tools?: OpenAIRealtimeFunctionTool[];
  toolChoice?: "auto" | "none" | "required" | Record<string, unknown>;
  outputModalities?: Array<"audio" | "text">;
};

type OpenAIRealtimeClientSecretResponse = {
  value?: string;
  expires_at?: number;
  session?: Record<string, unknown>;
};

type OpenAIRealtimeRequestFailure = {
  ok: false;
  status: number;
  errorText: string;
};

type OpenAIRealtimeRequestSuccess = {
  ok: true;
  data: Record<string, unknown>;
};

type OpenAIRealtimeRequestResult =
  | OpenAIRealtimeRequestFailure
  | OpenAIRealtimeRequestSuccess;

function cleanRecord<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) {
      delete record[key];
    }
  }
  return record;
}

function normalizeMaxOutputTokens(
  value: number | "inf" | null | undefined,
): number | "inf" | undefined {
  if (value === "inf") return "inf";
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(Math.max(Math.round(value), 1), 4096);
}

export function buildOpenAIRealtimeSession(
  options: OpenAIRealtimeSessionOptions,
): Record<string, unknown> {
  const inputAudio = cleanRecord({
    transcription: options.transcription ?? undefined,
    turn_detection: options.turnDetection,
  });

  const audio = cleanRecord({
    input: Object.keys(inputAudio).length > 0 ? inputAudio : undefined,
    output: options.voice ? { voice: options.voice } : undefined,
  });

  return cleanRecord({
    type: "realtime",
    model: options.model,
    instructions: options.instructions,
    output_modalities: options.outputModalities ?? ["audio"],
    audio: Object.keys(audio).length > 0 ? audio : undefined,
    max_output_tokens: normalizeMaxOutputTokens(options.maxOutputTokens),
    tools: options.tools,
    tool_choice: options.toolChoice,
  });
}

export function extractOpenAIRealtimeClientSecret(
  session: Record<string, unknown>,
): string | null {
  const clientSecret = session.client_secret;
  if (typeof clientSecret === "string" && clientSecret) return clientSecret;
  if (
    clientSecret &&
    typeof clientSecret === "object" &&
    "value" in clientSecret &&
    typeof clientSecret.value === "string" &&
    clientSecret.value
  ) {
    return clientSecret.value;
  }
  if (typeof session.value === "string" && session.value) return session.value;
  if (typeof session.ephemeralKey === "string" && session.ephemeralKey) {
    return session.ephemeralKey;
  }
  return null;
}

export async function createOpenAIRealtimeClientSecret(params: {
  apiKey: string;
  session: Record<string, unknown>;
  safetyIdentifier?: string | null;
}): Promise<OpenAIRealtimeRequestResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.apiKey}`,
    "Content-Type": "application/json",
  };
  if (params.safetyIdentifier) {
    headers["OpenAI-Safety-Identifier"] = params.safetyIdentifier;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers,
      body: JSON.stringify({ session: params.session }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        errorText: await response.text(),
      };
    }

    const payload = (await response.json()) as OpenAIRealtimeClientSecretResponse;
    const clientSecret = payload.value ?? "";
    const session = payload.session ?? {};

    return {
      ok: true,
      data: {
        ...session,
        value: clientSecret,
        expires_at: payload.expires_at,
        client_secret: {
          value: clientSecret,
          expires_at: payload.expires_at,
        },
        ephemeralKey: clientSecret,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        status: 504,
        errorText: "Timed out while contacting OpenAI Realtime after 15 seconds.",
      };
    }

    return {
      ok: false,
      status: 502,
      errorText: error instanceof Error ? error.message : "Failed to contact OpenAI Realtime.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function exchangeOpenAIRealtimeSdp(params: {
  apiKey: string;
  sdpOffer: string;
  session: Record<string, unknown>;
  safetyIdentifier?: string | null;
}): Promise<OpenAIRealtimeRequestResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.apiKey}`,
  };
  if (params.safetyIdentifier) {
    headers["OpenAI-Safety-Identifier"] = params.safetyIdentifier;
  }

  const formData = new FormData();
  formData.set("sdp", params.sdpOffer);
  formData.set("session", JSON.stringify(params.session));

  const response = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      errorText: await response.text(),
    };
  }

  return {
    ok: true,
    data: {
      sdpAnswer: await response.text(),
      callId: response.headers.get("location") ?? null,
    },
  };
}

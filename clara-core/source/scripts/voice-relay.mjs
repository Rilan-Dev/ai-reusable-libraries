/**
 * scripts/voice-relay.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side voice relay.  Runs inside the Node.js process alongside Next.js.
 *
 * Security properties:
 *   • OpenAI / Gemini API keys never leave the server
 *   • System prompt / KB instructions never leave the server
 *   • Model names, voice IDs, temperature never leave the server
 *   • RAG tool calls resolved entirely server-side
 *   • Rate limiting enforced through /api/embed/voice-init on every connection
 *   • Browser only ever sends: PCM16 audio bytes | text | interrupt
 *   • Browser only ever receives: PCM16 audio bytes | transcript events | status
 *
 * Browser ←WebSocket→ Relay ←WebSocket→ OpenAI / Gemini
 */

import WebSocket from "ws";

const PORT    = process.env.PORT    ?? 3000;
const BASE    = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://127.0.0.1:${PORT}`;
const GEMINI_WSS =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";
const GEMINI_IN_HZ  = 16_000;
const GEMINI_OUT_HZ = 24_000;

// ── Entry point called from start.mjs ────────────────────────────────────────
export async function handleVoiceConnection(browserWs, req) {
  const url    = new URL(req.url, BASE);
  const apiKey = url.searchParams.get("key") ?? "";

  if (!apiKey) {
    send(browserWs, { type: "error", message: "Missing API key" });
    browserWs.close(1008, "Missing API key");
    return;
  }

  // ── 1. Validate key + get voice config (server-to-server call) ───────────
  let cfg;
  try {
    const res = await fetch(`${BASE}/api/embed/voice-init`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      send(browserWs, { type: "error", message: err.error ?? "Auth failed" });
      browserWs.close(1008, "Auth failed");
      return;
    }
    cfg = await res.json();
  } catch (e) {
    send(browserWs, { type: "error", message: "Could not reach backend" });
    browserWs.close(1011, "Backend unreachable");
    return;
  }

  send(browserWs, { type: "status", value: "connecting" });

  // ── 2. Branch by provider ─────────────────────────────────────────────────
  try {
    if (cfg.provider === "gemini") {
      await relayGemini(browserWs, cfg, apiKey);
    } else {
      await relayOpenAI(browserWs, cfg, apiKey);
    }
  } catch (e) {
    console.error("[voice-relay] fatal:", e);
    send(browserWs, { type: "error", message: "Voice session failed" });
    if (browserWs.readyState === WebSocket.OPEN) browserWs.close(1011);
  }
}

// ── OpenAI Realtime Relay ─────────────────────────────────────────────────────

async function relayOpenAI(browserWs, cfg, apiKey) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    send(browserWs, { type: "error", message: "Voice not configured on server" });
    browserWs.close(1011); return;
  }

  // Connect server→OpenAI via WebSocket (long-term key, stays on server)
  const upstream = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(cfg.model)}`,
    {
      headers: {
        Authorization: `Bearer ${openaiKey}`,
      },
    }
  );

  let upstreamReady = false;

  // Buffer browser audio until upstream is ready
  const audioQueue = [];

  upstream.on("open", () => {
    upstreamReady = true;

    // Configure session — KB instructions, RAG tool, VAD — all server-side
    upstream.send(JSON.stringify({
      type: "session.update",
      session: {
        type: "realtime",
        output_modalities: ["audio"],
        max_output_tokens: cfg.maxTokens,
        instructions: cfg.systemPrompt,
        audio: {
          output: { voice: cfg.voice },
          input: {
            turn_detection: {
              type:               "server_vad",
              threshold:          0.5,
              prefix_padding_ms:  300,
              silence_duration_ms: 700,
              create_response:    false,  // relay handles response.create
            },
            transcription: {
              model:    cfg.transcriptionModel,
              // Omitted = auto-detect (multi-language assistants).
              ...(cfg.language ? { language: cfg.language } : {}),
            },
          },
        },
        tools: [{
          type:        "function",
          name:        "rag_search",
          description: `Search the "${cfg.kbName}" knowledge base. ALWAYS call this before answering.`,
          parameters: {
            type:       "object",
            properties: { query: { type: "string" } },
            required:   ["query"],
          },
        }],
      },
    }));

    // Drain any buffered audio
    while (audioQueue.length > 0) {
      upstream.send(audioQueue.shift());
    }

    send(browserWs, { type: "status", value: "connected" });
  });

  upstream.on("message", async (data) => {
    const str = data.toString();
    let ev;
    try { ev = JSON.parse(str); } catch { return; }
    await handleOpenAIEvent(ev, upstream, browserWs, cfg, apiKey);
  });

  upstream.on("error", (e) => {
    console.error("[relay/openai] upstream error:", e.message);
    send(browserWs, { type: "error", message: "Upstream connection error" });
    if (browserWs.readyState === WebSocket.OPEN) browserWs.close(1011);
  });

  upstream.on("close", () => {
    send(browserWs, { type: "status", value: "idle" });
    if (browserWs.readyState === WebSocket.OPEN) browserWs.close(1000);
  });

  // Handle messages from browser
  browserWs.on("message", (data, isBinary) => {
    if (upstream.readyState !== WebSocket.OPEN) return;

    if (isBinary) {
      // Raw PCM16 audio — base64-encode and send to OpenAI
      const b64 = data.toString("base64");
      const msg = JSON.stringify({ type: "input_audio_buffer.append", audio: b64 });
      if (upstreamReady) upstream.send(msg);
      else audioQueue.push(msg);
      return;
    }

    // Text control messages
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "interrupt") {
        upstream.send(JSON.stringify({ type: "response.cancel" }));
        upstream.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
      } else if (msg.type === "text") {
        upstream.send(JSON.stringify({
          type: "conversation.item.create",
          item: { type: "message", role: "user", content: [{ type: "input_text", text: msg.content }] },
        }));
        upstream.send(JSON.stringify({ type: "response.create" }));
        send(browserWs, { type: "transcript.user", itemId: `txt_${Date.now()}`, text: msg.content });
      } else if (msg.type === "ping") {
        send(browserWs, { type: "pong" });
      }
    } catch { /* ignore malformed */ }
  });

  browserWs.on("close", () => {
    if (upstream.readyState === WebSocket.OPEN) upstream.close(1000);
  });
}

// ── OpenAI Realtime event handler ─────────────────────────────────────────────

async function handleOpenAIEvent(ev, upstream, browserWs, cfg, apiKey) {
  switch (ev.type) {

    // Audio committed by VAD → trigger AI response (client never sees this)
    case "input_audio_buffer.committed":
      upstream.send(JSON.stringify({ type: "response.create" }));
      break;

    // AI audio chunk → forward to browser as base64.
    // GA names (response.output_*) and beta names are both accepted.
    case "response.output_audio.delta":
    case "response.audio.delta":
      send(browserWs, { type: "audio", data: ev.delta });
      send(browserWs, { type: "status", value: "speaking" });
      break;

    case "response.output_audio.done":
    case "response.audio.done":
      send(browserWs, { type: "status", value: "listening" });
      break;

    // User speech transcription → forward to browser
    case "conversation.item.input_audio_transcription.completed": {
      const text = ev.transcript ?? "";
      if (text.trim()) send(browserWs, { type: "transcript.user", itemId: ev.item_id, text });
      break;
    }

    // AI text transcript streaming → forward to browser
    case "response.output_audio_transcript.delta":
    case "response.audio_transcript.delta":
      send(browserWs, { type: "transcript.ai.delta", responseId: ev.response_id, delta: ev.delta });
      break;

    case "response.output_audio_transcript.done":
    case "response.audio_transcript.done":
      send(browserWs, { type: "transcript.ai.done", responseId: ev.response_id });
      break;

    // RAG tool call — handled entirely server-side, browser never knows
    case "response.function_call_arguments.done": {
      const callId = ev.call_id ?? "";
      let args = {};
      try { args = JSON.parse(ev.arguments ?? "{}"); } catch {}
      if (callId && args.query) {
        const answer = await serverRagSearch(args.query, apiKey);
        upstream.send(JSON.stringify({
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: callId, output: answer },
        }));
        upstream.send(JSON.stringify({ type: "response.create" }));
      }
      break;
    }

    // VAD speech detected → let browser know user is speaking
    case "input_audio_buffer.speech_started":
      send(browserWs, { type: "status", value: "listening" });
      break;

    case "error":
      console.error("[relay/openai] event error:", ev.error);
      send(browserWs, { type: "error", message: ev.error?.message ?? "OpenAI error" });
      break;
  }
}

// ── Gemini Live Relay ─────────────────────────────────────────────────────────

async function relayGemini(browserWs, cfg, apiKey) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    send(browserWs, { type: "error", message: "Gemini voice not configured" });
    browserWs.close(1011); return;
  }

  const model  = cfg.geminiModel.startsWith("models/") ? cfg.geminiModel : `models/${cfg.geminiModel}`;
  const wsUrl  = `${GEMINI_WSS}?key=${geminiKey}`;
  const upstream = new WebSocket(wsUrl);

  upstream.on("open", () => {
    // Send setup with KB instructions — API key is in URL, never sent to browser
    upstream.send(JSON.stringify({
      setup: {
        model,
        generation_config: { response_modalities: ["AUDIO"] },
        system_instruction: { parts: [{ text: cfg.systemPrompt }] },
        tools: [{
          function_declarations: [{
            name:        "rag_search",
            description: `Search the "${cfg.kbName}" knowledge base. Always call before answering.`,
            parameters:  { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] },
          }],
        }],
      },
    }));
    send(browserWs, { type: "status", value: "connected" });
  });

  // Accumulate Gemini audio chunks before playing
  const audioChunks = new Map(); // responseId → base64 chunks

  upstream.on("message", async (data) => {
    const raw = data instanceof Buffer ? data.toString() : data;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const serverContent = msg.serverContent;
    if (serverContent?.modelTurn?.parts) {
      for (const part of serverContent.modelTurn.parts) {
        if (part.inlineData?.data) {
          // Audio chunk → forward as-is to browser
          send(browserWs, { type: "audio", data: part.inlineData.data, sampleRate: GEMINI_OUT_HZ });
          send(browserWs, { type: "status", value: "speaking" });
        }
        if (typeof part.text === "string" && part.text.trim()) {
          send(browserWs, { type: "transcript.ai.done", responseId: `g_${Date.now()}`, text: part.text });
        }
      }
    }

    if (serverContent?.turnComplete) {
      send(browserWs, { type: "status", value: "listening" });
    }

    // RAG tool call — handled server-side
    const toolCall = msg.toolCall;
    if (toolCall?.functionCalls) {
      const responses = [];
      for (const call of toolCall.functionCalls) {
        if (call.args?.query) {
          const answer = await serverRagSearch(call.args.query, apiKey);
          responses.push({ id: call.id, response: { output: answer } });
        }
      }
      if (responses.length > 0) {
        upstream.send(JSON.stringify({ tool_response: { function_responses: responses } }));
      }
    }
  });

  upstream.on("error", (e) => {
    console.error("[relay/gemini] upstream error:", e.message);
    send(browserWs, { type: "error", message: "Gemini connection error" });
    if (browserWs.readyState === WebSocket.OPEN) browserWs.close(1011);
  });

  upstream.on("close", () => {
    send(browserWs, { type: "status", value: "idle" });
    if (browserWs.readyState === WebSocket.OPEN) browserWs.close(1000);
  });

  browserWs.on("message", (data, isBinary) => {
    if (upstream.readyState !== WebSocket.OPEN) return;

    if (isBinary) {
      // PCM16 audio → base64 → Gemini realtime_input
      const b64 = data.toString("base64");
      upstream.send(JSON.stringify({
        realtime_input: {
          media_chunks: [{ mime_type: `audio/pcm;rate=${GEMINI_IN_HZ}`, data: b64 }],
        },
      }));
      return;
    }

    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "text") {
        upstream.send(JSON.stringify({
          client_content: { turns: [{ role: "user", parts: [{ text: msg.content }] }], turn_complete: true },
        }));
        send(browserWs, { type: "transcript.user", itemId: `g_${Date.now()}`, text: msg.content });
      } else if (msg.type === "ping") {
        send(browserWs, { type: "pong" });
      }
    } catch { /* ignore */ }
  });

  browserWs.on("close", () => {
    if (upstream.readyState === WebSocket.OPEN) upstream.close(1000);
  });
}

// ── RAG search — server-side, never exposed to browser ───────────────────────

async function serverRagSearch(query, apiKey) {
  try {
    const res = await fetch(`${BASE}/api/embed/chat`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body:    JSON.stringify({
        messages:  [{ role: "user", content: query }],
        sessionId: "voice_rag_internal",
      }),
    });
    if (!res.ok || !res.body) return "No information found.";

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buf = ""; let answer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const ev = JSON.parse(line);
          if (ev.type === "token" && typeof ev.payload === "string") answer += ev.payload;
        } catch { /* skip */ }
      }
    }
    return answer || "No relevant information found in the knowledge base.";
  } catch (e) {
    console.warn("[relay] RAG search failed:", e.message);
    return "Knowledge base search failed.";
  }
}

// ── Utility ──────────────────────────────────────────────────────────────────

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

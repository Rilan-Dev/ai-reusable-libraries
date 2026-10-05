/**
 * Server-side Sarvam Bulbul v3 realtime TTS relay.
 *
 * Browser -> Clara WS -> Sarvam TTS WS.
 * The Sarvam key and vendor endpoint stay server-side.
 * One browser session owns one warm Bulbul connection and can stream
 * multiple generations through it.
 *
 * Browser → relay:
 *   { type: "generation_start", generationId, language? }  — new reply; the
 *     reply's language (BCP-47, e.g. "hi-IN") re-configures Bulbul when it
 *     differs from the connection's current target_language_code
 *   { type: "text", generationId, text, language? }
 *   { type: "flush", generationId }
 *   { type: "interrupt" }  — barge-in: drops buffered text + in-flight audio
 *     by recycling ONLY the upstream socket (the browser socket stays warm)
 *   { type: "ping" }
 * Relay → browser:
 *   { type: "status", value, model, sampleRate }
 *   { type: "audio", generationId, audio(base64 PCM16), sampleRate }
 *   { type: "tts_event", generationId, eventType }   ("final" = generation done)
 *   { type: "error", generationId?, message, fatal }
 */
import crypto from "node:crypto";
import WebSocket from "ws";
import { buildTtsConfig, holdEarlyBrowserFrames, streamingTtsSampleRate, toTtsLanguage } from "./sarvam-wire.mjs";

const PORT = process.env.PORT ?? 3000;
const BASE = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://127.0.0.1:${PORT}`;
const TOKEN_VERSION = "v1";
const RELAY_HEADER_PAYLOAD = "sarvam-relay-v1";

function hmacHex(payload) {
  return crypto.createHmac("sha256", process.env.AUTH_SECRET).update(payload).digest("hex");
}
function safeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex")); }
  catch { return false; }
}
function verifyToken(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 5 || parts[0] !== TOKEN_VERSION) return null;
  const [, expRaw, kbId, orgId, sig] = parts;
  const expiresAtMs = Number(expRaw);
  if (!Number.isFinite(expiresAtMs)) return null;
  const payload = `${TOKEN_VERSION}.${expRaw}.${kbId}.${orgId}`;
  if (!safeEqualHex(hmacHex(payload), sig) || Date.now() >= expiresAtMs) return null;
  return { kbId, orgId };
}
function send(ws, value) {
  if (ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(value)); } catch {}
  }
}
function relayHeaderValue() { return hmacHex(RELAY_HEADER_PAYLOAD); }

/**
 * Per-generation character metering (plan Task 5.3: "meter usage once").
 *
 * The hook streams MANY text frames per assistant generation (sentence
 * chunks, each with its own flush). Metering per frame would recreate the
 * sentence-by-sentence billing the plan forbids. This helper accumulates
 * characters per generationId and emits EXACTLY ONE meter callback per
 * generation — flushed when the next generation starts or the connection
 * settles. Exported for relay tests.
 */
export function createGenerationMeter(meter) {
  let generationId = null;
  let characters = 0;

  const settle = () => {
    if (characters > 0) {
      meter({ generationId, characters });
      characters = 0;
    }
    generationId = null;
  };

  return {
    /** Accumulate text for a generation; switching generation settles the old one. */
    add(nextGenerationId, text) {
      const id = nextGenerationId == null ? null : String(nextGenerationId);
      if (id !== generationId) {
        settle();
        generationId = id;
      }
      characters += typeof text === "string" ? text.trim().length : 0;
    },
    /** Meter the trailing generation (connection close). */
    settle,
  };
}

export async function handleSarvamTtsRealtimeConnection(browserWs, req) {
  const url = new URL(req.url, BASE);
  const claims = verifyToken(url.searchParams.get("token"));
  if (!claims) {
    send(browserWs, { type: "error", message: "Invalid or expired realtime TTS session token", fatal: true });
    browserWs.close(1008, "Invalid token");
    return;
  }

  // Frames sent during the bootstrap round trip are held, not dropped.
  const early = holdEarlyBrowserFrames(browserWs);
  send(browserWs, { type: "status", value: "connecting" });

  let cfg;
  try {
    const response = await fetch(`${BASE}/api/voice/sarvam/realtime-init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sarvam-relay": relayHeaderValue(),
      },
      body: JSON.stringify({ kbId: claims.kbId, orgId: claims.orgId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      send(browserWs, { type: "error", message: body.error ?? "Realtime TTS bootstrap failed", fatal: true });
      browserWs.close(1011, "Bootstrap failed");
      return;
    }
    cfg = await response.json();
  } catch {
    send(browserWs, { type: "error", message: "Could not reach Clara backend", fatal: true });
    browserWs.close(1011, "Backend unreachable");
    return;
  }

  // Realtime voice ALWAYS streams (the one-shot REST TTS belongs to the
  // chat-window voice chat) — the phone-only SARVAM_REALTIME_TTS_ENABLED
  // switch does not downgrade the browser realtime agent.
  const model = cfg.realtime?.ttsModel || cfg.tts?.model || "bulbul:v3";
  const speaker = cfg.tts?.speaker || "shubh";
  const sampleRate = streamingTtsSampleRate(cfg.tts?.sampleRate);
  const pace = cfg.tts?.pace;
  // The language follows the REPLY (per generation), starting at the
  // assistant's default language.
  let language = toTtsLanguage(cfg.tts?.language);
  const upstreamUrl =
    `${String(cfg.baseUrl || "https://api.sarvam.ai").replace(/\/+$/, "")}/text-to-speech/ws?model=${encodeURIComponent(model)}&send_completion_event=true`;

  if (early.closed()) return; // browser left during bootstrap — open nothing upstream

  let closed = false;
  let generationId = null;
  let upstream = null;
  let reconnectTimer = null;
  let pingTimer = null;
  const pending = [];
  // Bounded reconnect (plan Phase 9 — NO infinite reconnect loops): five
  // attempts with linear backoff, then a fatal error so the browser can
  // recover deterministically. A successful reconnect resets the budget.
  // Mirrors src/modules/voice-core/realtime/reconnect-policy.ts (plain JS —
  // relay scripts cannot import TS).
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const reconnect = {
    succeeded() { reconnectAttempts = 0; },
    nextDelayMs() {
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return null;
      reconnectAttempts += 1;
      return 250 * reconnectAttempts;
    },
  };

  // One meter event per assistant generation — never per sentence frame.
  const generationMeter = createGenerationMeter(({ characters }) => {
    if (!cfg.orgId) return;
    fetch(`${BASE}/api/internal/sarvam/realtime-meter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sarvam-relay": relayHeaderValue(),
      },
      body: JSON.stringify({
        kind: "tts",
        orgId: cfg.orgId,
        kbId: claims.kbId,
        agentId: cfg.agentId ?? null,
        model,
        characters,
      }),
    }).catch((e) => console.warn("[sarvam-tts-relay] tts metering failed:", e.message));
  });

  /** A reply in another language re-configures Bulbul. Only at generation
   *  boundaries: recycling the upstream socket mid-reply would cut audio.
   *  The config frame is always the FIRST message on a socket (docs), so a
   *  language change opens a fresh upstream with the new config. */
  const switchLanguage = (requested) => {
    if (typeof requested !== "string" || !requested.trim()) return;
    const next = toTtsLanguage(requested);
    if (next === language) return;
    language = next;
    if (upstream?.readyState === WebSocket.OPEN || upstream?.readyState === WebSocket.CONNECTING) {
      const previous = upstream;
      upstream = null;
      try { previous.close(1000, "language change"); } catch {}
    }
    openUpstream();
  };

  const closeBoth = (code = 1000, reason = "closed") => {
    if (closed) return;
    closed = true;
    generationMeter.settle(); // meter the trailing generation exactly once
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (pingTimer) clearInterval(pingTimer);
    try { upstream?.close(code, reason); } catch {}
    try { browserWs.close(code, reason); } catch {}
  };

  const openUpstream = () => {
    if (closed || upstream?.readyState === WebSocket.OPEN || upstream?.readyState === WebSocket.CONNECTING) return;
    const socket = new WebSocket(upstreamUrl, { headers: { "api-subscription-key": cfg.apiKey } });
    upstream = socket;
    socket.on("open", () => {
      reconnect.succeeded(); // vendor is healthy again — reset the budget
      // Documented config frame: target_language_code + an explicit
      // speech_sample_rate so playback never guesses the model default.
      socket.send(JSON.stringify(buildTtsConfig({ speaker, languageCode: language, codec: "linear16", sampleRate, pace })));
      send(browserWs, { type: "status", value: "connected", model, sampleRate, language });
      for (const msg of pending.splice(0)) { try { socket.send(msg); } catch {} }
    });

    socket.on("message", (data) => {
    let event;
    try { event = JSON.parse(data.toString()); } catch { return; }
    const type = String(event.type ?? event.event ?? "");

    if (type === "audio") {
      const payload = event.data ?? {};
      send(browserWs, {
        type: "audio",
        generationId,
        audio: payload.audio ?? "",
        contentType: payload.content_type ?? "audio/linear16",
        sampleRate,
      });
      return;
    }

    if (type === "event") {
      const eventType = event.data?.event_type ?? event.event_type;
      send(browserWs, { type: "tts_event", generationId, eventType });
      return;
    }

    if (type === "error") {
      const payload = event.data ?? event;
      send(browserWs, { type: "error", generationId, message: String(payload.message ?? "Sarvam TTS error"), fatal: false });
      return;
    }

    send(browserWs, { type: "upstream", event });
  });

    socket.on("error", (error) => {
      console.error("[sarvam-tts-relay] upstream error:", error.message);
      send(browserWs, { type: "error", message: "Sarvam TTS connection error", fatal: false });
    });

    socket.on("close", () => {
      // Intentional recycles (interrupt / language change) already detached
      // this socket — only an UNEXPECTED close spends the reconnect budget.
      const unexpected = upstream === socket;
      if (unexpected) upstream = null;
      if (!closed && unexpected) {
        const delay = reconnect.nextDelayMs();
        if (delay === null) {
          // Reconnect budget exhausted — surface a FATAL error so the browser
          // recovers deterministically instead of churning forever.
          send(browserWs, { type: "error", message: "TTS connection lost after repeated retries", fatal: true });
          closeBoth(1011, "Reconnect budget exhausted");
          return;
        }
        send(browserWs, { type: "status", value: "reconnecting" });
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(openUpstream, delay);
      }
    });
  };

  openUpstream();
  pingTimer = setInterval(() => {
    if (upstream?.readyState === WebSocket.OPEN) {
      try { upstream.send(JSON.stringify({ type: "ping", data: {} })); } catch {}
    } else {
      openUpstream();
    }
  }, 20_000);

  early.attach((data) => {
    let message;
    try { message = JSON.parse(data.toString()); } catch { return; }

    const type = String(message.type ?? "");
    if (type === "generation_start") {
      generationId = String(message.generationId ?? "");
      switchLanguage(message.language);
      return;
    }

    if (type === "text") {
      if (typeof message.text !== "string" || !message.text.trim()) return;
      if (message.generationId != null) generationId = String(message.generationId);
      // Meter once per generation: accumulate chars, settle on switch/close.
      generationMeter.add(message.generationId, message.text);
      const payload = JSON.stringify({ type: "text", data: { text: message.text } });
      if (upstream?.readyState === WebSocket.OPEN) { try { upstream.send(payload); } catch { pending.push(payload); } }
      else { pending.push(payload); openUpstream(); }
      return;
    }

    if (type === "flush") {
      if (message.generationId != null) generationId = String(message.generationId);
      const payload = JSON.stringify({ type: "flush", data: {} });
      if (upstream?.readyState === WebSocket.OPEN) { try { upstream.send(payload); } catch { pending.push(payload); } }
      else { pending.push(payload); openUpstream(); }
      return;
    }

    if (type === "interrupt") {
      pending.length = 0;
      generationId = null;
      const previous = upstream;
      upstream = null;
      try { previous?.close(1000, "generation interrupted"); } catch {}
      setTimeout(openUpstream, 0);
      return;
    }

    if (type === "ping") {
      if (upstream?.readyState === WebSocket.OPEN) { try { upstream.send(JSON.stringify({ type: "ping", data: {} })); } catch {} }
      else openUpstream();
    }
  });

  browserWs.on("close", () => closeBoth(1000, "Browser closed"));
  browserWs.on("error", () => closeBoth(1011, "Browser error"));
}

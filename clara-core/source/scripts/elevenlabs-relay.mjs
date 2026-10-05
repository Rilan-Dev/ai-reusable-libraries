/**
 * scripts/elevenlabs-relay.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side ElevenLabs Clara-realtime relay (Mode C — plan Tasks 6.2 + 6.3).
 * Two legs, both attached by scripts/start.mjs:
 *
 *   /api/voice/elevenlabs/realtime        — Scribe realtime STT
 *   /api/voice/elevenlabs/tts-realtime    — streaming TTS WebSocket
 *
 * Security properties (mirrors scripts/sarvam-relay.mjs):
 *   • the ElevenLabs API key never leaves the server (fetched from the
 *     HMAC-guarded realtime-init route, held in-process only);
 *   • the browser authenticates with a session-minted HMAC token (?token=),
 *     verified in-process — signature + expiry, no DB round-trip;
 *   • models/voices are re-resolved server-side on every connection;
 *   • STT metering fires per committed transcript; TTS metering fires ONCE
 *     per assistant generation (never per sentence — plan Task 6.3);
 *   • hard caps: 60-minute lifetime, 120-second idle.
 *
 * Vendor wire (validated against elevenlabs.io docs, 2026-09-20):
 *   STT  wss://…/v1/speech-to-text/realtime?model_id=scribe_v2_realtime
 *        client→server  {"message_type":"input_audio_chunk","audio_base_64":"<base64>","sample_rate":16000}
 *        server→client {"message_type":"session_started"|"partial_transcript"|
 *                       "committed_transcript"|...} · error events.
 *        Errors arrive as JSON messages with a `type`/`error` field before
 *        the socket closes.
 *   TTS  wss://…/v1/text-to-speech/{voice_id}/stream-input?model_id=…
 *        BOS: {"text":" ","voice_settings":{…},"generation_config":
 *             {"chunk_length_schedule":[50,120,160,290]}}
 *        text: {"text":"…"} (+ "flush":true to force audio) — an empty text
 *              closes the vendor connection, so the relay NEVER forwards an
 *              empty text frame (browser sends explicit close instead).
 *        audio frames: {"audio":"<base64>","isFinal":bool,…} with
 *              output_format=pcm_16000 (16 kHz mono PCM16).
 *
 * Browser frames (relay→browser):
 *   STT:  {"type":"session_started"} · {"type":"transcript_partial","text"} ·
 *         {"type":"transcript_final","text","audioSeconds"} · {"type":"error",…}
 *   TTS:  {"type":"status","value"} · {"type":"audio","audio","generationId",
 *          "sampleRate"} · {"type":"error",…}
 * Browser→relay (TTS): {"type":"generation_start"|"text"|"flush"|"interrupt"|
 *          "ping","generationId","text"}
 */

import crypto from "node:crypto";
import WebSocket from "ws";

const PORT = process.env.PORT ?? 3000;
const BASE = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://127.0.0.1:${PORT}`;

// Browser realtime sessions are user-owned. ElevenLabs upstream sockets may
// rotate/reconnect, but they must never terminate the browser session.
// Explicit End Session owns teardown.
const RECONNECT_BASE_DELAY_MS = 250;
const RECONNECT_MAX_DELAY_MS = 5000;

const TOKEN_VERSION = "v1";
const RELAY_HEADER_PAYLOAD = "elevenlabs-relay-v1";

function hmacHex(payload) {
  return crypto.createHmac("sha256", process.env.AUTH_SECRET).update(payload).digest("hex");
}

function safeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/** Verify a session-minted browser token (mirrors realtime-auth.ts in TS). */
export function verifyToken(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 5 || parts[0] !== TOKEN_VERSION) return null;
  const [, expRaw, kbId, orgId, sig] = parts;
  const expiresAtMs = Number(expRaw);
  if (!Number.isFinite(expiresAtMs)) return null;
  const payload = `${TOKEN_VERSION}.${expRaw}.${kbId}.${orgId}`;
  if (!safeEqualHex(hmacHex(payload), sig)) return null;
  if (Date.now() >= expiresAtMs) return null;
  return { kbId, orgId };
}

function relayHeaderValue() {
  return hmacHex(RELAY_HEADER_PAYLOAD);
}

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch {}
  }
}

/** BCP-47 language code for the Scribe realtime query (blank → omitted). */
export function scribeLanguageCode(language) {
  const code = String(language ?? "").trim();
  return code || null;
}

/**
 * Map a vendor STT event to the browser frame contract (plan Task 6.2).
 * Documented events: session_started, partial_transcript,
 * committed_transcript (+ _with_timestamps/_entities variants), error types.
 */
export function translateScribeEvent(event) {
  const type = String(event.message_type ?? event.type ?? event.event ?? "");
  const text = String(event.text ?? event.transcript ?? "");
  switch (type) {
    case "session_started":
      return { type: "session_started" };
    case "partial_transcript":
      return { type: "transcript_partial", text };
    case "committed_transcript":
    case "committed_transcript_with_timestamps":
    case "committed_transcript_entities":
      // The stable, committed transcript — the ONLY event that may create a
      // Clara generation (plan §1.4). The _with_timestamps/_entities
      // variants repeat the same committed text — collapse into one frame.
      return { type: "transcript_final", text };
    default: {
      // Current Scribe errors are typed message_type values such as
      // auth_error, quota_exceeded, rate_limited, input_error, etc. Keep the
      // browser contract stable and treat all vendor error envelopes as fatal
      // because Scribe closes the socket after an error.
      const error = event.error && typeof event.error === "object" ? event.error : null;
      const typedError = /(?:^|_)(error|errors|exceeded|limited|throttled|rejected|exhausted)$/.test(type)
        || type === "error";
      if (typedError || error || typeof event.error === "string") {
        const message = String(
          (error && (error.message ?? error.type)) ??
          (typeof event.error === "string" ? event.error : null) ??
          event.message ??
          type ??
          "Scribe realtime error",
        );
        return { type: "error", message, fatal: true };
      }
      if (type) return { type: "upstream", event };
      return null; // keepalives / non-typed frames
    }
  }
}

/**
 * Build the upstream Scribe realtime URL with the documented query params.
 * Exported for relay tests.
 */
export function scribeRealtimeUrl(cfg) {
  const base = String(cfg.baseUrl || "https://api.elevenlabs.io").replace(/\/+$/, "");
  const params = new URLSearchParams({
    model_id: cfg.sttModel || "scribe_v2_realtime",
    audio_format: "pcm_16000",
    // Let Scribe own turn detection. A sub-second silence threshold keeps
    // perceived voice latency low without adding a second client-side VAD.
    commit_strategy: "vad",
    vad_silence_threshold_secs: String(
      Number.isFinite(Number(process.env.ELEVENLABS_REALTIME_VAD_SILENCE_SECS))
        ? Math.min(3, Math.max(0.3, Number(process.env.ELEVENLABS_REALTIME_VAD_SILENCE_SECS)))
        : 0.8,
    ),
    vad_threshold: String(
      Number.isFinite(Number(process.env.ELEVENLABS_REALTIME_VAD_THRESHOLD))
        ? Math.min(0.9, Math.max(0.1, Number(process.env.ELEVENLABS_REALTIME_VAD_THRESHOLD)))
        : 0.4,
    ),
    min_speech_duration_ms: "100",
    min_silence_duration_ms: "100",
  });
  const language = scribeLanguageCode(cfg.languageCode);
  if (language) params.set("language_code", language);
  return `${base}/v1/speech-to-text/realtime?${params.toString()}`;
}

/**
 * Build the upstream TTS stream-input URL (plan Task 6.3).
 * The voice is fixed in the path; output_format pins PCM16 @16 kHz so the
 * browser queue plays raw samples without an MP3 decode hop.
 */
export function ttsStreamInputUrl(cfg) {
  const base = String(cfg.baseUrl || "https://api.elevenlabs.io").replace(/\/+$/, "");
  const voiceId = encodeURIComponent(cfg.tts?.voiceId || "");
  const params = new URLSearchParams({
    model_id: cfg.tts?.model || "eleven_flash_v2_5",
    output_format: "pcm_16000",
    inactivity_timeout: "180",
  });
  return `${base}/v1/text-to-speech/${voiceId}/stream-input?${params.toString()}`;
}

/** The BOS message the TTS leg sends on upstream open. */
export function ttsBosMessage() {
  return JSON.stringify({
    text: " ",
    voice_settings: { stability: 0.5, similarity_boost: 0.8, use_speaker_boost: false },
    generation_config: { chunk_length_schedule: [50, 120, 160, 290] },
  });
}

async function bootstrapConfig(claims) {
  const res = await fetch(`${BASE}/api/voice/elevenlabs/realtime-init`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-elevenlabs-relay": relayHeaderValue(),
    },
    body: JSON.stringify({ kbId: claims.kbId, orgId: claims.orgId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return { error: err.error ?? `Realtime bootstrap failed (HTTP ${res.status})` };
  }
  return { cfg: await res.json() };
}

// ─── STT leg: /api/voice/elevenlabs/realtime ─────────────────────────────────

export async function handleElevenLabsRealtimeStt(browserWs, req) {
  const url = new URL(req.url, BASE);
  const claims = verifyToken(url.searchParams.get("token"));
  if (!claims) {
    send(browserWs, { type: "error", message: "Invalid or expired realtime session token", fatal: true });
    browserWs.close(1008, "Invalid token");
    return;
  }
  const { kbId, orgId } = claims;

  send(browserWs, { type: "status", value: "connecting" });

  const { cfg, error } = await bootstrapConfig(claims).catch((e) => ({ error: e.message }));
  if (!cfg) {
    send(browserWs, { type: "error", message: error ?? "Could not reach backend", fatal: true });
    browserWs.close(1011, "Bootstrap failed");
    return;
  }

  let upstream = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  const state = { closed: false, upstreamReady: false, bytesSent: 0 };
  const audioQueue = [];
  const sampleRate = Number(cfg.sampleRate ?? 16_000) || 16_000;

  const keepAliveTimer = setInterval(() => {
    if (state.closed || !state.upstreamReady || !upstream) return;
    try {
      upstream.send(JSON.stringify({
        message_type: "input_audio_chunk",
        audio_base_64: Buffer.from(new Int16Array(160)).toString("base64"),
        sample_rate: 16_000,
      }));
    } catch {}
  }, 20_000);

  function closeBoth(code, reason) {
    if (state.closed) return;
    state.closed = true;
    clearInterval(keepAliveTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    try { upstream?.close(code, reason); } catch {}
    try { browserWs.close(code, reason); } catch {}
  }

  function meterCommitted(audioSeconds, languageCode) {
    fetch(`${BASE}/api/internal/elevenlabs/realtime-meter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-elevenlabs-relay": relayHeaderValue(),
      },
      body: JSON.stringify({
        kind: "stt",
        orgId: cfg.orgId ?? orgId,
        kbId,
        agentId: cfg.agentId ?? null,
        model: cfg.sttModel,
        audioSeconds,
        languageCode: languageCode ?? null,
      }),
    }).catch((e) => console.warn("[elevenlabs-relay] stt metering failed:", e.message));
  }

  const connectUpstream = () => {
    if (state.closed || upstream?.readyState === WebSocket.OPEN || upstream?.readyState === WebSocket.CONNECTING) return;
    const socket = new WebSocket(scribeRealtimeUrl(cfg), {
      headers: { "xi-api-key": cfg.apiKey },
    });
    upstream = socket;
    socket.on("open", () => {
      if (state.closed) { try { socket.close(); } catch {} ; return; }
      reconnectAttempts = 0;
      state.upstreamReady = true;
      for (const frame of audioQueue.splice(0)) { try { socket.send(frame); } catch {} }
      send(browserWs, { type: "status", value: "connected" });
    });

    socket.on("message", (data) => {
      let event;
    try {
      event = JSON.parse(data.toString());
    } catch {
      return;
    }
    const frame = translateScribeEvent(event);
    if (!frame) return;

    if (frame.type === "transcript_final") {
      const audioSeconds = Math.max(1, Math.round(state.bytesSent / (sampleRate * 2)));
      state.bytesSent = 0; // per-turn accounting
      send(browserWs, { ...frame, audioSeconds });
      meterCommitted(audioSeconds, event.language_code ?? null);
      return;
    }
    if (frame.type === "error") {
      send(browserWs, frame);
      closeBoth(1011, "Upstream error");
      return;
    }
    send(browserWs, frame);
  });

    socket.on("close", (code, reason) => {
      if (upstream === socket) upstream = null;
      state.upstreamReady = false;
      if (state.closed) return;
      const delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * Math.max(1, ++reconnectAttempts));
      send(browserWs, { type: "status", value: "reconnecting" });
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectUpstream, delay);
    });

    socket.on("error", (err) => {
      console.error("[elevenlabs-relay] stt upstream error:", err.message);
      // The close event handles recovery. Preserve the browser session.
    });
  };

  connectUpstream();

  browserWs.on("message", (data) => {
    let frame = data;
    let bytes = data.length;
    try {
      const parsed = JSON.parse(data.toString());
      // Normalize the browser frame to the current Scribe realtime wire.
      // The browser intentionally sends only PCM; the relay owns the vendor
      // protocol so a vendor envelope change never leaks into the client.
      const audio = parsed?.audio_base_64 ?? parsed?.audio ?? parsed?.user_audio_chunk;
      if (typeof audio === "string") {
        frame = JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: audio,
          sample_rate: Number(parsed?.sample_rate ?? 16_000) || 16_000,
        });
        bytes = Math.floor((audio.length * 3) / 4); // base64 → raw bytes
      } else {
        frame = data.toString();
      }
    } catch {
      // Raw binary PCM frames pass through as-is.
    }
    state.bytesSent += bytes;
    if (state.upstreamReady) {
      try { upstream.send(frame); } catch {}
    } else {
      audioQueue.push(frame);
      if (audioQueue.length > 600) audioQueue.shift();
    }
  });

  browserWs.on("close", () => closeBoth(1000, "Browser closed"));
  browserWs.on("error", () => closeBoth(1011, "Browser error"));
}

// ─── TTS leg: /api/voice/elevenlabs/tts-realtime ─────────────────────────────

export async function handleElevenLabsRealtimeTts(browserWs, req) {
  const url = new URL(req.url, BASE);
  const claims = verifyToken(url.searchParams.get("token"));
  if (!claims) {
    send(browserWs, { type: "error", message: "Invalid or expired realtime TTS session token", fatal: true });
    browserWs.close(1008, "Invalid token");
    return;
  }

  send(browserWs, { type: "status", value: "connecting" });

  const { cfg, error } = await bootstrapConfig(claims).catch((e) => ({ error: e.message }));
  if (!cfg) {
    send(browserWs, { type: "error", message: error ?? "Could not reach backend", fatal: true });
    browserWs.close(1011, "Bootstrap failed");
    return;
  }
  if (!cfg.tts?.voiceId) {
    send(browserWs, { type: "error", message: "No ElevenLabs voice is configured for this knowledge base.", fatal: true });
    browserWs.close(1008, "No voice configured");
    return;
  }

  const model = cfg.tts.model || "eleven_flash_v2_5";
  let closed = false;
  let generationId = null;
  let upstream = null;
  let reconnectTimer = null;
  let pingTimer = null;
  let ttsChars = 0; // per-generation character metering (once per generation)
  const pending = [];
  const sampleRate = Number(cfg.tts.sampleRate ?? 16_000) || 16_000;
  // Persistent-session reconnect: an upstream TTS socket may rotate or fail
  // independently of the browser session. Retry with bounded backoff rather
  // than closing the user's realtime session. A successful reconnect resets
  // the backoff counter.
  let reconnectAttempts = 0;
  const reconnect = {
    succeeded() { reconnectAttempts = 0; },
    nextDelayMs() {
      reconnectAttempts += 1;
      return Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * reconnectAttempts);
    },
  };

  const meterTts = (characters) => {
    if (!characters || characters <= 0 || !cfg.orgId) return;
    fetch(`${BASE}/api/internal/elevenlabs/realtime-meter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-elevenlabs-relay": relayHeaderValue(),
      },
      body: JSON.stringify({
        kind: "tts",
        orgId: cfg.orgId,
        kbId: claims.kbId,
        agentId: cfg.agentId ?? null,
        model,
        characters,
      }),
    }).catch((e) => console.warn("[elevenlabs-relay] tts metering failed:", e.message));
  };

  const settleGeneration = () => {
    if (ttsChars > 0) {
      meterTts(ttsChars);
      ttsChars = 0;
    }
  };

  const closeBoth = (code = 1000, reason = "closed") => {
    if (closed) return;
    closed = true;
    settleGeneration(); // meter the trailing generation exactly once
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (pingTimer) clearInterval(pingTimer);
    try { upstream?.close(code, reason); } catch {}
    try { browserWs.close(code, reason); } catch {}
  };

  const openUpstream = () => {
    if (closed || upstream?.readyState === WebSocket.OPEN || upstream?.readyState === WebSocket.CONNECTING) return;
    const socket = new WebSocket(ttsStreamInputUrl(cfg), {
      headers: { "xi-api-key": cfg.apiKey },
    });
    upstream = socket;
    socket.on("open", () => {
      reconnect.succeeded(); // vendor is healthy again — reset the budget
      socket.send(ttsBosMessage());
      send(browserWs, { type: "status", value: "connected", model, sampleRate });
      for (const msg of pending.splice(0)) { try { socket.send(msg); } catch {} }
    });

    socket.on("message", (data) => {
      let event;
      try { event = JSON.parse(data.toString()); } catch { return; }
      if (event.audio) {
        send(browserWs, {
          type: "audio",
          generationId,
          audio: event.audio,
          isFinal: Boolean(event.isFinal),
          sampleRate,
        });
        return;
      }
      if (event.isFinal) {
        send(browserWs, { type: "tts_event", generationId, eventType: "final" });
        return;
      }
      if (event.error || event.type === "error") {
        const message = String(event.error?.message ?? event.message ?? "TTS stream error");
        send(browserWs, { type: "error", generationId, message, fatal: false });
        return;
      }
      send(browserWs, { type: "upstream", event });
    });

    socket.on("error", (err) => {
      console.error("[elevenlabs-relay] tts upstream error:", err.message);
      send(browserWs, { type: "error", message: "TTS connection error", fatal: false });
    });

    socket.on("close", () => {
      if (upstream === socket) upstream = null;
      if (!closed) {
        const delay = reconnect.nextDelayMs();
        // Keep the browser WebSocket alive indefinitely; only an explicit
        // session close should tear it down. The upstream is retried with
        // bounded backoff until ElevenLabs is reachable again.
        send(browserWs, { type: "status", value: "reconnecting" });
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(openUpstream, delay);
      }
    });
  };

  openUpstream();
  pingTimer = setInterval(() => {
    if (closed) return;
    if (upstream?.readyState === WebSocket.OPEN) {
      // A trailing space keeps the vendor inactivity timeout fed; it never
      // changes spoken output (the flush frames decide utterance bounds).
      try { upstream.send(JSON.stringify({ text: " " })); } catch {}
    } else {
      openUpstream();
    }
  }, 20_000);

  browserWs.on("message", (data) => {
    let message;
    try { message = JSON.parse(data.toString()); } catch { return; }

    const type = String(message.type ?? "");
    if (type === "generation_start") {
      // A new assistant generation settles the previous one's metering.
      settleGeneration();
      generationId = String(message.generationId ?? "");
      return;
    }

    if (type === "text") {
      const text = typeof message.text === "string" ? message.text : "";
      if (!text.trim()) return; // NEVER forward empty text — it closes the vendor socket
      if (message.generationId != null && generationId !== String(message.generationId)) {
        settleGeneration();
        generationId = String(message.generationId);
      }
      ttsChars += text.trim().length;
      // Trailing space separates words across chunk boundaries (vendor docs).
      const payload = JSON.stringify({ text: `${text} ` });
      if (upstream?.readyState === WebSocket.OPEN) { try { upstream.send(payload); } catch { pending.push(payload); } }
      else { pending.push(payload); openUpstream(); }
      return;
    }

    if (type === "flush") {
      // NEVER send an empty text frame — the vendor treats "" as end-of-stream
      // and CLOSES the socket. A trailing space plus flush:true force-generates
      // the buffered text without closing anything.
      const payload = JSON.stringify({ text: " ", flush: true });
      if (upstream?.readyState === WebSocket.OPEN) { try { upstream.send(payload); } catch { pending.push(payload); } }
      else { pending.push(payload); openUpstream(); }
      return;
    }

    if (type === "interrupt") {
      pending.length = 0;
      try { upstream?.close(1000, "generation interrupted"); } catch {}
      upstream = null;
      setTimeout(openUpstream, 0);
      return;
    }

    if (type === "ping") {
      if (upstream?.readyState === WebSocket.OPEN) {
        try { upstream.send(JSON.stringify({ text: " " })); } catch {}
      } else {
        openUpstream();
      }
    }
  });

  browserWs.on("close", () => closeBoth(1000, "Browser closed"));
  browserWs.on("error", () => closeBoth(1011, "Browser error"));
}

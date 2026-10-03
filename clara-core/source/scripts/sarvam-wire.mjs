/**
 * Sarvam realtime wire contract — shared by the browser relays
 * (sarvam-relay.mjs, sarvam-tts-relay.mjs) and phone-stream.mjs so every
 * realtime surface speaks the SAME documented protocol.
 *
 * Streaming STT — wss://api.sarvam.ai/speech-to-text-realtime/ws
 *   query: language_code (required; "auto" = adaptive detection), model
 *   (saaras:v3-realtime default | saaras:v4-realtime), stream_type,
 *   encoding, sample_rate (8000 | 16000), VAD trio threshold /
 *   silence_duration_ms / min_speech_duration_ms.
 *   client → { event: "audio_input", audio: <base64 PCM> } | { event: "ping" }
 *   server → session.begin, vad.speech_start/end, transcript.partial/final,
 *            config.updated, pong, session.end, error
 *   https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/realtime-streaming
 *
 * Streaming TTS — wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v3
 *   first message MUST be { type: "config", data: { speaker,
 *   target_language_code, … } }; then { type: "text", data: { text } },
 *   { type: "flush" }, { type: "ping" }.
 *   https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/streaming-api/web-socket
 *
 * Plain JS (relay scripts cannot import TS).
 */

/** Realtime STT model ids the vendor accepts on the realtime endpoint. */
export const REALTIME_STT_MODELS = ["saaras:v3-realtime", "saaras:v4-realtime", "saaras:v4"];

/** Map a resolved Saaras STT id to the realtime-WS model id. Idempotent:
 *  realtime ids pass through; batch ids (saaras:v3 …) and anything unknown
 *  fall back to the documented default saaras:v3-realtime. */
export function toRealtimeModel(model) {
  const id = String(model ?? "").trim();
  if (REALTIME_STT_MODELS.includes(id)) return id;
  return "saaras:v3-realtime";
}

/** Normalise the language code for the REALTIME STT endpoint.
 *  • "unknown" is the BATCH/REST auto-detect code; the realtime endpoint's
 *    adaptive detection code is "auto" — sending "unknown" there broke
 *    multi-language assistants.
 *  • Odia is "or-IN" on this endpoint (legacy "od-IN").
 *  • Blank falls back to en-IN. */
export function normalizeRealtimeLanguage(code) {
  const id = String(code ?? "").trim();
  if (!id) return "en-IN";
  if (id === "unknown" || id === "auto") return "auto";
  if (id === "od-IN") return "or-IN";
  return id;
}

function finiteOr(value, fallback, min, max) {
  // Unset / empty settings mean "documented default" (Number("") is 0).
  if (value == null || (typeof value === "string" && !value.trim())) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** VAD / endpointing tuning — platform-configurable (Settings → AI → Sarvam),
 *  clamped to sane ranges; defaults are the documented conversational values. */
export function realtimeVadTuning(input = {}) {
  return {
    threshold: finiteOr(input.threshold ?? process.env.SARVAM_REALTIME_VAD_THRESHOLD, 0.3, 0.05, 0.95),
    silenceMs: Math.round(finiteOr(input.silenceMs ?? process.env.SARVAM_REALTIME_SILENCE_MS, 500, 100, 3000)),
    minSpeechMs: Math.round(finiteOr(input.minSpeechMs ?? process.env.SARVAM_REALTIME_MIN_SPEECH_MS, 250, 50, 2000)),
  };
}

/** Build the realtime STT upstream URL. */
export function buildRealtimeSttUrl({ baseUrl, languageCode, model, sampleRate, encoding = "linear16", vad = {} }) {
  const base = String(baseUrl || "https://api.sarvam.ai").replace(/\/+$/, "");
  const tuning = realtimeVadTuning(vad);
  const rate = Number(sampleRate) === 8000 ? 8000 : 16000;
  const params = new URLSearchParams({
    language_code: normalizeRealtimeLanguage(languageCode),
    model: toRealtimeModel(model),
    stream_type: "fast",
    encoding,
    sample_rate: String(rate),
    endpointing: "vad",
    threshold: String(tuning.threshold),
    silence_duration_ms: String(tuning.silenceMs),
    min_speech_duration_ms: String(tuning.minSpeechMs),
  });
  return `${base}/speech-to-text-realtime/ws?${params.toString()}`;
}

/** Streaming TTS supports speech_sample_rate up to 24000 Hz. */
export function streamingTtsSampleRate(value) {
  const n = Number(value);
  return [8000, 16000, 22050, 24000].includes(n) ? n : 24000;
}

/** Bulbul pace — v3 accepts 0.5–2.0 (v2 0.3–3.0); clamp to the v3 range. */
export function streamingTtsPace(value) {
  return finiteOr(value ?? process.env.SARVAM_TTS_PACE, 1, 0.5, 2);
}

/** The documented TTS config frame. Uses target_language_code (the old
 *  relay sent language_code, which the vendor does not read) and pins
 *  speech_sample_rate so playback never guesses the model's default rate
 *  (bulbul:v2 defaults to 22050, v3 to 24000). */
export function buildTtsConfig({ speaker, languageCode, codec = "linear16", sampleRate = 24000, pace, minBufferSize = 30, maxChunkLength = 150 }) {
  return {
    type: "config",
    data: {
      speaker: speaker || "shubh",
      target_language_code: toTtsLanguage(languageCode),
      pace: streamingTtsPace(pace),
      min_buffer_size: minBufferSize,
      max_chunk_length: maxChunkLength,
      output_audio_codec: codec,
      speech_sample_rate: streamingTtsSampleRate(sampleRate),
    },
  };
}

/** TTS needs a concrete language (no auto-detect) — auto/unknown/blank → en-IN. */
export function toTtsLanguage(code) {
  const id = String(code ?? "").trim();
  if (!id || id === "auto" || id === "unknown") return "en-IN";
  if (id === "or-IN") return "od-IN";
  return id;
}

/** Decoded PCM byte count of a browser audio frame (JSON audio_input with
 *  base64, or raw binary). Metering must count AUDIO bytes — counting the
 *  base64 JSON frame over-billed every turn by ~35%. */
export function audioBytesOf(frame) {
  if (typeof frame === "string") {
    try {
      const parsed = JSON.parse(frame);
      const audio = typeof parsed?.audio === "string" ? parsed.audio : "";
      const padding = audio.endsWith("==") ? 2 : audio.endsWith("=") ? 1 : 0;
      return Math.max(0, Math.floor((audio.length * 3) / 4) - padding);
    } catch {
      return 0;
    }
  }
  return frame?.length ?? frame?.byteLength ?? 0;
}

/** Browser → vendor allow-list: only audio and keepalives are forwarded.
 *  A browser can never reconfigure the vendor session (model / language /
 *  VAD are resolved server-side). Raw binary PCM is wrapped as audio_input.
 *  Returns the JSON string to send upstream, or null to drop. */
export function toUpstreamSttFrame(data, isBinary) {
  if (isBinary) {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (bytes.length === 0) return null;
    return JSON.stringify({ event: "audio_input", audio: bytes.toString("base64") });
  }
  let parsed;
  try { parsed = JSON.parse(data.toString()); } catch { return null; }
  const event = String(parsed?.event ?? parsed?.type ?? "");
  if (event === "audio_input" && typeof parsed.audio === "string" && parsed.audio) {
    return JSON.stringify({ event: "audio_input", audio: parsed.audio });
  }
  if (event === "ping") return JSON.stringify({ event: "ping" });
  return null;
}

/**
 * Hold browser frames that arrive while the relay is still bootstrapping
 * (the realtime-init round trip). The browser socket is OPEN from the first
 * byte, so the hook flushes its queue (greeting text, first audio frames)
 * immediately — without a listener those frames were silently dropped and
 * the greeting / first words never reached Sarvam.
 *
 *   const early = holdEarlyBrowserFrames(browserWs);
 *   … await bootstrap …
 *   if (early.closed()) return;          // browser left during bootstrap
 *   early.attach((data, isBinary) => …); // replays held frames in order
 */
export function holdEarlyBrowserFrames(ws, maxFrames = 600) {
  const held = [];
  let handler = null;
  let closed = false;
  ws.on("message", (data, isBinary) => {
    if (handler) { handler(data, isBinary); return; }
    held.push([data, isBinary]);
    if (held.length > maxFrames) held.shift();
  });
  ws.once("close", () => { closed = true; });
  return {
    closed: () => closed,
    attach(next) {
      handler = next;
      for (const [data, isBinary] of held.splice(0)) next(data, isBinary);
    },
  };
}

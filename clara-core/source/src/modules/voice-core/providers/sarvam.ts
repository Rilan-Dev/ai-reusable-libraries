/**
 * src/modules/voice-core/providers/sarvam.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Sarvam AI implementation of the VoiceProviderService interface — Saaras STT
 * + Bulbul TTS on the shared Mode-A pipeline infrastructure.
 *
 * Wire truth (Doc/SARVAM_AI_INTEGRATION_PLAN.md §5.4):
 *   POST {SARVAM_BASE_URL}/speech-to-text   — multipart {file, model, mode,
 *     language_code?}; ≤30 s vendor cap; response {request_id, transcript,
 *     language_code, language_probability, timestamps, diarized_transcript}
 *   POST {SARVAM_BASE_URL}/text-to-speech   — JSON {text, language_code,
 *     model, speaker, speech_sample_rate, pace?}; ≤2 500 chars; WAV bytes out
 *   Auth: `api-subscription-key: <key>` header.
 *
 * Bulbul returns a complete WAV (RIFF) container, not a PCM stream. The
 * platform pipeline contract is raw PCM16 @16 kHz (audio/octet-stream), so
 * `speak()` strips the RIFF header server-side with a chunk-length-aware
 * parser (never assumes the 44-byte canonical header). If parsing fails the
 * WAV is returned verbatim with audio/wav — the client can still decode it
 * (plan §16 mitigation for the "WAV header variance" risk).
 *
 * Voice catalog: Bulbul speakers are enumerable string ids (shubh, priya, …)
 * — a STATIC catalogue in model-catalog.ts. No DB table, no sync job, no
 * per-org round-trip (an explicit simplification vs elevenlabs_voices/033).
 *
 * No Mode B: Sarvam's "Voice Agents" (Samvaad) is a hosted no-code platform,
 * not an embeddable signed-agent runtime — this provider implements
 * VoiceProviderService ONLY (plan §3.2).
 *
 * Construct via VoiceProviderFactory — never `new SarvamVoiceProvider(...)`.
 */

import {
  getSarvamApiKey,
  getSarvamBaseUrl,
  getSarvamTimeoutMs,
  SARVAM_SPEAKERS,
} from "../model-catalog";
import type {
  ElevenLabsSubscriptionInfo,
  ElevenLabsVoice,
  SpeakParams,
  TranscribeParams,
  TranscribeResult,
  VoiceProvider,
  VoiceProviderService,
  VoiceServiceConfig,
} from "../types";

export class SarvamVoiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SarvamVoiceError";
  }
}

const CONNECT_RETRY_BACKOFF_MS = 250;

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
  if (!(error instanceof TypeError)) return false;
  const cause = (error as { cause?: unknown }).cause;
  if (cause == null || typeof cause !== "object") return false;
  if (CONNECT_FAILURE_CODES.has(String((cause as { code?: unknown }).code ?? ""))) return true;
  if (Array.isArray((cause as { errors?: unknown }).errors)) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Chunk-length-aware RIFF parser: walks the chunk list to locate the `data`
 * chunk payload instead of assuming the canonical 44-byte header. Returns
 * null when the buffer is not a parseable RIFF/WAVE — callers treat that as
 * "return the WAV verbatim" rather than failing the synthesis.
 */
export function extractWavDataChunk(wav: Uint8Array): Uint8Array | null {
  if (wav.length < 12) return null;
  if (wav[0] !== 0x52 || wav[1] !== 0x49 || wav[2] !== 0x46 || wav[3] !== 0x46) return null; // "RIFF"
  if (wav[8] !== 0x57 || wav[9] !== 0x41 || wav[10] !== 0x56 || wav[11] !== 0x45) return null; // "WAVE"

  let offset = 12;
  while (offset + 8 <= wav.length) {
    const chunkId = String.fromCharCode(wav[offset], wav[offset + 1], wav[offset + 2], wav[offset + 3]);
    // Little-endian 32-bit chunk size.
    const chunkSize =
      wav[offset + 4] | (wav[offset + 5] << 8) | (wav[offset + 6] << 16) | (wav[offset + 7] << 24);
    const dataStart = offset + 8;
    if (chunkId === "data") {
      const dataEnd = Math.min(dataStart + chunkSize, wav.length);
      if (dataEnd <= dataStart) return null;
      return wav.slice(dataStart, dataEnd);
    }
    // Chunks are padded to even sizes; advance size + header + pad.
    offset = dataStart + chunkSize + (chunkSize % 2);
  }
  return null;
}

/**
 * Sarvam's /text-to-speech ships audio as a JSON envelope —
 * {"request_id": "…", "audios": ["<base64 WAV>"]} — NOT raw bytes (the
 * integration plan's "WAV bytes out" assumption was wrong for api.sarvam.ai;
 * verified live 2026-09-19). Returns the decoded WAV bytes, or null when the
 * payload is not that shape (raw RIFF already, or a genuinely foreign body —
 * callers pass those through verbatim).
 */
export function decodeSarvamAudioEnvelope(body: Uint8Array): Uint8Array<ArrayBuffer> | null {
  // Cheap shape sniff before parsing: a JSON envelope starts with '{'.
  if (body.length === 0 || body[0] !== 0x7b) return null;
  let parsed: { audios?: unknown };
  try {
    parsed = JSON.parse(new TextDecoder().decode(body)) as { audios?: unknown };
  } catch {
    return null;
  }
  const first = Array.isArray(parsed.audios) ? parsed.audios[0] : null;
  if (typeof first !== "string" || !first) return null;
  try {
    const binary = atob(first);
    if (!binary) return null;
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export class SarvamVoiceProvider implements VoiceProviderService {
  private config: VoiceServiceConfig;
  private apiKey: string | undefined;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(config?: VoiceServiceConfig) {
    this.config = config ?? { provider: "sarvam" };
    // Same precedence discipline as ElevenLabsVoiceProvider: config wins, env
    // second, and a missing key does NOT throw — the status probe constructs
    // a keyless service, the resolve.ts kill switch rejects billable paths,
    // and the lazy requireApiKey() fires 503 on the first vendor call.
    this.apiKey = this.config.apiKey ?? getSarvamApiKey();
    this.baseUrl = this.config.baseUrl ?? getSarvamBaseUrl();
    const timeout = this.config.timeoutMs ?? getSarvamTimeoutMs();
    this.timeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout : 30_000;
  }

  // ─── Transport ───────────────────────────────────────────────────────────

  private requireApiKey(): string {
    if (!this.apiKey) {
      throw new SarvamVoiceError(
        "SARVAM_API_KEY is not set. Add it in Platform Admin → Settings → AI (Sarvam section).",
        503,
      );
    }
    return this.apiKey;
  }

  private async sarvamFetch(
    path: string,
    init: RequestInit & { timeoutMs?: number } = {},
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
          "api-subscription-key": this.requireApiKey(),
          ...(rest.headers ?? {}),
        },
      });
      if (!response.ok) {
        // Vendor body never echoed — it can echo request payloads. Log the
        // server-side detail only.
        const bodyText = await response.text().catch(() => "");
        console.error(
          `[sarvam-voice] API error ${response.status} on ${path}: ${bodyText.slice(0, 300)}`,
        );
        throw new SarvamVoiceError(
          `Sarvam API error (${response.status} ${response.statusText}) on ${path}`,
          response.status,
        );
      }
      return response;
    } catch (error) {
      if (error instanceof SarvamVoiceError) throw error;
      if ((error as Error).name === "AbortError") {
        throw new SarvamVoiceError(`Sarvam request timed out after ${timeoutMs}ms on ${path}`, 504);
      }
      if (allowConnectRetry && isConnectLevelFailure(error)) {
        await sleep(CONNECT_RETRY_BACKOFF_MS);
        return this.sarvamFetch(path, init, false);
      }
      throw new SarvamVoiceError(`Sarvam request failed on ${path}: ${(error as Error).message}`, 502);
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── Subscription / connection test ──────────────────────────────────────

  /**
   * Sarvam publishes NO credits/subscription REST endpoint (dashboard-only).
   * Health = a 1-token chat completion probe: 200 ⇒ connected; 401/403 ⇒ bad
   * key; 429 ⇒ reachable but throttled. Normalized into the shared DTO with
   * tier/quota semantics mapped from the probe outcome.
   */
  async getSubscriptionInfo(): Promise<ElevenLabsSubscriptionInfo> {
    try {
      await this.sarvamFetch("/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.SARVAM_CHAT_MODEL?.trim() || "sarvam-105b",
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 1,
        }),
        timeoutMs: Math.max(this.timeoutMs, 60_000),
      });
      return {
        tier: "api-probe-ok",
        characterCount: 0,
        characterLimit: 0,
        nextCharacterCountResetUnix: null,
        voiceLimit: SARVAM_SPEAKERS.length,
        canUseInstantCloning: false,
      };
    } catch (error) {
      if (error instanceof SarvamVoiceError && error.status === 429) {
        // Reachable but throttled — connectivity itself is proven.
        return {
          tier: "rate-limited",
          characterCount: 0,
          characterLimit: 0,
          nextCharacterCountResetUnix: null,
          voiceLimit: SARVAM_SPEAKERS.length,
          canUseInstantCloning: false,
        };
      }
      throw error;
    }
  }

  // ─── Voice catalog (static — no vendor call by design) ───────────────────

  async listVoices(): Promise<ElevenLabsVoice[]> {
    return SARVAM_SPEAKERS.map((speaker) => ({
      voiceId: speaker.id,
      name: `${speaker.name} (${speaker.gender === "female" ? "F" : "M"})`,
      category: "sarvam-bulbul",
      labels: {
        gender: speaker.gender,
        provider: "sarvam",
        ...(speaker.isDefault ? { default: "true" } : {}),
      },
      description: null,
      previewUrl: null,
    }));
  }

  // ─── Speech-to-text (Saaras) ─────────────────────────────────────────────

  async transcribeAudio(params: TranscribeParams): Promise<TranscribeResult> {
    const form = new FormData();
    form.append("file", params.file, "utterance.webm");
    form.append("model", params.modelId);
    // 'transcribe' mode returns the raw transcript; 'translate' mode (cross-
    // lingual V4) is a separate surface — never mixed here.
    form.append("mode", "transcribe");
    if (params.languageCode) form.append("language_code", params.languageCode);

    const response = await this.sarvamFetch("/speech-to-text", {
      method: "POST",
      body: form,
      // Audio uploads legitimately need more headroom than JSON calls.
      timeoutMs: Math.max(this.timeoutMs, 90_000),
    });

    const data = (await response.json()) as Record<string, unknown>;
    return {
      text: String(data.transcript ?? data.text ?? ""),
      languageCode: typeof data.language_code === "string" ? data.language_code : null,
      // Saaras does not report audio duration — the route estimates from
      // bytes/ bitrate (same discipline as the ElevenLabs bridge).
      durationSeconds: null,
    };
  }

  // ─── Text-to-speech (Bulbul) ─────────────────────────────────────────────

  /**
   * Synthesize speech: request 16 kHz WAV, strip the RIFF container to raw
   * PCM16, and return a synthetic Response whose body is the PCM stream the
   * shared playback queue expects. Falls back to the WAV bytes (audio/wav)
   * when the container is non-canonical — the client decoder handles it.
   */
  async speak(params: SpeakParams): Promise<Response> {
    const sampleRate = Number(params.outputFormat?.replace(/[^0-9]/g, "")) || 16_000;

    const response = await this.sarvamFetch("/text-to-speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: params.text,
        model: params.modelId,
        speaker: params.voiceId,
        speech_sample_rate: sampleRate,
        ...(params.languageCode ? { language_code: params.languageCode } : {}),
        ...(params.speed != null ? { pace: Math.min(2, Math.max(0.5, params.speed)) } : {}),
      }),
      // Long syntheses need headroom beyond the JSON default.
      timeoutMs: Math.max(this.timeoutMs, 60_000),
    });

    let wav = new Uint8Array(await response.arrayBuffer());
    // Live vendor shape (2026-09-19): a JSON envelope with base64 WAV, not the
    // raw RIFF bytes the plan assumed. Raw-RIFF bodies (proxies, future vendor
    // changes) still take the direct path.
    if (wav.length < 12 || wav[0] !== 0x52 || wav[1] !== 0x49 || wav[2] !== 0x46 || wav[3] !== 0x46) {
      const decoded = decodeSarvamAudioEnvelope(wav);
      if (decoded) wav = decoded;
    }
    const pcm = extractWavDataChunk(wav);
    if (pcm) {
      return new Response(pcm as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Sarvam-Audio-Format": `pcm_${sampleRate}`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Unparseable container (non-canonical RIFF or raw vendor payload):
    // pass through verbatim with the honest content type.
    console.warn(
      `[sarvam-voice] Bulbul response was not a parseable RIFF/WAVE (${wav.length} bytes) — returning bytes verbatim.`,
    );
    return new Response(wav as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "X-Sarvam-Audio-Format": "wav",
        "Cache-Control": "no-store",
      },
    });
  }

  // ─── Identity ────────────────────────────────────────────────────────────

  getProviderName(): VoiceProvider {
    return "sarvam";
  }
}

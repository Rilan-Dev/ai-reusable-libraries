/**
 * src/modules/phone/providers/twilio.ts
 * Twilio provider adapter.
 *
 * Call flow:
 *   1. Twilio calls POST /api/phone/twilio/incoming (voice webhook)
 *   2. Server returns TwiML <Connect><Stream> pointing to our WebSocket
 *   3. Twilio opens WebSocket to /api/phone/twilio/stream
 *   4. Audio flows: Twilio → mulaw 8kHz → CallHandler → pcm16 → OpenAI Realtime
 *   5. Response audio: OpenAI → pcm16 → CallHandler → mulaw 8kHz → Twilio
 *
 * Docs: https://www.twilio.com/docs/voice/media-streams
 */
import crypto from "node:crypto";
import type { PhoneCallConfig, PhoneProviderAdapter } from "../core/types";

export class TwilioAdapter implements PhoneProviderAdapter {
  readonly answerContentType = "text/xml";
  readonly audioFormat       = "mulaw_8khz" as const;

  private authToken: string;

  constructor(authToken?: string) {
    this.authToken = authToken ?? process.env.TWILIO_AUTH_TOKEN ?? "";
  }

  verifySignature(rawBody: string, headers: Record<string, string | undefined>): boolean {
    const signature = headers["x-twilio-signature"];
    const url       = headers["x-forwarded-url"] ?? headers["host"] ?? "";
    if (!signature || !this.authToken) return false;

    // Twilio signature: HMAC-SHA1 of URL + sorted POST params
    try {
      const expected = crypto
        .createHmac("sha1", this.authToken)
        .update(url + rawBody)
        .digest("base64");
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  buildAnswerResponse(wsUrl: string, callSid: string, config: PhoneCallConfig): string {
    // TwiML: connect the call to our Media Stream WebSocket
    // The stream sends raw audio to our WS handler
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}">
      <Parameter name="callSid" value="${callSid}" />
      <Parameter name="kbId" value="${config.kbId}" />
    </Stream>
  </Connect>
</Response>`;
  }
}

/**
 * Encode PCM16 (signed 16-bit LE) to mulaw (8-bit G.711 u-law)
 * Required to send OpenAI's audio output back to Twilio.
 */
export function pcm16ToMulaw(pcmBuf: Buffer): Buffer {
  const out = Buffer.allocUnsafe(pcmBuf.length / 2);
  for (let i = 0; i < out.length; i++) {
    const sample = pcmBuf.readInt16LE(i * 2);
    out[i] = encodeMulaw(sample);
  }
  return out;
}

/**
 * Decode mulaw (G.711) to PCM16 (signed 16-bit LE)
 * Required to send Twilio's caller audio to OpenAI.
 */
export function mulawToPcm16(mulawBuf: Buffer): Buffer {
  const out = Buffer.allocUnsafe(mulawBuf.length * 2);
  for (let i = 0; i < mulawBuf.length; i++) {
    out.writeInt16LE(decodeMulaw(mulawBuf[i]!), i * 2);
  }
  return out;
}

// ── G.711 mulaw codec ─────────────────────────────────────────────────────────

const MULAW_BIAS = 0x84;
const MULAW_MAX  = 32767;

function encodeMulaw(sample: number): number {
  const sign  = sample < 0 ? 0x80 : 0;
  sample = Math.min(Math.abs(sample) + MULAW_BIAS, MULAW_MAX + MULAW_BIAS);
  let exp = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exp > 0; exp--, expMask >>= 1) {}
  const mantissa = (sample >> (exp + 3)) & 0x0f;
  return ~(sign | (exp << 4) | mantissa) & 0xff;
}

function decodeMulaw(byte: number): number {
  byte = ~byte;
  const sign     = byte & 0x80;
  const exp      = (byte >> 4) & 0x07;
  const mantissa = byte & 0x0f;
  let   sample   = ((mantissa << 1) + 33) << (exp + 2);
  sample -= MULAW_BIAS;
  return sign ? -sample : sample;
}

// ── Resample 8kHz mulaw → 24kHz PCM16 (linear interpolation) ─────────────────
// OpenAI Realtime API expects 24kHz PCM16.

export function resample8To24kHz(pcm8k: Buffer): Buffer {
  // From 8000 Hz to 24000 Hz: ratio = 3 (exactly)
  const samples8  = pcm8k.length / 2;
  const samples24 = samples8 * 3;
  const out = Buffer.allocUnsafe(samples24 * 2);
  for (let i = 0; i < samples8; i++) {
    const s = pcm8k.readInt16LE(i * 2);
    const n = i + 1 < samples8 ? pcm8k.readInt16LE((i + 1) * 2) : s;
    out.writeInt16LE(s,                            (i * 3) * 2);
    out.writeInt16LE(Math.round((s * 2 + n) / 3),  (i * 3 + 1) * 2);
    out.writeInt16LE(Math.round((s + n * 2) / 3),  (i * 3 + 2) * 2);
  }
  return out;
}

// ── Resample 24kHz PCM16 → 8kHz PCM16 (downsample) ────────────────────────────
// Convert OpenAI output back to 8kHz for Twilio.

export function resample24To8kHz(pcm24k: Buffer): Buffer {
  const samples24 = pcm24k.length / 2;
  const samples8  = Math.floor(samples24 / 3);
  const out = Buffer.allocUnsafe(samples8 * 2);
  for (let i = 0; i < samples8; i++) {
    // Average every 3 samples
    const a = pcm24k.readInt16LE((i * 3) * 2);
    const b = pcm24k.readInt16LE((i * 3 + 1) * 2);
    const c = pcm24k.readInt16LE((i * 3 + 2) * 2);
    out.writeInt16LE(Math.round((a + b + c) / 3), i * 2);
  }
  return out;
}

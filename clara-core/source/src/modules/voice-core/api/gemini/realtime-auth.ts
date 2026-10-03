/**
 * src/modules/voice-core/api/gemini/realtime-auth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared HMAC helpers for the Gemini Live relay (gap-closure Phase D).
 *
 * Same two-credential discipline as the Sarvam V5 and ElevenLabs Mode C relays:
 *
 *   1. Browser session token — minted by POST /api/gemini/session (or the
 *      embed session route when the voice axis resolves to Gemini), carried as
 *      ?token= on the WS upgrade to /api/voice/gemini/realtime. The relay
 *      verifies signature + expiry IN-PROCESS (no DB round-trip per
 *      connection). Format: v1.<expMs>.<kbId>.<orgId>.<hmacHex>
 *
 *   2. The vendor key NEVER mints and NEVER appears in any token: the relay
 *      reads GEMINI_API_KEY from env server-side and builds the upstream
 *      wss://…?key=… URL itself. The browser receives only the relay endpoint
 *      + this short-lived capability token.
 *
 * Mirrors the AUTH_SECRET HMAC discipline of session tokens (auth-core) and
 * realtime-auth.ts of the Sarvam / ElevenLabs relays.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "v1";
/** WS connection hard cap — the token must outlive it. */
export const GEMINI_REALTIME_TOKEN_TTL_MS = 60 * 60 * 1000; // 60 minutes

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  return secret;
}

function hmac(payload: string): string {
  return createHmac("sha256", getAuthSecret()).update(payload).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export interface GeminiRealtimeTokenClaims {
  kbId: string;
  orgId: string;
  expiresAtMs: number;
}

/** Mint a browser session token for one relay connection window. */
export function mintGeminiRealtimeToken(claims: {
  kbId: string;
  orgId: string;
  ttlMs?: number;
}): string {
  const expiresAtMs = Date.now() + (claims.ttlMs ?? GEMINI_REALTIME_TOKEN_TTL_MS);
  const payload = `${TOKEN_VERSION}.${expiresAtMs}.${claims.kbId}.${claims.orgId}`;
  return `${payload}.${hmac(payload)}`;
}

/** Verify a browser session token. Returns null on bad format/signature/expiry. */
export function verifyGeminiRealtimeToken(token: string): GeminiRealtimeTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== TOKEN_VERSION) return null;
  const [, expRaw, kbId, orgId, sig] = parts;
  const expiresAtMs = Number(expRaw);
  if (!Number.isFinite(expiresAtMs)) return null;
  const payload = `${TOKEN_VERSION}.${expRaw}.${kbId}.${orgId}`;
  if (!safeEqualHex(hmac(payload), sig)) return null;
  if (Date.now() >= expiresAtMs) return null;
  return { kbId, orgId, expiresAtMs };
}

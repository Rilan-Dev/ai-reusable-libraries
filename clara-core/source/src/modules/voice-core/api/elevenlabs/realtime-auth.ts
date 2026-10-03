/**
 * src/modules/voice-core/api/elevenlabs/realtime-auth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared HMAC helpers for the ElevenLabs Clara-realtime relays (Mode C)
 * (scripts/elevenlabs-relay.mjs ⇄ the realtime-init / realtime-meter routes).
 *
 * Same two-credential discipline as the Sarvam V5 relay:
 *
 *   1. Browser session token — minted by POST /api/voice/elevenlabs/session
 *      when the Clara-realtime capability is on, carried as ?token= on BOTH
 *      WS upgrades (/api/voice/elevenlabs/realtime + /tts-realtime). The
 *      relay verifies signature + expiry IN-PROCESS (no DB round-trip).
 *      Format: v1.<expMs>.<kbId>.<orgId>.<hmacHex>
 *
 *   2. Relay→route internal header — `x-elevenlabs-relay: <hmacHex>` proving
 *      the caller is the in-process relay. Guards realtime-init (returns the
 *      vendor key to the relay) and realtime-meter (writes usage rows).
 *
 * The vendor API key NEVER reaches the browser — the relay holds it
 * server-side only (plan §12 security invariant).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "v1";
/** WS connection hard cap — the token must outlive it. */
export const ELEVENLABS_REALTIME_TOKEN_TTL_MS = 60 * 60 * 1000; // 60 minutes
const RELAY_HEADER_PAYLOAD = "elevenlabs-relay-v1";

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

export interface ElevenLabsRealtimeTokenClaims {
  kbId: string;
  orgId: string;
  expiresAtMs: number;
}

/** Mint a browser session token for one relay connection window. */
export function mintElevenLabsRealtimeToken(claims: {
  kbId: string;
  orgId: string;
  ttlMs?: number;
}): string {
  const expiresAtMs = Date.now() + (claims.ttlMs ?? ELEVENLABS_REALTIME_TOKEN_TTL_MS);
  const payload = `${TOKEN_VERSION}.${expiresAtMs}.${claims.kbId}.${claims.orgId}`;
  return `${payload}.${hmac(payload)}`;
}

/** Verify a browser session token. Returns null on bad format/signature/expiry. */
export function verifyElevenLabsRealtimeToken(token: string): ElevenLabsRealtimeTokenClaims | null {
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

/**
 * The internal header value the relay attaches to realtime-init /
 * realtime-meter calls. Exported for route-side verification; the relay
 * re-implements the same HMAC in plain JS (scripts/elevenlabs-relay.mjs).
 */
export function elevenLabsRelayHeaderValue(): string {
  return hmac(RELAY_HEADER_PAYLOAD);
}

/** Route-side verification of the x-elevenlabs-relay header. */
export function isElevenLabsRelayRequest(headerValue: string | null): boolean {
  if (!headerValue) return false;
  return safeEqualHex(elevenLabsRelayHeaderValue(), headerValue);
}

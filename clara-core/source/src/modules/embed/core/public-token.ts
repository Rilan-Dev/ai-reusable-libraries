/**
 * src/modules/embed/core/public-token.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Short-lived SIGNED public session tokens for the public PUBLISHED agent page
 * (/agents/:agentId).
 *
 * The published page must be publicly accessible, so it cannot use platform
 * JWTs; and long-lived clr_ embed keys must never be handed to anonymous
 * browsers (they are revocable, but re-minting per visitor would revoke the
 * previous visitor — keys are stored hashed and can never be re-read).
 *
 * Instead, the public config endpoint mints a compact HMAC-signed token that
 * the EXISTING embed validation layer (validateEmbedRequest) accepts as an
 * embed-equivalent credential:
 *
 *   pub_v1.<base64url(payload JSON)>.<hmac-sha256-hex>
 *
 *   payload = { a: agentId, k: kbId, o: orgId, d: deploymentId, e: expMs }
 *
 * Properties:
 *   • server-secret bound — AUTH_SECRET (never a vendor key);
 *   • short TTL (default 2 h) — page-load scoped, not a persistent credential;
 *   • deployment-bound — validation re-checks the ACTIVE deployment and its
 *     publicAccess flag on every use, so unpublishing (or flipping private)
 *     cuts off existing tokens immediately;
 *   • no DB row — nothing to revoke or leak; validation is a single HMAC +
 *     one cached deployment lookup;
 *   • org plan + daily quota + hourly rate limits still apply downstream
 *     (the token maps onto the same guard pipeline as clr_ keys).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "pub_v1.";
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/** AUTH_SECRET (never a vendor key) — same HMAC discipline as session tokens. */
function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  return secret;
}

export interface PublicSessionPayload {
  /** Agent id. */
  a: string;
  /** Primary knowledge-base id bound to the published deployment. */
  k: string;
  /** Owning organisation id. */
  o: string;
  /** Active deployment id at mint time (re-verified on every use). */
  d: string;
  /** Expiry (epoch ms). */
  e: number;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function hmacHex(signedPart: string): string {
  return createHmac("sha256", getAuthSecret()).update(signedPart).digest("hex");
}

/** Mint a public session token bound to an agent's active public deployment. */
export function mintPublicSessionToken(input: {
  agentId: string;
  kbId: string;
  orgId: string;
  deploymentId: string;
  ttlMs?: number;
}): string {
  const payload: PublicSessionPayload = {
    a: input.agentId,
    k: input.kbId,
    o: input.orgId,
    d: input.deploymentId,
    e: Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS),
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signedPart = `${TOKEN_PREFIX}${encoded}`;
  return `${signedPart}.${hmacHex(signedPart)}`;
}

/** True when the raw bearer value is a public session token (cheap prefix check). */
export function isPublicSessionToken(rawCredential: string): boolean {
  return typeof rawCredential === "string" && rawCredential.startsWith(TOKEN_PREFIX);
}

/**
 * Verify a public session token: format, signature (timing-safe) and expiry.
 * Deployment/publicAccess re-verification happens in the validation layer so
 * every request — not just the mint — enforces publication state.
 * Returns null when the token is malformed, forged or expired.
 */
export function verifyPublicSessionToken(
  rawCredential: string,
): { payload: PublicSessionPayload; expiresAt: number } | null {
  if (!isPublicSessionToken(rawCredential)) return null;
  const parts = rawCredential.split(".");
  if (parts.length !== 3) return null;
  const [prefix, encoded, signature] = parts;
  if (prefix !== "pub_v1" || !encoded || !signature) return null;

  const expected = hmacHex(`${prefix}.${encoded}`);
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: PublicSessionPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encoded)) as PublicSessionPayload;
  } catch {
    return null;
  }
  if (
    typeof payload?.a !== "string" ||
    typeof payload?.k !== "string" ||
    typeof payload?.o !== "string" ||
    typeof payload?.d !== "string" ||
    typeof payload?.e !== "number"
  ) {
    return null;
  }
  if (payload.e <= Date.now()) return null;
  return { payload, expiresAt: payload.e };
}

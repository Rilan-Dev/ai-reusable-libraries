/**
 * src/lib/redact.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * WS-1.4: default-ON PII redaction for the Q&A audit trail.
 *
 * Every prompt and every AI answer is masked BEFORE it lands in query_events:
 * emails, phone numbers (international + Indian formats) and payment card
 * identifiers are replaced with stable markers. The audit viewer therefore
 * shows display-safe text by default; the original is kept in the restricted
 * *_raw column ONLY when redaction occurred, and leaves that column through
 * the super-admin justify-and-reveal endpoint (each reveal is audited).
 */

export type RedactionCounts = Record<string, number>;

export type RedactionResult = {
  /** Masked text — safe for display. */
  text: string;
  /** True when anything was masked (callers only keep *_raw when true). */
  changed: boolean;
  /** Per-type counts, e.g. { email: 2, phone: 1 }. */
  counts: RedactionCounts;
};

// ── Pattern library ───────────────────────────────────────────────────────────

// Email — standard practical pattern (local@domain.tld).
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Payment card — 13-19 digits, spaces/dashes allowed between groups.
// Deliberately conservative: requires a 4-6 digit leading group, so ordinary
// 4-digit numbers (years, quantities) and policy IDs stay untouched. The
// final digit carries NO trailing separator, so the space before the next
// word is never swallowed into the marker.
const CARD_RE = /\b(?:\d[ -]?){12,18}\d\b/g;

// Phone — international E.164 (+91…), bracketed area codes, and the common
// 10-digit local forms (5+5 Indian, 3+4 US). Must NOT swallow card-like
// 16-digit runs (CARD_RE runs first) or short numeric tokens.
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?(?:\d{5}[\s.-]?\d{5}|\d{3}[\s.-]?\d{4}|\d{10})\b/g;

export type RedactionType = "email" | "phone" | "payment";

const MARKERS: Record<RedactionType, string> = {
  email:   "[email]",
  phone:   "[phone]",
  payment: "[payment]",
};

/**
 * Mask PII in `input`. Order matters: payment cards first (longest digit
 * runs), then phones, then emails — so a 16-digit card is never split into
 * two fake "phone numbers".
 */
export function redactText(input: string | null | undefined): RedactionResult {
  const original = input ?? "";
  if (!original) return { text: original, changed: false, counts: {} };

  const counts: RedactionCounts = {};
  let text = original;

  const apply = (type: RedactionType, re: RegExp): void => {
    text = text.replace(re, (match) => {
      // Skip obvious non-PII: all-space/dash matches can't happen (regex
      // requires digits), but guard empty markers anyway.
      if (!/\d|@/.test(match)) return match;
      counts[type] = (counts[type] ?? 0) + 1;
      return MARKERS[type];
    });
  };

  apply("payment", CARD_RE);
  apply("phone", PHONE_RE);
  apply("email", EMAIL_RE);

  const changed = Object.keys(counts).length > 0 && text !== original;
  return { text, changed, counts };
}

/** JSONB value for the redactions column: [{type, count}, …]. */
export function redactionEntries(counts: RedactionCounts): Array<{ type: string; count: number }> {
  return Object.entries(counts).map(([type, count]) => ({ type, count }));
}

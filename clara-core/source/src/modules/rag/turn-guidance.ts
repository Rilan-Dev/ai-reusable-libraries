/**
 * src/modules/rag/turn-guidance.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Per-turn guidance for the answering model — ONE provider-neutral text used
 * by every channel: OpenAI Realtime and Gemini Live (injected as a system
 * item / tool result), and the Clara chat pipeline behind ElevenLabs, Sarvam
 * and the text widget.
 *
 * It replaces the old "GROUNDING GUARD … say exactly: <out-of-scope reply>"
 * which made the assistant open conversations with "I can only answer
 * questions about the topics I have been set up for" whenever retrieval had
 * no hit — including for greetings ("வணக்கம்") and "how can you help me?".
 *
 * Nothing here is tenant- or domain-specific. Everything comes from the
 * tenant's own configuration: the knowledge-base topics, the admin's
 * fallback reply (used for its meaning, in the visitor's language — never
 * recited verbatim), and the detected visitor language. The operator's system
 * prompt stays in charge of role, tone and rules; this only adds what the
 * current turn needs.
 */

export type TurnGuidanceInput = {
  /** Retrieval produced relevant knowledge-base evidence. */
  grounded: boolean;
  /** "capability" = the visitor asks what the assistant can help with. */
  intent: "knowledge" | "capability" | "out_of_scope";
  /** Language code to reply in (legacy; prefer languageDirective). */
  responseLanguage?: string | null;
  /** Reply-language directive from the assistant's language policy. */
  languageDirective?: string | null;
  /** The admin's configured fallback reply for unanswerable questions. */
  fallbackReply?: string | null;
  /** What this knowledge base covers (admin description or derived topics). */
  topics?: string | null;
  /** Spoken replies must end on complete sentences. */
  channel?: "voice" | "chat";
};

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function buildTurnGuidance(input: TurnGuidanceInput): string {
  const lines: string[] = ["TURN GUIDANCE (follow together with the operator instructions):"];
  const topics = input.topics?.trim();
  const topicsLine = topics ? `Topics you can help with: ${topics}` : "";

  if (input.languageDirective) {
    lines.push(`- ${input.languageDirective}`);
  } else if (input.responseLanguage) {
    lines.push(
      `- Reply in ${languageName(input.responseLanguage)}, the language the visitor is using, even though the knowledge-base passages may be in another language.`,
    );
  }

  if (input.intent === "capability") {
    lines.push(
      "- The visitor is asking what you can help with. Give a short, friendly overview of the main areas below and invite them to ask about one. Do not refuse and do not say you are restricted.",
    );
    if (topicsLine) lines.push(topicsLine);
  } else if (input.grounded) {
    lines.push(
      "- Answer from the knowledge-base passages provided for this turn. If they only partly cover the question, answer what they support and say which part is not covered. Do not add facts that are not in them.",
    );
  } else {
    lines.push(
      "- No knowledge-base passage matched this message. Decide what it is and respond naturally:",
      "  • A greeting, thanks, small talk or a personal remark: reply warmly and briefly, then invite a question about the topics below.",
      "  • A question about what you can do or which topics you cover: describe the topics below.",
      "  • A specific question the knowledge base does not answer: say briefly that you don't have that specific information, then suggest a related topic you can help with. Do not invent facts.",
    );
    const fallback = input.fallbackReply?.trim();
    if (fallback) {
      lines.push(
        `  For that last case, convey the meaning of the operator's fallback message in the visitor's language (do not recite it word for word): "${fallback}"`,
      );
    }
    lines.push(
      "- Never open with or repeat a restriction such as \"I can only answer questions about the topics I have been set up for\".",
    );
    if (topicsLine) lines.push(topicsLine);
  }

  if (input.channel === "voice") {
    lines.push(
      "- This reply is spoken. Always finish your sentences. If the full answer is long, give the key points and offer to continue, unless the operator instructions say otherwise.",
    );
  }
  return lines.join("\n");
}

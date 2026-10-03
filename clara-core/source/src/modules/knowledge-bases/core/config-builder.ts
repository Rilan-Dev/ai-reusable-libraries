import type { AssistantConfig } from "./models";
import { buildLanguageGuidance, describeLanguage, resolveLanguagePreferences } from "@/modules/assistant/core/config";
import { languagePolicyInstruction, normalizeLanguagePolicy } from "@/modules/assistant/core/language-policy";

export type SessionPromptContext = { kbName: string; kbDescription?: string | null; orgName?: string; documentCount?: number; documentTitles?: string[]; surface?: "embed" | "realtime" | "voice" | "chat"; allowedLanguages?: string[]; responseLanguage?: string | null };

export function buildSystemPrompt(config: AssistantConfig, ctx: SessionPromptContext): string {
  const parts: string[] = [];
  const orgPhrase = ctx.orgName ? ` for ${ctx.orgName}` : "";
  const operatorPrompt = config.systemPrompt.trim();
  // The operator's own prompt defines role, tone, rules and persona. The
  // name line stays neutral so it never contradicts an identity the operator
  // wrote ("You are <X>, a voice assistant" was also sent to text chat).
  parts.push(`Your name is ${config.assistantName}${orgPhrase ? `, assisting visitors${orgPhrase}` : ""}.`);
  if (operatorPrompt) {
    parts.push(operatorPrompt);
    parts.push(
      "The operator instructions above take precedence over the general platform guidance below whenever they conflict, except for the project language allowlist.",
    );
  }
  if (ctx.documentCount !== undefined && ctx.documentCount > 0) parts.push(`You have access to the "${ctx.kbName}" knowledge base, which contains ${ctx.documentCount} document${ctx.documentCount === 1 ? "" : "s"}.`); else parts.push(`You have access to the "${ctx.kbName}" knowledge base.`);
  if (ctx.kbDescription?.trim()) parts.push(`Knowledge-base scope and purpose:\n${ctx.kbDescription.trim()}`);
  if (config.welcomeMessage.trim()) parts.push(`Configured visitor welcome/capability guidance:\n${config.welcomeMessage.trim()}`);
  if (ctx.documentTitles?.length) {
    parts.push(
      "The indexed documents are:\n" +
        ctx.documentTitles.map((title, index) => `  ${index + 1}. ${title}`).join("\n"),
    );
  }

  // Clara is a RAG assistant, not a retrieval-error bot. Retrieved evidence is
  // authoritative for factual/domain answers, but retrieval failure must never
  // suppress normal conversation such as greetings, thanks, acknowledgements,
  // or simple conversational follow-ups.
  parts.push(
    "CORE RESPONSE POLICY: Be a natural AI assistant. Use the knowledge-base evidence supplied for each turn whenever the visitor asks a factual or domain-specific question, and never invent domain facts when evidence is missing. Greetings, thanks, pleasantries, small talk and questions about what you can help with are always welcome: answer them naturally, then invite a question about what you cover. When a specific question is not covered, say briefly that you don't have that information and steer the visitor to a related topic you can help with. Never open a conversation with, or repeat, a restriction such as \"I can only answer questions about the topics I have been set up for\". Follow the per-turn guidance supplied with the context. Never mention retrieval, Qdrant, embeddings, providers, models, or internal context to the visitor.",
  );

  if (ctx.surface !== "embed") {
    parts.push("IMPORTANT: Ground factual/domain answers in the Clara knowledge-base context supplied to you. Retrieved passages are the source of truth. If no relevant passages are supplied, do not fabricate an answer.");
  } else {
    parts.push("PUBLIC VISITOR CHAT RULE: Respond directly and naturally. Use supplied knowledge-base context as the source of truth for factual/domain questions. Treat broad or naturally worded questions as in-scope when retrieved passages contain related facts and synthesize those facts instead of refusing because there is no exact phrase match. For ordinary conversation, answer normally. If a factual/domain question has no supporting context, explain that the configured knowledge base does not contain enough information rather than using a generic topic-restriction refusal. Never make the visitor choose a knowledge base, product, policy type, provider, model, or other configuration.");
  }

  if (config.rules.length > 0) { parts.push("Behaviour rules — follow these strictly:"); config.rules.forEach((rule, index) => parts.push(`  ${index + 1}. ${rule}`)); }

  // Managed FAQ (ElevenLabs-style FAQ tab): canonical Q/A pairs ride the
  // assistant config and are injected as a grounded block the assistant
  // should reuse verbatim when the visitor's question matches.
  const faqItems = config.faqItems ?? [];
  if (faqItems.length > 0) {
    const faqBlock = faqItems
      .map((item, index) => `  Q${index + 1}: ${item.question.trim()}\n  A${index + 1}: ${item.answer.trim()}`)
      .join("\n");
    parts.push(
      "Frequently asked questions — when the visitor's question matches one of these (including paraphrases), answer using the canonical answer below, lightly adapted to the conversation:\n" +
        faqBlock,
    );
  }

  // ONE language policy for every provider and surface (see
  // modules/assistant/core/language-policy.ts): start in the default
  // language, mirror the visitor only within the allowed list, otherwise
  // answer in the default language. The project's allowed languages (the
  // tenant boundary) win over the assistant's own list when supplied.
  const projectLanguages = [...new Set((ctx.allowedLanguages ?? []).map((language) => language.trim().toLowerCase()).filter(Boolean))];
  const languagePolicy = normalizeLanguagePolicy({
    defaultLanguage: config.defaultLanguage,
    allowedLanguages: projectLanguages.length > 0 ? projectLanguages : config.allowedLanguages,
    alwaysRespondIn: config.alwaysRespondIn,
  });
  parts.push(languagePolicyInstruction(languagePolicy));

  // The operator's fallback reply is used for its MEANING, in the visitor's
  // language, with a redirect to what the KB covers — never recited word for
  // word and never for greetings/capability questions. ("Say exactly" made
  // the assistant open conversations with a canned restriction.)
  const fallbackReply = config.outOfScopeReply?.trim();
  const fallbackRule = fallbackReply
    ? ` For a specific question the knowledge base does not cover, convey the meaning of this operator message in the visitor's language (do not recite it word for word), then suggest a related topic you can help with: "${fallbackReply}"`
    : "";
  if (config.strictMode) parts.push("Strict mode is ON. Use it as a knowledge-safety rule, not as a trigger for refusing normal conversation or broad questions. If the supplied context contains relevant information, answer from it even when the wording is broad, abbreviated, contains spelling mistakes, or does not exactly match a source. Capability/onboarding questions (what you can do, how you can help, what topics you cover, what the visitor can ask) are NOT out of scope: answer them from the configured welcome/capability guidance and the knowledge-base scope above. Greetings, thanks, acknowledgements and pleasantries are always allowed. Do not answer domain questions from general knowledge." + fallbackRule);
  else parts.push("If a question is outside this knowledge base, you may help briefly from general knowledge when it is safe, making clear it is not from the knowledge base." + fallbackRule);

  if (config.citeSources) parts.push("When your answer draws from specific document snippets, append inline source references such as [S1], [S2] at the end of the relevant sentence.");
  parts.push("Keep answers concise, warm, and conversational. Do not mention 'retrieval', 'documents', 'RAG', or 'context' — speak like a well-briefed human expert, not a search engine.");
  return parts.join("\n\n");
}

export function buildLanguageGuidanceFromConfig(config: AssistantConfig): { session: string; follow: string } {
  const preferences = resolveLanguagePreferences({ assistant: config.alwaysRespondIn ?? config.defaultLanguage, customer: config.allowedLanguages });
  const guidance = buildLanguageGuidance(preferences);
  return { session: config.alwaysRespondIn && preferences.assistant ? `Always respond in ${describeLanguage(preferences.assistant)}. Do not switch output language unless this configuration is changed.` : guidance.session, follow: config.alwaysRespondIn && preferences.assistant ? `Continue in ${describeLanguage(preferences.assistant)}.` : guidance.follow };
}

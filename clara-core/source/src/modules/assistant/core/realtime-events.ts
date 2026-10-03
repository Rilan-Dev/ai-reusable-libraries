/**
 * OpenAI Realtime server event names — GA and beta.
 *
 * The GA Realtime API (gpt-realtime*, `/v1/realtime/calls`) renamed the
 * model-output events:
 *
 *   beta                               GA
 *   response.audio_transcript.delta    response.output_audio_transcript.delta
 *   response.audio_transcript.done     response.output_audio_transcript.done
 *   response.text.delta                response.output_text.delta
 *   response.text.done                 response.output_text.done
 *   response.audio.delta               response.output_audio.delta
 *   response.audio.done                response.output_audio.done
 *
 * Listening only for the beta names means a GA session never shows the
 * assistant's answer (and phone calls never receive audio). Every consumer
 * accepts both so beta-model sessions keep working.
 *
 * Reference: https://platform.openai.com/docs/api-reference/realtime-server-events
 */

export const ASSISTANT_TRANSCRIPT_DELTA_EVENTS: ReadonlySet<string> = new Set([
  "response.output_audio_transcript.delta",
  "response.output_text.delta",
  "response.audio_transcript.delta",
  "response.text.delta",
]);

export const ASSISTANT_TRANSCRIPT_DONE_EVENTS: ReadonlySet<string> = new Set([
  "response.output_audio_transcript.done",
  "response.output_text.done",
  "response.audio_transcript.done",
  "response.text.done",
]);

export const ASSISTANT_AUDIO_DELTA_EVENTS: ReadonlySet<string> = new Set([
  "response.output_audio.delta",
  "response.audio.delta",
]);

export const ASSISTANT_AUDIO_DONE_EVENTS: ReadonlySet<string> = new Set([
  "response.output_audio.done",
  "response.audio.done",
]);

export const isAssistantTranscriptDelta = (type: unknown): boolean =>
  typeof type === "string" && ASSISTANT_TRANSCRIPT_DELTA_EVENTS.has(type);

export const isAssistantTranscriptDone = (type: unknown): boolean =>
  typeof type === "string" && ASSISTANT_TRANSCRIPT_DONE_EVENTS.has(type);

export const isAssistantAudioDelta = (type: unknown): boolean =>
  typeof type === "string" && ASSISTANT_AUDIO_DELTA_EVENTS.has(type);

export const isAssistantAudioDone = (type: unknown): boolean =>
  typeof type === "string" && ASSISTANT_AUDIO_DONE_EVENTS.has(type);

/**
 * The assistant's full text from a `response.done` event — transcript of
 * audio parts and plain text parts, in order. A fallback for when no delta
 * was received (an unknown future event name, a dropped frame).
 */
export function extractResponseText(response: unknown): string {
  const output = (response as { output?: unknown } | null)?.output;
  if (!Array.isArray(output)) return "";
  const parts: string[] = [];
  for (const item of output) {
    const content = (item as { type?: string; role?: string; content?: unknown } | null);
    if (!content || content.type !== "message" || content.role === "user") continue;
    if (!Array.isArray(content.content)) continue;
    for (const part of content.content) {
      const p = part as { transcript?: unknown; text?: unknown } | null;
      const value = typeof p?.transcript === "string" ? p.transcript : typeof p?.text === "string" ? p.text : "";
      if (value) parts.push(value);
    }
  }
  return parts.join("").trim();
}

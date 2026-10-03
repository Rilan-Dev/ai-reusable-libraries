/**
 * src/modules/assistant/core/voice/sentence-split.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Sentence chunking for streaming TTS (hybrid voice pipeline).
 *
 * While the chat answer streams in token by token, complete sentences are
 * carved out and dispatched to TTS so speech starts before the answer
 * finishes generating. Shared by the useElevenLabsVoice hook and its unit
 * tests — colocated with realtime-audio-config.ts in the shared
 * client-side voice utility folder.
 */

/** Don't TTS tiny fragments — short clips cost a round-trip and stutter. */
export const TTS_SENTENCE_MIN_CHARS = 12;

/**
 * Split buffered text into speakable sentences; returns them and the
 * unspoken remainder (the trailing incomplete sentence stays buffered).
 */
export function splitSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  // Match up to terminal punctuation (incl. international ?, !) + closing quotes.
  const pattern = /[^.!?…।\n]+[.!?…।\n]+["'”’)\]]*\s*/g;
  let consumed = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(buffer)) !== null) {
    const sentence = match[0].trim();
    consumed = match.index + match[0].length;
    if (sentence.length >= TTS_SENTENCE_MIN_CHARS) sentences.push(sentence);
  }
  return { sentences, rest: buffer.slice(consumed) };
}

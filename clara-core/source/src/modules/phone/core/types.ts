/**
 * src/modules/phone/core/types.ts
 */
export type PhoneProvider = "twilio" | "vonage";

/**
 * Realtime engine powering live conversations on a phone config.
 *  - "openai": Clara relay (Twilio Media Streams ⇄ OpenAI Realtime)
 *  - "elevenlabs": ElevenLabs Agents — the incoming webhook returns the
 *    vendor register-call TwiML, audio flows Twilio ⇄ vendor directly.
 */
export type PhoneVoiceEngine = "openai" | "elevenlabs";

export type PhoneCallConfig = {
  id: string; kbId: string; provider: PhoneProvider; enabled: boolean;
  voiceEngine: PhoneVoiceEngine;
  phoneNumber: string | null; greetingMessage: string;
  maxCallDurationSec: number; recordCalls: boolean; transcribeCalls: boolean;
  webhookUrlOverride: string | null; createdAt: string; updatedAt: string;
};

export type PhoneCallLog = {
  id: string; configId: string | null; kbId: string | null;
  provider: PhoneProvider; callSid: string;
  fromNumber: string | null; toNumber: string | null;
  direction: "inbound" | "outbound";
  status: "initiated"|"ringing"|"in-progress"|"completed"|"failed"|"busy"|"no-answer"|"canceled";
  startedAt: string; answeredAt: string | null; endedAt: string | null;
  durationSec: number | null; turnCount: number;
  transcript: Array<{ speaker: "user"|"assistant"; text: string; ts: string }>;
  recordingUrl: string | null; errorMessage: string | null; createdAt: string;
};

export interface PhoneProviderAdapter {
  verifySignature(rawBody: string, headers: Record<string, string | undefined>): boolean;
  buildAnswerResponse(wsUrl: string, callSid: string, config: PhoneCallConfig): string;
  answerContentType: string;
  audioFormat: "mulaw_8khz" | "linear16_16khz";
}

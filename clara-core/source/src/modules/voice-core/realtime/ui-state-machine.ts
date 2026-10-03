/**
 * src/modules/voice-core/realtime/ui-state-machine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Realtime UI state machine (plan Task 8.1).
 *
 *   idle → connecting → listening → thinking → speaking → interrupting → …
 *   any  → error → idle (reconnect starts clean generation state)
 *
 * Rules (plan §8.1):
 *   • `speaking` only belongs to the CURRENT generation — the caller supplies
 *     the coordinator's isCurrentGeneration() verdict, never a bare flag;
 *   • interruption immediately exits speaking (interrupting → listening);
 *   • errors terminate the active generation (the caller's coordinator is
 *     cancelled through the onError hook);
 *   • reconnect starts from a clean generation state.
 *
 * Pure module — no React, no browser APIs. The voice hooks feed it events;
 * VoiceChatModal-style consumers read `current`.
 */

export type RealtimeUiState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "interrupting"
  | "error";

export interface RealtimeUiStateMachineEvents {
  onStateChange?: (next: RealtimeUiState, previous: RealtimeUiState) => void;
  /** Fires when an error terminates the active generation (plan rule). */
  onGenerationTerminated?: (previous: RealtimeUiState) => void;
}

const TRANSITIONS: Record<RealtimeUiState, RealtimeUiState[]> = {
  idle: ["connecting", "error"],
  connecting: ["listening", "idle", "error"],
  listening: ["thinking", "interrupting", "idle", "error", "listening"],
  thinking: ["speaking", "interrupting", "idle", "error", "listening"],
  speaking: ["interrupting", "idle", "listening", "error"],
  interrupting: ["listening", "idle", "thinking", "error"],
  error: ["idle", "connecting"],
};

export class RealtimeUiStateMachine {
  private state: RealtimeUiState = "idle";
  private readonly events: RealtimeUiStateMachineEvents;

  constructor(events?: RealtimeUiStateMachineEvents) {
    this.events = events ?? {};
  }

  get current(): RealtimeUiState {
    return this.state;
  }

  /** All states may fall back to idle on disconnect. */
  disconnected(): void {
    this.transition("idle");
  }

  connectStarted(): void {
    this.transition("connecting");
  }

  /**
   * Connected — includes reconnects: always re-enters the clean listening
   * state (plan rule: reconnect starts clean generation state).
   */
  connected(): void {
    this.transition("listening");
  }

  /** User speech detected (partial transcript / VAD event). */
  userSpeechStarted(): void {
    if (this.state === "speaking") {
      // Barge-in while the assistant speaks → immediate interrupting.
      this.transition("interrupting");
      return;
    }
    this.transition("listening");
  }

  /** User stopped speaking without a committed turn yet. */
  userSpeechEnded(): void {
    if (this.state === "listening") this.transition("idle");
  }

  /** A committed user turn started the assistant generation. */
  turnStarted(): void {
    this.transition("thinking");
  }

  /**
   * Assistant audio is playing. ONLY the current generation may set this:
   * the caller must pass the coordinator verdict — a stale generation can
   * never move the machine into speaking (plan rule 1).
   */
  assistantSpeaking(isCurrentGeneration: boolean): void {
    if (!isCurrentGeneration) return;
    this.transition("speaking");
  }

  /** User interrupted — immediately exits speaking. */
  interrupt(): void {
    this.transition("interrupting");
    // The interrupt window is transient: the very next event decides where
    // to go (listening when the user keeps speaking, thinking on the new
    // turn, idle otherwise). Auto-settle to listening — the user just spoke.
    this.transition("listening");
  }

  /**
   * Fatal error — terminates the ACTIVE generation and lands in error.
   * Recovery returns the UI to a deterministic state (idle on disconnect).
   */
  error(): void {
    const previous = this.state;
    if (previous === "speaking" || previous === "thinking") {
      this.events.onGenerationTerminated?.(previous);
    }
    this.transition("error");
  }

  private transition(next: RealtimeUiState): void {
    if (next === this.state) return;
    const allowed = TRANSITIONS[this.state];
    if (!allowed.includes(next)) {
      // Unlisted transitions are ignored — the machine stays deterministic
      // even when a provider fires events out of order.
      return;
    }
    const previous = this.state;
    this.state = next;
    this.events.onStateChange?.(next, previous);
  }
}

/**
 * Derive the display state from the signals the provider hooks already
 * expose (status + isSpeaking [+ pending turn / partial caption]) — the
 * zero-refactor adoption path for useVoiceClient.
 */
export function deriveRealtimeUiState(input: {
  status: string;
  isSpeaking: boolean;
  isCurrentGeneration?: boolean;
  hasPendingTurn?: boolean;
  hasPartialTranscript?: boolean;
}): RealtimeUiState {
  if (input.status === "error") return "error";
  if (input.status === "connecting") return "connecting";
  if (input.status === "idle" || input.status !== "connected") return "idle";
  // connected:
  if (input.isSpeaking && input.isCurrentGeneration !== false) return "speaking";
  if (input.hasPendingTurn) return "thinking";
  if (input.hasPartialTranscript) return "listening";
  return "listening"; // connected + quiescent === open mic
}

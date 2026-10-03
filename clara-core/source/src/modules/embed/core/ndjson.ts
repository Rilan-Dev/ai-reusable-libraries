export type NDJSONEvent = {
  type: string;
  payload?: unknown;
};

export function encodeNDJSONEvent(event: NDJSONEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/**
 * Parse newline-delimited JSON incrementally. A browser ReadableStream can
 * split a JSON object across arbitrary network chunks, so callers must retain
 * the incomplete tail between chunks.
 */
export function collectNDJSONEvents(chunks: Iterable<string>): NDJSONEvent[] {
  const events: NDJSONEvent[] = [];
  let pending = "";

  for (const chunk of chunks) {
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed) as NDJSONEvent;
        if (event && typeof event.type === "string") events.push(event);
      } catch {
        // Ignore malformed lines; the production client is intentionally
        // tolerant of proxy/transport noise around a valid NDJSON stream.
      }
    }
  }

  const tail = pending.trim();
  if (tail) {
    try {
      const event = JSON.parse(tail) as NDJSONEvent;
      if (event && typeof event.type === "string") events.push(event);
    } catch {
      // Ignore incomplete/malformed trailing data.
    }
  }

  return events;
}

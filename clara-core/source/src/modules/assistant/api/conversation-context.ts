type ConversationMessage = {
  role: string;
  content: string;
};

const MAX_CONTEXT_MESSAGES = 8;
const MAX_CONTEXT_CHARS = 8_000;
const MAX_SEARCH_QUERY_CHARS = 5_500;
const MAX_CHART_MEMORY_ROWS = 30;

const FOLLOW_UP_OR_VISUALIZATION_PATTERN =
  /\b(now|show|chart|graph|plot|visuali[sz]e|view|table|compare|comparison|variant|variants|compose|composed|combo|convert|change|reformat|format|transform|those|these|that|this|them|above|previous|same|it|cost|costs|price|prices|course|courses)\b/i;

export const CHART_RESPONSE_INSTRUCTIONS = [
  "When the user asks for a chart, graph, trend, comparison, breakdown, or visualization, and the available answer includes real numeric data, render the visualization as a fenced code block with language `chart`.",
  "The chart block must contain strict JSON only, with no comments and no trailing commas.",
  'Use this shape: {"type":"bar|line|area|pie|composed","title":"Short title","description":"Optional note","xKey":"label","series":[{"key":"value","label":"Value","color":"#2563eb"}],"data":[{"label":"Jan","value":12}]}',
  "Use stable snake_case keys, numeric values for every series, at most 80 rows, and at most 5 series.",
  "Never output a chart block that only has a title or description; every chart block must include non-empty data rows with numeric series values.",
  "For course, product, price, or cost comparisons, use a bar chart and include only items with actual numeric prices in the chart data; list unavailable prices separately in normal text if needed.",
  "When the user asks for low-to-high or high-to-low prices/costs, sort chart data by the numeric price/cost value in the requested direction.",
  "If the user asks to visualize, chart, reformat, sort, compare, or summarize values already given earlier in this same conversation, use that prior sourced assistant answer as conversation context instead of replying out-of-scope.",
  "A user request like 'show this in compose chart', 'convert this to chart', or 'show the previous result as a chart' is in scope when the previous sourced answer contains the requested values; use type `composed` when the user explicitly asks for a compose/composed/combo chart.",
  "Do not create a chart when neither the knowledge-base context nor the prior sourced conversation contains enough numeric data; answer normally instead.",
].join(" ");

export function withChartInstructions(systemPrompt: string): string {
  return `${systemPrompt}\n\n${CHART_RESPONSE_INSTRUCTIONS}`;
}

function normalizeContent(content: string): string {
  return preserveChartDataForConversationMemory(content)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const match = value.trim().match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toText(value: unknown, fallback = ""): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  return fallback;
}

function inferChartXKey(rows: Record<string, unknown>[]): string | null {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return (
    keys.find((key) => ["label", "name", "course", "product", "category", "date"].includes(key)) ??
    keys.find((key) => rows.some((row) => typeof row[key] === "string")) ??
    keys[0] ??
    null
  );
}

function getChartSeriesKeys(parsed: Record<string, unknown>, rows: Record<string, unknown>[], xKey: string): string[] {
  const keys: string[] = [];

  if (Array.isArray(parsed.series)) {
    for (const item of parsed.series) {
      if (typeof item === "string") {
        keys.push(item);
      } else if (isRecord(item) && typeof item.key === "string") {
        keys.push(item.key);
      }
    }
  }

  for (const key of [parsed.yKey, parsed.valueKey]) {
    if (typeof key === "string") keys.push(key);
  }

  if (keys.length === 0) {
    const allKeys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    for (const key of allKeys) {
      if (key !== xKey && rows.some((row) => toNumber(row[key]) !== null)) {
        keys.push(key);
      }
    }
  }

  return Array.from(new Set(keys)).slice(0, 5);
}

function summarizeChartJson(rawJson: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson.trim());
  } catch {
    return " ";
  }

  if (!isRecord(parsed)) return " ";

  const rowsInput = parsed.data ?? parsed.rows ?? parsed.values ?? parsed.items;
  if (!Array.isArray(rowsInput)) return " ";

  const rows = rowsInput.filter(isRecord).slice(0, MAX_CHART_MEMORY_ROWS);
  if (rows.length === 0) return " ";

  const xKey = toText(parsed.xKey) || toText(parsed.nameKey) || inferChartXKey(rows);
  if (!xKey) return " ";

  const seriesKeys = getChartSeriesKeys(parsed, rows, xKey);
  if (seriesKeys.length === 0) return " ";

  const title = toText(parsed.title, "previous chart");
  const rowSummaries = rows
    .map((row) => {
      const label = toText(row[xKey], "item");
      const values = seriesKeys
        .map((key) => {
          const value = toNumber(row[key]);
          return value === null ? null : `${key}: ${value}`;
        })
        .filter(Boolean);

      return values.length > 0 ? `${label} (${values.join(", ")})` : null;
    })
    .filter(Boolean);

  if (rowSummaries.length === 0) return " ";

  return ` Chart data from ${title}: ${rowSummaries.join("; ")}. `;
}

function preserveChartDataForConversationMemory(content: string): string {
  return content.replace(
    /```(?:chart|ai-chart)(?:\s+json)?[^\S\r\n]*(?:\r?\n)?([\s\S]*?)```/gi,
    (_, rawJson: string) => summarizeChartJson(rawJson),
  );
}

export function buildRecentConversationContextBlock(messages: ConversationMessage[]): string {
  const recentConversationContext = buildRecentConversationContext(messages);

  return recentConversationContext
    ? [
        "Prior sourced conversation context for follow-up transformations:",
        "Treat this prior context as in-scope when the user asks to show, convert, reformat, compose, compare, or visualize previous results.",
        recentConversationContext,
      ].join("\n")
    : "";
}

export function buildRecentConversationContext(messages: ConversationMessage[]): string {
  const priorMessages = messages
    .slice(0, -1)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-MAX_CONTEXT_MESSAGES);

  if (priorMessages.length === 0) {
    return "";
  }

  return priorMessages
    .map((message) => {
      const role = message.role === "assistant" ? "Assistant" : "User";
      return `${role}: ${normalizeContent(message.content).slice(0, 1_200)}`;
    })
    .join("\n")
    .slice(-MAX_CONTEXT_CHARS);
}

export function buildConversationAwareSearchQuery(
  messages: ConversationMessage[],
  latestUserContent: string,
): string {
  const query = latestUserContent.trim();
  const recentConversation = buildRecentConversationContext(messages);

  if (!recentConversation) {
    return query;
  }

  if (!FOLLOW_UP_OR_VISUALIZATION_PATTERN.test(query) && query.length >= 80) {
    return query;
  }

  return [
    `Latest user request: ${query}`,
    "Use the recent conversation to resolve references like now, this, these, those, above, same, chart view, compose chart, cost, price, course, or variants.",
    "Recent conversation:",
    recentConversation,
  ]
    .join("\n\n")
    .slice(0, MAX_SEARCH_QUERY_CHARS);
}

/**
 * The most recent turns sent to the model. Long conversations used to send
 * their entire history on every turn — cost and latency grew without bound
 * and very long chats could overflow the model's context window. Override
 * with CHAT_HISTORY_MAX_MESSAGES.
 */
export function recentMessages<T>(messages: T[]): T[] {
  const configured = Number(process.env.CHAT_HISTORY_MAX_MESSAGES);
  const limit = Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 20;
  return messages.length > limit ? messages.slice(-limit) : messages;
}

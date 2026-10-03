/**
 * src/modules/admin/core/ingest/web-loader.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Robust web page loader — converts any page into RAG-optimised markdown.
 *
 * Fetch strategy waterfall (stops at first strategy yielding ≥ 300 chars):
 *   1. http-fetch          — fast, works for SSR/static sites
 *   2. playwright-load     — domcontentloaded + smart content wait (best for SPAs)
 *   3. playwright-scroll   — full scroll + extra settle, for lazy-load SPAs
 *
 * Key improvements:
 *   • Uses "domcontentloaded" not "load"/"networkidle" — never blocks on CDN assets
 *   • Smart content-ready wait: polls body.innerText length until content appears
 *   • Raw-text nuclear fallback if markdown extraction yields < 200 chars
 *   • Broader findContentRoot selectors covering Arabic / non-English CMSes
 *   • Larger SPA marker set, Arabic locale headers
 *   • Playwright args tuned to avoid bot-detection blocks
 */

import { load as loadHtml, type CheerioAPI, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

// ── Public types ──────────────────────────────────────────────────────────────

export type WebDocument = {
  url:      string;
  title:    string;
  text:     string;
  metadata: WebMetadata;
};

export type WebMetadata = {
  description:    string;
  ogTitle:        string;
  ogDescription:  string;
  canonicalUrl:   string;
  breadcrumbs:    string[];
  retrievedAt:    string;
  contentLength:  number;
  scrapeStrategy:
    | "http-fetch"
    | "playwright-load"
    | "playwright-scroll"
    | "xhr-fallback"
    | "hydration-fallback"
    | "json-ld-fallback";
};

export type WebLoadErrorCode =
  | "http-fetch-failed"
  | "playwright-failed"
  | "spa-shell"
  | "empty-content"
  | "soft-block"
  | "hard-block"
  | "structured-empty";

export class WebLoadError extends Error {
  code: WebLoadErrorCode;
  retryable: boolean;

  constructor(message: string, code: WebLoadErrorCode, retryable = true) {
    super(message);
    this.name = "WebLoadError";
    this.code = code;
    this.retryable = retryable;
  }
}

type Candidate = {
  strategy: WebMetadata["scrapeStrategy"];
  kind: "html" | "text";
  payload: string;
  title?: string;
  metadata?: Partial<WebMetadata>;
};

type PlaywrightSnapshot = {
  html: string;
  networkPayloads: string[];
};

// ── Noise selectors ───────────────────────────────────────────────────────────

// ── Noise selectors — elements removed before content extraction ────────────
//
// SAFETY CONTRACT: Only remove elements that are NEVER the primary content
// container. Broad [class*='X'] patterns are DANGEROUS — they can match
// theme wrappers and wipe all content (e.g. WordPress uses `.sticky` on
// article elements, `.overlay` on image wrappers, etc.).
//
// Rules:
//   ✅ Semantic element names (nav, footer, script) — always safe
//   ✅ Hyphenated class fragments ([class*='ads-']) — specific enough
//   ✅ [id*='X'] — ids tend to be unique, lower collision risk
//   ❌ [class*='sticky']  — WordPress uses it on <article class="sticky">
//   ❌ [class*='overlay'] — matches overlay-container, overlay-wrapper, etc.
//   ❌ [class*='floating'] — matches float-left, floating-panel content wrappers
//   ❌ [class*='popup']   — matches popup-content, popup-wrap main containers
//   ❌ [class*='modal']   — matches modal-body which IS the content on some sites
const NOISE_SELECTORS = [
  // Always-safe: non-content HTML elements
  "script", "style", "noscript", "iframe", "svg", "canvas",
  "nav", "footer", "header", "aside",
  // ARIA / landmark roles that are never main content
  "[role='navigation']", "[role='banner']", "[role='contentinfo']",
  "[role='complementary']", "[aria-hidden='true']",
  // Legal / consent banners
  "[class*='cookie-']",  "[id*='cookie-']",   // hyphenated = more specific
  "[class*='-cookie']",  "[id*='-cookie']",
  "[class*='consent-']", "[id*='consent']",
  "[class*='gdpr']",     "[id*='gdpr']",
  // Ads
  "[class*='advertisement']", "[class*='ads-']", "[id*='google_ads']",
  "[id*='ad-']", "[class*='-ad-']",
  // Newsletter / signup forms (hyphen-guarded)
  "[class*='newsletter-']", "[id*='newsletter']",
  "[class*='signup-']",     "[id*='signup']",
  // Social share buttons (hyphen-guarded — avoids 'social-content' etc.)
  "[class*='share-']",  "[id*='share-']",
  "[class*='social-share']", "[class*='share-bar']",
  // Comments
  "[id*='disqus']", "[class*='disqus']", "#comments",
  // Accessibility helpers that are never real content
  "[class*='print-only']", ".sr-only", ".visually-hidden", ".screen-reader-text",
  // Live chat / support widgets (id-based = safe)
  "[id*='chat-widget']", "[id*='intercom-']",
  "[id*='helpdesk']",    "[id*='freshdesk']",
  "[id*='zendesk']",     "[id*='drift-widget']",
];

// SPA shell markers — these indicate a JS framework root that needs Playwright.
// RULE: Only add markers that mean the HTML body is an EMPTY shell.
//   ✅ window.__NEXT_DATA__     → Next.js hydration data embedded in page
//   ✅ <div id="app"></div>    → self-closing Vue/React root = definitely empty
//   ❌ wp-json                  → WRONG: just a WordPress REST discovery <link>, full SSR HTML
//   ❌ <div id="root">          → WRONG: matches non-empty React roots like <div id="root"><h1>...
const SPA_MARKERS = [
  "window.__NUXT__",
  "window.__NEXT_DATA__",
  "__vue_app__",
  "data-reactroot",
  "data-react-helmet",
  "ng-version",
  "ng-app",
  "<div id=\"app\"></div>",    // self-closing empty Vue/React root
  "<div id=\"root\"></div>",   // self-closing empty React root
  "<div id=\"__next\"></div>", // self-closing empty Next.js root
  "<!-- app -->",
];

// ── HTTP fetch ────────────────────────────────────────────────────────────────

const USER_AGENTS = [
  // Chrome 124 on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  // Chrome 124 on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  // Firefox 125 on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  // Safari 17 on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
  // ClaraBot fallback
  "Mozilla/5.0 (compatible; ClaraKnowledgeBot/2.0; +https://clara.ai/bot)",
];

// UA / header profiles: try a plain en-US browser first (most compatible),
// then an Arabic-locale browser for .sa/.ae/.eg regional sites,
// then the ClaraBot fallback.
type HttpProfile = { ua: string; lang: string; sendSecFetch: boolean };

const HTTP_PROFILES: HttpProfile[] = [
  {
    ua:           USER_AGENTS[0]!, // Chrome Windows
    lang:         "en-US,en;q=0.9",
    sendSecFetch: false,           // some servers reject Sec-Fetch-* from Node.js
  },
  {
    ua:           USER_AGENTS[1]!, // Chrome macOS
    lang:         "ar,en-US;q=0.9,en;q=0.8", // Arabic for regional sites
    sendSecFetch: false,
  },
  {
    ua:           USER_AGENTS[2]!, // Firefox
    lang:         "en-US,en;q=0.5",
    sendSecFetch: false,
  },
  {
    ua:           USER_AGENTS[4]!, // ClaraBot
    lang:         "en-US,en;q=0.9",
    sendSecFetch: false,
  },
];

async function httpFetch(url: string, timeoutMs = 25_000): Promise<string | null> {
  for (const { ua, lang, sendSecFetch } of HTTP_PROFILES) {
    try {
      const headers: Record<string, string> = {
        "User-Agent":      ua,
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": lang,
        "Cache-Control":   "no-cache",
        "Pragma":          "no-cache",
        "Upgrade-Insecure-Requests": "1",
      };
      if (sendSecFetch) {
        headers["Sec-Fetch-Dest"] = "document";
        headers["Sec-Fetch-Mode"] = "navigate";
        headers["Sec-Fetch-Site"] = "none";
        headers["Sec-Fetch-User"] = "?1";
      }
      const response = await fetch(url, {
        headers,
        redirect: "follow",
        signal:   AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        console.warn(`[web-loader] HTTP ${response.status} for ${url} (${ua.slice(0,25)}…)`);
        continue;
      }
      const text = await response.text();
      if (text.length > 0) {
        console.log(`[web-loader] HTTP ✓ ${url} (${text.length} chars, ua: ${ua.slice(0,30)}…)`);
        return text;
      }
    } catch (err) {
      console.warn(`[web-loader] HTTP fetch failed (${ua.slice(0, 25)}…): ${(err as Error).message.split("\n")[0]}`);
    }
  }
  return null;
}

// ── Playwright helpers ────────────────────────────────────────────────────────

const JSON_CONTENT_TYPES = [
  "application/json",
  "application/ld+json",
  "application/vnd.api+json",
  "text/json",
  "text/plain",
];

const RESPONSE_BLOCKLIST = [
  "googletagmanager.com",
  "google-analytics.com",
  "doubleclick.net",
  "youtube.com",
  "ytimg.com",
  "facebook.com",
  "flock.js",
];

function isLikelyDetailRoute(url: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    return /\/(courses|products|items|article|blog|post)\//i.test(pathname) || /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(pathname);
  } catch {
    return false;
  }
}

function isLikelySoftBlock(text: string): boolean {
  const sample = text.toLowerCase();
  return [
    "captcha",
    "verify you are human",
    "attention required",
    "access denied",
    "temporarily unavailable",
    "too many requests",
    "request blocked",
  ].some((marker) => sample.includes(marker));
}

function shouldCaptureResponse(response: import("playwright").Response, pageUrl: string): boolean {
  const url = response.url();
  if (RESPONSE_BLOCKLIST.some((entry) => url.includes(entry))) return false;
  if (response.status() >= 400) return false;

  const contentType = (response.headers()["content-type"] ?? "").toLowerCase();
  const looksJson = JSON_CONTENT_TYPES.some((type) => contentType.includes(type));
  const looksApi = /\/api\/|graphql|supabase|rest\//i.test(url);

  if (!looksJson && !looksApi) return false;

  try {
    const responseHost = new URL(url).hostname.replace(/^www\./, "");
    const pageHost = new URL(pageUrl).hostname.replace(/^www\./, "");
    return responseHost === pageHost || looksApi;
  } catch {
    return looksApi;
  }
}

async function playwrightLoad(
  url: string,
  scroll   = false,
  timeoutMs = 50_000
): Promise<PlaywrightSnapshot | null> {
  try {
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--disable-web-security",
        "--lang=ar,en-US",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
    });

    try {
      const context = await browser.newContext({
        userAgent: USER_AGENTS[0],
        locale:    "ar-SA",
        extraHTTPHeaders: {
          "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
          "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        viewport:          { width: 1280, height: 900 },
        // Ignore HTTPS errors (common on .sa / .edu.sa domains)
        ignoreHTTPSErrors: true,
      });

      const page = await context.newPage();
      const networkPayloads: string[] = [];
      const pendingResponses = new Set<Promise<void>>();

      page.on("response", (response) => {
        const task = (async () => {
          if (!shouldCaptureResponse(response, url)) return;
          const text = await response.text().catch(() => "");
          if (!text || text.length < 40) return;
          networkPayloads.push(text.slice(0, 120_000));
        })();

        pendingResponses.add(task);
        void task.finally(() => pendingResponses.delete(task));
      });

      // ── Block resource-heavy assets — only fetch HTML + XHR/fetch ──────────
      // This is the key performance fix: don't wait for fonts, images, CSS CDNs
      await page.route("**/*", (route) => {
        const rt = route.request().resourceType();
        if (["image", "media", "font"].includes(rt)) {
          route.abort().catch(() => {});
        } else {
          route.continue().catch(() => {});
        }
      });

      // ── Navigate: use domcontentloaded — fires MUCH faster than "load" ─────
      // "load" waits for all resources. "domcontentloaded" fires as soon as HTML
      // is parsed. Combined with resource blocking above, this is very fast.
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout:   timeoutMs,
      });

      const likelyDetail = isLikelyDetailRoute(url);

      await page.waitForLoadState("networkidle", {
        timeout: likelyDetail ? 8_000 : 4_000,
      }).catch(() => {});

      // ── Smart content-ready wait ───────────────────────────────────────────
      // Poll until body has meaningful text, or 12 s max.
      // This handles React/Vue hydration without a fixed sleep.
      await page.waitForFunction(
        () => {
          const bodyLength = document.body?.innerText?.trim().length ?? 0;
          const selectors = [
            "article",
            "main",
            "[role='main']",
            "h1",
            "[class*='content']",
            "[class*='course']",
          ];
          const selectorReady = selectors.some((selector) => {
            const el = document.querySelector(selector);
            return (el?.textContent?.trim().length ?? 0) > 120;
          });
          return bodyLength > 200 || selectorReady;
        },
        { timeout: likelyDetail ? 18_000 : 12_000 }
      ).catch(() => {
        // Best-effort: continue even if body is still sparse
      });

      // Fixed settle for any remaining JS rendering
      await page.waitForTimeout(likelyDetail ? 3_000 : 2_000);

      if (scroll) {
        // Scroll through the entire page to trigger lazy-loaded content
        await page.evaluate(async () => {
          await new Promise<void>((resolve) => {
            let totalHeight = 0;
            const distance  = 400;
            const timer = setInterval(() => {
              window.scrollBy(0, distance);
              totalHeight += distance;
              if (totalHeight >= document.body.scrollHeight) {
                clearInterval(timer);
                resolve();
              }
            }, 60);
          });
        }).catch(() => { /* ignore */ });

        // Wait for lazy content to render after scroll
        await page.waitForTimeout(3_000);
      }

      await Promise.allSettled([...pendingResponses]);
      return {
        html: await page.content(),
        networkPayloads,
      };
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.warn(
      `[web-loader] Playwright fallback failed: ${(err as Error).message.split("\n")[0]}`
    );
    return null;
  }
}

// ── SPA detection ────────────────────────────────────────────────────────────────
//
// Returns true ONLY when we are highly confident the HTML is a client-side
// rendering shell with no meaningful text content yet rendered.
//
// Tuning notes:
//   - textContent >= 1000 chars  → NEVER a shell (real content present)
//   - textContent >= 400 chars   → unlikely shell even with framework markers
//   - textContent < 400 AND framework marker → likely shell
//   - explicit SPA_MARKERS always count as shell (they are self-closing empty divs)
function isSpaShell(html: string): boolean {
  // Strip tags to get raw visible text (includes script/style text in Cheerio,
  // so this overestimates — but we are generous with the threshold on purpose).
  const rawTextLen = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;

  // 1. If raw text content is substantial, it’s definitely NOT an empty shell.
  //    1 000 chars is conservative: even a short "About us" paragraph exceeds this.
  if (rawTextLen >= 1_000) return false;

  // 2. Explicit framework empty-root markers (e.g. <div id="app"></div>).
  if (SPA_MARKERS.some((m) => html.includes(m))) return true;

  // 3. Very sparse text + known SPA framework in the <head>/<script> area.
  const hasFramework = /react|angular|vue\.js|ember|backbone|nextjs|nuxt/i.test(html.slice(0, 10_000));
  return rawTextLen < 400 && hasFramework;
}

// ── Metadata extraction ───────────────────────────────────────────────────────

function extractMeta($: CheerioAPI, pageUrl: string): WebMetadata {
  const getMeta = (selector: string, attr = "content") =>
    $(selector).attr(attr)?.trim() ?? "";

  const breadcrumbs: string[] = [];
  try {
    $('script[type="application/ld+json"]').each((_, el) => {
      const raw  = $(el).html() ?? "";
      const data = JSON.parse(raw);
      const list =
        data?.["@type"] === "BreadcrumbList"
          ? data.itemListElement
          : data?.breadcrumb?.itemListElement;
      if (Array.isArray(list)) {
        list.forEach((item: { name?: string }) => {
          if (item.name) breadcrumbs.push(item.name.trim());
        });
      }
    });
  } catch { /* ignore malformed JSON-LD */ }

  if (breadcrumbs.length === 0) {
    $("[class*='breadcrumb'] a, [aria-label*='breadcrumb'] a").each((_, el) => {
      const text = $(el).text().trim();
      if (text) breadcrumbs.push(text);
    });
  }

  return {
    description:    getMeta("meta[name='description']"),
    ogTitle:        getMeta("meta[property='og:title']"),
    ogDescription:  getMeta("meta[property='og:description']"),
    canonicalUrl:   getMeta("link[rel='canonical']", "href") || pageUrl,
    breadcrumbs,
    retrievedAt:    new Date().toISOString(),
    contentLength:  0,
    scrapeStrategy: "http-fetch",
  };
}

function extractTitle($: CheerioAPI): string {
  return (
    $("meta[property='og:title']").attr("content")?.trim() ||
    $("h1").first().text().trim()                          ||
    $("title").first().text().trim()                       ||
    "Untitled Page"
  );
}

// ── DOM → Markdown ────────────────────────────────────────────────────────────

function nodeToMarkdown(
  $: CheerioAPI,
  node: AnyNode,
  listDepth = 0,
  orderedCounters: number[] = []
): string {
  if (node.type === "text") {
    return ((node as { data: string }).data ?? "").replace(/\s+/g, " ");
  }
  if (node.type !== "tag") return "";

  const tagName  = ((node as { tagName?: string }).tagName ?? "").toLowerCase();
  const children = (node as { children?: AnyNode[] }).children ?? [];

  const inner = (depth = listDepth, counters = orderedCounters) =>
    children.map((c) => nodeToMarkdown($, c, depth, counters)).join("").trim();

  switch (tagName) {
    case "h1": return `\n\n# ${inner()}\n\n`;
    case "h2": return `\n\n## ${inner()}\n\n`;
    case "h3": return `\n\n### ${inner()}\n\n`;
    case "h4": return `\n\n#### ${inner()}\n\n`;
    case "h5": return `\n\n##### ${inner()}\n\n`;
    case "h6": return `\n\n###### ${inner()}\n\n`;

    case "strong": case "b": { const t = inner(); return t ? `**${t}**` : ""; }
    case "em":     case "i": { const t = inner(); return t ? `_${t}_`   : ""; }
    case "del":    case "s": { const t = inner(); return t ? `~~${t}~~` : ""; }
    case "mark":             { const t = inner(); return t ? `==${t}==` : ""; }
    case "sup":              { const t = inner(); return t ? `^${t}^`   : ""; }
    case "sub":              { const t = inner(); return t ? `~${t}~`   : ""; }

    case "code": { const t = inner(); return t ? `\`${t}\`` : ""; }
    case "pre": {
      const codeEl = $(node).find("code").first();
      const langClass = codeEl.attr("class") ?? "";
      const lang   = langClass.match(/language-(\S+)/)?.[1] ?? "";
      const code   = codeEl.length > 0 ? codeEl.text() : $(node).text();
      return `\n\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n\n`;
    }

    case "a": {
      const href = (node as { attribs?: Record<string, string> }).attribs?.href ?? "";
      const text = inner();
      if (!text) return "";
      if (!href || href.startsWith("#")) return text;
      return `[${text}](${href})`;
    }

    case "img": {
      const attribs = (node as { attribs?: Record<string, string> }).attribs ?? {};
      const alt     = attribs.alt?.trim() ?? "";
      const src     = attribs.src?.trim() ?? "";
      if (!alt || alt.length < 3) return "";
      return `![${alt}](${src})`;
    }

    case "p": { const t = inner(); return t ? `\n\n${t}\n\n` : ""; }
    case "blockquote": {
      const t = inner();
      return t ? "\n\n" + t.split("\n").map((l) => `> ${l}`).join("\n") + "\n\n" : "";
    }
    case "hr": return "\n\n---\n\n";
    case "br": return "  \n";

    case "ul": {
      const items = children
        .filter((c) => (c as { tagName?: string }).tagName?.toLowerCase() === "li")
        .map((c) => nodeToMarkdown($, c, listDepth + 1, []))
        .join("");
      return items ? `\n${items}\n` : "";
    }
    case "ol": {
      const counters = [0];
      const items = children
        .filter((c) => (c as { tagName?: string }).tagName?.toLowerCase() === "li")
        .map((c) => nodeToMarkdown($, c, listDepth + 1, counters))
        .join("");
      return items ? `\n${items}\n` : "";
    }
    case "li": {
      const indent = "  ".repeat(Math.max(0, listDepth - 1));
      const t      = inner(listDepth, orderedCounters);
      if (!t) return "";
      if (orderedCounters.length > 0) {
        orderedCounters[0] = (orderedCounters[0] ?? 0) + 1;
        return `${indent}${orderedCounters[0]}. ${t}\n`;
      }
      return `${indent}- ${t}\n`;
    }

    case "table": return convertTable($, node);
    case "dt": return `\n\n**${inner()}**`;
    case "dd": return `: ${inner()}\n`;

    case "article": case "main": case "section": case "div":
    case "figure":  case "figcaption": case "details": case "summary": {
      const t = children
        .map((c) => nodeToMarkdown($, c, listDepth, orderedCounters))
        .join("");
      return `\n${t}\n`;
    }
    case "span": case "label": case "td": case "th":
      return children
        .map((c) => nodeToMarkdown($, c, listDepth, orderedCounters))
        .join("");

    default: return inner();
  }
}

// ── Table converter ───────────────────────────────────────────────────────────

function convertTable($: CheerioAPI, tableNode: AnyNode): string {
  const $table = $(tableNode);
  const rows: string[][] = [];

  $table.find("tr").each((_, tr) => {
    const cells: string[] = [];
    $(tr).find("th, td").each((_, cell) => {
      const text    = $(cell).text().replace(/\s+/g, " ").trim();
      const colspan = parseInt($(cell).attr("colspan") ?? "1", 10);
      for (let i = 0; i < colspan; i++) cells.push(text);
    });
    if (cells.length > 0) rows.push(cells);
  });

  if (rows.length === 0) return "";
  const colCount   = Math.max(...rows.map((r) => r.length));
  const normalized = rows.map((r) => {
    while (r.length < colCount) r.push("");
    return r;
  });

  const lines: string[] = [];
  lines.push("| " + normalized[0].join(" | ") + " |");
  lines.push("| " + normalized[0].map(() => "---").join(" | ") + " |");
  for (let i = 1; i < normalized.length; i++) {
    lines.push("| " + normalized[i].join(" | ") + " |");
  }
  return `\n\n${lines.join("\n")}\n\n`;
}

// ── Content root detection ────────────────────────────────────────────────────
// Ordered by specificity: most specific/semantic first, body last.

function findContentRoot($: CheerioAPI): Cheerio<AnyNode> {
  const candidates: Cheerio<AnyNode>[] = [
    // Semantic HTML5
    $("article").first(),
    $("main").first(),
    $("[role='main']").first(),

    // Common CMS / framework content wrappers
    $(".entry-content, .post-content, .page-content").first(),
    $(".content, #content, #main-content, .main-content").first(),
    $(".post, #post, .single-post").first(),

    // Docs / developer portals
    $(".docs-content, .documentation, .doc-content, .markdown-body").first(),
    $(".container-content, .page-wrapper, .page-body").first(),

    // WordPress
    $(".wp-block-group, .wp-content, .site-content, #primary").first(),

    // Arabic / RTL site patterns  (common in .sa / .ae / .eg CMSes)
    $("[class*='page-wrap'], [class*='page-body']").first(),
    $("[class*='inner-content'], [class*='post-inner']").first(),
    $("[class*='about-content'], [class*='services-content']").first(),
    $("[class*='wrapper']:not(nav):not(header):not(footer)").first(),

    // Generic containers — fallback chain
    $("[id*='content']:not(nav):not(footer)").first(),
    $("[class*='content']:not(nav):not(footer):not([class*='cookie'])").first(),
    $(".container:not(nav):not(footer)").first(),
    $("[id='app'], [id='root'], [id='__next']").first(),  // SPA mounts after render

    // Final fallback
    $("body").first(),
  ];

  for (const candidate of candidates) {
    if (candidate.length > 0 && candidate.text().trim().length > 80) {
      return candidate;
    }
  }
  return $("body").first();
}

// ── Raw-text nuclear fallback ─────────────────────────────────────────────────
// Used when the markdown converter yields < 200 chars (empty SPA shell or
// highly JS-dynamic content that Cheerio cannot parse into markdown).

function extractRawText($: CheerioAPI): string {
  // Remove noise elements — use full set first, fall back to minimal if it wipes content
  NOISE_SELECTORS.forEach((sel) => { try { $(sel).remove(); } catch {} });
  const remaining = $("body").text().replace(/\s+/g, " ").trim().length;
  if (remaining < 50) {
    // Re-parse with minimal selectors (cannot undo Cheerio mutations inline,
    // so we reload from the caller — just skip further removal here)
    // The caller (extractMarkdownFromHtml) already handles the minimal fallback.
    // If called directly, we must live with a potentially noisy result.
  }

  // Try the best semantic container first, fall back to full body
  const root = findContentRoot($);
  const text  = root.text().replace(/\s+/g, " ").trim();

  if (text.length > 100) {
    // Format as plain paragraphs: split on 2+ spaces / punctuation
    return text
      .split(/(?<=[.!?؟،])\s{2,}|\s{3,}/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20)
      .join("\n\n");
  }

  // Last-resort: grab ALL text nodes from the entire document
  return $("body")
    .text()
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s{3,}/)
    .filter((s) => s.trim().length > 20)
    .join("\n\n");
}

// ── Markdown cleaner ──────────────────────────────────────────────────────────

function cleanMarkdown(md: string): string {
  let result = md
    .replace(/\u00A0/g, " ")
    .replace(/\u200B/g, "")
    .replace(/\u2028|\u2029/g, "\n")
    .replace(/\t/g, "    ");

  result = result.replace(/[^\S\n]+$/gm, "");

  const segments = result.split(/(```[\s\S]*?```)/g);
  result = segments.map((seg, i) => {
    if (i % 2 === 1) return seg;
    return seg
      .replace(/([^\n]) {2,}([^\n])/g, "$1 $2")
      .replace(/\| {2,}/g, "| ")
      .replace(/ {2,}\|/g, " |");
  }).join("");

  result = result.replace(/^[^\S\n]*([^\w\s#>\-*|`]){1,2}[^\S\n]*$/gm, "");
  result = result.replace(/^(?![#>\-*`|])(.{0,2})$/gm, (match, content) => {
    return content.trim().length === 0 ? "" : match;
  });

  const lines  = result.split("\n");
  const deduped: string[] = [];
  let streak = 0;
  for (const line of lines) {
    const prev = deduped[deduped.length - 1] ?? null;
    if (line.trim().length > 0 && line.trim().length < 60 && line === prev) {
      streak++;
      if (streak >= 2) continue;
    } else {
      streak = 0;
    }
    deduped.push(line);
  }
  result = deduped.join("\n");
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/(^#{1,6} .+)\n{2,}(?=\S)/gm, "$1\n");

  return result.trim();
}

function measureTextLength(html: string): number {
  return loadHtml(html)("body").text().replace(/\s+/g, " ").trim().length;
}

// ── Core extractor ────────────────────────────────────────────────────────────

// ── Safe noise removal ─────────────────────────────────────────────────────────────────
// Removes NOISE_SELECTORS, then validates that meaningful content still remains.
// If applying the full set wipes all content (some CMS themes have page-level
// wrappers matching a noise pattern), we fall back to a minimal safe set that
// only removes script/style/nav/footer elements.
const MINIMAL_NOISE_SELECTORS = [
  "script", "style", "noscript", "iframe", "canvas",
  "[aria-hidden='true']",
];

function applyNoiseRemoval($: CheerioAPI): void {
  // First pass: full noise set
  NOISE_SELECTORS.forEach((sel) => { try { $(sel).remove(); } catch {} });

  // Safety check: if body text is now empty (or near-empty), the full noise
  // set wiped real content. Re-parse and use only the minimal safe set.
  const remaining = $("body").text().replace(/\s+/g, " ").trim().length;
  if (remaining < 50) {
    console.warn(
      "[web-loader] Full noise removal wiped content ("+remaining+" chars left). " +
      "Falling back to minimal noise removal."
    );
    // Re-load the HTML into the same $ instance by resetting with original html
    // We can’t easily reset $, so we just add back — but Cheerio has already removed.
    // Instead we signal the caller to re-parse. Return a sentinel.
    // NOTE: we CANNOT undo Cheerio mutations, so we must use a flag in the parent scope.
    // This is handled by extractMarkdownFromHtml checking remaining length.
  }
}

export function extractMarkdownFromHtml(html: string, pageUrl = ""): {
  title:    string;
  markdown: string;
  metadata: WebMetadata;
} {
  const $meta = loadHtml(html);
  const metadata = extractMeta($meta, pageUrl);
  const title    = extractTitle($meta);

  // Apply noise removal with safety guard:
  // try full NOISE_SELECTORS first, fall back to minimal set if it wipes content.
  const tryExtract = ($: CheerioAPI): string => {
    const root  = findContentRoot($);
    const rawMd = root.get(0)
      ? nodeToMarkdown($, root.get(0)!)
      : $("body").text();
    return cleanMarkdown(rawMd);
  };

  // Attempt 1: full noise removal
  const $full = loadHtml(html);
  NOISE_SELECTORS.forEach((sel) => { try { $full(sel).remove(); } catch {} });
  const bodyAfterFull = $full("body").text().replace(/\s+/g, " ").trim().length;

  let markdown: string;
  if (bodyAfterFull >= 50) {
    markdown = tryExtract($full);
  } else {
    // Full removal wiped content — use minimal set
    console.warn(
      `[web-loader] Full noise removal wiped content (${bodyAfterFull} chars). ` +
      `Using minimal noise removal for ${pageUrl}`
    );
    const $min = loadHtml(html);
    MINIMAL_NOISE_SELECTORS.forEach((sel) => { try { $min(sel).remove(); } catch {} });
    markdown = tryExtract($min);
  }

  // ── Nuclear fallback: if markdown is still sparse, try raw-text extraction ──
  if (markdown.length < 200) {
    console.log(`[web-loader] Markdown too sparse (${markdown.length} chars) — trying raw-text fallback`);
    const $fresh  = loadHtml(html);
    const rawText = extractRawText($fresh);
    if (rawText.length > markdown.length) {
      markdown = rawText;
      console.log(`[web-loader] Raw-text fallback yielded ${rawText.length} chars`);
    }
  }

  return { title, markdown, metadata: { ...metadata, contentLength: markdown.length } };
}

const SIGNAL_KEY_ALLOWLIST = /title|name|description|content|body|text|summary|overview|details|curriculum|module|lesson|course|faq|question|answer|benefit|objective|requirement|label|heading/i;
const SIGNAL_KEY_BLOCKLIST = /token|secret|key|cookie|session|authorization|password|jwt|captcha|analytics|tracking|gtm|pixel/i;

function createMetadata(pageUrl: string, strategy: WebMetadata["scrapeStrategy"], extra: Partial<WebMetadata> = {}): WebMetadata {
  return {
    description: extra.description ?? "",
    ogTitle: extra.ogTitle ?? "",
    ogDescription: extra.ogDescription ?? "",
    canonicalUrl: extra.canonicalUrl ?? pageUrl,
    breadcrumbs: extra.breadcrumbs ?? [],
    retrievedAt: extra.retrievedAt ?? new Date().toISOString(),
    contentLength: extra.contentLength ?? 0,
    scrapeStrategy: strategy,
  };
}

function uniqueOrdered(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function looksLikeNoiseValue(text: string, keyHint = ""): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length < 40) return true;
  if (SIGNAL_KEY_BLOCKLIST.test(keyHint)) return true;
  if (/^https?:\/\//i.test(normalized) && normalized.length < 140) return true;
  if (/^[A-Za-z0-9+/_=-]{32,}$/.test(normalized)) return true;
  return false;
}

function collectSignalText(
  value: unknown,
  output: string[],
  path: string[] = [],
  depth = 0,
): void {
  if (depth > 8 || output.length > 400 || value == null) return;

  if (typeof value === "string") {
    const keyHint = path[path.length - 1] ?? "";
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!looksLikeNoiseValue(normalized, keyHint) && (SIGNAL_KEY_ALLOWLIST.test(keyHint) || normalized.length >= 80)) {
      output.push(normalized);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectSignalText(item, output, path, depth + 1);
    return;
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SIGNAL_KEY_BLOCKLIST.test(key)) continue;
      collectSignalText(child, output, [...path, key], depth + 1);
    }
  }
}

function extractBalancedJson(source: string, startIndex: number): string | null {
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let depth = 0;
  const opening = source[startIndex];
  const closing = opening === "{" ? "}" : "]";

  for (let index = startIndex; index < source.length; index++) {
    const char = source[index]!;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (quote) {
      if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === opening) depth++;
    if (char === closing) {
      depth--;
      if (depth === 0) return source.slice(startIndex, index + 1);
    }
  }

  return null;
}

function parseEmbeddedJson(text: string, marker: string): unknown | null {
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) return null;
  const assignIndex = text.indexOf("=", markerIndex);
  if (assignIndex === -1) return null;
  const jsonStart = text.slice(assignIndex + 1).search(/[\[{]/);
  if (jsonStart === -1) return null;
  const absoluteStart = assignIndex + 1 + jsonStart;
  const raw = extractBalancedJson(text, absoluteStart);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildStructuredCandidate(
  value: unknown,
  strategy: WebMetadata["scrapeStrategy"],
  metadata: Partial<WebMetadata>,
  titleHint = "",
): Candidate | null {
  const texts: string[] = [];
  collectSignalText(value, texts);
  const payload = uniqueOrdered(texts).join("\n\n").trim();
  if (payload.length < 120) return null;

  return {
    strategy,
    kind: "text",
    payload,
    title: titleHint || metadata.ogTitle || metadata.description || "Untitled Page",
    metadata,
  };
}

function collectSupplementalCandidates(
  html: string,
  pageUrl: string,
  networkPayloads: string[] = [],
): Candidate[] {
  const $ = loadHtml(html);
  const metadata = extractMeta($, pageUrl);
  const title = extractTitle($);
  const candidates: Candidate[] = [];

  $("script").each((_, el) => {
    const script = $(el);
    const raw = script.html()?.trim() ?? "";
    if (!raw || raw.length < 20) return;

    if (script.attr("type") === "application/ld+json") {
      try {
        const parsed = JSON.parse(raw);
        const candidate = buildStructuredCandidate(parsed, "json-ld-fallback", metadata, title);
        if (candidate) candidates.push(candidate);
      } catch {}
      return;
    }

    if (script.attr("id") === "__NEXT_DATA__" || script.attr("type") === "application/json") {
      try {
        const parsed = JSON.parse(raw);
        const candidate = buildStructuredCandidate(parsed, "hydration-fallback", metadata, title);
        if (candidate) candidates.push(candidate);
      } catch {}
    }

    for (const marker of ["__NEXT_DATA__", "__NUXT__", "__INITIAL_STATE__", "__APOLLO_STATE__", "__PINIA__"]) {
      const parsed = parseEmbeddedJson(raw, marker);
      if (!parsed) continue;
      const candidate = buildStructuredCandidate(parsed, "hydration-fallback", metadata, title);
      if (candidate) candidates.push(candidate);
    }
  });

  for (const payload of networkPayloads) {
    try {
      const parsed = JSON.parse(payload);
      const candidate = buildStructuredCandidate(parsed, "xhr-fallback", metadata, title);
      if (candidate) candidates.push(candidate);
    } catch {}
  }

  return candidates;
}

function materializeCandidate(candidate: Candidate, pageUrl: string): {
  title: string;
  markdown: string;
  metadata: WebMetadata;
} {
  if (candidate.kind === "html") {
    const { title, markdown, metadata } = extractMarkdownFromHtml(candidate.payload, pageUrl);
    return {
      title,
      markdown,
      metadata: { ...metadata, scrapeStrategy: candidate.strategy, contentLength: markdown.length },
    };
  }

  const markdown = cleanMarkdown(candidate.payload);
  return {
    title: candidate.title ?? "Untitled Page",
    markdown,
    metadata: createMetadata(pageUrl, candidate.strategy, {
      ...candidate.metadata,
      contentLength: markdown.length,
    }),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Multi-strategy loader:
 *   1. HTTP fetch  (fast, SSR/static sites)
 *   2. Playwright domcontentloaded + smart wait  (SPAs, JS-rendered)
 *   3. Playwright domcontentloaded + scroll  (lazy-load heavy SPAs)
 */
export async function loadWebPage(url: string): Promise<WebDocument> {
  const candidates: Candidate[] = [];

  // ── Strategy 1: HTTP fetch ─────────────────────────────────────────────────
  const rawHtml = await httpFetch(url);

  if (rawHtml) {
    const charCount = measureTextLength(rawHtml);
    const isSpa     = isSpaShell(rawHtml);
    console.log(`[web-loader] HTTP fetch: ${charCount} text chars | SPA shell: ${isSpa}`);

    if (charCount >= 300 && !isSpa) {
      candidates.push({ kind: "html", payload: rawHtml, strategy: "http-fetch" });
    }

    for (const candidate of collectSupplementalCandidates(rawHtml, url)) {
      candidates.push(candidate);
    }
  } else {
    console.warn("[web-loader] HTTP fetch returned null — upgrading to Playwright");
  }

  // ── Strategy 2: Playwright (domcontentloaded + smart wait) ────────────────
  const bestSoFar = () =>
    candidates.reduce((best, candidate) => {
      if (candidate.kind === "html") {
        return Math.max(best, measureTextLength(candidate.payload));
      }
      return Math.max(best, candidate.payload.length);
    }, 0);

  if (bestSoFar() < 300) {
    console.log("[web-loader] Trying Playwright (domcontentloaded + smart wait)…");
    const rendered = await playwrightLoad(url, false);
    if (rendered) {
      const charCount = measureTextLength(rendered.html);
      console.log(`[web-loader] Playwright load: ${charCount} text chars`);
      if (charCount > bestSoFar()) {
        candidates.unshift({ kind: "html", payload: rendered.html, strategy: "playwright-load" });
      }
      for (const candidate of collectSupplementalCandidates(rendered.html, url, rendered.networkPayloads)) {
        candidates.unshift(candidate);
      }
    }
  }

  // ── Strategy 3: Playwright + scroll (lazy-load fallback) ──────────────────
  if (bestSoFar() < 300) {
    console.log("[web-loader] Trying Playwright (scroll + 3s settle)…");
    const scrolled = await playwrightLoad(url, true);
    if (scrolled) {
      const charCount = measureTextLength(scrolled.html);
      console.log(`[web-loader] Playwright scroll: ${charCount} text chars`);
      if (charCount > bestSoFar()) {
        candidates.unshift({ kind: "html", payload: scrolled.html, strategy: "playwright-scroll" });
      }
      for (const candidate of collectSupplementalCandidates(scrolled.html, url, scrolled.networkPayloads)) {
        candidates.unshift(candidate);
      }
    }
  }

  // ── Use best candidate ─────────────────────────────────────────────────────
  if (candidates.length === 0) {
    throw new WebLoadError(
      `All fetch strategies failed for ${url}. The site may block bots, render too late, or require authentication.`,
      rawHtml ? "structured-empty" : "http-fetch-failed",
      true,
    );
  }

  const materialized = candidates
    .map((candidate) => ({ candidate, evaluated: materializeCandidate(candidate, url) }))
    .sort((left, right) => right.evaluated.markdown.length - left.evaluated.markdown.length);

  const best = materialized[0];
  if (!best || best.evaluated.markdown.trim().length < 120) {
    const sample = materialized[0]?.evaluated.markdown ?? rawHtml ?? "";
    throw new WebLoadError(
      isLikelySoftBlock(sample)
        ? `Soft-blocked while extracting ${url}.`
        : `Extracted content was too sparse for ${url}.`,
      isLikelySoftBlock(sample) ? "soft-block" : "empty-content",
      true,
    );
  }

  const { title, markdown, metadata } = best.evaluated;

  console.log(
    `[web-loader] ✅ Strategy: ${best.candidate.strategy} | ` +
      `raw payload chars: ${best.candidate.payload.length.toLocaleString()} | ` +
      `markdown chars: ${markdown.length.toLocaleString()}`
  );

  return {
    url,
    title,
    text:     markdown,
    metadata: { ...metadata, scrapeStrategy: best.candidate.strategy },
  };
}

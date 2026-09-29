"use client";

/**
 * SEO tab — edit the tags search engines and social platforms read.
 *
 * Source of truth is the project's own index.html, NOT a database row: the
 * AI edits that file too (see the SEO rule in the vite-react framework
 * prompt), the build copies it verbatim, and a user reading their repo sees
 * exactly what ships. Storing this separately would mean two places to
 * disagree.
 *
 * Next.js projects use the Metadata API instead and have no index.html, so
 * the tab says so rather than silently editing nothing.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Search, AlertCircle, RotateCcw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { SectionCard } from "./project-settings-shared";
import { projectHostname } from "@/lib/publish-domain";

interface SeoFields {
  title: string;
  description: string;
  image: string;
}

const RECOMMENDED_TITLE_MAX = 60;
const RECOMMENDED_DESC_MIN = 120;
const RECOMMENDED_DESC_MAX = 160;

// ─── index.html parsing / patching ──────────────────────────
// Deliberately regex over the raw file rather than DOMParser +
// serialization: a round-trip through the DOM reformats the whole document
// and would produce a huge, unreviewable diff in the user's editor. These
// patterns touch one attribute value at a time and leave everything else
// byte-identical.

function readTag(html: string, re: RegExp): string {
  const m = re.exec(html);
  return m?.[1]?.trim() ?? "";
}

const TITLE_RE = /<title>([\s\S]*?)<\/title>/i;
const metaNameRe = (name: string) =>
  new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([\\s\\S]*?)["']`, "i");
const metaPropRe = (prop: string) =>
  new RegExp(`<meta\\s+property=["']${prop}["']\\s+content=["']([\\s\\S]*?)["']`, "i");

export function parseSeo(html: string): SeoFields {
  return {
    title: readTag(html, TITLE_RE),
    description:
      readTag(html, metaNameRe("description")) ||
      readTag(html, metaPropRe("og:description")),
    image: readTag(html, metaPropRe("og:image")),
  };
}

/** Escape a value for safe interpolation into a double-quoted attribute. */
function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Replace an existing tag's content, or insert the tag before </head> when
 * the project predates the SEO-enabled templates.
 */
function upsert(html: string, re: RegExp, tag: string): string {
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

export function applySeo(html: string, f: SeoFields): string {
  let out = html;
  const t = attr(f.title);
  const d = attr(f.description);
  const i = attr(f.image);

  out = upsert(out, TITLE_RE, `<title>${t}</title>`);

  const pairs: [RegExp, string][] = [
    [/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${d}" />`],
    [/<meta\s+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${t}" />`],
    [/<meta\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${d}" />`],
    [/<meta\s+name=["']twitter:title["'][^>]*>/i, `<meta name="twitter:title" content="${t}" />`],
    [/<meta\s+name=["']twitter:description["'][^>]*>/i, `<meta name="twitter:description" content="${d}" />`],
  ];
  for (const [re, tag] of pairs) out = upsert(out, re, tag);

  // Only write image tags when a value is set — an empty og:image is worse
  // than none, because crawlers will try to fetch "" and log a failure.
  if (i) {
    out = upsert(out, /<meta\s+property=["']og:image["'][^>]*>/i, `<meta property="og:image" content="${i}" />`);
    out = upsert(out, /<meta\s+name=["']twitter:image["'][^>]*>/i, `<meta name="twitter:image" content="${i}" />`);
    out = upsert(
      out,
      /<meta\s+name=["']twitter:card["'][^>]*>/i,
      `<meta name="twitter:card" content="summary_large_image" />`,
    );
  }
  return out;
}

// ─── Tab ────────────────────────────────────────────────────

export function SeoTab({
  project,
  addToast,
}: {
  project: { id: string; slug: string };
  addToast: (type: "success" | "error", message: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fields, setFields] = useState<SeoFields>({ title: "", description: "", image: "" });
  const [initial, setInitial] = useState<SeoFields>({ title: "", description: "", image: "" });

  const [isNext, setIsNext] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch<{ data: { content: string } }>(
        `/projects/${project.id}/files/index.html`,
      );
      const content = res.data.content;
      setHtml(content);
      const parsed = parseSeo(content);
      setFields(parsed);
      setInitial(parsed);
    } catch {
      // No index.html. Distinguish "Next.js, which has none by design" from
      // "a Vite project whose index.html is missing" so the guidance is right.
      let next = false;
      try {
        await apiFetch(`/projects/${project.id}/files/app/layout.tsx`);
        next = true;
      } catch {
        /* not a Next.js app router project */
      }
      setIsNext(next);
      setLoadError(
        next
          ? "This project has no index.html."
          : "Could not read index.html for this project.",
      );
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty =
    fields.title !== initial.title ||
    fields.description !== initial.description ||
    fields.image !== initial.image;

  async function save() {
    if (!html) return;
    setSaving(true);
    try {
      const next = applySeo(html, fields);
      await apiFetch(`/projects/${project.id}/files/index.html`, {
        method: "PUT",
        body: JSON.stringify({ content: next }),
      });
      setHtml(next);
      setInitial(fields);
      addToast("success", "SEO tags saved — redeploy to publish them");
    } catch {
      addToast("error", "Could not save SEO tags");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <SectionCard title="SEO" description="Search and social preview tags.">
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-medium text-foreground">{loadError}</p>
            <p className="mt-1 text-muted-foreground">
              {isNext ? (
                <>
                  Next.js builds its head tags from the Metadata API. Export a{" "}
                  <code className="font-mono">metadata</code> object from{" "}
                  <code className="font-mono">app/layout.tsx</code> — or just ask
                  the AI to &quot;set up SEO&quot; and it will write it for you.
                </>
              ) : (
                <>Ask the AI to &quot;add SEO meta tags&quot; and it will create them.</>
              )}
            </p>
          </div>
        </div>
      </SectionCard>
    );
  }

  const host = projectHostname(project.slug);
  const titlePreview = fields.title || "Untitled app";
  const descPreview = fields.description || "No description set.";
  const descLen = fields.description.length;
  const descOk = descLen >= RECOMMENDED_DESC_MIN && descLen <= RECOMMENDED_DESC_MAX;
  const titleOk = fields.title.length > 0 && fields.title.length <= RECOMMENDED_TITLE_MAX;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Search & social tags"
        description="What Google shows in results, and what Slack, WhatsApp, LinkedIn and X show when someone shares a link. Saved into your project's index.html."
      >
        <div className="space-y-5">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label htmlFor="seo-title" className="text-sm font-medium">
                Page title
              </label>
              <span
                className={
                  titleOk ? "text-xs text-muted-foreground" : "text-xs text-amber-500"
                }
              >
                {fields.title.length}/{RECOMMENDED_TITLE_MAX}
              </span>
            </div>
            <input
              id="seo-title"
              value={fields.title}
              onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))}
              placeholder="My App — what it does"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Google truncates past ~{RECOMMENDED_TITLE_MAX} characters.
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label htmlFor="seo-desc" className="text-sm font-medium">
                Meta description
              </label>
              <span
                className={descOk ? "text-xs text-muted-foreground" : "text-xs text-amber-500"}
              >
                {descLen}/{RECOMMENDED_DESC_MAX}
              </span>
            </div>
            <textarea
              id="seo-desc"
              rows={3}
              value={fields.description}
              onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))}
              placeholder="One sentence describing what this app does and who it's for."
              className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Aim for {RECOMMENDED_DESC_MIN}–{RECOMMENDED_DESC_MAX} characters.
            </p>
          </div>

          <div>
            <label htmlFor="seo-image" className="mb-1.5 block text-sm font-medium">
              Social share image
            </label>
            <input
              id="seo-image"
              value={fields.image}
              onChange={(e) => setFields((f) => ({ ...f, image: e.target.value }))}
              placeholder="/og-image.png"
              className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              1200×630 works everywhere. A path like{" "}
              <code className="font-mono">/og-image.png</code> resolves against your
              site; some crawlers require a full https:// URL.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-500 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </button>
          {dirty && (
            <button
              onClick={() => setFields(initial)}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
          {dirty && (
            <span className="text-xs text-muted-foreground">
              Redeploy to publish these changes.
            </span>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Preview"
        description="Approximate — each platform renders slightly differently."
      >
        <div className="space-y-5">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Search className="h-3.5 w-3.5" /> Google result
            </p>
            <div className="rounded-lg border bg-background p-4">
              <p className="truncate text-xs text-muted-foreground">{host}</p>
              <p className="mt-0.5 truncate text-lg text-[#1a0dab] dark:text-[#8ab4f8]">
                {titlePreview}
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {descPreview}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Social card
            </p>
            <div className="max-w-md overflow-hidden rounded-lg border bg-background">
              <div className="flex aspect-[1200/630] items-center justify-center bg-muted/40">
                {fields.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={fields.image}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <span className="px-4 text-center text-xs text-muted-foreground">
                    No share image set — links will preview without a picture.
                  </span>
                )}
              </div>
              <div className="border-t p-3">
                <p className="truncate text-xs uppercase text-muted-foreground">{host}</p>
                <p className="mt-0.5 truncate text-sm font-medium">{titlePreview}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {descPreview}
                </p>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

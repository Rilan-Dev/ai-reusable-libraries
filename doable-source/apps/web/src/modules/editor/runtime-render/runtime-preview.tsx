"use client";

/**
 * RuntimePreview — renders a project file live, without a dev server, inside
 * an isolated sandbox iframe.
 *
 * The file and everything it imports are transpiled and executed in a frame
 * with sandbox="allow-scripts" and NO allow-same-origin. That frame's origin
 * is opaque, so the code cannot read the editor's session cookie or
 * localStorage, call the API as the user, or touch the editor's DOM — which
 * matters because the rendered code comes from AI output, GitHub imports and
 * collaborators. This mirrors how the regular Preview tab isolates generated
 * apps.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Cpu, Loader2, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { collectModules } from "./collect-modules";
import { PARENT_SOURCE, SANDBOX_SOURCE, type RenderRequest, type SandboxMessage } from "./sandbox/protocol";
import { buildSandboxHtml } from "./sandbox/sandbox-html";

type Status =
  | { phase: "booting" }
  | { phase: "rendering" }
  | { phase: "ok"; durationMs: number; modules: number }
  | { phase: "error"; error: string };

export interface RuntimePreviewProps {
  projectId: string;
  /** Root-relative path of the file to render, e.g. "src/App.tsx". */
  entry: string;
  /** Current editor buffer for `entry` (may include unsaved edits). */
  source: string;
  /** Bump to drop cached dependency contents (e.g. after the AI edits files). */
  refreshKey?: number;
  className?: string;
}

function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function RuntimePreview({ projectId, entry, source, refreshKey = 0, className }: RuntimePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const nonce = useMemo(makeNonce, []);
  const [parentOrigin, setParentOrigin] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>({ phase: "booting" });
  const [unresolved, setUnresolved] = useState<string[]>([]);

  const fileCache = useRef(new Map<string, string>());
  const fileList = useRef<string[] | null>(null);

  // window is only available after mount (this component can be SSR'd).
  useEffect(() => setParentOrigin(window.location.origin), []);

  const srcDoc = useMemo(
    () => (parentOrigin ? buildSandboxHtml(nonce, parentOrigin) : ""),
    [nonce, parentOrigin],
  );

  // Other files may have changed (AI edits, collaborators): forget them.
  useEffect(() => {
    fileCache.current.clear();
    fileList.current = null;
  }, [refreshKey, projectId]);

  // ─── Messages from the sandbox ─────────────────────────────────────────
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const frame = iframeRef.current?.contentWindow;
      // Our frame only; its origin is opaque, which serializes as "null".
      if (!frame || event.source !== frame || event.origin !== "null") return;
      const data = event.data as SandboxMessage | null;
      if (!data || data.source !== SANDBOX_SOURCE || data.nonce !== nonce) return;

      if (data.type === "ready") setReady(true);
      else if (data.type === "result") {
        setStatus(data.ok ? { phase: "ok", durationMs: data.durationMs, modules: data.modules } : { phase: "error", error: data.error });
      } else if (data.type === "runtime-error") {
        setStatus({ phase: "error", error: data.error });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [nonce]);

  const readFile = useCallback(
    async (path: string): Promise<string> => {
      const hit = fileCache.current.get(path);
      if (hit !== undefined) return hit;
      const res = await apiFetch<{ data: { content: string } }>(`/projects/${projectId}/files/${encodePath(path)}`);
      fileCache.current.set(path, res.data.content);
      return res.data.content;
    },
    [projectId],
  );

  // ─── Render on change (debounced) ──────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setStatus({ phase: "rendering" });

    const timer = setTimeout(async () => {
      try {
        if (!fileList.current) {
          const res = await apiFetch<{ data: string[] }>(`/projects/${projectId}/files`);
          fileList.current = res.data;
        }
        const collected = await collectModules({ entry, entrySource: source, fileList: fileList.current, readFile });
        if (cancelled) return;
        setUnresolved(collected.unresolved);

        const message: RenderRequest = {
          source: PARENT_SOURCE,
          type: "render",
          nonce,
          entry,
          files: collected.files,
          packages: collected.packages,
          dark: document.documentElement.classList.contains("dark"),
        };
        // targetOrigin must be "*": an opaque origin cannot be named. The
        // frame is only addressed after it proved it is the document we
        // created (right window + nonce), sandbox flags persist across any
        // navigation it attempts, and the payload is the user's own source.
        iframeRef.current?.contentWindow?.postMessage(message, "*");
      } catch (err) {
        if (!cancelled) setStatus({ phase: "error", error: err instanceof Error ? err.message : String(err) });
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready, projectId, entry, source, refreshKey, nonce, readFile]);

  const name = entry.split("/").pop() ?? entry;

  return (
    <div className={cn("relative flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-zinc-900", className)}>
      <div className="flex items-center justify-between gap-2 border-b bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-teal-500 text-white">
            <Sparkles className="size-3.5" />
          </span>
          <span className="text-xs font-medium text-muted-foreground">Runtime Preview</span>
          <span className="max-w-[200px] truncate rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-[10px] dark:bg-zinc-700">{name}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {status.phase === "booting" && (<><Loader2 className="size-3 animate-spin" /> Starting sandbox…</>)}
          {status.phase === "rendering" && (<><Loader2 className="size-3 animate-spin" /> Rendering…</>)}
          {status.phase === "ok" && (<><Cpu className="size-3" /> {status.durationMs}ms · {status.modules} module{status.modules === 1 ? "" : "s"}</>)}
          {status.phase === "error" && (
            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">Error</span>
          )}
        </div>
      </div>

      <div className="relative flex-1">
        {srcDoc && (
          <iframe
            ref={iframeRef}
            title={`Runtime preview of ${name}`}
            // allow-scripts WITHOUT allow-same-origin: see the file header.
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            className="absolute inset-0 h-full w-full border-0 bg-white"
          />
        )}

        {status.phase === "error" && (
          <div className="absolute inset-x-0 bottom-0 max-h-[50%] overflow-auto border-t border-rose-300 bg-rose-50 p-3 text-sm dark:border-rose-900/60 dark:bg-rose-950/80">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <div className="min-w-0">
                <p className="font-semibold text-rose-700 dark:text-rose-300">Couldn&apos;t render {name}</p>
                <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs text-rose-700 dark:text-rose-300">{status.error}</pre>
                {unresolved.length > 0 && (
                  <p className="mt-2 text-xs text-rose-700/80 dark:text-rose-300/80">Unresolved imports: {unresolved.join(", ")}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

/**
 * RuntimePreviewPanel — Doable integration wrapper.
 *
 * Reads the active file from the editor store and renders it live in the
 * isolated runtime sandbox — no dev server or build step. Local imports
 * (`@/…`, `./…`) are followed and shipped along. Useful for:
 *   - Quick TSX component previews without spinning up a dev server
 *   - Runtime UI rendering when the dev server is unavailable
 *   - Sharing live component previews
 */

import { useMemo } from "react";
import { useEditorStore } from "../hooks/use-editor-store";
import { RuntimePreview } from "../runtime-render";
import { Code2, Info } from "lucide-react";

export function RuntimePreviewPanel() {
  const projectId = useEditorStore((s) => s.projectId);
  const activeFilePath = useEditorStore((s) => s.activeFilePath);
  const activeFileContent = useEditorStore((s) => s.activeFileContent);
  // Bumped whenever the AI applies tool results — other files may have changed.
  const toolResultVersion = useEditorStore((s) => s.toolResultVersion);

  // Get the source of the active file.
  const source = useMemo(() => {
    return activeFileContent || "";
  }, [activeFileContent]);

  // Check if the active file is a TSX/JSX file.
  const isTsxFile = useMemo(() => {
    if (!activeFilePath) return false;
    return /\.(tsx|jsx)$/i.test(activeFilePath);
  }, [activeFilePath]);

  if (!projectId) return null;

  if (!activeFilePath) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <Code2 className="mx-auto size-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            No file open
          </p>
          <p className="text-xs text-muted-foreground">
            Open a TSX/JSX file to see it rendered live.
          </p>
        </div>
      </div>
    );
  }

  if (!isTsxFile) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <Info className="mx-auto size-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            Not a TSX/JSX file
          </p>
          <p className="text-xs text-muted-foreground">
            Runtime preview works with .tsx and .jsx files.
            <br />
            Active file: <code className="font-mono">{activeFilePath}</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full p-4 overflow-auto">
      <RuntimePreview
        projectId={projectId}
        entry={activeFilePath}
        source={source}
        refreshKey={toolResultVersion}
        className="h-full"
      />
    </div>
  );
}

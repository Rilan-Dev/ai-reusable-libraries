import { DocumentParser, ParsedDocument } from "../types";

// pdf-parse@1.1.1 is kept as the fast primary parser. pdfjs-dist is already a
// project dependency and provides a reliable fallback for PDFs that pdf-parse
// cannot process because of parser/version/encoding edge cases.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParseModule = require("pdf-parse/lib/pdf-parse.js");
const pdfParse = pdfParseModule.default || pdfParseModule;

type PdfJsMetadata = {
  info?: Record<string, unknown>;
};

type PdfJsDocumentCompat = {
  getMetadata?: () => Promise<PdfJsMetadata>;
};

type PdfJsLoadingTaskCompat = {
  destroy?: () => Promise<void>;
};

async function parseWithPdfJs(buffer: Buffer): Promise<ParsedDocument> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
  });

  const document = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      // Keep this compatible with the installed pdfjs-dist typings. The
      // parser does not need marked-content items, and filtering them below
      // already ensures only text-bearing items are included.
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" ")
        .trim();

      if (text) pages.push(text);
    }

    // Some pdfjs-dist builds expose getMetadata at runtime without declaring
    // it on the imported PDFDocumentProxy type. Use a narrow compatibility
    // guard so metadata remains available when the runtime provides it while
    // keeping TypeScript compatible with the installed declarations.
    const documentCompat = document as unknown as PdfJsDocumentCompat;
    let info: Record<string, unknown> | undefined;

    if (typeof documentCompat.getMetadata === "function") {
      try {
        const metadata = await documentCompat.getMetadata();
        info = metadata?.info;
      } catch {
        // Metadata is optional; text extraction should still succeed.
      }
    }

    return {
      text: pages.join("\n\n"),
      metadata: {
        pageCount: document.numPages,
        info,
        sourceType: "pdf",
        originalFilename: "",
        parser: "pdfjs",
      },
      title: typeof info?.Title === "string" ? info.Title : "",
    };
  } finally {
    // The installed pdfjs-dist typings do not expose the loading-task
    // lifecycle method, although supported runtimes may provide it. Guard the
    // optional runtime API so cleanup is performed when available without
    // making the production type-check depend on an incompatible declaration.
    const loadingTaskCompat = loadingTask as unknown as PdfJsLoadingTaskCompat;
    if (typeof loadingTaskCompat.destroy === "function") {
      await loadingTaskCompat.destroy();
    }
  }
}

export class PDFParser implements DocumentParser {
  async parse(buffer: Buffer, filename: string): Promise<ParsedDocument> {
    if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error(`Invalid PDF ${filename}: missing PDF signature`);
    }

    let primaryError: Error | undefined;

    try {
      const data = await pdfParse(buffer);
      const text = typeof data.text === "string" ? data.text.trim() : "";

      if (text) {
        return {
          text,
          metadata: {
            pageCount: data.numpages,
            info: data.info,
            sourceType: "pdf",
            originalFilename: filename,
            parser: "pdf-parse",
          },
          title:
            (data.info?.Title as string | undefined) ||
            filename.replace(/\.pdf$/i, ""),
        };
      }

      primaryError = new Error("pdf-parse returned no readable text");
    } catch (error) {
      primaryError = error instanceof Error ? error : new Error(String(error));
    }

    try {
      const fallback = await parseWithPdfJs(buffer);
      if (!fallback.text.trim()) {
        throw new Error("PDF contains no extractable text. It may be scanned/image-only and require OCR.");
      }

      return {
        ...fallback,
        title: fallback.title || filename.replace(/\.pdf$/i, ""),
        metadata: {
          ...fallback.metadata,
          originalFilename: filename,
          fallbackReason: primaryError?.message,
        },
      };
    } catch (fallbackError) {
      throw new Error(
        `Failed to parse PDF ${filename}: ${primaryError?.message ?? "primary parser failed"}; fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
      );
    }
  }

  supports(filename: string, mimeType?: string): boolean {
    return (
      filename.toLowerCase().endsWith(".pdf") ||
      mimeType === "application/pdf"
    );
  }
}

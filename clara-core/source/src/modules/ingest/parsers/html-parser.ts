/**
 * src/modules/ingest/parsers/html-parser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Parser for .html / .htm files uploaded directly to a Knowledge Base.
 *
 * Registered in ParserFactory BEFORE TextParser so that HTML files are
 * converted to structured markdown rather than ingested as raw HTML noise.
 *
 * Uses the same extractMarkdownFromHtml() function that powers the live
 * web scraper — so both upload and scrape paths produce identical output.
 */

import { DocumentParser, ParsedDocument } from "../types";
import { extractMarkdownFromHtml } from "../../admin/core/ingest/web-loader";

export class HtmlParser implements DocumentParser {
  supports(filename: string, mimeType?: string): boolean {
    const ext = filename.toLowerCase().split(".").pop() ?? "";
    if (["html", "htm", "xhtml"].includes(ext)) return true;
    if (mimeType) {
      return (
        mimeType.includes("text/html") ||
        mimeType.includes("application/xhtml")
      );
    }
    return false;
  }

  async parse(
    buffer: Buffer,
    filename: string
  ): Promise<ParsedDocument> {
    const html = buffer.toString("utf-8");

    const { title, markdown, metadata } = extractMarkdownFromHtml(
      html,
      `file://${filename}`
    );

    if (!markdown.trim()) {
      throw new Error(
        `HTML file "${filename}" yielded no extractable content after parsing`
      );
    }

    return {
      title,
      text: markdown,
      metadata: {
        sourceType:       "html",
        originalFilename: filename,
        byteLength:       buffer.length,
        description:      metadata.description,
        ogTitle:          metadata.ogTitle,
        canonicalUrl:     metadata.canonicalUrl,
        breadcrumbs:      metadata.breadcrumbs,
        contentLength:    metadata.contentLength,
      },
    };
  }
}

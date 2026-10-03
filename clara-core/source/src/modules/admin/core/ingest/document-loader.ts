import path from "node:path";
import { ParserFactory } from "../../../ingest/factory";

export type LoadedDocument = {
  title: string;
  text: string;
  metadata: Record<string, unknown>;
};

/**
 * Strips lone surrogate/control characters that can break JSON serialization.
 */
function sanitizeString(str: string): string {
  if (!str) return str;
  let sanitized = typeof str.toWellFormed === "function" ? str.toWellFormed() : str;
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uFFFD\uD800-\uDFFF]/g, "");
  return sanitized;
}

function extensionOf(filename: string): string {
  return path.extname(filename).toLowerCase();
}

function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function isZipContainer(buffer: Buffer): boolean {
  // DOCX/XLSX are OOXML ZIP containers. Accept the common ZIP signatures.
  const a = buffer[0];
  const b = buffer[1];
  const c = buffer[2];
  const d = buffer[3];
  return a === 0x50 && b === 0x4b && (c === 0x03 || c === 0x05 || c === 0x07) && (d === 0x04 || d === 0x06 || d === 0x08);
}

function isBinaryDocument(filename: string, mimeType?: string): boolean {
  const ext = extensionOf(filename);
  return (
    [".pdf", ".docx", ".xlsx", ".xls", ".pptx", ".ppt"].includes(ext) ||
    mimeType === "application/pdf" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel"
  );
}

function validateBinarySignature(buffer: Buffer, filename: string, mimeType?: string): void {
  const ext = extensionOf(filename);

  if (ext === ".pdf" || mimeType === "application/pdf") {
    if (!isPdf(buffer)) {
      throw new Error(`Invalid PDF file ${filename}: the uploaded file does not contain a valid PDF signature`);
    }
    return;
  }

  if ([".docx", ".xlsx"].includes(ext) || mimeType?.includes("openxmlformats-officedocument")) {
    if (!isZipContainer(buffer)) {
      const documentType = ext === ".docx" ? "DOCX" : ext === ".xlsx" ? "XLSX" : "Office";
      throw new Error(`Invalid ${documentType} document ${filename}: the uploaded file is not a valid OOXML/ZIP container`);
    }
  }
}

export async function parseDocumentFromBuffer(
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<LoadedDocument> {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error(`Cannot parse empty document: ${filename}`);
  }

  try {
    validateBinarySignature(buffer, filename, mimeType);
    const parser = ParserFactory.getParser(filename, mimeType);
    const parsed = await parser.parse(buffer, filename, mimeType);
    const text = sanitizeString(parsed.text ?? "");

    if (isBinaryDocument(filename, mimeType) && !text.trim()) {
      throw new Error(`Document ${filename} was parsed successfully but contains no readable text`);
    }

    return {
      title: sanitizeString(parsed.title || path.basename(filename, path.extname(filename))),
      text,
      metadata: parsed.metadata,
    };
  } catch (error) {
    console.error(`[ingest] Error parsing document ${filename}:`, error);

    // Never decode binary Office/PDF files as UTF-8. That creates apparently
    // successful ingestion jobs containing ZIP/PDF bytes instead of document text.
    // Text files can still use the UTF-8 fallback for backwards compatibility.
    if (isBinaryDocument(filename, mimeType)) {
      throw error instanceof Error ? error : new Error(String(error));
    }

    return {
      title: sanitizeString(path.basename(filename, path.extname(filename))),
      text: sanitizeString(buffer.toString("utf-8")),
      metadata: {
        filename,
        extension: extensionOf(filename),
        format: "text-fallback",
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function loadFileAsText(filePath: string): Promise<LoadedDocument> {
  const { readFile } = await import("node:fs/promises");
  const buffer = await readFile(filePath);
  return parseDocumentFromBuffer(buffer, path.basename(filePath));
}

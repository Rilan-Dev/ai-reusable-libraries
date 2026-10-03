export interface ParsedDocument {
  text: string;
  metadata: Record<string, unknown>;
  title?: string;
}

export interface DocumentParser {
  /**
   * Parses a file buffer into a structured document.
   * @param buffer The raw file buffer
   * @param filename The original filename
   * @param mimeType The MIME type of the file
   */
  parse(buffer: Buffer, filename: string, mimeType?: string): Promise<ParsedDocument>;
  
  /**
   * Checks if this parser supports the given file type.
   */
  supports(filename: string, mimeType?: string): boolean;
}

export interface TextChunker {
  /**
   * Splits a large text into smaller chunks suitable for embedding.
   */
  chunk(text: string): string[];
}

export interface ChunkerOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

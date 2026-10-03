import { DocumentParser } from './types';
import { PDFParser } from './parsers/pdf';
import { DocxParser } from './parsers/docx';
import { HtmlParser } from './parsers/html-parser';
import { TextParser } from './parsers/text';
import { XlsxParser } from './parsers/xlsx';

export class ParserFactory {
  private static parsers: DocumentParser[] = [
    new PDFParser(),
    new DocxParser(),
    new XlsxParser(),
    new HtmlParser(),  // before TextParser — HTML files get structured markdown extraction
    new TextParser(),  // catch-all for .txt, .md, .csv, text/*
  ];

  /**
   * Returns the appropriate parser for the given file.
   * Throws an error if no suitable parser is found.
   */
  static getParser(filename: string, mimeType?: string): DocumentParser {
    const parser = this.parsers.find(p => p.supports(filename, mimeType));

    if (!parser) {
      throw new Error(`No parser found for file: ${filename} (mime: ${mimeType})`);
    }

    return parser;
  }
}

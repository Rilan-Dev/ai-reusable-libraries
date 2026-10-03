import { DocumentParser, ParsedDocument } from '../types';
import mammoth from 'mammoth';

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export class DocxParser implements DocumentParser {
  async parse(buffer: Buffer, filename: string): Promise<ParsedDocument> {
    if (!buffer || buffer.length < 4 || buffer.subarray(0, 2).toString('ascii') !== 'PK') {
      throw new Error(`Invalid DOCX ${filename}: the uploaded file is not a valid OOXML container`);
    }

    try {
      const result = await mammoth.extractRawText({ buffer });
      let text = result.value?.trim() ?? '';
      let parser = 'mammoth-raw-text';

      // Some DOCX files place useful content in structures that raw-text
      // extraction can omit. HTML conversion is a safe second pass because it
      // uses the same OOXML parser while preserving more document structure.
      if (!text) {
        const htmlResult = await mammoth.convertToHtml({ buffer });
        text = stripHtml(htmlResult.value ?? '');
        parser = 'mammoth-html-fallback';
      }

      if (!text) {
        throw new Error('DOCX contains no readable text');
      }

      return {
        text,
        metadata: {
          sourceType: 'docx',
          originalFilename: filename,
          warnings: result.messages,
          parser,
        },
        title: filename.replace(/\.docx$/i, '')
      };
    } catch (error) {
      throw new Error(`Failed to parse DOCX ${filename}: ${(error as Error).message}`);
    }
  }

  supports(filename: string, mimeType?: string): boolean {
    return filename.toLowerCase().endsWith('.docx') ||
           mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
}

import { DocumentParser, ParsedDocument } from '../types';

export class TextParser implements DocumentParser {
  async parse(buffer: Buffer, filename: string): Promise<ParsedDocument> {
    try {
      const text = buffer.toString('utf-8');
      
      return {
        text,
        metadata: {
          sourceType: 'text',
          originalFilename: filename,
          byteLength: buffer.length
        },
        title: filename.replace(/\.(txt|md|csv)$/i, '')
      };
    } catch (error) {
      throw new Error(`Failed to parse text file ${filename}: ${(error as Error).message}`);
    }
  }

  supports(filename: string, mimeType?: string): boolean {
    const ext = filename.toLowerCase().split('.').pop();
    return ['txt', 'md', 'csv', 'json'].includes(ext || '') || 
           (mimeType?.startsWith('text/') ?? false);
  }
}

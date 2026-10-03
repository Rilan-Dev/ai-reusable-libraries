import { RecursiveCharacterTextSplitter } from "../../../ingest/chunkers/recursive";

type ChunkerOptions = {
  chunkSize?: number;
  overlap?: number;
};

const DEFAULT_CHUNK_SIZE = 900;
const DEFAULT_OVERLAP = 150;

export function chunkText(
  input: string,
  options?: ChunkerOptions,
): string[] {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: options?.chunkSize ?? DEFAULT_CHUNK_SIZE,
    chunkOverlap: options?.overlap ?? DEFAULT_OVERLAP,
  });
  
  return splitter.chunk(input);
}

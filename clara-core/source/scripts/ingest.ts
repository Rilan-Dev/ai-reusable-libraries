#!/usr/bin/env tsx

import path from "node:path";

import {
  chunkText,
  loadFileAsText,
  generateCollectionName,
  addDocumentRecord,
  ensureCollectionExists,
  upsertDocuments,
  type DocumentChunk,
} from "../src/modules/admin/core";

function printUsage(): void {
  console.error(
    "Usage: npm run ingest <path-to-file> [display-title] [source-url]",
  );
}

async function main(): Promise<void> {
  const [, , fileArg, titleArg, urlArg] = process.argv;

  if (!fileArg) {
    printUsage();
    process.exit(1);
  }

  const absolutePath = path.resolve(process.cwd(), fileArg);
  const document = await loadFileAsText(absolutePath);

  const textContent = document.text.trim();
  if (!textContent) {
    console.warn("No textual content detected in the document.");
    return;
  }

  const chunks = chunkText(textContent);
  if (chunks.length === 0) {
    console.warn("Chunker returned no segments. Nothing to ingest.");
    return;
  }

  const preferredTitle = titleArg?.trim() || document.title || "Untitled";
  const collectionName = generateCollectionName(preferredTitle);

  const payload: DocumentChunk[] = chunks.map((chunk: string, index: number) => ({
    text: chunk,
    title: preferredTitle,
    url: urlArg,
    metadata: {
      ...document.metadata,
      order: index,
      sourcePath: path.relative(process.cwd(), absolutePath),
    },
  }));

  await ensureCollectionExists(collectionName);
  await upsertDocuments(collectionName, payload);

  const record = await addDocumentRecord({
    title: preferredTitle,
    collectionName,
    sourceType: "cli-file",
    sourceUrl: urlArg,
    originalFilename: path.basename(absolutePath),
  });

  console.log(
    `Ingested ${payload.length} chunks from ${absolutePath} into Qdrant collection ${collectionName}.`,
  );
  console.log(`Document ID: ${record.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

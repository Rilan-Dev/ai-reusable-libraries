#!/usr/bin/env tsx

import {
  chunkText,
  loadWebPage,
  generateCollectionName,
  addDocumentRecord,
  ensureCollectionExists,
  upsertDocuments,
  type DocumentChunk,
} from "../src/modules/admin/core";

function printUsage(): void {
  console.error("Usage: npm run ingest-web <url> [display-title]");
}

async function main(): Promise<void> {
  const [, , urlArg, titleArg] = process.argv;

  if (!urlArg) {
    printUsage();
    process.exit(1);
  }

  let url: URL;
  try {
    url = new URL(urlArg);
  } catch {
    console.error("Invalid URL provided.");
    process.exit(1);
    return;
  }

  const document = await loadWebPage(url.toString());
  const content = document.text.trim();

  if (!content) {
    console.warn("No textual content could be extracted from the page.");
    return;
  }

  const chunks = chunkText(content);
  if (chunks.length === 0) {
    console.warn("Chunker returned no segments. Nothing to ingest.");
    return;
  }

  const preferredTitle = titleArg?.trim() || document.title;
  const collectionName = generateCollectionName(preferredTitle);

  const payload: DocumentChunk[] = chunks.map((chunk: string, index: number) => ({
    text: chunk,
    title: preferredTitle,
    url: document.url,
    metadata: {
      ...document.metadata,
      sourceType: "web",
      order: index,
    },
  }));

  await ensureCollectionExists(collectionName);
  await upsertDocuments(collectionName, payload);

  const record = await addDocumentRecord({
    title: preferredTitle,
    collectionName,
    sourceType: "cli-web",
    sourceUrl: document.url,
  });

  console.log(
    `Ingested ${payload.length} chunks from ${document.url} into Qdrant collection ${collectionName}.`,
  );
  console.log(`Document ID: ${record.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

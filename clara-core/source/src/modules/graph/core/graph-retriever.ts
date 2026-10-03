import { getGraphStore } from "./graph-store";
import type { GraphSearchHit } from "./types";

type RetrieveGraphContextArgs = {
  kbId: string;
  query: string;
  topK?: number;
  documentId?: string;
};

export async function retrieveGraphContext(args: RetrieveGraphContextArgs): Promise<GraphSearchHit[]> {
  const store = getGraphStore();
  return store.search({
    kbId: args.kbId,
    query: args.query,
    topK: args.topK ?? 4,
    documentId: args.documentId,
  });
}

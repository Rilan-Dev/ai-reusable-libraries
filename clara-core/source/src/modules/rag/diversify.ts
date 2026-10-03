/**
 * src/modules/rag/diversify.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Per-document round-robin re-ranking for KB-wide vector search.
 *
 * Problem: a plain top-K cosine search over a KB collection that has multiple
 * documents lets whichever document has the MOST chunks dominate every slot,
 * even when a smaller document is the one that's actually relevant to the
 * question (e.g. a 71-chunk FAQ PDF crowding out a 27-chunk project DOCX).
 *
 * Fix: fetch a larger candidate pool (topK * CANDIDATE_MULTIPLIER, capped),
 * group by documentId while preserving score order within each group, then
 * round-robin across documents (best-scoring document group first) so every
 * document that has *any* relevant chunk gets a fair shot at a citation slot
 * instead of being drowned out purely by chunk-count volume.
 *
 * Results are always returned sorted by score, descending — diversify only
 * changes *which* items are selected, not the final display/citation order.
 */

export const CANDIDATE_MULTIPLIER = 5;
export const MAX_CANDIDATE_POOL = 30;

/** How many chunks to actually fetch from Qdrant before diversifying down to topK. */
export function candidatePoolSize(topK: number): number {
  return Math.min(Math.max(topK * CANDIDATE_MULTIPLIER, topK), MAX_CANDIDATE_POOL);
}

export function diversifyByDocument<T>(
  items: T[],
  opts: {
    getDocId: (item: T) => string | undefined;
    getScore: (item: T) => number;
    topK: number;
  },
): T[] {
  const { getDocId, getScore, topK } = opts;
  if (items.length <= topK) return items;

  // Group while preserving relative score order (items are assumed pre-sorted
  // desc by score). Map insertion order == order groups first appear, i.e.
  // the order of each group's best-scoring chunk — this is what makes the
  // round-robin below process the most-relevant document first each round.
  const groups = new Map<string, T[]>();
  const groupOrder: string[] = [];
  for (const item of items) {
    const key = getDocId(item) ?? "__unknown__";
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
      groupOrder.push(key);
    }
    group.push(item);
  }

  // Single document (or no documentId metadata at all) — nothing to diversify.
  if (groupOrder.length <= 1) return items.slice(0, topK);

  const selected: T[] = [];
  let round = 0;
  while (selected.length < topK) {
    let addedAny = false;
    for (const key of groupOrder) {
      const group = groups.get(key)!;
      if (round < group.length) {
        selected.push(group[round]!);
        addedAny = true;
        if (selected.length >= topK) break;
      }
    }
    if (!addedAny) break; // every group exhausted before reaching topK
    round++;
  }

  return selected.sort((a, b) => getScore(b) - getScore(a));
}

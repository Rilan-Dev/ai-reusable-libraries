import type {
  DocumentGraphExtraction,
  GraphChunkRef,
  GraphEdge,
  GraphNode,
  GraphSearchHit,
  GraphStats,
  GraphStore,
  GraphStoreSearchParams,
} from "./types";

type InMemoryGraphState = {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  documentsByKb: Map<string, Set<string>>;
};

function getState(): InMemoryGraphState {
  const globalScope = globalThis as typeof globalThis & {
    __claraGraphState__?: InMemoryGraphState;
  };

  if (!globalScope.__claraGraphState__) {
    globalScope.__claraGraphState__ = {
      nodes: new Map<string, GraphNode>(),
      edges: new Map<string, GraphEdge>(),
      documentsByKb: new Map<string, Set<string>>(),
    };
  }

  return globalScope.__claraGraphState__;
}

function mergeChunkRefs(existing: GraphChunkRef[], incoming: GraphChunkRef[]): GraphChunkRef[] {
  const merged = new Map<string, GraphChunkRef>();
  for (const item of [...existing, ...incoming]) {
    merged.set(`${item.documentId ?? "doc"}:${item.chunkId}`, item);
  }
  return Array.from(merged.values());
}

class InMemoryGraphStore implements GraphStore {
  async upsertExtraction(extraction: DocumentGraphExtraction): Promise<void> {
    const state = getState();
    const docs = state.documentsByKb.get(extraction.kbId) ?? new Set<string>();
    docs.add(extraction.documentId);
    state.documentsByKb.set(extraction.kbId, docs);

    for (const nodeInput of extraction.nodes) {
      const existing = state.nodes.get(nodeInput.id);
      if (existing) {
        existing.aliases = Array.from(new Set([...existing.aliases, ...(nodeInput.aliases ?? [])]));
        existing.documentIds = Array.from(new Set([...existing.documentIds, ...(nodeInput.documentIds ?? [])]));
        existing.chunks = mergeChunkRefs(existing.chunks, nodeInput.chunks ?? []);
      } else {
        state.nodes.set(nodeInput.id, {
          ...nodeInput,
          aliases: nodeInput.aliases ?? [nodeInput.label],
          documentIds: nodeInput.documentIds ?? [],
          chunks: nodeInput.chunks ?? [],
        });
      }
    }

    for (const edgeInput of extraction.edges) {
      const existing = state.edges.get(edgeInput.id);
      if (existing) {
        existing.weight += edgeInput.weight ?? 1;
        existing.documentIds = Array.from(new Set([...existing.documentIds, ...(edgeInput.documentIds ?? [])]));
        existing.evidence = mergeChunkRefs(existing.evidence, edgeInput.evidence ?? []);
      } else {
        state.edges.set(edgeInput.id, {
          ...edgeInput,
          weight: edgeInput.weight ?? 1,
          documentIds: edgeInput.documentIds ?? [],
          evidence: edgeInput.evidence ?? [],
        });
      }
    }
  }

  async search(params: GraphStoreSearchParams): Promise<GraphSearchHit[]> {
    const state = getState();
    const tokens = params.query.toLowerCase().split(/\s+/).filter(Boolean);

    return Array.from(state.nodes.values())
      .filter((node) => node.kbId === params.kbId)
      .filter((node) => !params.documentId || node.documentIds.includes(params.documentId))
      .map((node) => {
        const haystack = `${node.label} ${node.aliases.join(" ")}`.toLowerCase();
        const matchedTokens = tokens.filter((token) => haystack.includes(token)).length;
        const relationMatches = Array.from(state.edges.values()).filter(
          (edge) =>
            (edge.source === node.id || edge.target === node.id) &&
            (!params.documentId || edge.documentIds.includes(params.documentId)),
        );
        const score = matchedTokens * 2 + Math.min(relationMatches.length, 5);

        return {
          id: node.id,
          label: node.label,
          score,
          type: node.type,
          supportingChunks: node.chunks.slice(0, 4),
          relations: relationMatches.slice(0, 6).map((edge) => ({
            id: edge.id,
            type: edge.type,
            source: edge.source,
            target: edge.target,
            weight: edge.weight,
          })),
        };
      })
      .filter((hit) => hit.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, params.topK);
  }

  async getStats(kbId?: string): Promise<GraphStats> {
    const state = getState();
    const nodes = Array.from(state.nodes.values()).filter((node) => !kbId || node.kbId === kbId);
    const edges = Array.from(state.edges.values()).filter((edge) => !kbId || edge.kbId === kbId);
    const documentSet = kbId ? state.documentsByKb.get(kbId) ?? new Set<string>() : new Set<string>();

    if (!kbId) {
      for (const docs of state.documentsByKb.values()) {
        for (const docId of docs) documentSet.add(docId);
      }
    }

    return {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      documentCount: documentSet.size,
    };
  }
}

export function getGraphStore(provider = process.env.GRAPH_STORE_PROVIDER ?? "memory"): GraphStore {
  if (provider !== "memory") {
    return new InMemoryGraphStore();
  }
  return new InMemoryGraphStore();
}

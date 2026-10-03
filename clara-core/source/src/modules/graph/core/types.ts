export type GraphEntityType =
  | "concept"
  | "technology"
  | "service"
  | "person"
  | "organization"
  | "document"
  | "unknown";

export type GraphChunkRef = {
  chunkId: string;
  title?: string;
  text: string;
  score?: number;
  documentId?: string;
};

export type GraphNodeInput = {
  id: string;
  kbId: string;
  label: string;
  type: GraphEntityType;
  aliases?: string[];
  documentIds?: string[];
  chunks?: GraphChunkRef[];
};

export type GraphEdgeInput = {
  id: string;
  kbId: string;
  source: string;
  target: string;
  type: string;
  weight?: number;
  evidence?: GraphChunkRef[];
  documentIds?: string[];
};

export type GraphNode = GraphNodeInput & {
  aliases: string[];
  documentIds: string[];
  chunks: GraphChunkRef[];
};

export type GraphEdge = GraphEdgeInput & {
  weight: number;
  evidence: GraphChunkRef[];
  documentIds: string[];
};

export type DocumentGraphExtraction = {
  kbId: string;
  documentId: string;
  title?: string;
  nodes: GraphNodeInput[];
  edges: GraphEdgeInput[];
};

export type GraphSearchHit = {
  id: string;
  label: string;
  score: number;
  type: GraphEntityType;
  supportingChunks: GraphChunkRef[];
  relations: Array<{
    id: string;
    type: string;
    source: string;
    target: string;
    weight: number;
  }>;
};

export type GraphStoreSearchParams = {
  kbId: string;
  query: string;
  topK: number;
  documentId?: string;
};

export type GraphStats = {
  nodeCount: number;
  edgeCount: number;
  documentCount: number;
};

export interface GraphStore {
  upsertExtraction(extraction: DocumentGraphExtraction): Promise<void>;
  search(params: GraphStoreSearchParams): Promise<GraphSearchHit[]>;
  getStats(kbId?: string): Promise<GraphStats>;
}

import type { GraphMeta } from './graphStore'
import type { DisplayDocumentRegistry } from './displays/displayDocument'

/**
 * What a node's preview reads from the graph store while it evaluates: the
 * graphs' names (a show names its patterns) and the screen designs (a panel
 * and its Touch read the shown design).
 *
 * The evaluator reads them through this seam rather than importing
 * `graphStore.ts`, which brings React Flow, uploads and every board and part
 * catalogue with it. `graphStore.ts` registers itself here as it loads; the
 * preview worker, which never loads it, registers the names it is sent with
 * each request instead (`previewWorker.ts`).
 */
export interface GraphReadState {
  readonly graphs: Readonly<Record<string, GraphMeta>>
  readonly displayDocuments: DisplayDocumentRegistry
}

const EMPTY: GraphReadState = { graphs: {}, displayDocuments: {} }

let reader: () => GraphReadState = () => EMPTY

/** Where the graph state comes from; returns the reader it replaces. */
export function setGraphReader(next: () => GraphReadState): () => GraphReadState {
  const previous = reader
  reader = next
  return previous
}

export function graphReadState(): GraphReadState {
  return reader()
}

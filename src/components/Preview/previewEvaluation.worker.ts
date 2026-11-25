/// <reference lib="webworker" />
import { EVALUATOR_STORES } from './evaluatorStores'
import { createPreviewWorkerHandler, responseBuffers, STORE_READ_ERROR, type PreviewWorkerRequest } from './previewWorker'

// The stores exist here but hold nothing. A graph the gate let through never
// reads one; if one does, fail loudly so the main thread takes the graph back
// instead of showing a frame made from empty state.
for (const [name, store] of EVALUATOR_STORES) {
  store.getState = () => { throw new Error(`${STORE_READ_ERROR}: ${name}`) }
}

const handle = createPreviewWorkerHandler()
const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (event: MessageEvent<PreviewWorkerRequest>) => {
  const response = handle(event.data)
  try {
    scope.postMessage(response, responseBuffers(response))
  } catch (error) {
    // A port value that cannot be cloned: answer, so the request is not lost.
    scope.postMessage({ ...response, terminal: null, routed: [], outputs: null, error: String(error) })
  }
}

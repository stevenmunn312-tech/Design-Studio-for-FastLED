/// <reference lib="webworker" />
import { EVALUATOR_STORES } from './evaluatorStores'
import {
  createPreviewWorkerHandler, LIVE_STATE_STORES, responseBuffers, STORE_READ_ERROR, type PreviewWorkerRequest,
} from './previewWorker'

// Every store but the live ones (sent with each request) holds nothing here.
// A graph the gate let through never reads one; if one does, fail loudly so
// the main thread takes the graph back instead of showing a frame made from
// empty state.
for (const [name, store] of EVALUATOR_STORES) {
  if (LIVE_STATE_STORES.has(name)) continue
  store.getState = () => { throw new Error(`${STORE_READ_ERROR}: ${name}`) }
}

const handle = createPreviewWorkerHandler()
const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (event: MessageEvent<PreviewWorkerRequest>) => {
  const response = handle(event.data)
  try {
    scope.postMessage(response, responseBuffers(response))
  } catch (error) {
    // A port value that cannot be cloned: this graph belongs on the main thread.
    scope.postMessage({
      ...response, terminal: null, routed: [], outputs: null, liveOutputs: [], playerCommands: [], error: String(error), fatal: true,
    })
  }
}

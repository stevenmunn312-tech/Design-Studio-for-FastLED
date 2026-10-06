import { create } from 'zustand'

// Live browser-only touch state for TransportDisplay node previews. Like the
// hardware input preview store, this is transient run-state: it is neither
// persisted nor undo-tracked, and the evaluator samples it on the next tick.

export interface TransportDisplayTouchValue {
  pressed: boolean
  x: number
  y: number
}

interface TransportDisplayTouchState {
  touches: Map<string, TransportDisplayTouchValue>
  setTouch: (id: string, touch: TransportDisplayTouchValue) => void
  releaseTouch: (id: string) => void
  clear: () => void
}

export const useTransportDisplayTouchStore = create<TransportDisplayTouchState>()((set, get) => ({
  touches: new Map(),

  setTouch: (id, touch) => {
    const touches = new Map(get().touches)
    touches.set(id, touch)
    set({ touches })
  },

  releaseTouch: (id) => {
    const previous = get().touches.get(id)
    if (!previous?.pressed) return
    const touches = new Map(get().touches)
    touches.set(id, { ...previous, pressed: false })
    set({ touches })
  },

  clear: () => set({ touches: new Map() }),
}))

/*
 * The optional first-project guide's own memory: whether it is showing, which
 * steps someone chose to skip, and the two facts the project cannot tell it —
 * what the project looked like when it started (so "Make it yours" can notice
 * a change) and whether an upload of it has finished. Everything else a step
 * needs is read live off the project; see `src/utils/firstProjectSteps.ts`.
 */
import { create } from 'zustand'
import { rootGraphEdges, rootGraphNodes, useGraphStore } from './graphStore'
import { useUploadStore } from './uploadStore'
import {
  appearanceFingerprint,
  projectHasContent,
  type FirstProjectStepId,
} from '../utils/firstProjectSteps'

const STORAGE_KEY = 'design-studio-for-fastled-first-project-guide'

interface Persisted {
  visible: boolean
  /** The full step list, opened above the strip; the strip alone shows the
   *  current step, which is all a step needs. */
  listOpen: boolean
  skipped: FirstProjectStepId[]
  baseline: string | null
  uploaded: boolean
}

interface FirstProjectGuideState extends Persisted {
  /** The strip's drawn height, so the graph canvas can frame its nodes above
   *  it rather than under it. Zero while the guide is not showing. */
  stripHeight: number
  setStripHeight: (height: number) => void
  /** Show the guide, picking up wherever the project already is. */
  start: () => void
  /** Put it away; progress is kept for when it is opened again. */
  hide: () => void
  setListOpen: (listOpen: boolean) => void
  skip: (id: FirstProjectStepId) => void
  unskip: (id: FirstProjectStepId) => void
  /** Forget skips and the upload, and take the project as it is now. */
  restart: () => void
  /** A starter or blank canvas was just installed: a new project. */
  noteFreshStart: () => void
}

const DEFAULTS: Persisted = { visible: false, listOpen: false, skipped: [], baseline: null, uploaded: false }

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const saved = JSON.parse(raw) as Partial<Persisted>
    return {
      visible: saved.visible === true,
      listOpen: saved.listOpen === true,
      skipped: Array.isArray(saved.skipped) ? saved.skipped.filter((id): id is FirstProjectStepId => typeof id === 'string') : [],
      baseline: typeof saved.baseline === 'string' ? saved.baseline : null,
      uploaded: saved.uploaded === true,
    }
  } catch {
    return DEFAULTS
  }
}

function save(state: Persisted) {
  try {
    const { visible, listOpen, skipped, baseline, uploaded } = state
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ visible, listOpen, skipped, baseline, uploaded }))
  } catch {
    // Session-only when storage is unavailable.
  }
}

/** The project's current shape, or `null` while there is nothing in it. */
function currentBaseline(): string | null {
  const graph = useGraphStore.getState()
  const nodes = rootGraphNodes(graph)
  return projectHasContent(nodes) ? appearanceFingerprint(nodes, rootGraphEdges(graph)) : null
}

export const useFirstProjectGuide = create<FirstProjectGuideState>((set, get) => {
  const update = (patch: Partial<Persisted>) => {
    set(patch)
    save(get())
  }
  return {
    ...load(),
    stripHeight: 0,
    setStripHeight: (stripHeight) => { if (stripHeight !== get().stripHeight) set({ stripHeight }) },
    start: () => update({ visible: true, baseline: get().baseline ?? currentBaseline() }),
    hide: () => update({ visible: false, listOpen: false }),
    setListOpen: (listOpen) => update({ listOpen }),
    skip: (id) => update({ skipped: [...new Set([...get().skipped, id])] }),
    unskip: (id) => update({ skipped: get().skipped.filter((entry) => entry !== id) }),
    restart: () => update({ skipped: [], uploaded: false, baseline: currentBaseline() }),
    noteFreshStart: () => update({ baseline: currentBaseline(), uploaded: false }),
  }
})

// A project that arrives with content — opened from a file, recovered, or
// built by hand from blank — is its own starting point the first time the
// guide sees something in it.
useGraphStore.subscribe((graph) => {
  const guide = useFirstProjectGuide.getState()
  if (guide.baseline !== null) return
  if (!projectHasContent(rootGraphNodes(graph))) return
  useFirstProjectGuide.setState({ baseline: currentBaseline() })
  save(useFirstProjectGuide.getState())
})

// A finished upload of the project itself — never a wiring test or a
// calibration sketch flashed in its place — completes the last step, whether
// or not the guide was showing at the time.
useUploadStore.subscribe((upload, previous) => {
  if (upload.status.phase !== 'done' || previous.status.phase === 'done') return
  if (!upload.statusIsProject) return
  if (useFirstProjectGuide.getState().uploaded) return
  useFirstProjectGuide.setState({ uploaded: true })
  save(useFirstProjectGuide.getState())
})

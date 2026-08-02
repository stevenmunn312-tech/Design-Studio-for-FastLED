import { useGraphStore } from '../state/graphStore'
import { useUiStore } from '../state/uiStore'
import { useProjectStore } from '../state/projectStore'
import { captureWorkspace } from '../state/workspacePersistence'
import { isPatternContentTrusted, trustPatternContent } from '../state/patternTrust'
import type { SavedPattern } from '../state/patternLibrary'

/**
 * Ask the user to trust a just-loaded graph before its CustomFormula/
 * FieldFormula/Code nodes are allowed to evaluate — see todo.md's P0
 * trust-boundary item. Call this right after any load path that pulled
 * content from outside this browser and set `trusted: false` on it (a share
 * link, an imported Graph JSON, or an opened project file); it's a no-op if
 * the graph is already trusted. Deliberately not called from pattern-drop
 * actions (instantiatePattern/createCollectionFromPatterns/
 * addPatternToCollection) — those are frequent, additive workflow actions,
 * so a blocking modal on every drop would be disruptive; the persistent
 * `TrustBanner` is the affordance for that case instead.
 */
export async function promptTrustIfNeeded(): Promise<void> {
  if (useGraphStore.getState().trusted) return
  const trust = await useUiStore.getState().requestConfirm({
    title: 'Trust this graph?',
    message: 'This graph came from outside this browser — a share link, an imported file, or someone else’s project. Its Formula and Code node preview logic won’t run until you trust it. Only trust graphs from people and sources you trust.',
    confirmLabel: 'Trust and run',
    cancelLabel: 'Keep blocked',
    tone: 'danger',
  })
  if (!trust) return
  useGraphStore.getState().setTrusted(true)
  useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
}

// Concurrent asks for the same pattern content share one dialog. Pattern
// rating runs as a batch, and the ratings popup's effect can start twice under
// StrictMode — without this the second run would stack a duplicate dialog on
// the first and silently resolve it as a skip.
const pendingPatternTrust = new Map<string, Promise<boolean>>()

/**
 * Ask whether a saved Pattern Library pattern may run its Formula/Code node
 * logic. Unlike `promptTrustIfNeeded` this is per-pattern rather than
 * per-workspace: rating renders each saved pattern's subgraph on its own,
 * outside any workspace, so there is no workspace trust flag to consult.
 *
 * A yes is remembered by content in `patternTrust`, so the same pattern isn't
 * re-asked on the next rating run (and dropping it on the canvas later won't
 * re-ask either — it's the same trust store `TrustBanner` writes to). A no is
 * deliberately *not* remembered: "skip this one" shouldn't harden into a
 * permanent verdict the user has no obvious way to undo.
 */
export async function promptPatternTrust(saved: SavedPattern): Promise<boolean> {
  if (isPatternContentTrusted(saved.subgraph)) return true

  const key = saved.id
  const pending = pendingPatternTrust.get(key)
  if (pending) return pending

  const ask = (async () => {
    const trust = await useUiStore.getState().requestConfirm({
      title: 'Trust this pattern?',
      message: `“${saved.name}” contains Formula or Code nodes, and you haven’t run this version of it before. Rating it means running that logic in your browser. Skip it if you didn’t make this pattern and don’t know where it came from.`,
      confirmLabel: 'Trust and rate',
      cancelLabel: 'Skip this pattern',
      tone: 'danger',
    })
    if (trust) trustPatternContent(saved.subgraph)
    return trust
  })()

  pendingPatternTrust.set(key, ask)
  try {
    return await ask
  } finally {
    pendingPatternTrust.delete(key)
  }
}

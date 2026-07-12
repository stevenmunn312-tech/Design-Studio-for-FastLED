import { useGraphStore } from '../state/graphStore'
import { useUiStore } from '../state/uiStore'
import { useProjectStore } from '../state/projectStore'
import { captureWorkspace } from '../state/workspacePersistence'

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

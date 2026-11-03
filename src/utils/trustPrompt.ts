import { useGraphStore } from '../state/graphStore'
import { useUiStore } from '../state/uiStore'
import { useProjectStore } from '../state/projectStore'
import { captureWorkspace } from '../state/workspacePersistence'
import { isPatternContentTrusted, trustPatternContent } from '../state/patterns/patternTrust'
import type { SavedPattern } from '../state/patterns/patternLibrary'

export const WORKSPACE_CODE_QUESTION_ID = 'workspace-code-question'

/** Direct build consumers to the workspace's single code permission button. */
export function showWorkspaceCodeQuestion(): void {
  document.getElementById(WORKSPACE_CODE_QUESTION_ID)?.focus()
}

/**
 * Trust the open project: remembered on this machine for good (see
 * patternTrust.ts), and saved so the project reopens trusted. The one action
 * behind the one decision point, the "Run it" bar above the canvas
 * (`TrustBanner`). There is deliberately no modal on load and no second
 * confirm on Upload: the bar says what waits, Upload points at the bar while
 * anything does (`uploadBlockReason`'s `waitingForTrust`), and both are
 * answered by this.
 */
export function trustCurrentProject(): void {
  useGraphStore.getState().setTrusted(true)
  useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
}

// Pattern Insights scans a batch, so concurrent requests for the same content
// share one dialog instead of stacking duplicate trust prompts.
const pendingPatternTrust = new Map<string, Promise<boolean>>()

/**
 * Ask whether a saved Pattern Library pattern may run its Formula/Code node
 * logic. Unlike the workspace bar this is per-pattern rather than
 * per-workspace: the critic renders each saved pattern's subgraph on its own,
 * outside any workspace, so there is no workspace trust flag to consult.
 *
 * A yes is remembered by content in `patternTrust`, so the same pattern isn't
 * re-asked on the next scan (and dropping it on the canvas later won't
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
      title: 'Run code from this pattern?',
      message: `“${saved.name}” contains Formula or Code nodes, and you haven’t run this version before. Judging it means running that logic in your browser. Skip it if you didn’t make this pattern and don’t know where it came from.`,
      confirmLabel: 'Run and judge',
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

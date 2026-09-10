import { playerControlGraph } from '../codegen/playerControlGraph'
import { showControlRouting } from '../codegen/showControlRouting'
import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { useGraphStore, type StudioNode, type StudioEdge } from '../state/graphStore'
import type { DisplayDocument } from '../state/displayDocument'
import { customDisplayAssetRequests, customDisplayResourceIssues, type BakedCustomDisplayAsset } from '../state/customDisplayResources'
import { customDisplayMountPlan } from '../state/mountedDisplays'
import { bakeCustomDisplayAssets } from '../utils/bakeCustomDisplayAssets'
import { resolveBuildMode } from '../state/buildMode'

type AssetMap = Record<string, readonly BakedCustomDisplayAsset[]>
interface Result { assets: AssetMap; errors: string[] }

// Share successful/in-flight work between the capacity watcher and deploy view.
// Documents are immutable store snapshots; removed documents can be collected.
const bakes = new WeakMap<DisplayDocument, ReturnType<typeof bakeCustomDisplayAssets>>()
const useBakeRetry = create<{ revision: number; retry: () => void }>((set) => ({
  revision: 0,
  retry: () => set((state) => ({ revision: state.revision + 1 })),
}))

function bake(document: DisplayDocument) {
  let pending = bakes.get(document)
  if (!pending) {
    pending = bakeCustomDisplayAssets(document).then((result) => {
      if (result.issues.length > 0) bakes.delete(document)
      return result
    }, (error: unknown) => {
      bakes.delete(document)
      throw error
    })
    bakes.set(document, pending)
  }
  return pending
}

/**
 * Prepare real firmware bytes before either build consumer generates code.
 *
 * `edges` are not optional: what a build contains is a question about wires
 * now, not about which nodes exist, so there is no honest answer without them.
 */
export function useCustomDisplayAssets(nodes: StudioNode[], enabled: boolean, edges: StudioEdge[]) {
  const documents = useGraphStore((state) => state.displayDocuments)
  const trusted = useGraphStore((state) => state.trusted)
  const { revision, retry } = useBakeRetry()
  const plan = useMemo(() => {
    const build = resolveBuildMode(nodes, edges)
    const targets: { nodeId: string; label: string; document: DisplayDocument }[] = []
    const errors: string[] = []
    // Mounted screens only. A design nobody has plugged into a panel emits no
    // firmware, so fetching and decoding its artwork spends work on bytes no
    // build will contain — and worse, a broken asset in a design left over in
    // the workspace refused an upload that never referenced it. The same walk
    // the generators, the RAM estimate and validation use decides what is real.
    if (enabled) for (const mounted of customDisplayMountPlan(nodes, edges).mounted) {
      const node = mounted.document
      const document = documents[mounted.documentId]
      const label = String(node.data.label || 'Display')
      if (!document) {
        errors.push(`${label}: the screen document is missing. Open the display editor to configure it.`)
        continue
      }
      errors.push(...customDisplayResourceIssues(document).map((issue) => `${label}: ${issue.message}`))
      if (customDisplayAssetRequests(document).length > 0) targets.push({ nodeId: node.id, label, document })
    }
    /*
     * Broken control routing blocks a bake, but it is reported separately as
     * well, because the two kinds of blocker send the user to different
     * places: an asset that would not bake is explained in the Upload tab,
     * while a mis-wired control is explained — already, in full — by Graph
     * Health. Indistinguishable, a graph with no screens on it at all had an
     * LED-output wiring mistake recited in the Fits chip as though the
     * capacity meter had something to say about it.
     */
    const routingErrors = !enabled ? []
      : build.mode === 'player'
        ? playerControlGraph(nodes, edges, documents, build.engine?.id).errors
        : build.mode === 'show'
          ? showControlRouting(nodes, edges, documents, build.engine?.id).errors
          : []
    if (targets.length > 0 && !trusted) {
      errors.push('Trust this project before preparing its display images for firmware.')
    }
    // Routing errors stay in `errors` — they still block a bake, and one of
    // them is a wire onto a widget port that no longer exists, which is very
    // much a display problem. They are *also* reported separately so a caller
    // can tell whether what stopped the build was the graph or the images.
    return {
      targets,
      errors: [...new Set([...errors, ...routingErrors])],
      routingErrors: [...new Set(routingErrors)],
    }
  }, [nodes, edges, documents, trusted, enabled])
  const [finished, setFinished] = useState<{ plan: typeof plan; revision: number; result: Result } | null>(null)

  useEffect(() => {
    if (plan.errors.length > 0 || plan.targets.length === 0) return
    let cancelled = false
    void (async () => {
      // Start together so repeated uses share even a failed in-flight bake.
      // Promise.all preserves node order for diagnostics regardless of decode order.
      const prepared = await Promise.all(plan.targets.map(async (target) => {
        try {
          const result = await bake(target.document)
          return { nodeId: target.nodeId, assets: result.assets,
            errors: result.issues.map((issue) => `${target.label}: ${issue.message}`) }
        } catch (error) {
          return { nodeId: target.nodeId, assets: [],
            errors: [`${target.label}: could not prepare display images: ${error instanceof Error ? error.message : String(error)}`] }
        }
      }))
      const errors = prepared.flatMap((result) => result.errors)
      const assets: AssetMap = errors.length > 0 ? {} : Object.fromEntries(prepared.map((result) => [result.nodeId, result.assets]))
      if (!cancelled) setFinished({ plan, revision, result: { assets, errors } })
    })()
    return () => { cancelled = true }
  }, [plan, revision])

  // Compare during render, not only in the effect: no render may pair a new
  // document with bytes from the previous screen or a revoked trust decision.
  const result = useMemo<Result | null>(() => {
    if (plan.errors.length > 0 || plan.targets.length === 0) return { assets: {}, errors: plan.errors }
    return finished?.plan === plan && finished.revision === revision ? finished.result : null
  }, [plan, revision, finished])
  return {
    documents, trusted, retry,
    assets: result?.assets,
    errors: result?.errors ?? [],
    // Kept out of `errors` so a caller can tell "these images would not bake"
    // from "this graph would not build" — they lead to different places.
    routingErrors: plan.routingErrors,
    pending: result === null,
  }
}

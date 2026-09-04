import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { useGraphStore, type StudioNode } from '../state/graphStore'
import type { DisplayDocument } from '../state/displayDocument'
import { customDisplayAssetRequests, customDisplayResourceIssues, type BakedCustomDisplayAsset } from '../state/customDisplayResources'
import { bakeCustomDisplayAssets } from '../utils/bakeCustomDisplayAssets'

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

/** Prepare real firmware bytes before either build consumer generates code. */
export function useCustomDisplayAssets(nodes: StudioNode[], enabled: boolean) {
  const documents = useGraphStore((state) => state.displayDocuments)
  const trusted = useGraphStore((state) => state.trusted)
  const { revision, retry } = useBakeRetry()
  const plan = useMemo(() => {
    const targets: { nodeId: string; label: string; document: DisplayDocument }[] = []
    const errors: string[] = []
    if (enabled) for (const node of nodes) {
      if (node.data.nodeType !== 'Display') continue
      const document = documents[String(node.data.properties.displayId ?? node.id)]
      const label = String(node.data.label || 'Display')
      if (!document) {
        errors.push(`${label}: the screen document is missing. Open the display editor to configure it.`)
        continue
      }
      errors.push(...customDisplayResourceIssues(document).map((issue) => `${label}: ${issue.message}`))
      if (customDisplayAssetRequests(document).length > 0) targets.push({ nodeId: node.id, label, document })
    }
    if (targets.length > 0 && !trusted) {
      errors.push('Trust this project before preparing its display images for firmware.')
    }
    return { targets, errors }
  }, [nodes, documents, trusted, enabled])
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
    pending: result === null,
  }
}

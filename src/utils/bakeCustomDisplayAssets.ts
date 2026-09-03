import { displayAsset, displayAssetUrl } from '../state/displayAssets'
import {
  customDisplayAssetRequests,
  customDisplayResourceIssues,
  packCustomDisplayAsset,
  type BakedCustomDisplayAsset,
  type CustomDisplayAssetRequest,
  type CustomDisplayResourceIssue,
} from '../state/customDisplayResources'
import type { DisplayDocument } from '../state/displayDocument'

export interface BakedCustomDisplayAssets {
  assets: BakedCustomDisplayAsset[]
  issues: CustomDisplayResourceIssue[]
}

export type DisplayAssetRasterizer = (
  request: CustomDisplayAssetRequest,
  sourceUrl: string,
) => Promise<Uint8ClampedArray>

async function canvasRasterizer(
  request: CustomDisplayAssetRequest,
  sourceUrl: string,
): Promise<Uint8ClampedArray> {
  const response = await fetch(sourceUrl)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const image = await createImageBitmap(await response.blob())
  try {
    const canvas = typeof OffscreenCanvas === 'undefined'
      ? document.createElement('canvas')
      : new OffscreenCanvas(request.width, request.height)
    canvas.width = request.width
    canvas.height = request.height
    const context = canvas.getContext('2d', { willReadFrequently: true }) as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null
    if (!context) throw new Error('2D canvas is unavailable')
    context.clearRect(0, 0, request.width, request.height)
    if (request.fit === 'fill') {
      context.drawImage(image, 0, 0, request.width, request.height)
    } else {
      const scale = Math.min(request.width / image.width, request.height / image.height)
      const width = Math.max(1, Math.round(image.width * scale))
      const height = Math.max(1, Math.round(image.height * scale))
      context.drawImage(image, Math.floor((request.width - width) / 2), Math.floor((request.height - height) / 2), width, height)
    }
    return context.getImageData(0, 0, request.width, request.height).data
  } finally {
    image.close()
  }
}

/**
 * Rasterize only the exact asset variants collected from the document.
 *
 * This boundary is asynchronous because SVG decoding belongs to the browser,
 * not to a synchronous C++ text emitter. Callers can inject a rasterizer in
 * tests; production fetches only validated, site-relative catalogue URLs.
 */
export async function bakeCustomDisplayAssets(
  displayDocument: DisplayDocument,
  rasterize: DisplayAssetRasterizer = canvasRasterizer,
): Promise<BakedCustomDisplayAssets> {
  const validation = customDisplayResourceIssues(displayDocument)
  if (validation.length > 0) return { assets: [], issues: validation }

  const assets: BakedCustomDisplayAsset[] = []
  const issues: CustomDisplayResourceIssue[] = []
  for (const request of customDisplayAssetRequests(displayDocument)) {
    const entry = displayAsset(request.assetId)
    if (!entry) continue
    try {
      const rgba = await rasterize(request, displayAssetUrl(entry))
      assets.push({ ...request, data: packCustomDisplayAsset(request, rgba) })
    } catch (error) {
      issues.push({
        code: 'asset-data',
        message: `Could not bake ${entry.label} at ${request.width}x${request.height}: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }
  if (issues.length > 0) return { assets: [], issues }
  return { assets, issues: customDisplayResourceIssues(displayDocument, assets) }
}

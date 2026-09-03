import { displayAsset, type DisplayAssetEntry } from './displayAssets'
import type { DisplayDocument, DisplayWidget } from './displayDocument'
import { displayWidgetTextTokens } from './displayTheme'

/** Font sizes supplied by LVGL 9.5's pinned Montserrat bitmap set. */
export const CUSTOM_DISPLAY_FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48] as const

/** Keep a malformed/imported document from expanding into an unbounded sketch. */
export const CUSTOM_DISPLAY_ASSET_MAX_BYTES = 512 * 1024
export const CUSTOM_DISPLAY_ASSET_MAX_DIMENSION = 1024

export type CustomDisplayAssetFormat = 'a8' | 'rgb565' | 'rgb565a8'
export type CustomDisplayAssetOwner =
  | { kind: 'background' }
  | { kind: 'widget'; widgetIndex: number }

export interface CustomDisplayAssetRequest {
  /** Stable internal lookup key only. It is never emitted as a C++ identifier. */
  key: string
  assetId: string
  width: number
  height: number
  fit: 'fill' | 'contain'
  format: CustomDisplayAssetFormat
  /** A8 masks are painted with this colour by LVGL. */
  tintColor?: string
  owners: CustomDisplayAssetOwner[]
}

export interface BakedCustomDisplayAsset extends CustomDisplayAssetRequest {
  data: Uint8Array
}

export interface CustomDisplayResourceIssue {
  code: 'asset' | 'asset-size' | 'asset-data'
  message: string
}

function stringProperty(widget: DisplayWidget, key: string, fallback = ''): string {
  const value = widget.properties[key]
  return typeof value === 'string' ? value : fallback
}

function boolProperty(widget: DisplayWidget, key: string, fallback = false): boolean {
  const value = widget.properties[key]
  return typeof value === 'boolean' ? value : fallback
}

export function customDisplayFontSize(size: number): number {
  const requested = Number.isFinite(size) ? size : 14
  return CUSTOM_DISPLAY_FONT_SIZES.reduce((best, candidate) => (
    Math.abs(candidate - requested) < Math.abs(best - requested) ? candidate : best
  ), 14 as number)
}

/** Only fonts that a document actually paints are enabled in lv_conf.h. */
export function customDisplayFontSizes(document: DisplayDocument): number[] {
  const sizes = new Set<number>()
  for (const widget of document.widgets) {
    const hasText = widget.type === 'Text'
      || widget.type === 'Numeric Readout'
      || widget.type === 'Timecode'
      || widget.type === 'Pattern Browser'
      || widget.type === 'Button'
      || widget.type === 'Toggle'
    if (hasText) sizes.add(customDisplayFontSize(displayWidgetTextTokens(widget, document.theme).fontSize))
  }
  // Helpers and empty screens still use the pinned default font safely.
  return sizes.size > 0 ? [...sizes].sort((a, b) => a - b) : [14]
}

function assetDimensions(widget: DisplayWidget, asset: DisplayAssetEntry, document: DisplayDocument): { width: number; height: number } {
  if (widget.type === 'Image/Icon') return widget.bounds
  // Control icons match the DOM preview's 1.6em high glyph, or fill an
  // icon-only control. Preserve the source aspect ratio without a device-side
  // scaler.
  const presentation = stringProperty(widget, 'presentation', 'text')
  const textHeight = displayWidgetTextTokens(widget, document.theme).fontSize
  const height = Math.max(1, Math.min(widget.bounds.height, presentation === 'icon' ? widget.bounds.height : Math.round(textHeight * 1.6)))
  return { width: Math.max(1, Math.min(widget.bounds.width, Math.round(height * asset.width / Math.max(1, asset.height)))), height }
}

function requestKey(assetId: string, width: number, height: number, fit: 'fill' | 'contain', format: CustomDisplayAssetFormat, tintColor?: string): string {
  return [assetId, width, height, fit, format, tintColor ?? ''].join('|')
}

function addRequest(
  requests: Map<string, CustomDisplayAssetRequest>,
  assetId: string,
  size: { width: number; height: number },
  owner: CustomDisplayAssetOwner,
  options: { tint?: boolean; tintColor?: string; opaque?: boolean; fit?: 'fill' | 'contain' } = {},
): void {
  const asset = displayAsset(assetId)
  if (!asset || asset.bytesPerPixel === 0 || asset.format === 'json') return
  const width = Math.max(1, Math.round(size.width))
  const height = Math.max(1, Math.round(size.height))
  const format: CustomDisplayAssetFormat = options.tint && asset.tintable
    ? 'a8'
    : options.opaque ? 'rgb565' : 'rgb565a8'
  const tintColor = format === 'a8' ? options.tintColor ?? '#ffffff' : undefined
  const fit = options.fit ?? 'contain'
  const key = requestKey(assetId, width, height, fit, format, tintColor)
  const existing = requests.get(key)
  if (existing) existing.owners.push(owner)
  else requests.set(key, { key, assetId, width, height, fit, format, tintColor, owners: [owner] })
}

/**
 * Exact vector rasterizations needed by one screen. Equal uses are folded, so
 * two 24 px white power glyphs share one flash table while a different size or
 * tint remains a different bake.
 */
export function customDisplayAssetRequests(document: DisplayDocument): CustomDisplayAssetRequest[] {
  const requests = new Map<string, CustomDisplayAssetRequest>()
  if (document.theme.background.kind === 'image') {
    addRequest(requests, document.theme.background.assetId, document.designSize, { kind: 'background' }, { opaque: true, fit: 'fill' })
  }
  document.widgets.forEach((widget, widgetIndex) => {
    const assetId = stringProperty(widget, 'assetId')
    const asset = displayAsset(assetId)
    if (!asset) return
    if (widget.type === 'Image/Icon') {
      addRequest(requests, assetId, assetDimensions(widget, asset, document), { kind: 'widget', widgetIndex }, {
        tint: boolProperty(widget, 'tint'),
        tintColor: stringProperty(widget, 'tintColor', '#f4f7ff'),
      })
    } else if ((widget.type === 'Button' || widget.type === 'Toggle')
      && stringProperty(widget, 'presentation', 'text') !== 'text') {
      addRequest(requests, assetId, assetDimensions(widget, asset, document), { kind: 'widget', widgetIndex })
    }
  })
  return [...requests.values()]
}

export function customDisplayAssetByteLength(request: Pick<CustomDisplayAssetRequest, 'width' | 'height' | 'format'>): number {
  const bytesPerPixel = request.format === 'a8' ? 1 : request.format === 'rgb565' ? 2 : 3
  return request.width * request.height * bytesPerPixel
}

/** Validate the finished bake before any C++ text is generated. */
export function customDisplayResourceIssues(
  document: DisplayDocument,
  baked?: readonly BakedCustomDisplayAsset[],
): CustomDisplayResourceIssue[] {
  const issues: CustomDisplayResourceIssue[] = []
  const requests = customDisplayAssetRequests(document)
  const referenced = new Map<string, { assetId: string; use: 'background' | 'image' | 'icon' }>()
  const addReference = (assetId: string, use: 'background' | 'image' | 'icon') => {
    referenced.set(`${use}:${assetId}`, { assetId, use })
  }
  if (document.theme.background.kind === 'image') addReference(document.theme.background.assetId, 'background')
  for (const widget of document.widgets) {
    const assetId = stringProperty(widget, 'assetId')
    if (!assetId) continue
    if (widget.type === 'Image/Icon') addReference(assetId, 'image')
    else if ((widget.type === 'Button' || widget.type === 'Toggle')
      && stringProperty(widget, 'presentation', 'text') !== 'text') addReference(assetId, 'icon')
  }
  for (const { assetId, use } of referenced.values()) {
    const asset = displayAsset(assetId)
    if (!asset) issues.push({ code: 'asset', message: `Asset ${assetId} is not in the installed display pack.` })
    else if (asset.category === 'template-preview' || asset.bytesPerPixel === 0) {
      issues.push({ code: 'asset', message: `${asset.label} is editor-only and cannot be emitted to firmware.` })
    } else if (use === 'background' && asset.category !== 'background') {
      issues.push({ code: 'asset', message: `${asset.label} is not a display background.` })
    } else if (use !== 'background' && !asset.slots.includes(use)) {
      issues.push({ code: 'asset', message: `${asset.label} cannot fill a ${use} asset slot.` })
    } else if (use === 'background'
      && (asset.width !== document.designSize.width || asset.height !== document.designSize.height)) {
      issues.push({
        code: 'asset-size',
        message: `${asset.label} is ${asset.width}x${asset.height}; choose the ${document.designSize.width}x${document.designSize.height} background variant for this display.`,
      })
    }
  }
  let total = 0
  for (const request of requests) {
    const asset = displayAsset(request.assetId)
    if (!asset) continue
    const bytes = customDisplayAssetByteLength(request)
    total += bytes
    if (request.width > CUSTOM_DISPLAY_ASSET_MAX_DIMENSION || request.height > CUSTOM_DISPLAY_ASSET_MAX_DIMENSION) {
      issues.push({ code: 'asset-size', message: `${asset.label} requests ${request.width}x${request.height}; the firmware asset limit is ${CUSTOM_DISPLAY_ASSET_MAX_DIMENSION}px per side.` })
    }
  }
  if (total > CUSTOM_DISPLAY_ASSET_MAX_BYTES) {
    issues.push({
      code: 'asset-size',
      message: `Display assets need ${total} bytes of flash; the pre-generation limit is ${CUSTOM_DISPLAY_ASSET_MAX_BYTES} bytes. Reduce image dimensions or remove artwork.`,
    })
  }
  if (baked) {
    const byKey = new Map(baked.map((entry) => [entry.key, entry]))
    for (const request of requests) {
      const entry = byKey.get(request.key)
      if (!entry) {
        issues.push({ code: 'asset-data', message: `Asset ${request.assetId} has not been baked for ${request.width}x${request.height}.` })
      } else if (entry.data.length !== customDisplayAssetByteLength(request)) {
        issues.push({ code: 'asset-data', message: `Asset ${request.assetId} produced ${entry.data.length} bytes; ${customDisplayAssetByteLength(request)} are required.` })
      }
    }
  }
  return issues
}

/** Convert Canvas RGBA pixels to the exact native format LVGL will read. */
export function packCustomDisplayAsset(
  request: CustomDisplayAssetRequest,
  rgba: Uint8ClampedArray,
): Uint8Array {
  const pixels = request.width * request.height
  if (rgba.length !== pixels * 4) throw new Error(`Expected ${pixels * 4} RGBA bytes, received ${rgba.length}.`)
  if (request.format === 'a8') {
    const out = new Uint8Array(pixels)
    for (let i = 0; i < pixels; i++) out[i] = rgba[i * 4 + 3]
    return out
  }
  const alphaOffset = pixels * 2
  const out = new Uint8Array(request.format === 'rgb565a8' ? pixels * 3 : pixels * 2)
  for (let i = 0; i < pixels; i++) {
    const at = i * 4
    const packed = ((rgba[at] & 0xf8) << 8) | ((rgba[at + 1] & 0xfc) << 3) | (rgba[at + 2] >> 3)
    // LVGL's native RGB565 converter stores the host-order low byte first.
    out[i * 2] = packed & 0xff
    out[i * 2 + 1] = packed >> 8
    if (request.format === 'rgb565a8') out[alphaOffset + i] = rgba[at + 3]
  }
  return out
}

import {
  customDisplayAssetByteLength,
  customDisplayAssetRequests,
  customDisplayResourceIssues,
  type BakedCustomDisplayAsset,
  type CustomDisplayAssetOwner,
} from '../state/customDisplayResources'
import type { DisplayDocument } from '../state/displayDocument'

function safeId(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9_]/g, '_')
  return safe.length > 0 && /^[A-Za-z_]/.test(safe) ? safe : `_${safe}`
}

function bytes(data: Uint8Array, perRow = 16): string {
  const rows: string[] = []
  for (let i = 0; i < data.length; i += perRow) {
    rows.push('  ' + Array.from(data.slice(i, i + perRow))
      .map((value) => `0x${value.toString(16).padStart(2, '0')}`).join(', ') + ',')
  }
  return rows.join('\n')
}

function colorFormat(format: BakedCustomDisplayAsset['format']): string {
  if (format === 'a8') return 'LV_COLOR_FORMAT_A8'
  if (format === 'rgb565a8') return 'LV_COLOR_FORMAT_RGB565A8'
  return 'LV_COLOR_FORMAT_RGB565'
}

function stride(asset: BakedCustomDisplayAsset): number {
  return asset.format === 'a8' ? asset.width : asset.width * 2
}

export function customDisplayAssetSymbol(displayId: string, index: number): string {
  return `_cdAsset_${safeId(displayId)}_${index}`
}

/** Locate a baked table by document owner, never by authored text. */
export function customDisplayAssetIndex(
  document: DisplayDocument,
  owner: CustomDisplayAssetOwner,
): number | null {
  const requests = customDisplayAssetRequests(document)
  const index = requests.findIndex((request) => request.owners.some((candidate) => (
    candidate.kind === owner.kind
    && (candidate.kind === 'background' || (owner.kind === 'widget' && candidate.widgetIndex === owner.widgetIndex))
  )))
  return index < 0 ? null : index
}

/**
 * Emit validated LVGL 9 image descriptors. Asset ids, labels and paths never
 * become symbols: the codegen-owned display stem and deterministic array index
 * are the only identifier material.
 */
export function customDisplayAssetsCpp(
  displayId: string,
  document: DisplayDocument,
  baked: readonly BakedCustomDisplayAsset[],
): string {
  const issues = customDisplayResourceIssues(document, baked)
  if (issues.length > 0) throw new Error(issues.map((issue) => issue.message).join(' '))
  const byKey = new Map(baked.map((asset) => [asset.key, asset]))
  return customDisplayAssetRequests(document).map((request, index) => {
    const asset = byKey.get(request.key)!
    const symbol = customDisplayAssetSymbol(displayId, index)
    if (asset.data.length !== customDisplayAssetByteLength(asset)) {
      throw new Error(`Invalid byte length for ${request.assetId}.`)
    }
    return `static const LV_ATTRIBUTE_MEM_ALIGN LV_ATTRIBUTE_LARGE_CONST uint8_t ${symbol}_map[] PROGMEM = {
${bytes(asset.data)}
};
static const lv_image_dsc_t ${symbol} = {
  .header = {
    .magic = LV_IMAGE_HEADER_MAGIC,
    .cf = ${colorFormat(asset.format)},
    .flags = 0,
    .w = ${asset.width},
    .h = ${asset.height},
    .stride = ${stride(asset)},
    .reserved_2 = 0,
  },
  .data_size = sizeof(${symbol}_map),
  .data = ${symbol}_map,
  .reserved = nullptr,
};`
  }).join('\n\n')
}


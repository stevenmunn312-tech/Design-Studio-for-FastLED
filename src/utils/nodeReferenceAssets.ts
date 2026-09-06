/** Shared by Help, the SVG generator and coverage checks, including acronyms. */
export function nodeReferenceSlug(nodeType: string): string {
  return nodeType
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

export function nodeCardSrc(nodeType: string): string {
  return `/node-cards/${nodeReferenceSlug(nodeType)}.svg`
}

export function exampleGraphSrc(nodeType: string): string {
  return `/node-cards/graphs/${nodeReferenceSlug(nodeType)}.svg`
}

export function mainPreviewSrc(nodeType: string): string {
  return `/node-cards/previews/${nodeReferenceSlug(nodeType)}.svg`
}

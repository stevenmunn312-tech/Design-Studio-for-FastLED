function blobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Unable to encode diagram image'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

export async function inlineSvgImages(svg: SVGSVGElement) {
  await Promise.all(Array.from(svg.querySelectorAll('image')).map(async (image) => {
    const href = image.getAttribute('href')
    if (!href || href.startsWith('data:')) return
    const response = await fetch(new URL(href, window.location.href))
    if (!response.ok) throw new Error(`Unable to embed diagram image: ${response.status}`)
    image.setAttribute('href', await blobAsDataUrl(await response.blob()))
  }))
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const BAND_FONT_SIZE = 13
const BAND_LINE_HEIGHT = 18
const BAND_PADDING = 12

/** Greedy word wrap; SVG text does not wrap on its own. */
function wrapWords(text: string, maxChars: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > maxChars) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * Adds the safety line as a band below the drawing of an exported SVG, which
 * travels on its own with no app or cover sheet around it. The viewBox and
 * height grow to make room, so nothing in the drawing moves.
 */
export function appendSafetyBand(svg: SVGSVGElement, text: string) {
  const [x, y, width, height] = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number)
  if (![x, y, width, height].every(Number.isFinite)) return
  // About 0.55 em per character in a sans face.
  const lines = wrapWords(text, Math.max(20, Math.floor((width - BAND_PADDING * 2) / (BAND_FONT_SIZE * 0.55))))
  const bandHeight = BAND_PADDING * 2 + lines.length * BAND_LINE_HEIGHT
  const top = y + height

  const band = document.createElementNS(SVG_NS, 'g')
  band.setAttribute('data-safety-band', 'true')
  const rect = document.createElementNS(SVG_NS, 'rect')
  Object.entries({ x, y: top, width, height: bandHeight, fill: '#ffffff', stroke: '#2b3031', 'stroke-width': 1.5 })
    .forEach(([name, value]) => rect.setAttribute(name, String(value)))
  const label = document.createElementNS(SVG_NS, 'text')
  Object.entries({ x: x + BAND_PADDING, y: top + BAND_PADDING, fill: '#2b3031', 'font-family': 'Arial, Helvetica, sans-serif', 'font-size': BAND_FONT_SIZE, 'font-weight': 600 })
    .forEach(([name, value]) => label.setAttribute(name, String(value)))
  lines.forEach((line) => {
    const span = document.createElementNS(SVG_NS, 'tspan')
    span.setAttribute('x', String(x + BAND_PADDING))
    span.setAttribute('dy', String(BAND_LINE_HEIGHT))
    span.textContent = line
    label.append(span)
  })
  band.append(rect, label)
  svg.append(band)

  svg.setAttribute('viewBox', `${x} ${y} ${width} ${height + bandHeight}`)
  svg.setAttribute('height', String(height + bandHeight))
}

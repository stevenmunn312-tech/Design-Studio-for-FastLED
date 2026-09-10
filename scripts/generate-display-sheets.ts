/**
 * Rasterise every fixed display layout into contact sheets you can look at.
 *
 * The other half of HW-08's visual pass. `displaySurfaceGolden.test.ts` can
 * tell you a picture changed; it cannot tell you whether the new one is any
 * good, and a layout is a picture — judging one from field coordinates does
 * not work. This renders the same enumerated cases the golden test freezes,
 * one sheet per panel geometry, every tile at the panel's true pixel size —
 * scaling them up would flatter text that is genuinely marginal on the glass,
 * and whether a fixed string fits is exactly what a sheet is for. (It is what
 * these sheets caught on their first run: a 240-wide panel was showing
 * "WAITING FOR A S...".)
 *
 * Output goes to the gitignored `artifacts/` tree: it is regenerable, and a
 * committed PNG of a layout is a second authority that can disagree with the
 * layout.
 *
 * It also draws a second kind of sheet, one per mounted size: the
 * custom-display templates as placed widget boxes, controls tinted apart from
 * readouts. A template carries no values yet, so what has to be judged there
 * is where things sit and how much room a finger has, not what they say.
 *
 * Labels are drawn with the panel's own bitmap font rather than a system one,
 * so a sheet needs no fonts, no browser and no dependency beyond zlib — and
 * the label text is legible at exactly the size the panel's text is, which is
 * itself a useful thing to see.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  TFT_CONTROLLERS, TFT_ROTATIONS, clearTftSurface, createTftSurface, drawTftRect,
  drawTftText, fillTftRect, rgb565, rgb565Components, tftRotatedSize, type TftSurface,
} from '../src/state/tftSurface'
import {
  displaySurfaceCases, type DisplaySurfaceCase, type RenderedSurface,
} from '../src/state/__tests__/displaySurfaceCases'
import { DISPLAY_TEMPLATES, applyDisplayTemplate } from '../src/state/displayTemplates'
import { createDisplayDocument } from '../src/state/displayEditor'
import { isDisplayTouchTarget } from '../src/state/displayRegistry'

const OUT_DIR = resolve('artifacts/display-sheets')

const SHEET_BG = rgb565(24, 24, 28)
const SHEET_INK = rgb565(232, 232, 240)
const SHEET_DIM = rgb565(140, 140, 152)
const TILE_EDGE = rgb565(80, 80, 92)
const WIDGET_FILL = rgb565(27, 31, 39)
const WIDGET_EDGE = rgb565(90, 97, 114)
const CONTROL_FILL = rgb565(29, 58, 82)
const CONTROL_EDGE = rgb565(74, 163, 224)

const LABEL_SCALE = 1
const LABEL_H = 8
const GAP = 14
const MARGIN = 18
const CAPTION_GAP = 4

// ── PNG ─────────────────────────────────────────────────────────────────────

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 12)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.length)
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i)
  out.set(body, 8)
  view.setUint32(body.length + 8, crc32(out.subarray(4, body.length + 8)))
  return out
}

/** Truecolour PNG from one `0xRRGGBB` per pixel. */
function encodePng(width: number, height: number, rgb: Uint32Array): Uint8Array {
  const raw = new Uint8Array(height * (1 + width * 3))
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3)
    raw[row] = 0 // filter: none — these are flat-shaded panels, not photographs
    for (let x = 0; x < width; x += 1) {
      const pixel = rgb[y * width + x]
      const at = row + 1 + x * 3
      raw[at] = (pixel >>> 16) & 0xff
      raw[at + 1] = (pixel >>> 8) & 0xff
      raw[at + 2] = pixel & 0xff
    }
  }
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header[8] = 8 // bit depth
  header[9] = 2 // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ])
}

// ── Sheet composition ───────────────────────────────────────────────────────

function blit(sheet: TftSurface, surface: RenderedSurface, atX: number, atY: number): void {
  for (let y = 0; y < surface.height; y += 1) {
    const row = (atY + y) * sheet.width
    for (let x = 0; x < surface.width; x += 1) {
      const pixel = surface.rgb[y * surface.width + x]
      sheet.data[row + atX + x] = rgb565((pixel >>> 16) & 0xff, (pixel >>> 8) & 0xff, pixel & 0xff)
    }
  }
}

function label(sheet: TftSurface, x: number, y: number, text: string, color: number): void {
  drawTftText(sheet, x, y, text, color, LABEL_SCALE)
}

interface Sheet { name: string; width: number; height: number; rgb: Uint32Array }

function composeSheet(key: string, cases: DisplaySurfaceCase[], columns: number): Sheet {
  const tileW = cases[0].width
  const tileH = cases[0].height
  const rows = Math.ceil(cases.length / columns)
  const cellW = Math.max(tileW, 1)
  const cellH = LABEL_H + CAPTION_GAP + tileH
  const titleH = LABEL_H + GAP
  const width = MARGIN * 2 + columns * cellW + (columns - 1) * GAP
  const height = MARGIN * 2 + titleH + rows * cellH + (rows - 1) * GAP

  const sheet = createTftSurface(width, height)
  clearTftSurface(sheet, SHEET_BG)
  label(sheet, MARGIN, MARGIN, `${key.toUpperCase()}  ${cases.length} CASES`, SHEET_INK)

  cases.forEach((entry, index) => {
    const column = index % columns
    const row = (index / columns) | 0
    const x = MARGIN + column * (cellW + GAP)
    const y = MARGIN + titleH + row * (cellH + GAP)
    label(sheet, x, y, `${entry.layout} / ${entry.state}`.toUpperCase(), SHEET_DIM)
    const tileY = y + LABEL_H + CAPTION_GAP
    blit(sheet, entry.render(), x, tileY)
    // An outline, because several layouts paint their own background right to
    // the edge and a black panel on a dark sheet has no boundary otherwise.
    drawTftRect(sheet, x - 1, tileY - 1, tileW + 2, tileH + 2, TILE_EDGE)
  })

  return { name: key, width, height, rgb: toRgb(sheet) }
}

function toRgb(sheet: TftSurface): Uint32Array {
  const rgb = new Uint32Array(sheet.width * sheet.height)
  for (let i = 0; i < rgb.length; i += 1) {
    const { r, g, b } = rgb565Components(sheet.data[i])
    rgb[i] = (r << 16) | (g << 8) | b
  }
  return rgb
}

/**
 * A second kind of sheet: the custom-display templates as placed widgets.
 *
 * Boxes and labels rather than a rendered screen, because a template *is* a
 * set of bounds — it carries no values yet — and what has to be judged is
 * where things sit and how much room a finger has. Drawn with the same
 * primitives as the panel sheets so this needs no browser and no rasteriser
 * either; the alternative, an SVG rasterised through a downloaded CLI, made
 * the picture unreproducible the moment the throwaway script was deleted.
 *
 * Controls are tinted apart from readouts, which is the distinction the
 * layout has to get right: only controls carry a touch minimum and a
 * separation rule.
 */
function composeTemplateSheet(width: number, height: number, columns: number): Sheet {
  const cellW = width
  const cellH = LABEL_H + CAPTION_GAP + height
  const rows = Math.ceil(DISPLAY_TEMPLATES.length / columns)
  const titleH = LABEL_H + GAP
  const sheetW = MARGIN * 2 + columns * cellW + (columns - 1) * GAP
  const sheetH = MARGIN * 2 + titleH + rows * cellH + (rows - 1) * GAP

  const sheet = createTftSurface(sheetW, sheetH)
  clearTftSurface(sheet, SHEET_BG)
  label(sheet, MARGIN, MARGIN, `TEMPLATES ${width}X${height}  ${DISPLAY_TEMPLATES.length} LAYOUTS`, SHEET_INK)

  DISPLAY_TEMPLATES.forEach((template, index) => {
    const x = MARGIN + (index % columns) * (cellW + GAP)
    const y = MARGIN + titleH + ((index / columns) | 0) * (cellH + GAP)
    label(sheet, x, y, template.label.toUpperCase(), SHEET_DIM)
    const top = y + LABEL_H + CAPTION_GAP
    fillTftRect(sheet, x, top, width, height, 0)
    drawTftRect(sheet, x - 1, top - 1, width + 2, height + 2, TILE_EDGE)
    const document = applyDisplayTemplate(createDisplayDocument('sheet', width, height), template.id)
    for (const placed of document.widgets) {
      const control = isDisplayTouchTarget(placed.type)
      const bounds = placed.bounds
      fillTftRect(sheet, x + bounds.x, top + bounds.y, bounds.width, bounds.height,
        control ? CONTROL_FILL : WIDGET_FILL)
      drawTftRect(sheet, x + bounds.x, top + bounds.y, bounds.width, bounds.height,
        control ? CONTROL_EDGE : WIDGET_EDGE)
      label(sheet, x + bounds.x + 3, top + bounds.y + 3, placed.label.toUpperCase(), SHEET_INK)
    }
  })

  return { name: `templates-${width}x${height}`, width: sheetW, height: sheetH, rgb: toRgb(sheet) }
}

/** Every size a catalogued colour panel presents, deduplicated. */
function mountedSizes(): Array<{ width: number; height: number }> {
  const seen = new Map<string, { width: number; height: number }>()
  for (const controller of Object.values(TFT_CONTROLLERS)) {
    for (const rotation of TFT_ROTATIONS) {
      const size = tftRotatedSize(controller, rotation)
      const key = `${size.width}x${size.height}`
      if (!seen.has(key)) seen.set(key, size)
    }
  }
  return [...seen.values()]
}

// ── Entry ───────────────────────────────────────────────────────────────────

export function generateDisplaySheets(): string[] {
  mkdirSync(OUT_DIR, { recursive: true })
  const byGeometry = new Map<string, DisplaySurfaceCase[]>()
  for (const entry of displaySurfaceCases()) {
    const key = `${entry.family}-${entry.width}x${entry.height}`
    byGeometry.set(key, [...(byGeometry.get(key) ?? []), entry])
  }

  const written: string[] = []
  for (const [key, cases] of byGeometry) {
    // Six across keeps a 240-wide panel sheet under about 1,600 pixels, which
    // is the width a screenshot stays readable at without scrolling.
    const columns = Math.min(6, cases.length)
    const sheet = composeSheet(key, cases, columns)
    const file = resolve(OUT_DIR, `${key}.png`)
    writeFileSync(file, encodePng(sheet.width, sheet.height, sheet.rgb))
    written.push(file)
  }

  for (const size of mountedSizes()) {
    const sheet = composeTemplateSheet(size.width, size.height, Math.min(4, DISPLAY_TEMPLATES.length))
    const file = resolve(OUT_DIR, `${sheet.name}.png`)
    writeFileSync(file, encodePng(sheet.width, sheet.height, sheet.rgb))
    written.push(file)
  }
  return written
}

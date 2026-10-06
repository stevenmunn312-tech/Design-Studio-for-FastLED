import { useEffect, useState } from 'react'
import { usePreviewStore } from '../../state/previewStore'
import type { OledSurface } from '../../state/displays/oledSurface'
import type { TftSurface } from '../../state/displays/tftSurface'
import { isOledSurface, isTftSurface, paintOledSurface, paintTftSurface } from './displaySurfaceRaster'

/*
 * A panel's picture is rasterised at most this often. The evaluator publishes a
 * fresh surface every tick, but what a panel shows changes at clock or progress
 * speed; re-encoding it sixty times a second would cost more than it shows.
 */
const RASTER_INTERVAL_MS = 100
/** An unlit OLED pixel: whatever is behind the picture shows through. */
const TRANSPARENT = [0, 0, 0, 0] as const

/*
 * One off-DOM canvas for every panel picture in the app. A visible, repainted
 * <canvas> becomes its own compositor layer, and Chromium leaks raster memory
 * for each one every compositor frame — invisible to the JS heap, and the
 * cause of the tab that grew to 8 GB. An image fed from here is ordinary
 * painted content. See `HardwareLedPreview` for the history.
 */
let scratch: HTMLCanvasElement | null = null

function rasterise(surface: OledSurface | TftSurface, kind: 'oled' | 'tft'): string | null {
  if (typeof document === 'undefined') return null
  scratch ??= document.createElement('canvas')
  scratch.width = surface.width
  scratch.height = surface.height
  const context = scratch.getContext('2d')
  if (!context) return null
  const image = context.createImageData(surface.width, surface.height)
  if (kind === 'oled') paintOledSurface(image, surface as OledSurface, TRANSPARENT)
  else paintTftSurface(image, surface as TftSurface)
  context.putImageData(image, 0, 0)
  return scratch.toDataURL('image/png')
}

/**
 * A transparent picture of a panel's size, for an `<img>` showing a dark
 * panel: it keeps the panel's shape, and the glass colour behind it shows.
 */
export function blankSurfaceUrl(width: number, height: number): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`,
  )}`
}

export interface SurfacePicture {
  url: string
  width: number
  height: number
}

/**
 * A display node's evaluated surface as an image URL, re-rasterised only when
 * its pixels change and no more often than `RASTER_INTERVAL_MS`. Null while
 * the panel is dark, so whatever stands for unlit glass behind it shows. An
 * OLED's unlit pixels are transparent for the same reason.
 *
 * `active: false` stops listening, for a panel drawing something other than
 * its fixed surface (a mounted screen design).
 */
export function useSurfacePicture(nodeId: string, kind: 'oled' | 'tft', active = true): SurfacePicture | null {
  const [picture, setPicture] = useState<SurfacePicture | null>(null)

  useEffect(() => {
    if (!active) return
    let latest: OledSurface | TftSurface | null = null
    let latestValue: unknown = undefined
    let shown: Uint8Array | Uint16Array | null = null
    let shownWidth = 0
    let painted = false
    let lastAt = -Infinity
    let timer: ReturnType<typeof setTimeout> | null = null

    const draw = () => {
      timer = null
      lastAt = Date.now()
      painted = true
      const surface = latest
      if (!surface) {
        shown = null
        setPicture(null)
        return
      }
      shown = surface.data.slice()
      shownWidth = surface.width
      const url = rasterise(surface, kind)
      setPicture(url ? { url, width: surface.width, height: surface.height } : null)
    }

    const unchanged = (surface: OledSurface | TftSurface | null) => {
      if (!painted) return false
      if (!surface || !shown) return !surface && !shown
      if (surface.width !== shownWidth || surface.data.length !== shown.length) return false
      for (let i = 0; i < shown.length; i++) if (shown[i] !== surface.data[i]) return false
      return true
    }

    const read = (state: ReturnType<typeof usePreviewStore.getState>) => {
      const value = state.outputs.get(nodeId)?.surface
      if (painted && value === latestValue) return
      latestValue = value
      latest = kind === 'oled'
        ? (isOledSurface(value) ? value : null)
        : (isTftSurface(value) ? value : null)
      if (timer || unchanged(latest)) return
      const wait = RASTER_INTERVAL_MS - (Date.now() - lastAt)
      if (wait <= 0) draw()
      else timer = setTimeout(draw, wait)
    }

    read(usePreviewStore.getState())
    const unsubscribe = usePreviewStore.subscribe(read)
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [active, kind, nodeId])

  return active ? picture : null
}

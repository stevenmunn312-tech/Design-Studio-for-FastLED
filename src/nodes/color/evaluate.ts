import {
  type ButtonEdgeState,
  normalizeButtonEdgeSettings,
  blankButtonEdgeState,
  buttonEdge,
} from '../../state/transportBridge'
import {
  paletteBankEntries,
  clampPaletteBankIndex,
  stepPaletteBankIndex,
  paletteBankSelection,
  paletteBankLabel,
} from '../../state/paletteBank'
import { displayString } from '../../state/displayText'
import { imagePaletteStops16 } from '../../state/imagePalette'
import { hexToRgb, polinePalette } from '../../state/polinePalette'
import { normalizeCustomPalette, hexToRgb as customHexToRgb, customPaletteStops16 } from '../../state/customPalette'
import { type RGB, hsv, samplePalette } from '../../state/ledColor'
import type { NodeEvaluators } from '../../state/evaluator/types'
import { byte, heatColor } from '../../state/evaluator/frames'
import { toggleTapPress } from '../../state/evaluator/signals'

/** Palette Bank cursors — one per node instance, like every other stateful node. */
const paletteBankState = new Map<string, {
  lastT: number
  index: number
  buttons: Record<string, ButtonEdgeState>
}>()

const TEMPERATURE_MIN_K = 1000
const TEMPERATURE_MAX_K = 12000

function normalizedTemperatureToKelvin(value: number): number {
  const t = Math.max(0, Math.min(1, value))
  return TEMPERATURE_MIN_K + t * (TEMPERATURE_MAX_K - TEMPERATURE_MIN_K)
}

// Approximate black-body white point for a colour temperature in Kelvin
// (Tanner Helland's approximation): ~1900K candle → ~6500K daylight → blue.
function kelvinToRgb(kelvin: number): RGB {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100
  const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)))
  let r: number, g: number, b: number
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661 }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492) }
  if (t >= 66) b = 255
  else if (t <= 19) b = 0
  else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307
  return { r: clamp(r), g: clamp(g), b: clamp(b) }
}

/** Shape one 0→1 leg of a PaletteSweep. The ping-pong timing itself is
 * handled by the node so every easing retains the requested round-trip rate. */
function applySweepEase(type: string, x: number): number {
  const t = Math.max(0, Math.min(1, x))
  switch (type) {
    case 'linear': return t
    case 'quad':
      return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2
    case 'cubic':
      return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2
    case 'sine':
    default:
      return (1 - Math.cos(Math.PI * t)) / 2
  }
}

export const COLOR_EVALUATORS: NodeEvaluators = {
  HueCycle({ num, t }, id, props) {
    const rate = num(id, 'rate', props, 'rate', 0.1)
    const s = num(id, 's', props, 's', 1)
    const v = num(id, 'v', props, 'v', 1)
    return { color: hsv(t * rate * 360, s, v) }
  },
  HSVToRGB({ num }, id, props) {
    const h = num(id, 'h', props, 'h', 0)
    const s = num(id, 's', props, 's', 1)
    const v = num(id, 'v', props, 'v', 1)
    return { color: hsv(h, s, v) }
  },
  // The inverse of HSVToRGB — shares HueShift/Saturation's inline extraction.
  RGBToHSV({ input, num }, id, props) {
    const c = (input(id, 'rgb', null) as RGB | null) ?? {
      r: byte(num(id, 'r', props, 'r', 0) / 255),
      g: byte(num(id, 'g', props, 'g', 0) / 255),
      b: byte(num(id, 'b', props, 'b', 0) / 255),
    }
    const r = c.r / 255, g = c.g / 255, b = c.b / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
    let h = 0
    if (d > 0) {
      if (max === r) h = ((g - b) / d) % 6
      else if (max === g) h = (b - r) / d + 2
      else h = (r - g) / d + 4
      h = h * 60
    }
    const s = max > 0 ? d / max : 0
    return { h: (h + 360) % 360, s, v: max }
  },
  Temperature({ num }, id, props) {
    return { color: kelvinToRgb(normalizedTemperatureToKelvin(num(id, 'kelvin', props, 'kelvin', 0.27))) }
  },
  HeatColor({ num }, id, props) {
    // heatColor() takes a 0–255 temperature (shared with Fire2012); the node
    // input is a normalised 0–1 heat.
    const heat = Math.max(0, Math.min(1, num(id, 'heat', props, 'heat', 0.5)))
    return { color: heatColor(heat * 255) }
  },
  BlendColors({ input, num }, id, props) {
    const ca = input(id, 'a', null) as RGB | null
    const cb = input(id, 'b', null) as RGB | null
    const mix = num(id, 't', props, 't', 0.5)
    const a = ca ?? {
      r: byte(num(id, 'rA', props, 'rA', 255) / 255),
      g: byte(num(id, 'gA', props, 'gA', 0) / 255),
      b: byte(num(id, 'bA', props, 'bA', 0) / 255),
    }
    const b = cb ?? {
      r: byte(num(id, 'rB', props, 'rB', 0) / 255),
      g: byte(num(id, 'gB', props, 'gB', 0) / 255),
      b: byte(num(id, 'bB', props, 'bB', 255) / 255),
    }
    return {
      color: {
        r: Math.round(a.r * (1 - mix) + b.r * mix),
        g: Math.round(a.g * (1 - mix) + b.g * mix),
        b: Math.round(a.b * (1 - mix) + b.b * mix),
      },
    }
  },
  GradientSampler({ input, num }, id, props) {
    const tt = num(id, 't', props, 't', 0)
    const cA = (input(id, 'colorA', null) as RGB | null) ?? {
      r: byte(num(id, 'rA', props, 'rA', 0) / 255),
      g: byte(num(id, 'gA', props, 'gA', 200) / 255),
      b: byte(num(id, 'bA', props, 'bA', 255) / 255),
    }
    const cB = (input(id, 'colorB', null) as RGB | null) ?? {
      r: byte(num(id, 'rB', props, 'rB', 255) / 255),
      g: byte(num(id, 'gB', props, 'gB', 0) / 255),
      b: byte(num(id, 'bB', props, 'bB', 255) / 255),
    }
    return { color: { r: Math.round(cA.r*(1-tt)+cB.r*tt), g: Math.round(cA.g*(1-tt)+cB.g*tt), b: Math.round(cA.b*(1-tt)+cB.b*tt) } }
  },
  PaletteSampler({ num, pal }, id, props) {
    const tt = num(id, 't', props, 't', 0)
    const palName = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    return { color: samplePalette(palName, tt) }
  },
  PaletteSweep({ num, pal, t }, id, props) {
    const rate = Math.max(0, num(id, 'rate', props, 'rate', 0.1))
    const phase = ((t * rate) % 1 + 1) % 1
    const pingPong = phase < 0.5 ? phase * 2 : (1 - phase) * 2
    const position = applySweepEase(String(props.easing ?? 'sine'), pingPong)
    const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    return { color: samplePalette(palette, position) }
  },
  PaletteBank({ input, t, stateKey, incoming, nodeMap }, id, props) {
    const entries = paletteBankEntries(props)
    const key = stateKey(id)
    const nowMs = t * 1000
    let state = paletteBankState.get(key)
    if (!state || t < state.lastT) {
      state = { lastT: t, index: 0, buttons: {} }
      paletteBankState.set(key, state)
    }
    state.lastT = t
    // The same debounce/rising-edge rules a transport button uses, from the
    // one module that owns them — a press has to mean the same thing here
    // as it does on a player, and as it will on the board.
    const edgeSettings = normalizeButtonEdgeSettings(props)
    const press = (port: string): boolean => {
      const tap = toggleTapPress(`${key}:${port}`, incoming.get(`${id}:${port}`), nodeMap)
      if (tap !== null) return tap
      let bs = state!.buttons[port]
      if (!bs) {
        bs = blankButtonEdgeState(nowMs)
        state!.buttons[port] = bs
      }
      return buttonEdge(bs, Boolean(input(id, port, false)), nowMs, true, edgeSettings)
    }
    // Pressed together they cancel, the way +step and -step in one frame net
    // to nothing — no precedence rule needed.
    const held = clampPaletteBankIndex(state.index, entries.length)
    const delta = (press('next') ? 1 : 0) - (press('previous') ? 1 : 0)
    const index = delta === 0 ? held : stepPaletteBankIndex(held, entries.length, delta)
    state.index = index
    const selected = paletteBankSelection(entries, index)
    return { palette: selected, name: displayString(paletteBankLabel(selected)), index }
  },
  CHSV({ num }, id, props) {
    const hue = num(id, 'hue', props, 'hue', 128)
    const sat = num(id, 'sat', props, 'sat', 255)
    const val = num(id, 'val', props, 'val', 255)
    return { rgb: hsv(hue / 255 * 360, sat / 255, val / 255) }
  },
  PaletteSelector(_c, _id, props) {
    return { palette: String(props.palette ?? 'rainbow').toLowerCase() }
  },
  CustomPalette({ input }, id, props) {
    // Build a positioned local palette; wired color inputs override their
    // matching stop without removing the other local stops.
    const local = normalizeCustomPalette(props.colors, props.positions)
    const colors = local.colors.map((color, i) =>
      (input(id, `color${i}`, null) as RGB | null) ?? customHexToRgb(color)
    )
    return { palette: customPaletteStops16(colors, local.positions) }
  },
  PaletteFromImage({ input }, id, props) {
    const source = input(id, 'image', null)
    return { palette: imagePaletteStops16(source, Number(props.count ?? 6)) }
  },
  Poline({ input }, id, props) {
    // Polar-interpolated palette between up to three anchor colours
    // (poline). Wired colours override the per-anchor hex defaults.
    const a = (input(id, 'colorA', null) as RGB | null) ?? hexToRgb(String(props.anchorA ?? '#1020ff'))
    const b = (input(id, 'colorB', null) as RGB | null) ?? hexToRgb(String(props.anchorB ?? '#ff20a0'))
    const c = (input(id, 'colorC', null) as RGB | null) ?? hexToRgb(String(props.anchorC ?? '#20ffd0'))
    const points = Number(props.points ?? 4)
    const position = String(props.position ?? 'sinusoidal')
    return { palette: polinePalette([a, b, c], points, position) }
  },
  PaletteBlend({ num, pal }, id, props) {
    // Sample both palettes at 16 stops and lerp per entry → a real blend.
    const amount = Math.max(0, Math.min(1, num(id, 'amount', props, 'amount', 0.5)))
    const palA = pal(id, 'paletteA', props, 'paletteA', 'rainbow')
    const palB = pal(id, 'paletteB', props, 'paletteB', 'ocean')
    const stops: RGB[] = []
    for (let i = 0; i < 16; i++) {
      const ti = i / 15
      const ca = samplePalette(palA, ti), cb = samplePalette(palB, ti)
      stops.push({
        r: Math.round(ca.r * (1 - amount) + cb.r * amount),
        g: Math.round(ca.g * (1 - amount) + cb.g * amount),
        b: Math.round(ca.b * (1 - amount) + cb.b * amount),
      })
    }
    return { palette: stops }
  },
}

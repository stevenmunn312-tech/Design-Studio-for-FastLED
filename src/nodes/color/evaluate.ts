import {
  type ButtonEdgeState,
  normalizeButtonEdgeSettings,
  blankButtonEdgeState,
  buttonEdge,
} from '../../state/player/transportBridge'
import { pressEdgeSettings } from '../../state/player/pressSource'
import {
  paletteBankEntries,
  clampPaletteBankIndex,
  stepPaletteBankIndex,
  paletteBankSelection,
  paletteBankLabel,
  paletteBankBlend,
  paletteBankBlendTicks,
  paletteBankTable,
  nblendPaletteBytes,
  paletteBankChoice,
} from '../../state/palettes/paletteBank'
import { displayString } from '../../state/displays/displayText'
import { gradientMixMode, hueUnits, mixGradientColors } from '../../state/palettes/hueMix'
import { harmonyKind, harmonyStops16 } from '../../state/palettes/harmonyPalette'
import { imagePaletteStops16 } from '../../state/palettes/imagePalette'
import { hexToRgb, polineStops16 } from '../../state/palettes/polinePalette'
import { normalizeCustomPalette, hexToRgb as customHexToRgb, customPaletteStops16 } from '../../state/palettes/customPalette'
import { type RGB, hsv, samplePalette, samplePaletteClamped } from '../../state/palettes/ledColor'
import type { NodeEvaluators } from '../../state/evaluator/types'
import { speedPhase } from '../shared/speedClock'
import { applyEase } from '../math/easing'
import { paletteEnds, sweepLeg, sweepMotion } from './paletteMotion'
import { clampColorTemperature } from './colorTemperature'
import { applyBlackPoint, blackPointByte } from './paletteBlackPoint'
import { ADJUST_COLOR_DEFAULT, adjustColor } from './adjustColor'
import { byte, heatColor } from '../../state/evaluator/frames'
import { toggleTapPress } from '../../state/evaluator/signals'
import { instanceState } from '../../state/evaluator/memory'

/** Palette Bank cursors — one per node instance, like every other stateful node. */
const paletteBankState = instanceState('paletteBankState', new Map<string, {
  lastT: number
  index: number
  /** The Index value last acted on, rounded; a change selects. */
  chosen?: number
  buttons: Record<string, ButtonEdgeState>
  /** The working palette a change blends through, as the sketch's 48 bytes. */
  current?: Uint8Array
  blendMs?: number
}>())

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

export const COLOR_EVALUATORS: NodeEvaluators = {
  HueCycle({ num, t, stateKey }, id, props) {
    const rate = num(id, 'rate', props, 'rate', 0.1)
    const s = num(id, 's', props, 's', 1)
    const v = num(id, 'v', props, 'v', 1)
    return { color: hsv(speedPhase(stateKey(id), t, rate) * 360, s, v) }
  },
  Color(_c, _id, props) {
    return { color: hexToRgb(String(props.color ?? '#ff3080')) }
  },
  HSVToRGB({ num }, id, props) {
    const h = num(id, 'h', props, 'h', 0)
    const s = num(id, 's', props, 's', 1)
    const v = num(id, 'v', props, 'v', 1)
    return { color: hsv(hueUnits(props.hueUnits) === 'bytes' ? h / 255 * 360 : h, s, v) }
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
  AdjustColor({ input, num }, id, props) {
    const channel = (key: string, fallback: number) => byte(Number(props[key] ?? fallback) / 255)
    const source = (input(id, 'color', null) as RGB | null)
      ?? { r: channel('r', ADJUST_COLOR_DEFAULT.r), g: channel('g', ADJUST_COLOR_DEFAULT.g), b: channel('b', ADJUST_COLOR_DEFAULT.b) }
    return { color: adjustColor(source,
      num(id, 'hueShift', props, 'hueShift', 0),
      num(id, 'saturation', props, 'saturation', 1),
      num(id, 'brightness', props, 'brightness', 1)) }
  },
  Temperature({ num }, id, props) {
    return { color: kelvinToRgb(clampColorTemperature(num(id, 'kelvin', props, 'kelvin', 4000))) }
  },
  HeatColor({ num }, id, props) {
    // heatColor() takes a 0–255 temperature (shared with Fire2012); the node
    // input is a normalised 0–1 heat.
    const heat = Math.max(0, Math.min(1, num(id, 'heat', props, 'heat', 0.5)))
    return { color: heatColor(heat * 255) }
  },
  GradientSampler({ input, num }, id, props) {
    // Clamped in every mode, as the firmware's `constrain` is: unclamped, a
    // bipolar wave on T extrapolated here and wrapped the colour on the board.
    const tt = Math.max(0, Math.min(1, num(id, 't', props, 't', 0)))
    const channel = (key: string, fallback: number) => byte(Number(props[key] ?? fallback) / 255)
    const cA = (input(id, 'colorA', null) as RGB | null) ?? { r: channel('rA', 0), g: channel('gA', 200), b: channel('bA', 255) }
    const cB = (input(id, 'colorB', null) as RGB | null) ?? { r: channel('rB', 255), g: channel('gB', 0), b: channel('bB', 255) }
    return { color: mixGradientColors(cA, cB, tt, gradientMixMode(props.mixMode)) }
  },
  PaletteSampler({ num, pal }, id, props) {
    const tt = num(id, 't', props, 't', 0)
    const palName = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    // Hold ends reads T as an amount: 1 is the last colour, never the first again.
    return { color: paletteEnds(props.ends) === 'hold' ? samplePaletteClamped(palName, tt) : samplePalette(palName, tt) }
  },
  PaletteSweep({ num, pal, t, stateKey }, id, props) {
    const rate = Math.max(0, num(id, 'rate', props, 'rate', 0.1))
    const phase = (speedPhase(stateKey(id), t, rate) % 1 + 1) % 1
    const motion = sweepMotion(props.motion)
    const position = applyEase(String(props.easing ?? 'inOutSine'), sweepLeg(phase, motion))
    const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    // A ping-pong turns at each end of the palette, so its ends are held,
    // never wrapped back to the first colour (LINEARBLEND_NOWRAP in firmware);
    // a loop runs round, so it wraps (LINEARBLEND).
    return { color: motion === 'loop' ? samplePalette(palette, position) : samplePaletteClamped(palette, position) }
  },
  PaletteBank({ inputSourceType, input, num, elapsedT: t, stateKey, incoming, nodeMap }, id, props) {
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
      const settings = pressEdgeSettings(edgeSettings, inputSourceType(id, port))
      return buttonEdge(bs, Boolean(input(id, port, false)), nowMs, true, settings)
    }
    // Index selects directly whenever its value changes (and on the first
    // pass, so an unwired Index is where the bank starts); Next and Previous
    // then step on from there, so whichever moved last wins.
    const chosen = paletteBankChoice(num(id, 'select', props, 'select', 0))
    let held = clampPaletteBankIndex(state.index, entries.length)
    if (state.chosen !== chosen) {
      state.chosen = chosen
      held = stepPaletteBankIndex(0, entries.length, chosen)
    }
    // Pressed together they cancel, the way +step and -step in one frame net
    // to nothing — no precedence rule needed.
    const delta = (press('next') ? 1 : 0) - (press('previous') ? 1 : 0)
    const index = delta === 0 ? held : stepPaletteBankIndex(held, entries.length, delta)
    state.index = index
    const selected = paletteBankSelection(entries, index)
    const name = displayString(paletteBankLabel(selected))
    // Blend 0 cuts straight to the named palette, as the bank always did.
    const blend = paletteBankBlend(props)
    if (blend === 0) {
      state.current = undefined
      return { palette: selected, name, index }
    }
    // Otherwise a working copy eases toward the selection on a 10 ms clock,
    // through FastLED's own blend (paletteBank.ts), starting settled.
    const target = paletteBankTable(selected)
    if (!state.current || state.blendMs === undefined) {
      state.current = target.slice()
      state.blendMs = nowMs
    }
    const due = paletteBankBlendTicks(state.blendMs, nowMs)
    state.blendMs = due.lastMs
    for (let i = 0; i < due.ticks; i++) nblendPaletteBytes(state.current, target, blend)
    const current = state.current
    const palette = Array.from({ length: 16 }, (_, i) => ({ r: current[i * 3], g: current[i * 3 + 1], b: current[i * 3 + 2] }))
    return { palette, name, index }
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
    // Polar-interpolated palette through its three anchor colours (poline).
    // Wired colours override the per-anchor hex defaults. The 16-entry table
    // is the one the sketch bakes or builds, so preview and board agree.
    const a = (input(id, 'colorA', null) as RGB | null) ?? hexToRgb(String(props.anchorA ?? '#1020ff'))
    const b = (input(id, 'colorB', null) as RGB | null) ?? hexToRgb(String(props.anchorB ?? '#ff20a0'))
    const c = (input(id, 'colorC', null) as RGB | null) ?? hexToRgb(String(props.anchorC ?? '#20ffd0'))
    const points = Number(props.points ?? 4)
    const position = String(props.position ?? 'sinusoidal')
    return { palette: polineStops16([a, b, c], points, position) }
  },
  HarmonyPalette({ num }, id, props) {
    return { palette: harmonyStops16(
      harmonyKind(props.harmony),
      num(id, 'hue', props, 'hue', 200),
      num(id, 'saturation', props, 'saturation', 1),
      num(id, 'value', props, 'value', 1),
      num(id, 'spread', props, 'spread', 1),
      num(id, 'shade', props, 'shade', 0),
    ) }
  },
  // Keep in lockstep with the `PaletteTransform` emitter: entry by entry
  // (clamped) at rest, a wrapping sample once Offset rotates it, then the
  // black point, then scaled. With nothing wired it transforms its own preset.
  PaletteTransform({ num, pal }, id, props) {
    const src = pal(id, 'paletteIn', props, 'paletteIn', 'rainbow')
    const reverse = Boolean(props.reverse)
    const rawOffset = num(id, 'offset', props, 'offset', 0)
    const offset = ((rawOffset % 1) + 1) % 1
    const brightness = Math.max(0, Math.min(1, num(id, 'brightness', props, 'brightness', 1)))
    const floor = blackPointByte(num(id, 'blackPoint', props, 'blackPoint', 0))
    const stops: RGB[] = []
    for (let i = 0; i < 16; i++) {
      const u = reverse ? 1 - i / 15 : i / 15
      const c = offset > 0 ? samplePalette(src, ((u + offset) % 1 + 1) % 1) : samplePaletteClamped(src, u)
      stops.push({
        r: Math.round(applyBlackPoint(c.r, floor) * brightness),
        g: Math.round(applyBlackPoint(c.g, floor) * brightness),
        b: Math.round(applyBlackPoint(c.b, floor) * brightness),
      })
    }
    return { palette: stops }
  },
  PaletteBlend({ num, pal }, id, props) {
    // Sample both palettes at 16 stops and lerp per entry → a real blend.
    // Clamped, so entry 15 is each palette's last colour: at 15/15 a wrapping
    // sample lands back on the first, and the blend's brightest entry went dark.
    const amount = Math.max(0, Math.min(1, num(id, 'amount', props, 'amount', 0.5)))
    const palA = pal(id, 'paletteA', props, 'paletteA', 'rainbow')
    const palB = pal(id, 'paletteB', props, 'paletteB', 'ocean')
    const stops: RGB[] = []
    for (let i = 0; i < 16; i++) {
      const ti = i / 15
      const ca = samplePaletteClamped(palA, ti), cb = samplePaletteClamped(palB, ti)
      stops.push({
        r: Math.round(ca.r * (1 - amount) + cb.r * amount),
        g: Math.round(ca.g * (1 - amount) + cb.g * amount),
        b: Math.round(ca.b * (1 - amount) + cb.b * amount),
      })
    }
    return { palette: stops }
  },
}

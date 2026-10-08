// Where the controller sits on the physical assembly diagram: its render,
// its pads, and the points wires land on.
import type { PhysicalBoardProfile } from '../../build/boards/boardProfiles'
import { customBoardGeometry, customBoardPowerPad, type CustomBoardGeometry, type CustomBoardPad } from '../../build/boards/customBoardGeometry'
import type { PhysicalDiagramConnection } from './signalPresentation'

/**
 * A photoreal board render plus the header geometry needed to land a terminal
 * on the right pad.
 *
 * Pad positions are measured in the artwork's own pixel space and mapped onto
 * the diagram box, so the two can't drift apart. Keep the box's aspect ratio
 * close to `sourceWidth / sourceHeight` — the <image> uses `xMidYMid meet`, so
 * a mismatch letterboxes the render inside the box and shifts every pad off
 * its dot (the bug the microphone module had).
 */
interface ControllerRenderSpec {
  href: string
  /** The coordinate space the pad measurements below were taken in. Only its
   *  aspect ratio matters — every mapping is a ratio — so resizing the asset
   *  doesn't invalidate the measurements as long as the aspect is preserved. */
  sourceWidth: number
  sourceHeight: number
  /**
   * Real-world width the *whole image* spans, transparent margin included.
   *
   * This is what sizes the board on the sheet, so a XIAO and a Mega no longer
   * draw the same width on a diagram whose whole job is physical assembly.
   * Derive it the same way for every board so the relative sizes stay honest:
   * `visibleWidthMm * imageWidthPx / alphaContentWidthPx`, where the visible
   * width is the PCB's own width unless something overhangs it. All four
   * renders crop to 790 of 800 px, so this is the board width plus the 10 px
   * of transparent margin.
   */
  imageWidthMm: number
  /** Header geometry in source pixels: rail x, and first/last pad centre y. */
  leftPinX: number
  rightPinX: number
  firstPinY: number
  lastPinY: number
  /** Pads per rail, and the anchor id prefixes the board profile uses. */
  pinsPerRail: number
  /**
   * Drilled-hole radius in source pixels, measured from the render's
   * transparency (area-equivalent radius of the see-through hole). A terminal
   * is coloured at this size so the plated ring stays visible around it.
   */
  holeRadiusPx: number
  leftPrefix: string
  rightPrefix: string
  /** Anchor ids carrying the shared rails, plus the USB inlet in source pixels. */
  powerAnchors: { v3v3: string; ground: string }
  usbPoint: { x: number; y: number }
  /** Caption drawn under the render. */
  shortLabel: string
}

/** A spec plus the sheet geometry derived from it. */
export type ControllerRender = ControllerRenderSpec & { x: number; y: number; width: number; height: number }

/**
 * A board's render, the same drilled image the Hardware tab and pinout popup
 * show. The diagram once bundled its own copies, which missed the pass that
 * made every through-hole a real hole and kept painted discs on five boards.
 * Those were 800 px wide and these are 700, so every figure in the specs below
 * stays in the 800 px space it was measured in: only ratios reach the sheet.
 */
function boardRenderSrc(profileId: string) {
  return `/boards/${profileId}.webp`
}

const CONTROLLER_SPECS: Record<string, ControllerRenderSpec> = {
  // Header geometry from the render package, independently checked here: 22 + 22
  // rails on a 78.8px pitch sharing rows, rail centres symmetric about the image
  // (45.400 + 754.600 = 800). 25.7215 mm = Espressif's 25.40 mm PCB width over
  // alpha bounds 5..794 of an 800px render — and that scale reproduces the
  // drawing's 70.74 mm overall length to 0.04 mm, so the model is dimensionally
  // true, not just proportionally plausible.
  'espressif-esp32-s3-devkitc-1': {
    href: boardRenderSrc('espressif-esp32-s3-devkitc-1'),
    sourceWidth: 800, sourceHeight: 2199, imageWidthMm: 25.7215,
    leftPinX: 45.400, rightPinX: 754.600, firstPinY: 45.783, lastPinY: 1700.583,
    pinsPerRail: 22, holeRadiusPx: 15.5, leftPrefix: 'j1', rightPrefix: 'j3',
    powerAnchors: { v3v3: 'j1-1', ground: 'j3-22' },
    // The UART port, not the native-USB one: that's the port this app's upload
    // path drives, so it's the one a builder will have a cable in. The rebuilt
    // model seats both receptacles 1.5 mm past the edge instead of 7.7 mm.
    usbPoint: { x: 224.717, y: 1991.275 },
    shortLabel: 'ESP32-S3 DevKitC-1',
  },
  // 20 + 20 rails. Pad rows are the model's own rail-label Y coordinates, which
  // the package states are exactly its plated-hole centres, and the rail X came
  // out of the model geometry symmetric to four decimals (55.7763 + 744.2237).
  // Scale is the render camera's orthographic width, so it needs no image
  // measurement at all.
  'lolin-s3-40pin-dual-usbc': {
    href: boardRenderSrc('lolin-s3-40pin-dual-usbc'),
    sourceWidth: 800, sourceHeight: 2262, imageWidthMm: 26.1458,
    leftPinX: 55.7763, rightPinX: 744.2237, firstPinY: 211.8, lastPinY: 1955.8,
    pinsPerRail: 20, holeRadiusPx: 10.7, leftPrefix: 'left', rightPrefix: 'right',
    powerAnchors: { v3v3: 'left-1', ground: 'right-1' },
    // The UART port on the right, not the OTG port on the left; 1.7 mm further
    // onto the board since the rebuild.
    usbPoint: { x: 560, y: 2127.984 },
    shortLabel: 'LOLIN S3',
  },
  // 7 + 7 rails on a 111.817px pitch, supplied with the render and checked
  // here: pad rows land on real rings and the rail centres sum to exactly 800.0.
  // The four expansion pads are on the underside and so have no top-down
  // position; they fall back to the generic terminal column.
  'seeed-xiao-esp32s3': {
    href: boardRenderSrc('seeed-xiao-esp32s3'),
    sourceWidth: 800, sourceHeight: 1046, imageWidthMm: 18.1266,
    leftPinX: 64.5497, rightPinX: 735.4503, firstPinY: 134.943, lastPinY: 805.8435,
    pinsPerRail: 7, holeRadiusPx: 14.5, leftPrefix: 'left', rightPrefix: 'right',
    // This board has exactly one 3V3 and one GND, adjacent on the left rail.
    powerAnchors: { v3v3: 'left-5', ground: 'left-6' },
    usbPoint: { x: 400, y: 1029.477 },
    shortLabel: 'XIAO ESP32S3',
  },
  // 22 + 22 rails on a 71.475px pitch sharing rows. Geometry is now projected
  // from the model's own 2.54 mm pad grid through the render camera rather than
  // detected from pixels, so it supersedes the values measured here earlier —
  // the rail centres land symmetric to four decimal places (83.4285 + 716.5715).
  'generic-esp32-s3-n16r8-44pin-dual-usbc': {
    href: boardRenderSrc('generic-esp32-s3-n16r8-44pin-dual-usbc'),
    sourceWidth: 800, sourceHeight: 1886, imageWidthMm: 28.3544,
    leftPinX: 83.4285, rightPinX: 716.5715, firstPinY: 147.7725, lastPinY: 1648.7433,
    pinsPerRail: 22, holeRadiusPx: 13.9, leftPrefix: 'left', rightPrefix: 'right',
    // 3V3 tops the left rail and GND ends the right, so the two stubs leave
    // opposite edges and opposite ends of the board.
    powerAnchors: { v3v3: 'left-1', ground: 'right-22' },
    // The COM port: the one this app's upload path drives. Centre of its
    // receptacle, which the rebuild seats 2 mm further onto the board.
    usbPoint: { x: 253.674, y: 1774.53 },
    shortLabel: 'ESP32-S3 N16R8',
  },
  // 19 + 19 rails on a 71.536px pitch. Geometry projected from the model, and
  // internally consistent: the rail centres sum to exactly 800.0, and the
  // stated 24.10 mm rail separation puts the pad pitch at 2.54000 mm.
  'esp32-generic-devkit-38pin': {
    href: boardRenderSrc('esp32-generic-devkit-38pin'),
    sourceWidth: 800, sourceHeight: 1718, imageWidthMm: 28.2828,
    leftPinX: 60.6246, rightPinX: 739.3754, firstPinY: 137.7216, lastPinY: 1425.3767,
    pinsPerRail: 19, holeRadiusPx: 15.1, leftPrefix: 'left', rightPrefix: 'right',
    // Row 1 of each rail: 3V3 on the left, GND on the right, so the two stubs
    // leave opposite edges at the same height.
    powerAnchors: { v3v3: 'left-1', ground: 'right-1' },
    // The receptacle overhangs the edge by 1.1 mm, as a real one does, not 5.5.
    usbPoint: { x: 400, y: 1574.927 },
    shortLabel: 'ESP32 DevKit 38-pin',
  },
  // 15 + 15 rails on a 72.367px pitch sharing rows, rail centres symmetric
  // (60.879 + 739.121 = 800). 28.354 mm = 28 mm PCB over alpha bounds 5..794.
  'esp32-devkit-v1-30pin-esp32d': {
    href: boardRenderSrc('esp32-devkit-v1-30pin-esp32d'),
    sourceWidth: 800, sourceHeight: 1631, imageWidthMm: 28.354,
    leftPinX: 60.879, rightPinX: 739.121, firstPinY: 231.571, lastPinY: 1244.714,
    pinsPerRail: 15, holeRadiusPx: 14.0, leftPrefix: 'left', rightPrefix: 'right',
    // Both rails carry a GND pad (left-14 and right-14) on the same net; the
    // left one is used so the ground and 3V3 stubs leave opposite edges. On
    // the right rail they would be adjacent pads, close enough for the ground
    // symbol's bars to run into the 3V3 stub.
    powerAnchors: { v3v3: 'right-15', ground: 'left-14' },
    // Overhangs the edge by 1.1 mm since the rebuild, not 5.5.
    usbPoint: { x: 400, y: 1488.817 },
    shortLabel: 'ESP32 DevKit v1',
  },
  // The boards below are projected from their models' pad geometry through the
  // render camera, and each pad centre was checked against the centroid of its
  // see-through hole (within 1.4 px). imageWidthMm is the camera's
  // orthographic span over the render's aspect, which also reproduces the
  // 2.54 mm pitch.
  //
  // 8 + 8 castellated rails on a 111.134px pitch. 5V, GND and 3V3 are the
  // three left pads beside the USB-C, so the two stubs are adjacent, as on
  // the XIAO.
  'esp32-c3-super-mini': {
    href: boardRenderSrc('esp32-c3-super-mini'),
    sourceWidth: 800, sourceHeight: 1183, imageWidthMm: 18.2843,
    leftPinX: 66.5985, rightPinX: 733.4015, firstPinY: 109.8837, lastPinY: 887.8204,
    pinsPerRail: 8, holeRadiusPx: 21.0, leftPrefix: 'left', rightPrefix: 'right',
    powerAnchors: { v3v3: 'left-6', ground: 'left-7' },
    usbPoint: { x: 400, y: 1084.93 },
    shortLabel: 'ESP32-C3 Super Mini',
  },
  // Espressif's J1 and J3, 16 + 16 on a 78.8px pitch sharing rows.
  'esp32-c6-devkitc-1': {
    href: boardRenderSrc('esp32-c6-devkitc-1'),
    sourceWidth: 800, sourceHeight: 2027, imageWidthMm: 25.7867,
    leftPinX: 45.4, rightPinX: 754.6, firstPinY: 242.7958, lastPinY: 1424.7957,
    pinsPerRail: 16, holeRadiusPx: 15.5, leftPrefix: 'j1', rightPrefix: 'j3',
    // Row 1 of each header: the stubs leave opposite edges at the same height.
    powerAnchors: { v3v3: 'j1-1', ground: 'j3-1' },
    // The UART port, as on the S3 DevKitC-1: the one the upload path drives.
    usbPoint: { x: 224.717, y: 1868 },
    shortLabel: 'ESP32-C6 DevKitC-1',
  },
  // 8 + 8 rails 22.86 mm apart on a 78.184px pitch.
  'esp8266-lolin-d1-mini': {
    href: boardRenderSrc('esp8266-lolin-d1-mini'),
    sourceWidth: 800, sourceHeight: 1249, imageWidthMm: 25.9898,
    leftPinX: 48.1703, rightPinX: 751.8297, firstPinY: 244.6517, lastPinY: 791.9423,
    pinsPerRail: 8, holeRadiusPx: 15.3, leftPrefix: 'left', rightPrefix: 'right',
    // 3V3 ends the left rail and GND is next to last on the right.
    powerAnchors: { v3v3: 'left-8', ground: 'right-7' },
    usbPoint: { x: 400, y: 1095.138 },
    shortLabel: 'LOLIN D1 Mini',
  },
  // 20 + 20 on a 95.310px pitch: pins 21-40 down the left, 20-1 down the right.
  'raspberry-pi-pico-w': {
    href: boardRenderSrc('raspberry-pi-pico-w'),
    sourceWidth: 800, sourceHeight: 2126, imageWidthMm: 21.3198,
    leftPinX: 57.7829, rightPinX: 742.2171, firstPinY: 57.8122, lastPinY: 1868.7112,
    pinsPerRail: 20, holeRadiusPx: 18.6, leftPrefix: 'left', rightPrefix: 'right',
    // 3V3(OUT) is on the left; the ground comes from the right rail so the
    // two stubs leave opposite edges.
    powerAnchors: { v3v3: 'left-16', ground: 'right-17' },
    usbPoint: { x: 400, y: 1961.995 },
    shortLabel: 'Pico W',
  },
  // 24 + 24 on a 112.571px pitch.
  'teensy-4-1': {
    href: boardRenderSrc('teensy-4-1'),
    sourceWidth: 800, sourceHeight: 2938, imageWidthMm: 18.0508,
    leftPinX: 67.1609, rightPinX: 732.8392, firstPinY: 62.5176, lastPinY: 2651.6602,
    pinsPerRail: 24, holeRadiusPx: 22.0, leftPrefix: 'left', rightPrefix: 'right',
    powerAnchors: { v3v3: 'left-22', ground: 'right-24' },
    usbPoint: { x: 400, y: 2758.913 },
    shortLabel: 'Teensy 4.1',
  },
}

/**
 * Boards are drawn at true relative scale: the widest one fills the controller
 * slot and every other is sized from its own real width, so the sheet doesn't
 * imply a 21 mm XIAO and a 101 mm Mega are the same size.
 *
 * Each board is centred in the slot and bottom-aligned to a shared baseline, so
 * every render's USB end sits at the same height. Bottom-aligning is also what
 * banks a shorter board's slack *above* it, opening the band between the
 * wiring-plan callout and the board that lets a left-rail wire cross the top
 * instead of looping under the whole board.
 */
export const CONTROLLER_SLOT_X = 74
const CONTROLLER_SLOT_WIDTH = 184
export const CONTROLLER_SLOT_CENTER_X = CONTROLLER_SLOT_X + (CONTROLLER_SLOT_WIDTH / 2)
const CONTROLLER_BASELINE_Y = 530
/** Ceiling for the column: the wiring-plan callout ends at y=96. */
const CONTROLLER_SLOT_TOP_Y = 104
const CONTROLLER_SLOT_HEIGHT = CONTROLLER_BASELINE_Y - CONTROLLER_SLOT_TOP_Y

/**
 * One scale for all boards, set by whichever runs out of room first. The widest
 * board can't exceed the slot and the tallest can't reach the callout — the
 * S3-DevKitC is 2.75x as tall as it is wide, so at width-only scale it would
 * have run straight through the callout.
 */
const CONTROLLER_UNITS_PER_MM = Math.min(
  CONTROLLER_SLOT_WIDTH / Math.max(...Object.values(CONTROLLER_SPECS).map((spec) => spec.imageWidthMm)),
  CONTROLLER_SLOT_HEIGHT / Math.max(...Object.values(CONTROLLER_SPECS)
    .map((spec) => spec.imageWidthMm * (spec.sourceHeight / spec.sourceWidth))),
)

const CONTROLLER_RENDERS: Record<string, ControllerRender> = Object.fromEntries(
  Object.entries(CONTROLLER_SPECS).map(([id, spec]) => {
    const width = spec.imageWidthMm * CONTROLLER_UNITS_PER_MM
    const height = width * (spec.sourceHeight / spec.sourceWidth)
    return [id, {
      ...spec,
      width,
      height,
      x: CONTROLLER_SLOT_X + ((CONTROLLER_SLOT_WIDTH - width) / 2),
      y: CONTROLLER_BASELINE_Y - height,
    }]
  })
)

/**
 * Wire-pad centres of each controller converter, in millimetres from its
 * render's top-left board corner: the same drawing figures its Blender model
 * was built from, so the stubs land on the drilled pads.
 */
export const CONVERTER_PAD_MM: Record<string, Record<'IN+' | 'IN-' | 'OUT+' | 'OUT-', [number, number]>> = {
  'lm2596-buck-module': { 'IN+': [1.84, 1.97], 'IN-': [1.84, 19.11], 'OUT+': [41.34, 1.97], 'OUT-': [41.34, 19.11] },
}

/** Sheet width of the converter where the USB power block would otherwise sit. */
export const CONVERTER_SHEET_WIDTH = 184

export function controllerRender(boardProfile: PhysicalBoardProfile): ControllerRender | undefined {
  return CONTROLLER_RENDERS[boardProfile.id]
}

/**
 * A custom board's schematic, placed in the controller slot.
 *
 * Drawn from the same geometry as its SVG, with one transform for artwork and
 * terminals alike, so a wire always ends on the pad the label names. It is
 * sized to fit the slot rather than to scale: the drawing is schematic, so it
 * makes no claim about the board's physical size.
 */
export interface CustomControllerLayout {
  x: number
  y: number
  width: number
  height: number
  scale: number
  geometry: CustomBoardGeometry
}

export function customControllerLayout(boardProfile: PhysicalBoardProfile): CustomControllerLayout | undefined {
  if (!boardProfile.custom) return undefined
  const geometry = customBoardGeometry(boardProfile.custom.definition)
  const scale = Math.min(CONTROLLER_SLOT_WIDTH / geometry.width, CONTROLLER_SLOT_HEIGHT / geometry.height)
  const width = geometry.width * scale
  const height = geometry.height * scale
  return {
    x: CONTROLLER_SLOT_X + ((CONTROLLER_SLOT_WIDTH - width) / 2),
    y: CONTROLLER_BASELINE_Y - height,
    width,
    height,
    scale,
    geometry,
  }
}

/** The sheet box of whichever controller artwork is drawn. */
export function controllerBox(boardProfile: PhysicalBoardProfile): { y: number; height: number } | undefined {
  return controllerRender(boardProfile) ?? customControllerLayout(boardProfile)
}

export function customPadPoint(layout: CustomControllerLayout, pad: CustomBoardPad): ControllerTerminalPoint {
  return { x: layout.x + (pad.x * layout.scale), y: layout.y + (pad.y * layout.scale), side: pad.side, mapped: true }
}

/** Diagram units between adjacent pads on a render's header. */
function controllerPadPitch(render: ControllerRender) {
  const sourcePitch = (render.lastPinY - render.firstPinY) / (render.pinsPerRail - 1)
  return (sourcePitch / render.sourceHeight) * render.height
}

/**
 * Terminal dot radius, capped so a dot never spills onto its neighbours.
 *
 * This was a flat 6, sized against the DevKitC's roomy 15.8-unit pitch. The
 * ESP-32D packs 15 pads into a shorter board — an 11-unit pitch — where a
 * 12-across dot swallows the pads either side of it and stops reading as
 * "this pin".
 */
const CONTROLLER_TERMINAL_RADIUS = 6

export function controllerTerminalRadius(render: ControllerRender) {
  return Math.min(CONTROLLER_TERMINAL_RADIUS, controllerPadPitch(render) * 0.42)
}

export type ControllerTerminalPoint = {
  x: number
  y: number
  side: 'left' | 'right'
  mapped: boolean
}

export function controllerConnectionY(index: number, count: number) {
  if (count <= 1) return 350
  return 252 + ((194 * index) / (count - 1))
}

/** Map a point in the artwork's pixel space onto the diagram canvas. */
function renderSourcePoint(render: ControllerRender, sourceX: number, sourceY: number) {
  return {
    x: render.x + ((sourceX / render.sourceWidth) * render.width),
    y: render.y + ((sourceY / render.sourceHeight) * render.height),
  }
}

/** The pad a board profile's anchor id names, or undefined if it isn't a header pad. */
export function renderTerminalPoint(
  render: ControllerRender,
  anchorId: string | undefined,
): ControllerTerminalPoint | undefined {
  const match = new RegExp(`^(${render.leftPrefix}|${render.rightPrefix})-(\\d+)$`).exec(anchorId ?? '')
  if (!match) return undefined
  const pinIndex = Number(match[2]) - 1
  if (pinIndex < 0 || pinIndex >= render.pinsPerRail) return undefined
  const side = match[1] === render.leftPrefix ? 'left' : 'right'
  const sourceX = side === 'left' ? render.leftPinX : render.rightPinX
  const pitch = (render.lastPinY - render.firstPinY) / (render.pinsPerRail - 1)
  return { ...renderSourcePoint(render, sourceX, render.firstPinY + (pinIndex * pitch)), side, mapped: true }
}

export function controllerConnectionPoint(
  connection: PhysicalDiagramConnection,
  index: number,
  count: number,
  boardProfile: PhysicalBoardProfile,
): ControllerTerminalPoint {
  const render = controllerRender(boardProfile)
  if (render) {
    const point = renderTerminalPoint(render, connection.boardAnchorId)
    if (point) return point
  }
  const custom = customControllerLayout(boardProfile)
  const pad = custom && connection.boardAnchorId ? custom.geometry.padsBySlotId.get(connection.boardAnchorId) : undefined
  if (custom && pad) return customPadPoint(custom, pad)
  return { x: 280, y: controllerConnectionY(index, count), side: 'right', mapped: false }
}

/**
 * Where a controller rail meets the sheet. A custom board answers only with
 * pads it declares — 3V3 is a 3.3 V output, USB only when USB power was
 * chosen — and a rail it lacks is undefined rather than a stock coordinate.
 */
export function controllerPowerPoint(
  kind: '3v3' | 'ground' | 'usb',
  boardProfile: PhysicalBoardProfile,
): ControllerTerminalPoint | undefined {
  const custom = customControllerLayout(boardProfile)
  if (custom) {
    if (kind === 'usb') {
      if (boardProfile.custom?.definition.controllerPower !== 'usb') return undefined
      const { body } = custom.geometry
      return {
        x: custom.x + ((body.x + (body.width / 2)) * custom.scale),
        y: custom.y + ((body.y + body.height) * custom.scale),
        side: 'right',
        mapped: true,
      }
    }
    const pad = kind === 'ground'
      ? customBoardPowerPad(custom.geometry, 'ground')
      : customBoardPowerPad(custom.geometry, 'supply', 3.3, 'output')
    return pad ? customPadPoint(custom, pad) : undefined
  }
  const render = controllerRender(boardProfile)
  if (render) {
    if (kind === '3v3') return renderTerminalPoint(render, render.powerAnchors.v3v3)!
    if (kind === 'ground') return renderTerminalPoint(render, render.powerAnchors.ground)!
    return { ...renderSourcePoint(render, render.usbPoint.x, render.usbPoint.y), side: 'right', mapped: true }
  }
  if (kind === '3v3') return { x: 280, y: 220, side: 'right', mapped: true }
  if (kind === 'ground') return { x: 280, y: 476, side: 'right', mapped: true }
  return { x: 166, y: 512, side: 'right', mapped: true }
}

export function controllerTerminalFillRadius(render: ControllerRender) {
  return render.holeRadiusPx * (render.width / render.sourceWidth)
}

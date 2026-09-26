// Wire routes on the physical assembly diagram: controller lanes, the level
// shifter corridors, and the control pads the modules wire to.
import type { PhysicalBoardProfile } from '../../build/boardProfiles'
import type { HardwareManifestItem } from '../../build/hardwareManifest'
import {
  type LevelShifterTerminalPoint,
  LEVEL_SHIFTER_X,
  LEVEL_SHIFTER_RENDER_X,
  LEVEL_SHIFTER_RENDER_WIDTH,
  levelShifterChipY,
  LEVEL_SHIFTER_HEIGHT,
  type ItemLayout,
  peripheralApproach,
  peripheralSignalEndPoint,
  peripheralLaneBase,
  PERIPHERAL_RENDER_H,
  PERIPHERAL_LANE_SPACING,
  outputHasDataExtender,
  OUTPUT_STRIP_CARD_HEIGHT,
  OUTPUT_CARD_HEIGHT,
} from './physicalDiagramLayout'
import {
  CONTROLLER_SLOT_X,
  type ControllerRender,
  type ControllerTerminalPoint,
  controllerConnectionPoint,
} from './controllerGeometry'
import type { PhysicalDiagramConnection } from './signalPresentation'

/**
 * Two descent bands share the gap between the controller and the resistors, and
 * they must not overlap.
 *
 * Bus wires (mic, output data) all terminate above y~520, so they can hug the
 * board in 266..290 where the USB connector block is no obstacle. Control wires run all
 * the way down to the module lanes, so they need 296..328 — clear of that block
 * (ends x=291) and of the series resistors (start x=350).
 */
const RIGHT_CONTROLLER_LANE_X = 266
// Keep the whole left fan outside the controller slot. Starting this at x=90
// put the first few vertical corridors inside the widest board artwork
// (which begins at x=74), so the render painted those wires out of sight.
const LEFT_CONTROLLER_LANE_X = CONTROLLER_SLOT_X - 8
const CONTROLLER_LANE_SPACING = 6

/**
 * A left-rail pin has to get around the board to reach anything on the right,
 * and below is the only clear band — the wiring-plan callout fills the top-left
 * corner (x 30..302, y 28..96), leaving no room to cross above.
 *
 * How far below has to follow the board: this was a fixed 542, which is just
 * under the 426-tall DevKitC the diagram was built around. A shorter board left
 * every left-rail wire diving hundreds of units past its own bottom edge and
 * climbing back up — most visible on the 276-tall ESP-32D, where the mic sits
 * *above* the descent. Deriving the band from the render's own bottom keeps the
 * loop tight whatever board is selected, and clears the caption underneath it,
 * which the old fixed depth actually crossed on the DevKitC.
 */
const CONTROLLER_CAPTION_CLEARANCE = 40
const CONTROLLER_DETOUR_FALLBACK_Y = 542

export function controllerDetourBaseY(render: ControllerRender | undefined) {
  return render ? render.y + render.height + CONTROLLER_CAPTION_CLEARANCE : CONTROLLER_DETOUR_FALLBACK_Y
}

/** Bottom edge of the wiring-plan callout, which owns the top-left corner. */
const WIRING_PLAN_CALLOUT_BOTTOM = 96
/** Room the lane fan needs before crossing above the board is worth doing. */
const CONTROLLER_TOP_BAND_MIN = 56
const CONTROLLER_TOP_BAND_INSET = 14

/**
 * Band above the board for left-rail wires whose target is also up there, or
 * `undefined` when the board reaches too close to the callout to fit one.
 *
 * A board that fills the column top to bottom (the DevKitC) leaves no gap, so
 * those wires still take the long way under it. A shorter board bottom-aligned
 * in the same column does leave a gap, and crossing it turns a loop around the
 * entire board into a short hop.
 */
export function controllerTopBandY(render: ControllerRender | undefined) {
  if (!render) return undefined
  if (render.y - WIRING_PLAN_CALLOUT_BOTTOM < CONTROLLER_TOP_BAND_MIN) return undefined
  return WIRING_PLAN_CALLOUT_BOTTOM + CONTROLLER_TOP_BAND_INSET
}

export function routeFromController(
  point: ControllerTerminalPoint,
  targetX: number,
  targetY: number,
  rightSlot: number,
  leftSlot: number,
  leftLaneCount: number,
  detourBaseY: number,
  topBandY: number | undefined,
) {
  const rightLane = RIGHT_CONTROLLER_LANE_X + (rightSlot * CONTROLLER_LANE_SPACING)
  if (point.side === 'right') return `M${point.x} ${point.y}H${rightLane}V${targetY}H${targetX}`
  const laneSlot = leftSlot
  const leftLane = LEFT_CONTROLLER_LANE_X - (laneSlot * CONTROLLER_LANE_SPACING)
  // Cross above the board when there's a band for it and the target is up
  // there too; otherwise drop under the board as before. Deeper lanes sit
  // nearer the board on top so the fan stays nested either way.
  const overTheTop = topBandY !== undefined && targetY < topBandY + 40
  const bandY = overTheTop
    ? topBandY + ((leftLaneCount - 1 - laneSlot) * 7)
    : detourBaseY + (laneSlot * 7)
  return `M${point.x} ${point.y}H${leftLane}V${bandY}H${rightLane}V${targetY}H${targetX}`
}

/**
 * Level-shifter corridors, one per output.
 *
 * These used to be shared constants — every right-side Y pin dropped down the
 * same x=650 vertical and every right-side A pin came in via x=410 — so wires
 * for different outputs were drawn on top of each other rather than merely
 * close. Each output now owns its own corridor and detour lane.
 */
const LS_CORRIDOR_SPACING = 12
const LEVEL_SHIFTER_PIN_LEAD_OVERLAP = 4

/**
 * The main harness is intentionally painted behind component photographs, but
 * that also hides the last few units of a route where it meets a DIP leg. This
 * short overlaid lead restores only the physical pin connection on top of the
 * photograph without pulling the complete harness over the package body.
 */
export function levelShifterPinLeadPath(point: LevelShifterTerminalPoint, chipY: number) {
  const x = point.x - LEVEL_SHIFTER_X
  const y = point.y - chipY
  const outsideImageX = point.side === 'left'
    ? LEVEL_SHIFTER_RENDER_X - LEVEL_SHIFTER_PIN_LEAD_OVERLAP
    : LEVEL_SHIFTER_RENDER_X + LEVEL_SHIFTER_RENDER_WIDTH + LEVEL_SHIFTER_PIN_LEAD_OVERLAP
  return `M${x} ${y}H${outsideImageX}`
}

/** Between the series resistors (end x=390) and the chip body (starts x=453). */
function levelShifterEntryX(outputIndex: number) {
  return 402 + ((outputIndex % 4) * LS_CORRIDOR_SPACING)
}

/** Between the chip body (ends x=587) and the output corridors. */
function levelShifterWrapX(outputIndex: number) {
  return 591 + ((outputIndex % 4) * 9)
}

/** Between the chip and the LED panels (start x=820). */
function levelShifterOutputX(outputIndex: number) {
  return 626 + (outputIndex * 13)
}

/** Lane below each chip, used by whichever side has to wrap around it. */
function levelShifterDetourY(outputIndex: number) {
  return levelShifterChipY(outputIndex) + LEVEL_SHIFTER_HEIGHT + 18 + ((outputIndex % 4) * 13)
}

export function routeToLevelShifterInput(outputIndex: number, point: LevelShifterTerminalPoint) {
  if (point.side === 'left') return `M390 ${point.y}H${point.x}`
  // Leave the resistor vertically before wrapping under the chip. Travelling
  // right first can reuse the exact Y channel of a previous channel's output
  // (Y2 and A3 are level on this DIP), drawing two different wires on top of
  // each other between the entry corridors.
  return `M390 ${point.y}V${levelShifterDetourY(outputIndex)}H${levelShifterWrapX(outputIndex)}V${point.y}H${point.x}`
}

export function routeFromLevelShifterOutput(
  outputIndex: number,
  point: LevelShifterTerminalPoint,
  targetX: number,
  targetY: number,
) {
  const corridorX = levelShifterOutputX(outputIndex)
  if (point.side === 'right') return `M${point.x} ${point.y}H${corridorX}V${targetY}H${targetX}`
  return `M${point.x} ${point.y}H${levelShifterEntryX(outputIndex)}V${levelShifterDetourY(outputIndex)}H${corridorX}V${targetY}H${targetX}`
}

/**
 * Control signals leave the controller, drop to their own lane below the module
 * row, run across, and climb into their pad.
 *
 * Lanes are ordered by pad x, which makes the routing planar: a wire only ever
 * climbs at a point that deeper lanes have not yet reached, so no climb crosses
 * another lane's horizontal run.
 */
export function assignControlLanes(
  peripheralLayouts: ItemLayout[],
  connections: PhysicalDiagramConnection[],
) {
  const lanes = new Map<string, { index: number; y: number }>()
  const rows = new Map<number, Array<{ id: string; padX: number; rowTop: number }>>()
  // The lane base follows the row's own stub depth, so a row holding a module
  // with a channel-select stub starts its lanes below that deeper caption
  // rather than through it. `itemLayouts` sizes the row from the same rule.
  const rowItems = new Map<number, HardwareManifestItem[]>()
  peripheralLayouts.forEach((layout) => {
    rowItems.set(layout.y, [...(rowItems.get(layout.y) ?? []), layout.item])
    const own = connections.filter((connection) => connection.itemId === layout.item.id)
    own.forEach((connection, index) => {
      const entry = rows.get(layout.y) ?? []
      // Ordered by where the wire climbs, which is not always its pad's x.
      const climbX = peripheralApproach(layout, index)?.x ?? peripheralSignalEndPoint(layout, index).x
      entry.push({ id: connection.id, padX: climbX, rowTop: layout.y })
      rows.set(layout.y, entry)
    })
  })
  rows.forEach((entries, rowTop) => {
    const base = peripheralLaneBase(rowItems.get(rowTop) ?? [])
    entries
      .slice()
      .sort((a, b) => a.padX - b.padX)
      .forEach((entry, index) => {
        lanes.set(entry.id, {
          index,
          y: entry.rowTop + PERIPHERAL_RENDER_H + base + (index * PERIPHERAL_LANE_SPACING),
        })
      })
  })
  return lanes
}

/**
 * One controller-edge corridor per control wire, grouped by the rail the wire
 * actually leaves.
 *
 * The peripheral-lane index cannot double as this slot: it restarts on every
 * module row and, historically, wrapped after five. Left-side control wires
 * share the bus lane map, because both families descend on the same
 * `LEFT_CONTROLLER_LANE_X` fan and could otherwise interleave less than one
 * wire stroke apart.
 *
 * Right-side control wires share the same right-hand descent as the bus
 * family and are ranked *after* every bus wire rather than interleaved with
 * them by pin height, which is what the shared map used to do. Two rules
 * decide the offset and both are physical. Past the bus wires, because two
 * wires on one vertical is the thing this slot exists to prevent. And never
 * nearer than `CONTROL_CORRIDOR_MIN_SLOT`, because a bus wire stops above
 * y~520 while a control wire carries on down to the module lanes, straight
 * through the USB block that ends at x=291 — the clearance the 296..328 band
 * was named for. Under the old interleaving a right-rail control pin sitting
 * above every output pin took slot 0 and descended through both.
 */
const CONTROL_CORRIDOR_MIN_SLOT = 5

export function assignControlCorridors(
  peripheralLayouts: ItemLayout[],
  controllerConnections: PhysicalDiagramConnection[],
  boardProfile: PhysicalBoardProfile,
  leftLaneSlots: ReadonlyMap<string, number>,
  busCorridorCount: number,
) {
  const peripheralIds = new Set(peripheralLayouts.map((layout) => layout.item.id))
  const slots = new Map<string, number>()
  const rightward: Array<{ id: string; y: number }> = []
  controllerConnections.forEach((connection, index) => {
    if (!peripheralIds.has(connection.itemId)) return
    const point = controllerConnectionPoint(connection, index, controllerConnections.length, boardProfile)
    if (point.side === 'right') {
      rightward.push({ id: connection.id, y: point.y })
      return
    }
    const slot = leftLaneSlots.get(connection.id)
    if (slot !== undefined) slots.set(connection.id, slot)
  })
  const offset = Math.max(busCorridorCount, CONTROL_CORRIDOR_MIN_SLOT)
  // Deepest pin outermost, the same nesting rule the left fan follows.
  rightward
    .sort((a, b) => b.y - a.y)
    .forEach((entry, rank) => slots.set(entry.id, offset + rank))
  return slots
}

export function routeToControlPad(
  point: ControllerTerminalPoint,
  pad: { x: number; y: number },
  laneY: number,
  corridorSlot: number,
  /** Where to climb instead of the pad's own x; see `peripheralApproach`. */
  approach: { x: number; jogY: number } | null = null,
) {
  // Left-side pins exit past the board edge before dropping; the USB block
  // and the board render both sit between the header and the lanes.
  const corridorX = point.side === 'right'
    ? RIGHT_CONTROLLER_LANE_X + (corridorSlot * CONTROLLER_LANE_SPACING)
    : LEFT_CONTROLLER_LANE_X - (corridorSlot * CONTROLLER_LANE_SPACING)
  if (approach) {
    return `M${point.x} ${point.y}H${corridorX}V${laneY}H${approach.x}V${approach.jogY}H${pad.x}V${pad.y}`
  }
  return `M${point.x} ${point.y}H${corridorX}V${laneY}H${pad.x}V${pad.y}`
}

export function outputDataTerminalY(layout: ItemLayout) {
  if (outputHasDataExtender(layout.item)) {
    const baseHeight = layout.item.facts.form === 'strip' ? OUTPUT_STRIP_CARD_HEIGHT : OUTPUT_CARD_HEIGHT
    return layout.y + baseHeight + 59
  }
  return layout.y + (layout.item.facts.form === 'strip' ? 34 : 66)
}

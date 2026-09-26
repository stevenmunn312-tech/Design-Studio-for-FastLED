import { useRef } from 'react'
import type { ElectricalPlanSummary } from '../../build/electricalPlan'
import type { PhysicalBoardProfile } from '../../build/boardProfiles'
import type { HardwareManifestItem } from '../../build/hardwareManifest'
import levelShifterRender from '../../assets/components/sn74ahct125n-dip14.webp'
import resistorRender from '../../assets/components/330ohm-blue-axial-resistor.webp'
import styles from './BuildDiagramWorkspace.module.css'
import { NetStub, CommonNetCallout } from './netStubs'
import { type WireTooltipHandle, WireBloomFilter, HoverWire, WireTooltip } from './wireHover'
import { wireTooltipHandlers } from './wireTooltipHandlers'
import type { BuildSectionLayers } from './diagramSections'
import {
  itemLayouts,
  powerSectionStartY,
  peripheralPowerNet,
  physicalAssemblyDiagramHeight,
  levelShifterTerminalPoint,
  peripheralPowerPadIndex,
  peripheralPadPoint,
  peripheralGroundPadIndex,
  micChannelSelectPadIndex,
  receiveDivider,
  PERIPHERAL_STUB_LEAD,
  peripheralSignalPadIndex,
  peripheralSignalEndPoint,
  peripheralPadLabel,
  peripheralApproach,
  CHANNEL_SELECT_STUB_DROP,
  DIVIDER_RESISTOR_W,
  levelShifterSupplyPoint,
  levelShifterChipY,
  LEVEL_SHIFTER_X,
  LEVEL_SHIFTER_WIDTH,
  LEVEL_SHIFTER_RENDER_X,
  LEVEL_SHIFTER_RENDER_Y,
  LEVEL_SHIFTER_RENDER_WIDTH,
  LEVEL_SHIFTER_RENDER_HEIGHT,
  type LevelShifterTerminalPoint,
  COMMON_NET_CALLOUT_HEIGHT,
  COMMON_NET_CALLOUT_GAP,
  diagramContentBottom,
  powerZoneBands,
} from './physicalDiagramLayout'
import {
  controllerPowerPoint,
  controllerRender,
  controllerConnectionPoint,
  type ControllerTerminalPoint,
} from './controllerGeometry'
import { ControllerConverterGraphic, ControllerGraphic } from './ControllerGraphic'
import { OutputGraphic, InputGraphic } from './PeripheralGraphics'
import { PowerDistributionSections, WireLabel } from './PowerDistribution'
import { type PhysicalDiagramConnection, signalPresentation } from './signalPresentation'
import {
  assignControlLanes,
  controllerDetourBaseY,
  controllerTopBandY,
  assignControlCorridors,
  routeFromController,
  outputDataTerminalY,
  routeToLevelShifterInput,
  routeFromLevelShifterOutput,
  routeToControlPad,
  levelShifterPinLeadPath,
} from './wireRouting'

interface PhysicalAssemblyDiagramProps {
  boardProfile: PhysicalBoardProfile
  items: HardwareManifestItem[]
  connections: PhysicalDiagramConnection[]
  plan: ElectricalPlanSummary
  selectedItemId: string
  onSelectItem: (itemId: string) => void
  exportScope?: 'current-view' | 'complete-build'
  /** Which subsystem layers this sheet draws. Defaults to the complete build. */
  layers?: BuildSectionLayers
  /**
   * Window onto the full sheet, in diagram units. Printing puts one PSU zone on
   * a page by cropping to that zone's band rather than by re-laying the sheet
   * out, so a printed zone keeps the coordinates the on-screen sheet gave it.
   */
  crop?: { y: number; height: number }
}

const ALL_LAYERS: BuildSectionLayers = { signalWires: true, levelShifter: true, powerDistribution: true }

const CANVAS_WIDTH = 1120

export default function PhysicalAssemblyDiagram({ boardProfile, items, connections, plan, selectedItemId, onSelectItem, exportScope = 'current-view', layers = ALL_LAYERS, crop }: PhysicalAssemblyDiagramProps) {
  const boardLabel = boardProfile.label
  const layouts = itemLayouts(items)
  const outputLayouts = layouts.filter((layout) => layout.item.kind === 'matrix-output')
  const peripheralLayouts = layouts.filter((layout) => layout.item.kind !== 'matrix-output' && layout.item.kind !== 'power-converter')
  const outputConnections = connections.filter((connection) => outputLayouts.some((layout) => layout.item.id === connection.itemId))
  const controllerConnections = [...outputConnections, ...connections.filter((connection) => !outputConnections.includes(connection))]
  const controller3v3 = controllerPowerPoint('3v3', boardProfile)
  const controllerGround = controllerPowerPoint('ground', boardProfile)
  const controllerUsb = controllerPowerPoint('usb', boardProfile)
  // Drawn only on a sheet that shows the converter itself.
  const controllerSupply = plan.controllerSupply && items.some((item) => item.id === plan.controllerSupply?.itemId)
    ? plan.controllerSupply
    : undefined
  const powerSectionY = powerSectionStartY(items, layers)
  const showPowerDistribution = layers.powerDistribution && outputLayouts.length > 0
  const usesThreeVolt = peripheralLayouts.some((layout) => peripheralPowerNet(layout.item) === 'v3v3')
  const usesTwelveVolt = peripheralLayouts.some((layout) => peripheralPowerNet(layout.item) === 'v12')
  const controlLanes = assignControlLanes(peripheralLayouts, connections)
  const detourBaseY = controllerDetourBaseY(controllerRender(boardProfile))
  const topBandY = controllerTopBandY(controllerRender(boardProfile))
  /**
   * Left-rail lanes ordered by how far each wire has to travel, not by the
   * order its connection happens to appear in.
   *
   * Every left-rail wire leaves its pad horizontally, so a lane belonging to a
   * pad further along the rail crosses the horizontal exit of every pad before
   * it. Ranking by distance from the band the wires are heading for puts the
   * longest run in the outermost lane, and the fan nests instead of crossing.
   */
  const controllerLaneEntries = controllerConnections.map((connection, index) => ({
    connection,
    point: controllerConnectionPoint(connection, index, controllerConnections.length, boardProfile),
  }))
  const laneSlots = (side: ControllerTerminalPoint['side']) => new Map(
    controllerLaneEntries
      .filter(({ point }) => point.side === side)
      .sort((a, b) => (topBandY === undefined ? b.point.y - a.point.y : a.point.y - b.point.y))
      .map(({ connection }, rank) => [connection.id, rank] as const)
  )
  const leftLaneSlots = laneSlots('left')
  // Every output route eventually descends on the controller's right, even
  // when its pad is on the left rail, so the bus family ranks together here.
  // Right-rail control wires descend on the same side and take their slots
  // from beyond this count, so no component family can claim a corridor
  // another family is already occupying.
  const busConnectionIds = new Set(outputConnections.map((connection) => connection.id))
  const rightLaneSlots = new Map(
    controllerLaneEntries
      .filter(({ connection }) => busConnectionIds.has(connection.id))
      .sort((a, b) => (topBandY === undefined ? b.point.y - a.point.y : a.point.y - b.point.y))
      .map(({ connection }, rank) => [connection.id, rank] as const)
  )
  const leftLaneSlot = (connection: PhysicalDiagramConnection, fallback: number) =>
    leftLaneSlots.get(connection.id) ?? fallback
  const rightLaneSlot = (connection: PhysicalDiagramConnection, fallback: number) =>
    rightLaneSlots.get(connection.id) ?? fallback
  const controlCorridors = assignControlCorridors(peripheralLayouts, controllerConnections, boardProfile, leftLaneSlots, rightLaneSlots.size)
  const canvasHeight = physicalAssemblyDiagramHeight(items, plan, layers)
  const viewTop = crop?.y ?? 0
  const viewHeight = crop?.height ?? canvasHeight
  const wireTooltip = useRef<WireTooltipHandle>(null)

  return (
    <svg
      className={styles.physicalDiagram}
      viewBox={`0 ${viewTop} ${CANVAS_WIDTH} ${viewHeight}`}
      width={CANVAS_WIDTH}
      height={viewHeight}
      role="img"
      data-build-export={exportScope}
      // Named by aria-label rather than a root <title>: browsers show a root
      // title as a native tooltip over the whole sheet, which covered the
      // wire tooltip a moment after it appeared.
      aria-label="Generated physical LED controller wiring diagram"
      aria-describedby="physical-diagram-desc"
      {...wireTooltipHandlers(wireTooltip)}
    >
      <desc id="physical-diagram-desc">Every visible wire terminates at a labelled controller, audio input, level-shifter, LED, protection, distribution, capacitor, or supply terminal.</desc>
      <defs>
        <filter id="component-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#111" floodOpacity=".22" /></filter>
        <WireBloomFilter height={canvasHeight} />
        <linearGradient id="supply-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#405248" /><stop offset="1" stopColor="#171d1a" /></linearGradient>
      </defs>

      <rect data-pan-background="true" width={CANVAS_WIDTH} height={canvasHeight} fill="#f4f4f1" />
      <g opacity=".23">
        {Array.from({ length: 22 }, (_, index) => <line key={`v${index}`} x1={index * 52} y1="0" x2={index * 52} y2={canvasHeight} stroke="#afb4b4" strokeWidth=".7" />)}
        {Array.from({ length: Math.ceil(canvasHeight / 52) }, (_, index) => <line key={`h${index}`} x1="0" y1={index * 52} x2={CANVAS_WIDTH} y2={index * 52} stroke="#afb4b4" strokeWidth=".7" />)}
      </g>

      <g className={styles.physicalWires}>
        {layers.signalWires && outputLayouts.map((layout, index) => {
          const connection = outputConnections.find((entry) => entry.itemId === layout.item.id)
          if (!connection) return null
          const controllerIndex = controllerConnections.indexOf(connection)
          const controllerPoint = controllerConnectionPoint(connection, controllerIndex, controllerConnections.length, boardProfile)
          const presentation = signalPresentation(connection)
          const active = selectedItemId === 'controller' || selectedItemId === layout.item.id
          const wireClass = active ? styles.signalWire : styles.dimWire
          const wireStyle = active ? { stroke: presentation.color } : undefined
          const signalTip = `${connection.pinLabel} · ${connection.useLabel}`
          const shifterName = `Level shifter ${Math.floor(index / 4) + 1}`
          // Without the shifter layer there is nothing to route through, so the
          // data run goes straight from the controller pin to the panel.
          if (!layers.levelShifter) {
            return <HoverWire key={layout.item.id} tip={signalTip} data-wire={`${layout.item.id}-data-in`} data-signal-role={presentation.role} d={routeFromController(controllerPoint, layout.x, outputDataTerminalY(layout), rightLaneSlot(connection, controllerIndex), leftLaneSlot(connection, controllerIndex), leftLaneSlots.size, detourBaseY, topBandY)} className={wireClass} style={wireStyle} />
          }
          const inputPoint = levelShifterTerminalPoint(index, 'a')
          const outputPoint = levelShifterTerminalPoint(index, 'y')
          return <g key={layout.item.id}>
            <HoverWire tip={`${signalTip} · to 330Ω resistor`} data-wire={`${layout.item.id}-data-in`} data-signal-role={presentation.role} d={routeFromController(controllerPoint, 350, inputPoint.y, rightLaneSlot(connection, controllerIndex), leftLaneSlot(connection, controllerIndex), leftLaneSlots.size, detourBaseY, topBandY)} className={wireClass} style={wireStyle} />
            <HoverWire tip={`${signalTip} · 330Ω to ${shifterName} A${(index % 4) + 1}`} data-wire={`${layout.item.id}-level-shifter-input`} data-signal-role={presentation.role} d={routeToLevelShifterInput(index, inputPoint)} className={wireClass} style={wireStyle} />
            <HoverWire tip={`${shifterName} Y${(index % 4) + 1} · 5 V data to ${layout.item.title}`} data-wire={`${layout.item.id}-conditioned-data`} data-signal-role={presentation.role} d={routeFromLevelShifterOutput(index, outputPoint, layout.x, outputDataTerminalY(layout))} className={wireClass} style={wireStyle} />
          </g>
        })}
        {peripheralLayouts.map((layout) => {
          const peripheralConnections = connections.filter((connection) => connection.itemId === layout.item.id)
          const vccIndex = peripheralPowerPadIndex(layout.item)
          const vccNet = peripheralPowerNet(layout.item)
          const vccPad = vccIndex === null ? null : peripheralPadPoint(layout, vccIndex)
          const groundPad = peripheralPadPoint(layout, peripheralGroundPadIndex(layout.item))
          const channelSelectIndex = micChannelSelectPadIndex(layout.item)
          const channelSelectPad = channelSelectIndex === null ? null : peripheralPadPoint(layout, channelSelectIndex)
          const divider = receiveDivider(layout)
          const dividerConnection = divider ? peripheralConnections[divider.signalIndex] : undefined
          const dividerActive = selectedItemId === 'controller' || selectedItemId === layout.item.id
          const dividerColor = dividerConnection ? signalPresentation(dividerConnection).color : undefined
          return <g key={layout.item.id}>
            {vccPad && vccNet && (
              <NetStub
                x={vccPad.x}
                y={vccPad.y}
                kind={vccNet}
                direction="down"
                lead={PERIPHERAL_STUB_LEAD}
                wireId={`${layout.item.id}-${layout.item.kind === 'sd-card' ? 'power' : '3v3'}`}
              />
            )}
            {layers.signalWires && peripheralConnections.map((connection, index) => {
              const controllerIndex = controllerConnections.indexOf(connection)
              const controllerPoint = controllerConnectionPoint(connection, controllerIndex, controllerConnections.length, boardProfile)
              const padIndex = peripheralSignalPadIndex(layout.item, index)
              // Usually the pad itself; a receiver's RX wire ends on its divider.
              const end = peripheralSignalEndPoint(layout, index)
              const viaDivider = divider?.signalIndex === index
              // Name the pad the wire lands on, as printed on the part. The use
              // label speaks for the controller, so an amplifier's data line
              // read "I2S DOUT" over a pad silkscreened DIN.
              const padName = peripheralPadLabel(layout.item, padIndex)
              const lane = controlLanes.get(connection.id)
              const corridorSlot = controlCorridors.get(connection.id)
              if (!lane || corridorSlot === undefined) return null
              const presentation = signalPresentation(connection)
              const active = selectedItemId === 'controller' || selectedItemId === layout.item.id
              return <HoverWire
                key={connection.id}
                tip={viaDivider
                  ? `${connection.pinLabel} · 1 kΩ / 2 kΩ divider from ${layout.item.title} ${padName}`
                  : padName ? `${connection.pinLabel} · ${layout.item.title} ${padName}` : `${connection.pinLabel} · ${connection.useLabel}`}
                data-wire={connection.id}
                data-signal-role={presentation.role}
                data-control-lane={lane.index}
                data-control-corridor={corridorSlot}
                d={routeToControlPad(controllerPoint, end, lane.y, corridorSlot, peripheralApproach(layout, index))}
                className={active ? styles.signalWire : styles.dimWire}
                style={active ? { stroke: presentation.color } : undefined}
              />
            })}
            <NetStub x={groundPad.x} y={groundPad.y} kind="gnd" direction="down" lead={PERIPHERAL_STUB_LEAD} wireId={`${layout.item.id}-ground`} />
            {/*
              A microphone's channel-select pad picks its I2S slot by being tied
              to ground, so it carries the same ground symbol as the GND pad
              rather than a drawn strap between the two — one net, one symbol,
              per the common-net rule the callout states. A longer lead keeps
              its qualifying label off the plain GND label beside it.
            */}
            {channelSelectPad && (
              <NetStub
                x={channelSelectPad.x}
                y={channelSelectPad.y}
                kind="gnd"
                direction="down"
                lead={PERIPHERAL_STUB_LEAD + CHANNEL_SELECT_STUB_DROP}
                label="GND (LEFT)"
                wireId={`${layout.item.id}-channel-select`}
                wireRole="channel-select"
              />
            )}
            {/*
              A 5 V receiver's RO reaches RX through a divider: down out of the
              pad and left through 1 kΩ to the junction the RX wire climbs to,
              then 2 kΩ on to ground. The resistor bodies are drawn with the
              module; these are the leads between them.
            */}
            {divider && layers.signalWires && (
              <g data-receive-divider={layout.item.id}>
                {([
                  [`${layout.item.title} RO · to the 1 kΩ`, `M${divider.roPad.x} ${divider.roPad.y}V${divider.y}H${divider.seriesX + DIVIDER_RESISTOR_W}`, 'ro'],
                  ['1 kΩ · to the RX junction', `M${divider.seriesX} ${divider.y}H${divider.junction.x}`, 'series'],
                  ['RX junction · to the 2 kΩ', `M${divider.junction.x} ${divider.y}H${divider.shuntX + DIVIDER_RESISTOR_W}`, 'junction'],
                  ['2 kΩ · to GND', `M${divider.shuntX} ${divider.y}H${divider.ground.x}`, 'shunt'],
                ] as const).map(([tip, d, part]) => (
                  // Each lead stops at a resistor's end, so no wire is drawn
                  // across a resistor body whichever layer paints last.
                  <HoverWire
                    key={part}
                    tip={tip}
                    data-wire={`${layout.item.id}-divider-${part}`}
                    d={d}
                    className={dividerActive ? styles.signalWire : styles.dimWire}
                    style={dividerActive && dividerColor ? { stroke: dividerColor } : undefined}
                  />
                ))}
                <circle data-divider-junction="true" cx={divider.junction.x} cy={divider.junction.y} r={3} style={dividerColor ? { fill: dividerColor } : undefined} />
                <NetStub x={divider.ground.x} y={divider.ground.y} kind="gnd" direction="down" lead={PERIPHERAL_STUB_LEAD} wireId={`${layout.item.id}-divider-ground`} />
              </g>
            )}
          </g>
        })}
        {layers.levelShifter && Array.from({ length: Math.ceil(outputLayouts.length / 4) }, (_, chipIndex) => {
          const usedChannels = Math.min(4, outputLayouts.length - (chipIndex * 4))
          const vccPoint = levelShifterSupplyPoint(chipIndex, 'vcc')
          const groundPoint = levelShifterSupplyPoint(chipIndex, 'gnd')
          return <g key={`level-shifter-wires-${chipIndex}`}>
            <NetStub x={vccPoint.x} y={vccPoint.y} kind="v5" direction="right" wireId={`level-shifter-${chipIndex + 1}-vcc`} />
            <NetStub x={groundPoint.x} y={groundPoint.y} kind="gnd" direction="left" lead={26} wireId={`level-shifter-${chipIndex + 1}-ground`} />
            {Array.from({ length: usedChannels }, (_, channelIndex) => {
              const oePoint = levelShifterTerminalPoint((chipIndex * 4) + channelIndex, 'oe')
              // /OE ties low. Four identical cross-canvas runs per chip carried no
              // information beyond that, so each becomes a stub on its own pin side.
              return <NetStub
                key={channelIndex}
                x={oePoint.x}
                y={oePoint.y}
                kind="gnd"
                direction={oePoint.side === 'left' ? 'left' : 'right'}
                lead={oePoint.side === 'left' ? 26 : undefined}
                wireId={`level-shifter-${chipIndex + 1}-oe-${channelIndex + 1}`}
              />
            })}
          </g>
        })}
        {/*
          Source ends of the two rails the controller supplies, so each net
          still shows both ends. Each stub points away from the rail its pad is
          on — these were hardcoded left/right for the first board's pad
          placement, so a board whose 3V3 sits on the other rail aimed its stub
          into the board and had it painted over by the render.
        */}
        <NetStub x={controllerGround.x} y={controllerGround.y} kind="gnd" direction={controllerGround.side} lead={26} wireId="controller-common-ground" />
        {usesThreeVolt && <NetStub x={controller3v3.x} y={controller3v3.y} kind="v3v3" direction={controller3v3.side} lead={26} wireId="controller-3v3-rail" />}
      </g>

      {layers.levelShifter && outputLayouts.length > 0 && <g filter="url(#component-shadow)">
        {outputLayouts.map((layout, index) => (
          <g key={`${layout.item.id}-resistor`} transform={`translate(350 ${levelShifterTerminalPoint(index, 'a').y - 14})`}>
            {/* A3/A4 are one leg below A2/A1, so a label above would sit on that resistor. */}
            <text x="20" y={index % 4 >= 2 ? 42 : -8} textAnchor="middle" className={styles.physicalComponentLabel}>330Ω</text>
            <image
              data-component-render="330ohm-blue-axial-resistor"
              href={resistorRender}
              x="0"
              y="0"
              width="40"
              height="28"
              preserveAspectRatio="xMidYMid meet"
              className={styles.physicalBoardRender}
            />
          </g>
        ))}
        {Array.from({ length: Math.ceil(outputLayouts.length / 4) }, (_, chipIndex) => {
          const chipY = levelShifterChipY(chipIndex * 4)
          const usedChannels = Math.min(4, outputLayouts.length - (chipIndex * 4))
          const vccPoint = levelShifterSupplyPoint(chipIndex, 'vcc')
          const groundPoint = levelShifterSupplyPoint(chipIndex, 'gnd')
          return <g key={`level-shifter-${chipIndex}`} transform={`translate(${LEVEL_SHIFTER_X} ${chipY})`}>
            <text x={LEVEL_SHIFTER_WIDTH / 2} y="-14" textAnchor="middle" className={styles.physicalComponentLabel}>74AHCT125 DIP-14 level shifter {chipIndex + 1}</text>
            <image data-component-render="sn74ahct125n-dip14" href={levelShifterRender} x={LEVEL_SHIFTER_RENDER_X} y={LEVEL_SHIFTER_RENDER_Y} width={LEVEL_SHIFTER_RENDER_WIDTH} height={LEVEL_SHIFTER_RENDER_HEIGHT} preserveAspectRatio="xMidYMid meet" className={styles.physicalBoardRender} />
            <path
              data-level-shifter-pin-lead={`level-shifter-${chipIndex + 1}-vcc`}
              d={levelShifterPinLeadPath(vccPoint, chipY)}
              className={styles.powerWire}
            />
            <path
              data-level-shifter-pin-lead={`level-shifter-${chipIndex + 1}-gnd`}
              d={levelShifterPinLeadPath(groundPoint, chipY)}
              className={styles.groundWire}
            />
            <g data-terminal={`level-shifter-${chipIndex + 1}-vcc`}>
              <circle cx={vccPoint.x - LEVEL_SHIFTER_X} cy={vccPoint.y - chipY} r="6" fill="#d84938" stroke="#ffd1d7" strokeWidth="2" />
              <text x={vccPoint.x - LEVEL_SHIFTER_X - 12} y={vccPoint.y - chipY + 4} textAnchor="end" className={styles.physicalChipLabel}>P14 VCC</text>
            </g>
            {Array.from({ length: 4 }, (_, channelIndex) => {
              const outputIndex = (chipIndex * 4) + channelIndex
              const inputPoint = levelShifterTerminalPoint(outputIndex, 'a')
              const outputPoint = levelShifterTerminalPoint(outputIndex, 'y')
              const oePoint = levelShifterTerminalPoint(outputIndex, 'oe')
              const inputPin = [2, 5, 9, 12][channelIndex]
              const outputPin = [3, 6, 8, 11][channelIndex]
              const oePin = [1, 4, 10, 13][channelIndex]
              const outputLayout = outputLayouts[outputIndex]
              const connection = outputLayout && outputConnections.find((entry) => entry.itemId === outputLayout.item.id)
              const presentation = connection && signalPresentation(connection)
              const active = selectedItemId === 'controller' || selectedItemId === outputLayout?.item.id
              const signalLeadClass = active ? styles.signalWire : styles.dimWire
              const signalLeadStyle = active && presentation ? { stroke: presentation.color } : undefined
              const terminal = (point: LevelShifterTerminalPoint, label: string) => {
                const x = point.x - LEVEL_SHIFTER_X
                const y = point.y - chipY
                return <><circle cx={x} cy={y} r="5" fill="#d2d5d1" stroke="#465054" strokeWidth="2" /><text x={x + (point.side === 'left' ? 12 : -12)} y={y + 4} textAnchor={point.side === 'left' ? 'start' : 'end'} className={styles.physicalChipLabel}>{label}</text></>
              }
              return <g key={channelIndex}>
                {channelIndex < usedChannels && <>
                  <path
                    data-level-shifter-pin-lead={`level-shifter-${chipIndex + 1}-a${channelIndex + 1}`}
                    d={levelShifterPinLeadPath(inputPoint, chipY)}
                    className={signalLeadClass}
                    style={signalLeadStyle}
                  />
                  <path
                    data-level-shifter-pin-lead={`level-shifter-${chipIndex + 1}-y${channelIndex + 1}`}
                    d={levelShifterPinLeadPath(outputPoint, chipY)}
                    className={signalLeadClass}
                    style={signalLeadStyle}
                  />
                  <path
                    data-level-shifter-pin-lead={`level-shifter-${chipIndex + 1}-oe${channelIndex + 1}`}
                    d={levelShifterPinLeadPath(oePoint, chipY)}
                    className={styles.groundWire}
                  />
                </>}
                <g data-terminal={`level-shifter-${chipIndex + 1}-a${channelIndex + 1}`}>{terminal(inputPoint, `P${inputPin} A${channelIndex + 1}`)}</g>
                <g data-terminal={`level-shifter-${chipIndex + 1}-y${channelIndex + 1}`}>{terminal(outputPoint, `P${outputPin} Y${channelIndex + 1}`)}</g>
                <g data-terminal={`level-shifter-${chipIndex + 1}-oe${channelIndex + 1}`}>{terminal(oePoint, `P${oePin} /OE${channelIndex + 1}`)}</g>
              </g>
            })}
            <g data-terminal={`level-shifter-${chipIndex + 1}-gnd`}>
              <circle cx={groundPoint.x - LEVEL_SHIFTER_X} cy={groundPoint.y - chipY} r="6" fill="#202425" stroke="#f2c766" strokeWidth="2" />
              <text x={groundPoint.x - LEVEL_SHIFTER_X + 12} y={groundPoint.y - chipY + 4} className={styles.physicalChipLabel}>P7 GND</text>
            </g>
          </g>
        })}
      </g>}

      {/* The callout follows the stubs, not the PSU zones — a section sheet that
          drops power still draws net symbols and must still explain them. */}
      {layouts.length > 0 && (
        <CommonNetCallout
          x={320}
          y={showPowerDistribution
            ? powerSectionY - COMMON_NET_CALLOUT_HEIGHT - COMMON_NET_CALLOUT_GAP
            : diagramContentBottom(items, layers) + COMMON_NET_CALLOUT_GAP}
          width={776}
          powerBelow={showPowerDistribution}
          twelveVolt={usesTwelveVolt}
        />
      )}
      {showPowerDistribution && <PowerDistributionSections plan={plan} bands={powerZoneBands(items, plan, layers)} />}

      {controllerSupply ? (
        <ControllerConverterGraphic supply={controllerSupply} boardProfile={boardProfile} x={controllerUsb.x - 92} y={592} />
      ) : <g filter="url(#component-shadow)" transform={`translate(${controllerUsb.x - 92} 592)`}>
        <rect width="184" height="62" rx="12" fill="#e9ecea" stroke="#879092" strokeWidth="2" />
        <path d="M138 19h30v24h-30l-12-12z" fill="#aeb7ba" stroke="#5f696c" />
        {/* Deliberately does not name the connector type. Board renders are
            visually normalised to USB-C, so a type here would assert something
            the physical board may not have — the render shows the shape and
            the label just marks the controller's power inlet. */}
        <text x="18" y="27" className={styles.physicalComponentLabel}>USB power</text>
        <text x="18" y="46" className={styles.physicalMetaLabel}>controller only</text>
        <HoverWire tip="USB power · controller only" data-wire="controller-usb-power" d={`M92 0V${controllerUsb.y - 592}`} className={styles.logicPowerWire} />
      </g>}

      <g role="button" tabIndex={0} aria-label={`Select ${boardLabel}`} onClick={() => onSelectItem('controller')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectItem('controller') }} className={styles.physicalClickable}>
        {/* A sheet without signal runs shows no signal pins either, so the
            header strip carries only the terminals that sheet actually uses. */}
        <ControllerGraphic boardProfile={boardProfile} connections={layers.signalWires ? controllerConnections : []} selected={selectedItemId === 'controller'} />
      </g>
      {outputLayouts.map((layout) => <g key={layout.item.id} role="button" tabIndex={0} aria-label={`Select ${layout.item.title}`} onClick={() => onSelectItem(layout.item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectItem(layout.item.id) }} className={styles.physicalClickable}><OutputGraphic layout={layout} connection={outputConnections.find((entry) => entry.itemId === layout.item.id)} selected={selectedItemId === layout.item.id} plan={plan.outputs.find((entry) => entry.itemId === layout.item.id)} powerPlanBelow={showPowerDistribution} /></g>)}
      {peripheralLayouts.map((layout) => <g key={layout.item.id} role="button" tabIndex={0} aria-label={`Select ${layout.item.title}`} onClick={() => onSelectItem(layout.item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectItem(layout.item.id) }} className={styles.physicalClickable}><InputGraphic layout={layout} connections={connections.filter((connection) => connection.itemId === layout.item.id)} selected={selectedItemId === layout.item.id} /></g>)}

      <g transform="translate(30 28)">
        <rect width="272" height="68" rx="8" fill="#ffffff" stroke="#d2d4d1" />
        <text x="16" y="24" className={styles.physicalLegendTitle}>GENERATED WIRING PLAN</text>
        <text x="16" y="45" className={styles.physicalLegendMeta}>{items.length + 1} graph devices · {connections.length} GPIO routes</text>
        <text x="16" y="60" className={styles.physicalLegendMeta}>{plan.ruleSetVersion}</text>
      </g>
      <g transform={`translate(620 ${canvasHeight - 22})`}>
        <line x1="0" y1="0" x2="28" y2="0" className={styles.powerWire} /><WireLabel x={36} y={4}>+5V</WireLabel>
        <line x1="80" y1="0" x2="108" y2="0" className={styles.groundWire} /><WireLabel x={116} y={4}>GND</WireLabel>
        <line x1="166" y1="0" x2="194" y2="0" className={styles.signalWire} /><WireLabel x={202} y={4}>SIGNAL</WireLabel>
        <g transform="translate(292 -8)">
          <g className={styles.groundStubSymbol}>
            <line x1={-6} y1={4} x2={6} y2={4} /><line x1={-4} y1={8} x2={4} y2={8} /><line x1={-1.5} y1={12} x2={1.5} y2={12} />
          </g>
        </g>
        <WireLabel x={306} y={4}>SHARED NET — SEE CALLOUT</WireLabel>
      </g>
      <WireTooltip ref={wireTooltip} />
    </svg>
  )
}

import type { StudioEdge, StudioNode } from '../state/graphStore'
import {
  HUB75_CHIPSET,
  SPI_CHIPSETS,
  gpioRequirementForProperty,
  libraryDefaults,
  type GpioPropertyRequirement,
} from '../state/nodeLibrary'
import { boardByFqbn } from '../state/uploadStore'
import { controllerSettings } from '../state/controllerSettings'
import { targetFamilyFromFqbn, type BuildTargetFamily } from './buildProfile'
import {
  boardPinForGpio,
  selectedPhysicalBoardProfile,
  type PhysicalBoardPinProfile,
  type PhysicalBoardProfile,
} from './boardProfiles'
import { rtcI2cPinsForProfile } from '../state/rtcPins'

export interface HardwarePinUse {
  label: string
  nodeId: string
  nodeType: string
  propertyKey: string
  pin: number
  requirement: GpioPropertyRequirement | null
  /** Exact physical pad for a board-owned fixed peripheral alias. */
  boardPinId?: string
  /** True when the board/core owns this assignment rather than a node field. */
  boardDefault?: boolean
  /** Reviewed physical alias when a rendered pad is not present in the map. */
  boardPinLabel?: string
}

export function boardPinForUse(
  profile: PhysicalBoardProfile | undefined,
  use: HardwarePinUse,
): PhysicalBoardPinProfile | undefined {
  if (use.boardPinId) {
    const exact = profile?.pins?.find((pin) => pin.id === use.boardPinId)
    if (exact) return exact
  }
  return boardPinForGpio(profile, use.pin)
}

export function boardPinLabelForUse(
  profile: PhysicalBoardProfile | undefined,
  use: HardwarePinUse,
): string {
  return boardPinForUse(profile, use)?.label
    ?? use.boardPinLabel
    ?? `${use.boardDefault ? 'Arduino pin' : 'GPIO'} ${use.pin}`
}

export interface HardwareManifestItem {
  id: string
  kind: 'controller' | 'matrix-output' | 'mic-input' | 'rtc-input' | 'button-input' | 'pot-input' | 'encoder-input' | 'unsupported'
  title: string
  subtitle: string
  sourceNodeId?: string
  sourceNodeType?: string
  supported: boolean
  pins: HardwarePinUse[]
  facts: Record<string, unknown>
  reasons?: string[]
}

export interface HardwareManifest {
  targetFamily: BuildTargetFamily
  targetLabel: string
  controller: HardwareManifestItem
  items: HardwareManifestItem[]
  primaryItems: HardwareManifestItem[]
  unsupportedItems: HardwareManifestItem[]
}

const BUILD_DIAGRAM_SUPPORTED_NODE_TYPES = new Set([
  'MatrixOutput',
  'MicInput',
  'ButtonInput',
  'PotInput',
  'EncoderInput',
  'RTCInput',
])

const BUILD_DIAGRAM_5V_ONE_WIRE_CHIPSETS = new Set([
  'WS2812B',
  'SK6812',
  'SK6812-RGBW',
  'NEOPIXEL',
])

function nodeLabel(node: StudioNode): string {
  return String(node.data.label ?? node.data.nodeType)
}

function matrixOutputLabel(node: StudioNode, ordinal: number, count: number): string {
  return count > 1 ? `${nodeLabel(node)} ${ordinal}` : nodeLabel(node)
}

function nominalVoltageForChipset(chipset: string): number | null {
  return chipset === HUB75_CHIPSET ? 5 : 5
}

export function collectPinUses(nodes: StudioNode[]): HardwarePinUse[] {
  const uses: HardwarePinUse[] = []
  const rtcPins = rtcI2cPinsForProfile(selectedPhysicalBoardProfile(nodes))
  const matrixOutputs = nodes.filter((node) => node.data.nodeType === 'MatrixOutput')
  const matrixOrdinal = new Map(matrixOutputs.map((node, index) => [node.id, index + 1]))
  const push = (node: StudioNode, label: string, propertyKey: string, value: unknown) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return
    const nodeType = node.data.nodeType
    const props = node.data.properties as Record<string, unknown>
    uses.push({
      label,
      nodeId: node.id,
      nodeType,
      propertyKey,
      pin: value,
      requirement: gpioRequirementForProperty(nodeType, propertyKey, props),
    })
  }
  for (const node of nodes) {
    const props = node.data.properties as Record<string, unknown>
    const baseLabel = node.data.nodeType === 'MatrixOutput'
      ? matrixOutputLabel(node, matrixOrdinal.get(node.id) ?? 1, matrixOutputs.length)
      : nodeLabel(node)
    switch (node.data.nodeType) {
      case 'MicInput':
        push(node, `${baseLabel} I2S WS`, 'i2sWs', props.i2sWs)
        push(node, `${baseLabel} I2S SCK`, 'i2sSck', props.i2sSck)
        push(node, `${baseLabel} I2S SD`, 'i2sSd', props.i2sSd)
        break
      case 'DMXInput':
        if (String(props.inputMode ?? 'Art-Net') !== 'DMX512') break
        push(node, `${baseLabel} TX pin`, 'dmxTxPin', props.dmxTxPin)
        push(node, `${baseLabel} RX pin`, 'dmxRxPin', props.dmxRxPin)
        push(node, `${baseLabel} enable pin`, 'dmxEnablePin', props.dmxEnablePin)
        break
      case 'MatrixOutput':
        if (String(props.chipset ?? 'WS2812B') === HUB75_CHIPSET) {
          const hub75Props = { ...libraryDefaults('MatrixOutput'), ...props }
          push(node, `${baseLabel} R1 pin`, 'hub75R1Pin', hub75Props.hub75R1Pin)
          push(node, `${baseLabel} G1 pin`, 'hub75G1Pin', hub75Props.hub75G1Pin)
          push(node, `${baseLabel} B1 pin`, 'hub75B1Pin', hub75Props.hub75B1Pin)
          push(node, `${baseLabel} R2 pin`, 'hub75R2Pin', hub75Props.hub75R2Pin)
          push(node, `${baseLabel} G2 pin`, 'hub75G2Pin', hub75Props.hub75G2Pin)
          push(node, `${baseLabel} B2 pin`, 'hub75B2Pin', hub75Props.hub75B2Pin)
          push(node, `${baseLabel} row-select A`, 'hub75APin', hub75Props.hub75APin)
          push(node, `${baseLabel} row-select B`, 'hub75BPin', hub75Props.hub75BPin)
          push(node, `${baseLabel} row-select C`, 'hub75CPin', hub75Props.hub75CPin)
          push(node, `${baseLabel} row-select D`, 'hub75DPin', hub75Props.hub75DPin)
          if (hub75Props.hub75WideScan === true) push(node, `${baseLabel} row-select E`, 'hub75EPin', hub75Props.hub75EPin)
          push(node, `${baseLabel} clock pin`, 'hub75ClkPin', hub75Props.hub75ClkPin)
          push(node, `${baseLabel} latch pin`, 'hub75LatPin', hub75Props.hub75LatPin)
          push(node, `${baseLabel} output-enable pin`, 'hub75OePin', hub75Props.hub75OePin)
        } else {
          push(node, `${baseLabel} data pin`, 'dataPin', props.dataPin)
          if (SPI_CHIPSETS.has(String(props.chipset ?? 'WS2812B'))) push(node, `${baseLabel} clock pin`, 'clockPin', props.clockPin)
        }
        break
      case 'ButtonInput':
        push(node, `${baseLabel} pin`, 'pin', props.pin)
        break
      case 'PotInput':
        push(node, `${baseLabel} pin`, 'pin', props.pin)
        break
      case 'EncoderInput':
        push(node, `${baseLabel} pin A`, 'pinA', props.pinA)
        push(node, `${baseLabel} pin B`, 'pinB', props.pinB)
        push(node, `${baseLabel} switch pin`, 'pinSW', props.pinSW)
        break
      case 'RTCInput':
        if (String(props.timeSource ?? 'Compile Time') !== 'DS3231' || !rtcPins) break
        uses.push({
          label: `${baseLabel} SDA`,
          nodeId: node.id,
          nodeType: node.data.nodeType,
          propertyKey: 'sdaPin',
          pin: rtcPins.sda.arduinoPin,
          requirement: null,
          boardPinId: rtcPins.sda.boardPin?.id,
          boardDefault: true,
          boardPinLabel: rtcPins.sda.displayLabel,
        })
        uses.push({
          label: `${baseLabel} SCL`,
          nodeId: node.id,
          nodeType: node.data.nodeType,
          propertyKey: 'sclPin',
          pin: rtcPins.scl.arduinoPin,
          requirement: null,
          boardPinId: rtcPins.scl.boardPin?.id,
          boardDefault: true,
          boardPinLabel: rtcPins.scl.displayLabel,
        })
        break
      case 'SDCard':
        push(node, `${baseLabel} CS pin`, 'sdCsPin', props.sdCsPin)
        /*
         * The internal DAC has no Amplifier part — it *is* the output stage,
         * on two pins the library fixes for us, so they are claimed here.
         *
         * A card with no amplifier means either the internal DAC or no output
         * at all, and this walk has no board to tell them apart. Claiming the
         * pins in both cases is the safe way to be wrong: the no-output case
         * is already an error, and holding 25/26 stops something else taking
         * pins the DAC would need on the board where it does work.
         */
        if (!nodes.some((entry) => entry.data.nodeType === 'Amplifier')) {
          push(node, `${baseLabel} internal DAC (GPIO25)`, 'internalDac', 25)
          push(node, `${baseLabel} internal DAC (GPIO26)`, 'internalDac', 26)
        }
        break
      case 'Amplifier':
        push(node, `${baseLabel} I2S BCLK`, 'i2sBclk', props.i2sBclk)
        push(node, `${baseLabel} I2S LRC`, 'i2sLrc', props.i2sLrc)
        push(node, `${baseLabel} I2S DOUT`, 'i2sDout', props.i2sDout)
        break
    }
  }
  return uses
}

function buildMatrixOutputItem(node: StudioNode, ordinal: number, count: number, pinUses: HardwarePinUse[], powerCapMa: number | null): HardwareManifestItem {
  const props = node.data.properties as Record<string, unknown>
  const width = Math.max(0, Math.round(Number(props.width ?? 0)))
  const height = Math.max(0, Math.round(Number(props.height ?? 0)))
  const chipset = String(props.chipset ?? 'WS2812B')
  return {
    id: `output:${node.id}`,
    kind: 'matrix-output',
    title: matrixOutputLabel(node, ordinal, count),
    subtitle: `${width}×${height} ${chipset} route`,
    sourceNodeId: node.id,
    sourceNodeType: node.data.nodeType,
    supported: BUILD_DIAGRAM_5V_ONE_WIRE_CHIPSETS.has(chipset),
    pins: pinUses,
    facts: {
      width,
      height,
      pixelCount: width * height,
      routeOrdinal: ordinal,
      layout: String(props.layout ?? 'matrix'),
      chipset,
      nominalVoltage: nominalVoltageForChipset(chipset),
      desiredCurrentCapMa: powerCapMa,
    },
    reasons: !BUILD_DIAGRAM_5V_ONE_WIRE_CHIPSETS.has(chipset)
      ? [`${chipset} needs a dedicated Build Diagram signal and power profile before physical wiring can be generated.`]
      : undefined,
  }
}

function buildPeripheralItem(node: StudioNode, kind: HardwareManifestItem['kind'], subtitle: string, pinUses: HardwarePinUse[]): HardwareManifestItem {
  return {
    id: `${kind}:${node.id}`,
    kind,
    title: nodeLabel(node),
    subtitle,
    sourceNodeId: node.id,
    sourceNodeType: node.data.nodeType,
    supported: true,
    pins: pinUses,
    facts: {},
  }
}

function buildUnsupportedItem(node: StudioNode, pinUses: HardwarePinUse[]): HardwareManifestItem {
  return {
    id: `unsupported:${node.id}`,
    kind: 'unsupported',
    title: nodeLabel(node),
    subtitle: `${node.data.nodeType} is not wired into Build Diagram yet`,
    sourceNodeId: node.id,
    sourceNodeType: node.data.nodeType,
    supported: false,
    pins: pinUses,
    facts: {},
    reasons: ['This hardware type is outside the current Build Diagram MVP and will stay diagram-profile unavailable for now.'],
  }
}

export function buildHardwareManifest(nodes: StudioNode[], edges: StudioEdge[], selectedFqbn = ''): HardwareManifest {
  const targetFamily = targetFamilyFromFqbn(selectedFqbn)
  const board = boardByFqbn(selectedFqbn)
  const physicalBoard = selectedPhysicalBoardProfile(nodes)
  const pinUses = collectPinUses(nodes)
  const pinUsesByNodeId = new Map<string, HardwarePinUse[]>()
  for (const pinUse of pinUses) {
    const list = pinUsesByNodeId.get(pinUse.nodeId) ?? []
    list.push(pinUse)
    pinUsesByNodeId.set(pinUse.nodeId, list)
  }
  const matrixOutputs = nodes.filter((node) => node.data.nodeType === 'MatrixOutput')
  const settings = controllerSettings(nodes)
  const totalPixels = matrixOutputs.reduce((sum, node) => {
    const props = node.data.properties as Record<string, unknown>
    return sum + Math.max(0, Math.round(Number(props.width ?? 0))) * Math.max(0, Math.round(Number(props.height ?? 0)))
  }, 0)
  const hardwareNodes = nodes.filter((node) =>
    node.data.nodeType === 'MatrixOutput'
    || node.data.nodeType === 'MicInput'
    || node.data.nodeType === 'ButtonInput'
    || node.data.nodeType === 'PotInput'
    || node.data.nodeType === 'EncoderInput'
    || (node.data.nodeType === 'RTCInput'
      && String((node.data.properties as Record<string, unknown>).timeSource ?? 'Compile Time') === 'DS3231')
    || node.data.nodeType === 'DMXInput'
    || node.data.nodeType === 'SDCard'
  )

  const items = hardwareNodes.map((node) => {
    const pins = pinUsesByNodeId.get(node.id) ?? []
    if (!BUILD_DIAGRAM_SUPPORTED_NODE_TYPES.has(node.data.nodeType) && node.data.nodeType !== 'MatrixOutput') {
      return buildUnsupportedItem(node, pins)
    }
    switch (node.data.nodeType) {
      case 'MatrixOutput':
        return buildMatrixOutputItem(
          node,
          matrixOutputs.findIndex((entry) => entry.id === node.id) + 1,
          matrixOutputs.length,
          pins,
          settings.powerLimit && totalPixels > 0
            ? Math.round(settings.milliamps * (Math.max(0, Number((node.data.properties as Record<string, unknown>).width ?? 0)) * Math.max(0, Number((node.data.properties as Record<string, unknown>).height ?? 0))) / totalPixels)
            : null,
        )
      case 'MicInput':
        return buildPeripheralItem(node, 'mic-input', 'INMP441 microphone input', pins)
      case 'ButtonInput':
        return buildPeripheralItem(node, 'button-input', 'Momentary button input', pins)
      case 'PotInput':
        return buildPeripheralItem(node, 'pot-input', 'Analog potentiometer input', pins)
      case 'EncoderInput':
        return buildPeripheralItem(node, 'encoder-input', 'Rotary encoder input', pins)
      case 'RTCInput':
        return {
          ...buildPeripheralItem(node, 'rtc-input', 'DS3231 battery-backed I²C clock', pins),
          supported: pins.some((pin) => pin.propertyKey === 'sdaPin')
            && pins.some((pin) => pin.propertyKey === 'sclPin'),
          facts: { partId: String((node.data.properties as Record<string, unknown>).partId ?? 'ds3231-rtc-module') },
          reasons: rtcI2cPinsForProfile(physicalBoard)
            ? undefined
            : [`${physicalBoard?.label ?? 'The selected board'} does not yet have reviewed default SDA/SCL pads, so Studio will not invent RTC wiring.`],
        }
      default:
        return buildUnsupportedItem(node, pins)
    }
  })

  const controller: HardwareManifestItem = {
    id: 'controller',
    kind: 'controller',
    title: board?.label ?? (selectedFqbn || 'No board target selected'),
    subtitle: selectedFqbn ? `Target family: ${targetFamily}` : 'Select a board target in the LED output setup',
    supported: true,
    pins: [],
    facts: {
      selectedFqbn,
      targetFamily,
      boardLabel: board?.label ?? null,
      hardwareNodeCount: hardwareNodes.length,
      connectedEdgeCount: edges.length,
      brightness: settings.brightness,
      overclock: settings.overclock,
      powerLimit: settings.powerLimit,
      volts: settings.powerLimit ? settings.volts : null,
      milliamps: settings.powerLimit ? settings.milliamps : null,
      psram: settings.usePsram ? settings.psramMode : null,
    },
  }

  return {
    targetFamily,
    targetLabel: board?.label ?? (selectedFqbn || 'No board target selected'),
    controller,
    items,
    primaryItems: items.filter((item) => item.supported),
    unsupportedItems: items.filter((item) => !item.supported),
  }
}

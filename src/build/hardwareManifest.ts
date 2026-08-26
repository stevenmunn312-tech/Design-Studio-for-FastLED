import type { StudioEdge, StudioNode } from '../state/graphStore'
import {
  HUB75_CHIPSET,
  SPI_CHIPSETS,
  gpioRequirementForProperty,
  libraryDefaults,
  oledTransportForProps,
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
import { segmentControllerFor } from '../state/segmentDisplay'
import { OLED_TRANSPORT_PINS, asOledAddress, oledAddressLabel } from '../state/oledSurface'
import { isHardwareNodeType } from '../state/hardware'
import { partById } from '../state/partCatalogue'
import type { BusAssignment } from '../state/busTopology'
import { sdSpiPinsForBoard } from '../state/sdPinDefaults'
import { resolvePartIdentity } from '../state/partOptions'
import { LED_OUTPUT_FORM_LABELS, outputForm, outputGridDims, outputLedTotal } from '../state/ledOutputForm'
import { normalizeButtonBankEntries } from '../state/buttonBank'

export interface HardwarePinUse {
  label: string
  nodeId: string
  nodeType: string
  propertyKey: string
  pin: number
  requirement: GpioPropertyRequirement | null
  /** Bus role, where the property name alone cannot resolve it. */
  bus?: BusAssignment
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
  kind: 'controller' | 'matrix-output' | 'mic-input' | 'line-input' | 'rtc-input' | 'sd-card' | 'amplifier' | 'button-input' | 'pot-input' | 'encoder-input' | 'motion-input' | 'light-input' | 'segment-display' | 'info-display' | 'unsupported'
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
  'LineInput',
  'ButtonInput',
  'ButtonBank',
  'PotInput',
  'EncoderInput',
  'RTCInput',
  'SDCard',
  'Amplifier',
  'MotionInput',
  'LightInput',
  'SegmentDisplay',
  'InfoDisplay',
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
  const form = outputForm(node.data.properties as Record<string, unknown>)
  // Preserve the existing matrix export name for saved/custom projects, while
  // preventing a migrated chain form from being presented as a matrix.
  const label = form === 'matrix' ? nodeLabel(node) : LED_OUTPUT_FORM_LABELS[form]
  return count > 1 ? `${label} ${ordinal}` : label
}

function nominalVoltageForChipset(chipset: string): number | null {
  return chipset === HUB75_CHIPSET ? 5 : 5
}

export function collectPinUses(nodes: StudioNode[], selectedFqbn = ''): HardwarePinUse[] {
  const uses: HardwarePinUse[] = []
  const rtcPins = rtcI2cPinsForProfile(selectedPhysicalBoardProfile(nodes))
  const sdSpiPins = sdSpiPinsForBoard(selectedPhysicalBoardProfile(nodes), selectedFqbn)
  const matrixOutputs = nodes.filter((node) => node.data.nodeType === 'MatrixOutput')
  const matrixOrdinal = new Map(matrixOutputs.map((node, index) => [node.id, index + 1]))
  const pushBus = (
    node: StudioNode, label: string, propertyKey: string, value: unknown, bus: BusAssignment,
  ) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return
    uses.push({
      label,
      nodeId: node.id,
      nodeType: node.data.nodeType,
      propertyKey,
      pin: value,
      requirement: gpioRequirementForProperty(node.data.nodeType, propertyKey, node.data.properties as Record<string, unknown>),
      bus,
    })
  }
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
      case 'LineInput':
        push(node, `${baseLabel} I2S MCLK`, 'i2sMclk', props.i2sMclk)
        push(node, `${baseLabel} I2S BCLK`, 'i2sBclk', props.i2sBclk)
        push(node, `${baseLabel} I2S LRCLK`, 'i2sLrclk', props.i2sLrclk)
        push(node, `${baseLabel} I2S DOUT`, 'i2sDout', props.i2sDout)
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
      case 'InfoDisplay': {
        // Which wires exist depends on the module: a 7-pin SPI SH1106 has a
        // select, a data/command and a reset line, and a 4-pin I2C SSD1306 has
        // none of the three. Reserving all seven would hold five pins the
        // sketch never drives and hand the next part a bus it should share.
        if (oledTransportForProps(props) === 'i2c') {
          push(node, `${baseLabel} SDA`, 'sdaPin', props.sdaPin)
          push(node, `${baseLabel} SCL`, 'sclPin', props.sclPin)
          break
        }
        push(node, `${baseLabel} CS`, 'csPin', props.csPin)
        push(node, `${baseLabel} DC`, 'dcPin', props.dcPin)
        push(node, `${baseLabel} RESET`, 'resetPin', props.resetPin)
        push(node, `${baseLabel} SCK`, 'sckPin', props.sckPin)
        push(node, `${baseLabel} MOSI`, 'mosiPin', props.mosiPin)
        break
      }
      case 'SegmentDisplay': {
        // Which pins exist depends on the module. A TM1637's two wires are its
        // own; a MAX7219 clocks a shift register that other SPI devices may
        // share, so its roles are resolved here — the only walk that knows
        // which module the node is — and carried on the use itself.
        const segment = segmentControllerFor(partById(String(props.partId ?? ''))?.display?.controller)
        if (segment.id === 'MAX7219') {
          pushBus(node, `${baseLabel} CLK`, 'clkPin', props.clkPin, { kind: 'spi', role: 'sck' })
          pushBus(node, `${baseLabel} DIN`, 'dinPin', props.dinPin, { kind: 'spi', role: 'mosi' })
          pushBus(node, `${baseLabel} LOAD/CS`, 'csPin', props.csPin, { kind: 'spi', role: 'cs' })
        } else {
          push(node, `${baseLabel} CLK`, 'clkPin', props.clkPin)
          push(node, `${baseLabel} DIO`, 'dioPin', props.dioPin)
        }
        break
      }
      case 'ButtonInput':
        push(node, `${baseLabel} pin`, 'pin', props.pin)
        break
      case 'ButtonBank':
        for (const button of normalizeButtonBankEntries(props.buttons)) {
          uses.push({
            label: `${button.label} pin`,
            nodeId: node.id,
            nodeType: node.data.nodeType,
            propertyKey: `buttons.${button.id}.pin`,
            pin: button.pin,
            requirement: { capability: 'digitalInput', pullup: button.pullup },
          })
        }
        break
      case 'PotInput':
        push(node, `${baseLabel} pin`, 'pin', props.pin)
        break
      case 'MotionInput':
        push(node, `${baseLabel} OUT pin`, 'pin', props.pin)
        break
      case 'LightInput':
        push(node, `${baseLabel} signal pin`, 'pin', props.pin)
        break
      case 'EncoderInput':
        push(node, `${baseLabel} pin A`, 'pinA', props.pinA)
        push(node, `${baseLabel} pin B`, 'pinB', props.pinB)
        push(node, `${baseLabel} switch pin`, 'pinSW', props.pinSW)
        break
      case 'RTCInput':
        if (String(props.timeSource ?? 'Compile Time') !== 'DS3231') break
        {
          const sdaPin = Number(props.sdaPin ?? rtcPins?.sda.arduinoPin ?? 21)
          const sclPin = Number(props.sclPin ?? rtcPins?.scl.arduinoPin ?? 22)
          const sdaIsDefault = !!rtcPins && sdaPin === rtcPins.sda.arduinoPin
          const sclIsDefault = !!rtcPins && sclPin === rtcPins.scl.arduinoPin
          uses.push({
            label: `${baseLabel} SDA`,
            nodeId: node.id,
            nodeType: node.data.nodeType,
            propertyKey: 'sdaPin',
            pin: sdaPin,
            requirement: null,
            boardPinId: sdaIsDefault ? rtcPins.sda.boardPin?.id : undefined,
            boardDefault: sdaIsDefault,
            boardPinLabel: sdaIsDefault ? rtcPins.sda.displayLabel : undefined,
          })
          uses.push({
            label: `${baseLabel} SCL`,
            nodeId: node.id,
            nodeType: node.data.nodeType,
            propertyKey: 'sclPin',
            pin: sclPin,
            requirement: null,
            boardPinId: sclIsDefault ? rtcPins.scl.boardPin?.id : undefined,
            boardDefault: sclIsDefault,
            boardPinLabel: sclIsDefault ? rtcPins.scl.displayLabel : undefined,
          })
        }
        break
      case 'SDCard':
        for (const [propertyKey, label, fallback] of [
          ['sdCsPin', `${baseLabel} CS pin`, sdSpiPins?.cs],
          ['sdSckPin', `${baseLabel} SCK`, sdSpiPins?.sck],
          ['sdMosiPin', `${baseLabel} MOSI`, sdSpiPins?.mosi],
          ['sdMisoPin', `${baseLabel} MISO`, sdSpiPins?.miso],
        ] as const) {
          const pin = Number(props[propertyKey] ?? fallback)
          if (!Number.isFinite(pin)) continue
          uses.push({
            label,
            nodeId: node.id,
            nodeType: node.data.nodeType,
            propertyKey,
            pin,
            requirement: gpioRequirementForProperty(node.data.nodeType, propertyKey, props),
            boardDefault: fallback !== undefined && pin === fallback,
          })
        }
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
          push(node, `${baseLabel} internal DAC L (GPIO25)`, 'internalDacLeft', 25)
          push(node, `${baseLabel} internal DAC R (GPIO26)`, 'internalDacRight', 26)
        }
        break
      case 'Amplifier': {
        /*
         * An analog amplifier has no I2S receiver in it: the board hands it
         * line level from its own DAC, on the two pins the library fixes. It
         * claims those instead of three I2S pins it cannot listen to — the
         * same split `audioOutputMode` makes, made here so the diagram draws
         * the wires that actually exist.
         */
        const identity = resolvePartIdentity('Amplifier', props)
        if (identity?.option.input === 'analog') {
          // Distinct keys, not one `internalDac` for both: the diagram builds a
          // connection id from `${item.id}:${propertyKey}`, so a shared key
          // collapses the pair into one id — the two DAC pins rendered as a
          // duplicate of GPIO25 with GPIO26 missing. They are a stereo pair, so
          // name them as one.
          push(node, `${baseLabel} line in L (GPIO25)`, 'internalDacLeft', 25)
          push(node, `${baseLabel} line in R (GPIO26)`, 'internalDacRight', 26)
          break
        }
        push(node, `${baseLabel} I2S BCLK`, 'i2sBclk', props.i2sBclk)
        push(node, `${baseLabel} I2S LRC`, 'i2sLrc', props.i2sLrc)
        push(node, `${baseLabel} I2S DOUT`, 'i2sDout', props.i2sDout)
        break
      }
    }
  }
  return uses
}

function buildMatrixOutputItem(node: StudioNode, ordinal: number, count: number, pinUses: HardwarePinUse[], powerCapMa: number | null): HardwareManifestItem {
  const props = node.data.properties as Record<string, unknown>
  const form = outputForm(props)
  const { width, height } = outputGridDims(props)
  const pixelCount = outputLedTotal(props)
  const chipset = String(props.chipset ?? 'WS2812B')
  return {
    id: `output:${node.id}`,
    kind: 'matrix-output',
    title: matrixOutputLabel(node, ordinal, count),
    subtitle: form === 'matrix' || form === 'hub75'
      ? `${width}×${height} ${chipset} route`
      : `${pixelCount}-LED ${chipset} ${form} route`,
    sourceNodeId: node.id,
    sourceNodeType: node.data.nodeType,
    supported: BUILD_DIAGRAM_5V_ONE_WIRE_CHIPSETS.has(chipset),
    pins: pinUses,
    facts: {
      width,
      height,
      pixelCount,
      form,
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
  /*
   * Every peripheral names the exact module it is, resolved the same way both
   * views resolve it. Consumers that need a picture, a size or a datasheet
   * caveat then have one key to look it up by, rather than each keeping its own
   * table of which render belongs to which kind — which is how the Build
   * Diagram came to draw four different audio modules as a MAX98357A and to
   * draw a display as nothing at all.
   */
  const identity = resolvePartIdentity(node.data.nodeType, node.data.properties as Record<string, unknown>)
  return {
    id: `${kind}:${node.id}`,
    kind,
    title: nodeLabel(node),
    subtitle,
    sourceNodeId: node.id,
    sourceNodeType: node.data.nodeType,
    supported: true,
    pins: pinUses,
    facts: identity ? { partId: identity.option.id } : {},
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
  const pinUses = collectPinUses(nodes, selectedFqbn)
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
    return sum + outputLedTotal(props)
  }, 0)
  /*
   * What the diagram draws, derived rather than listed.
   *
   * This was a hand-maintained list of node types, and it fell behind twice for
   * the same reason: `collectPinUses` reserved a part's wires while nothing
   * drew the part, so the bench looked wired and the diagram silently omitted
   * it. The amplifier went missing that way, and so did the displays.
   *
   * Every part the workbench owns belongs on a wiring diagram. Board is the one
   * exclusion — it is the thing everything else is wired *to*, drawn as the
   * controller rather than as a peripheral — and DMXInput is the one addition,
   * since it is a graph-side input that still claims UART pins. An RTC on a
   * non-DS3231 source claims no pins and is not a part on the bench, which
   * `collectPinUses` already encodes, so it falls out here too.
   */
  const hardwareNodes = nodes.filter((node) => {
    const nodeType = node.data.nodeType
    if (nodeType === 'Board') return false
    if (nodeType === 'DMXInput') return true
    if (!isHardwareNodeType(nodeType)) return false
    if (nodeType === 'RTCInput') {
      return String((node.data.properties as Record<string, unknown>).timeSource ?? 'Compile Time') === 'DS3231'
    }
    return true
  })

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
            ? Math.round(settings.milliamps * outputLedTotal(node.data.properties as Record<string, unknown>) / totalPixels)
            : null,
        )
      case 'MicInput':
        return buildPeripheralItem(node, 'mic-input', 'INMP441 microphone input', pins)
      case 'LineInput':
        return {
          ...buildPeripheralItem(node, 'line-input', 'PCM1802 stereo line-level ADC', pins),
          supported: ['i2sMclk', 'i2sBclk', 'i2sLrclk', 'i2sDout']
            .every((key) => pins.some((pin) => pin.propertyKey === key)),
          facts: { partId: 'pcm1802-line-in-adc', input: 'stereo-line-level', output: 'i2s' },
          reasons: pins.length === 4
            ? undefined
            : ['This line-in ADC has no complete MCLK/BCLK/LRCLK/DOUT pin set configured.'],
        }
      case 'ButtonInput':
        return buildPeripheralItem(node, 'button-input', 'Momentary button input', pins)
      case 'ButtonBank':
        return buildPeripheralItem(node, 'button-input', 'Momentary button bank', pins)
      case 'PotInput':
        return buildPeripheralItem(node, 'pot-input', 'Analog potentiometer input', pins)
      case 'EncoderInput':
        return buildPeripheralItem(node, 'encoder-input', 'Rotary encoder input', pins)
      case 'MotionInput':
        return {
          ...buildPeripheralItem(node, 'motion-input', 'HC-SR501 PIR motion sensor', pins),
          facts: { partId: 'hc-sr501-pir-sensor' },
        }
      case 'LightInput':
        return {
          ...buildPeripheralItem(node, 'light-input', 'LDR analog light sensor', pins),
          facts: { partId: 'photosensitive-ldr-module' },
        }
      case 'RTCInput':
        return {
          ...buildPeripheralItem(node, 'rtc-input', 'DS3231 battery-backed I²C clock', pins),
          supported: pins.some((pin) => pin.propertyKey === 'sdaPin')
            && pins.some((pin) => pin.propertyKey === 'sclPin'),
          facts: { partId: String((node.data.properties as Record<string, unknown>).partId ?? 'ds3231-rtc-module') },
          reasons: pins.length === 2
            ? undefined
            : [`${physicalBoard?.label ?? 'The selected board'} does not have complete RTC SDA/SCL properties.`],
        }
      case 'SegmentDisplay': {
        const props = node.data.properties as Record<string, unknown>
        const partId = String(props.partId ?? 'tm1637-4digit-display')
        const controller = segmentControllerFor(partById(partId)?.display?.controller)
        return {
          ...buildPeripheralItem(node, 'segment-display',
            `${partById(partId)?.label ?? controller.id} 7-segment display`, pins),
          supported: controller.pins.every((key) => pins.some((pin) => pin.propertyKey === key)),
          facts: { partId, controller: controller.id, digits: controller.digits },
          reasons: controller.pins.every((key) => pins.some((pin) => pin.propertyKey === key))
            ? undefined
            : [`This ${controller.id} has no complete ${controller.pins.join('/')} pin set configured.`],
        }
      }
      case 'InfoDisplay': {
        const props = node.data.properties as Record<string, unknown>
        const partId = String(props.partId ?? 'sh1106-oled-128x64')
        const entry = partById(partId)
        const transport = oledTransportForProps(props)
        const keys = OLED_TRANSPORT_PINS[transport]
        const complete = keys.every((key) => pins.some((pin) => pin.propertyKey === key))
        const labels = transport === 'i2c' ? 'SDA/SCL' : 'CS/DC/RESET/CLK/MOSI'
        return {
          ...buildPeripheralItem(node, 'info-display',
            `${entry?.label ?? 'Monochrome OLED'} display`, pins),
          supported: complete,
          facts: {
            partId,
            controller: entry?.display?.controller ?? 'SH1106',
            resolution: entry?.display?.resolutionPx?.join('x') ?? '128x64',
            transport,
            // Only meaningful on I2C, and omitted rather than reported as a
            // default the SPI module does not answer to.
            ...(transport === 'i2c'
              ? { i2cAddress: oledAddressLabel(asOledAddress(props.i2cAddress)) }
              : {}),
          },
          reasons: complete
            ? undefined
            : [`This OLED has no complete ${labels} pin set configured.`],
        }
      }
      case 'SDCard': {
        const partId = String((node.data.properties as Record<string, unknown>).partId ?? 'microsd-module-5v')
        const spiPins = pins.filter((pin) => ['sdCsPin', 'sdSckPin', 'sdMosiPin', 'sdMisoPin'].includes(pin.propertyKey))
        return {
          ...buildPeripheralItem(node, 'sd-card', partId === 'microsd-breakout-3v3'
            ? 'Bare 3.3 V microSD SPI breakout'
            : '5 V microSD SPI module with regulator and level shifting', spiPins),
          supported: ['sdCsPin', 'sdSckPin', 'sdMosiPin', 'sdMisoPin']
            .every((key) => spiPins.some((pin) => pin.propertyKey === key)),
          facts: { partId, supplyVoltage: partId === 'microsd-breakout-3v3' ? 3.3 : 5 },
          reasons: spiPins.length === 4
            ? undefined
            : ['The selected board does not have a reviewed default SPI bus for the SD card.'],
        }
      }
      case 'Amplifier': {
        const identity = resolvePartIdentity('Amplifier', node.data.properties as Record<string, unknown>)
        const partId = identity?.option.id ?? 'max98357a-i2s-amplifier'
        const analog = identity?.option.input === 'analog'
        // Named by the module, not by the role: "Amplifier" on a bench holding
        // a PCM5102A would be wrong twice over — it is a DAC, and it is line
        // level. The part's own summary already says which.
        return {
          ...buildPeripheralItem(node, 'amplifier', identity?.option.summary ?? 'Audio output module', pins),
          title: identity?.entry?.label ?? identity?.option.label ?? nodeLabel(node),
          supported: analog
            ? pins.some((pin) => pin.propertyKey === 'internalDac')
            : ['i2sBclk', 'i2sLrc', 'i2sDout'].every((key) => pins.some((pin) => pin.propertyKey === key)),
          facts: { partId, input: analog ? 'analog' : 'i2s' },
          reasons: analog || pins.length === 3
            ? undefined
            : ['This audio module has no complete set of I2S pins configured.'],
        }
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

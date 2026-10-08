import type { StudioEdge, StudioNode } from '../state/graphStore'
import {
  HUB75_CHIPSET,
  SPI_CHIPSETS,
  gpioRequirementForProperty,
  libraryDefaults,
  oledTransportForProps,
  pinPropertyIsUnwired,
  tftTransportForProps,
  transportDisplayPinKeysForProps,
  type GpioPropertyRequirement,
} from '../state/nodeLibrary'
import { boardByFqbn } from '../state/upload/uploadStore'
import { controllerSettings } from './controllerSettings'
import { targetFamilyFromFqbn, type BuildTargetFamily } from './buildProfile'
import {
  boardPinForGpio,
  selectedPhysicalBoardProfile,
  type PhysicalBoardPinProfile,
  type PhysicalBoardProfile,
} from './boards/boardProfiles'
import { rtcI2cPinsForProfile } from './pins/rtcPins'
import { segmentControllerFor } from '../state/displays/segmentDisplay'
import { OLED_TRANSPORT_PINS, asOledAddress, oledAddressLabel } from '../state/displays/oledSurface'
import { isHardwareNodeType } from './hardware'
import { partById, partPinLabelForProperty } from './parts/partCatalogue'
import { PART_FIELDS } from './parts/partFields'
import type { BusAssignment } from './pins/busTopology'
import { sdSpiPinsForBoard } from './pins/sdPinDefaults'
import { resolvePartIdentity } from './parts/partOptions'
import { hasAudioOutputStage, i2sAudioStage, powerAmplifierFeed } from '../state/audio/audioOutput'
import { micModuleFor } from '../state/peripherals/micModules'
import { LED_OUTPUT_FORM_LABELS, outputForm, outputGridDims, outputLedTotal } from '../state/output/ledOutputForm'
import { normalizeButtonBankEntries } from '../state/player/buttonBank'
import { relayPinKeys } from '../state/peripherals/relayModule'
import { DEFAULT_POWER_SWITCH_PART_ID, powerSwitchChannels, powerSwitchDims, powerSwitchPwmHz } from '../state/peripherals/powerSwitch'
import { BUZZER_PART_ID, buzzerSpec } from '../state/peripherals/buzzer'
import {
  PCA9685_PART_ID, formatPwmDriverAddress, pwmDriverAddress, pwmDriverHz, pwmDriverSpec,
} from '../state/peripherals/pwmDriver'
import { DARLINGTON_PART_ID, darlingtonPinKeys, darlingtonSpec } from '../state/peripherals/darlingtonDriver'
import { PD_TRIGGER_PART_ID, pdTriggerSpec, pdTriggerVoltage } from '../state/peripherals/pdTrigger'
import { DEFAULT_POWER_MONITOR_PART_ID, formatI2cAddress, powerMonitorAddress, powerMonitorSpec } from '../state/peripherals/powerMonitor'
import { DMX_TRANSCEIVER_PART_ID, dmxUsesTransceiver } from '../state/peripherals/dmxTransceiver'
import { DEFAULT_PRESENCE_PART_ID, PRESENCE_UART_PORT, presenceSensorSpec } from '../state/peripherals/presenceSensor'
import { touchButtonSpec } from '../state/peripherals/touchButton'
import {
  DEFAULT_LIGHT_SENSOR_PART_ID,
  formatLightSensorAddress,
  lightSensorAddress,
  lightSensorPinKeys,
  lightSensorTransport,
} from '../state/peripherals/lightSensor'
import {
  BME280_PART_ID,
  environmentAddress,
  environmentSensorSpec,
  formatEnvironmentAddress,
} from '../state/peripherals/environmentSensor'
import { DS18B20_PART_ID, formatPullUp, temperatureSensorSpec } from '../state/peripherals/temperatureSensor'
import {
  HCSR04_PART_ID, distanceSensorAddress, distanceSensorSpec, distanceSensorTransport, distanceSensorXshutPin, formatDistanceSensorAddress,
} from '../state/peripherals/distanceSensor'
import { KY023_PART_ID } from '../state/peripherals/joystick'
import { KEYPAD_COL_KEYS, KEYPAD_PART_ID, KEYPAD_ROW_KEYS } from '../state/peripherals/keypad'
import {
  MPU6050_PART_ID, formatMotionVectorAddress, motionVectorAddress, motionVectorSpec,
} from '../state/peripherals/motionVector'
import {
  MPR121_PART_ID, formatTouchPadAddress, touchPadAddress, touchPadElectrodeCount,
} from '../state/peripherals/touchPad'
import { DEFAULT_ETHERNET_PART_ID, ETHERNET_PIN_KEYS, ethernetSpec, ethernetSpiHostForFqbn } from '../state/peripherals/ethernetModule'
import { DEFAULT_SOURCE_VOLTAGE, powerConverterModuleFor } from '../state/peripherals/powerConverter'
import {
  DIRECT_PIXEL_DATA_LINK,
  NLED_PIXEL_DATA_EXTENDER_PART_ID,
  NLED_PIXEL_DATA_LINK,
  nledPixelDataExtenderSpec,
  usesNledPixelDataExtender,
} from '../state/peripherals/pixelDataExtender'

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
  kind: 'controller' | 'matrix-output' | 'mic-input' | 'line-input' | 'rtc-input' | 'sd-card' | 'amplifier' | 'button-input' | 'touch-button-input' | 'pot-input' | 'encoder-input' | 'motion-input' | 'light-input' | 'environment-input' | 'temperature-input' | 'distance-input' | 'joystick-input' | 'keypad-input' | 'motion-vector-input' | 'touch-pad-input' | 'ir-input' | 'relay-output' | 'power-switch-output' | 'buzzer-output' | 'pwm-driver-output' | 'darlington-driver-output' | 'pd-trigger' | 'power-monitor-input' | 'presence-input' | 'dmx-input' | 'ethernet' | 'power-converter' | 'segment-display' | 'info-display' | 'transport-display' | 'unsupported'
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
  'StereoVuMeter',
  'MicInput',
  'LineInput',
  'ButtonInput',
  'TouchButtonInput',
  'ButtonBank',
  'PotInput',
  'EncoderInput',
  'RTCInput',
  'SDCard',
  'Amplifier',
  'PowerAmplifier',
  'MotionInput',
  'PresenceInput',
  'LightInput',
  'EnvironmentInput',
  'TemperatureInput',
  'DistanceInput',
  'JoystickInput',
  'KeypadInput',
  'MotionVectorInput',
  'TouchPadInput',
  'IRRemoteInput',
  'PowerMonitorInput',
  'RelayOutput',
  'PowerSwitchOutput',
  'BuzzerOutput',
  'PwmDriverOutput',
  'DarlingtonDriverOutput',
  'DMXInput',
  'EthernetModule',
  'PowerConverter',
  'PdTriggerSource',
  'SegmentDisplay',
  'InfoDisplay',
  'TransportDisplay',
  'TouchInput',
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

/**
 * Silkscreen first, then the hardware field's own name, then the property key.
 * A hand-listed SPI map left parallel lines unlabelled (`undefined` on the
 * wire) the moment a second transport arrived.
 */
function pinPropertyLabel(partId: string, nodeType: string, key: string): string {
  return partPinLabelForProperty(partId, key)
    ?? PART_FIELDS[nodeType]?.find((field) => field.key === key)?.label
    ?? key
}

function matrixOutputLabel(node: StudioNode, ordinal: number, count: number): string {
  const label = LED_OUTPUT_FORM_LABELS[outputForm(node.data.properties as Record<string, unknown>)]
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
    // A line the module ties on its own PCB claims no GPIO, so it must not
    // enter this walk: everything downstream — board compatibility, collision
    // checking, allocation, the diagram's wires — reads a use as a pin in use.
    if (pinPropertyIsUnwired(nodeType, propertyKey, value)) return
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
  const pushI2c = (node: StudioNode, baseLabel: string, props: Record<string, unknown>) => {
    const sdaPin = Number(props.sdaPin ?? rtcPins?.sda.arduinoPin ?? 21)
    const sclPin = Number(props.sclPin ?? rtcPins?.scl.arduinoPin ?? 22)
    const sdaIsDefault = !!rtcPins && sdaPin === rtcPins.sda.arduinoPin
    const sclIsDefault = !!rtcPins && sclPin === rtcPins.scl.arduinoPin
    uses.push({
      label: `${baseLabel} SDA`, nodeId: node.id, nodeType: node.data.nodeType,
      propertyKey: 'sdaPin', pin: sdaPin, requirement: null,
      boardPinId: sdaIsDefault ? rtcPins.sda.boardPin?.id : undefined,
      boardDefault: sdaIsDefault,
      boardPinLabel: sdaIsDefault ? rtcPins.sda.displayLabel : undefined,
    })
    uses.push({
      label: `${baseLabel} SCL`, nodeId: node.id, nodeType: node.data.nodeType,
      propertyKey: 'sclPin', pin: sclPin, requirement: null,
      boardPinId: sclIsDefault ? rtcPins.scl.boardPin?.id : undefined,
      boardDefault: sclIsDefault,
      boardPinLabel: sclIsDefault ? rtcPins.scl.displayLabel : undefined,
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
        if (!dmxUsesTransceiver(props)) break
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
      case 'StereoVuMeter':
        push(node, `${baseLabel} left data pin`, 'leftDataPin', props.leftDataPin)
        push(node, `${baseLabel} right data pin`, 'rightDataPin', props.rightDataPin)
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
      // Display (the document node) has no pins — it names no peripheral
      // item in either switch below either, for the same reason.
      case 'TransportDisplay': {
        const partId = String(props.partId ?? 'st7789-tft-240x240')
        for (const key of transportDisplayPinKeysForProps(props)) {
          const label = pinPropertyLabel(partId, 'TransportDisplay', key)
          push(node, `${baseLabel} ${label}`, key, props[key])
        }
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
      case 'TouchButtonInput':
        push(node, `${baseLabel} SIG pin`, 'pin', props.pin)
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
      // One UART receive line, from the sensor's TX pad.
      case 'PresenceInput':
        push(node, `${baseLabel} RX pin`, 'rxPin', props.rxPin)
        break
      // An SPI bus plus two control lines. Where the chip gives the module an
      // SPI host of its own, the bus lines are its alone; on a one-host chip it
      // shares `SPI` with any colour panel, so they are SPI lines the panel
      // also drives (see state/peripherals/ethernetModule.ts).
      case 'EthernetModule': {
        const shared = ethernetSpiHostForFqbn(selectedFqbn) === 'shared'
        const line = (label: string, key: string, role: BusAssignment['role']) => shared
          ? pushBus(node, `${baseLabel} ${label}`, key, props[key], { kind: 'spi', role })
          : push(node, `${baseLabel} ${label}`, key, props[key])
        line('SCLK', 'sckPin', 'sck')
        line('MOSI', 'mosiPin', 'mosi')
        line('MISO', 'misoPin', 'miso')
        line('SCNn', 'csPin', 'cs')
        push(node, `${baseLabel} INTn`, 'intPin', props.intPin)
        push(node, `${baseLabel} RSTn`, 'resetPin', props.resetPin)
        break
      }
      // One pin whatever the remote has: the receiver demodulates every key
      // onto the same line, so the learned buttons cost no GPIO of their own.
      case 'IRRemoteInput':
        push(node, `${baseLabel} OUT pin`, 'pin', props.pin)
        break
      case 'LightInput':
        if (lightSensorTransport(props.partId) === 'i2c') pushI2c(node, baseLabel, props)
        else push(node, `${baseLabel} signal pin`, 'pin', props.pin)
        break
      case 'EnvironmentInput':
        pushI2c(node, baseLabel, props)
        break
      case 'TemperatureInput':
        push(node, `${baseLabel} DATA pin`, 'pin', props.pin)
        break
      case 'MotionVectorInput':
      case 'TouchPadInput':
      case 'PwmDriverOutput':
        pushI2c(node, baseLabel, props)
        break
      case 'KeypadInput':
        KEYPAD_ROW_KEYS.forEach((key, index) => push(node, `${baseLabel} row ${index + 1} pin`, key, props[key]))
        KEYPAD_COL_KEYS.forEach((key, index) => push(node, `${baseLabel} column ${index + 1} pin`, key, props[key]))
        break
      case 'JoystickInput':
        push(node, `${baseLabel} X axis pin`, 'xPin', props.xPin)
        push(node, `${baseLabel} Y axis pin`, 'yPin', props.yPin)
        push(node, `${baseLabel} switch pin`, 'swPin', props.swPin)
        break
      case 'DistanceInput':
        if (distanceSensorTransport(props.partId) === 'i2c') {
          pushI2c(node, baseLabel, props)
          const xshut = distanceSensorXshutPin(props)
          if (xshut !== null) push(node, `${baseLabel} SHDN`, 'xshutPin', xshut)
          break
        }
        push(node, `${baseLabel} Trig pin`, 'trigPin', props.trigPin)
        push(node, `${baseLabel} Echo pin`, 'echoPin', props.echoPin)
        break
      case 'EncoderInput':
        push(node, `${baseLabel} pin A`, 'pinA', props.pinA)
        push(node, `${baseLabel} pin B`, 'pinB', props.pinB)
        push(node, `${baseLabel} switch pin`, 'pinSW', props.pinSW)
        break
      case 'RelayOutput':
        for (const [index, key] of relayPinKeys(props.partId).entries()) {
          push(node, `${baseLabel} IN${index + 1}`, key, props[key])
        }
        break
      case 'DarlingtonDriverOutput':
        darlingtonPinKeys().forEach((key, index) => push(node, `${baseLabel} ${index + 1}B`, key, props[key]))
        break
      case 'BuzzerOutput':
        push(node, `${baseLabel} SIG`, 'sigPin', props.sigPin)
        break
      case 'PowerSwitchOutput':
        // Named as the board prints each input: PWM on the LR7843, A to D on the Mosfetti.
        for (const channel of powerSwitchChannels(props.partId)) {
          push(node, `${baseLabel} ${channel.label ?? 'PWM'}`, channel.pinKey, props[channel.pinKey])
        }
        break
      // Both join the board's one I2C bus, on the board's own Wire pair
      // unless the node names another.
      case 'PowerMonitorInput':
      case 'RTCInput':
        if (node.data.nodeType === 'RTCInput' && String(props.timeSource ?? 'Compile Time') !== 'DS3231') break
        pushI2c(node, baseLabel, props)
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
         * The internal DAC has no part of its own — it *is* the output stage,
         * on two pins the library fixes for us, so they are claimed here.
         *
         * A card with no audio stage means either the internal DAC or no
         * output at all, and this walk has no board to tell them apart.
         * Claiming the pins in both cases is the safe way to be wrong: the
         * no-output case is already an error, and holding 25/26 stops
         * something else taking pins the DAC would need on the board where it
         * does work. A power amplifier on the bench claims them itself.
         */
        if (!hasAudioOutputStage(nodes)) {
          push(node, `${baseLabel} internal DAC L (GPIO25)`, 'internalDacLeft', 25)
          push(node, `${baseLabel} internal DAC R (GPIO26)`, 'internalDacRight', 26)
        }
        break
      case 'PowerAmplifier':
        /*
         * An analog power amplifier has no I2S receiver in it. Fed by a DAC it
         * touches no GPIO at all — its line in comes off the DAC's line out —
         * and fed by nothing else it takes line level from the classic ESP32's
         * own DAC, on the two pins the library fixes.
         *
         * Distinct keys, not one `internalDac` for both: the diagram builds a
         * connection id from `${item.id}:${propertyKey}`, so a shared key
         * collapses the pair into one id — the two DAC pins rendered as a
         * duplicate of GPIO25 with GPIO26 missing.
         */
        if (powerAmplifierFeed(nodes) === 'internalDac') {
          push(node, `${baseLabel} line in L (GPIO25)`, 'internalDacLeft', 25)
          push(node, `${baseLabel} line in R (GPIO26)`, 'internalDacRight', 26)
        }
        break
      case 'Amplifier': {
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
  const dataLink = String(props.dataLink ?? DIRECT_PIXEL_DATA_LINK)
  const extender = usesNledPixelDataExtender(props) ? nledPixelDataExtenderSpec() : null
  return {
    id: `output:${node.id}`,
    kind: 'matrix-output',
    title: matrixOutputLabel(node, ordinal, count),
    subtitle: (form === 'matrix' || form === 'hub75'
      ? `${width}×${height} ${chipset} route`
      : `${pixelCount}-LED ${chipset} ${form} route`)
      + (dataLink === NLED_PIXEL_DATA_LINK ? ' · differential link' : ''),
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
      dataLink,
      ...(extender ? {
        dataLinkPartId: NLED_PIXEL_DATA_EXTENDER_PART_ID,
        dataLinkMaxDistanceMeters: extender.maxDistanceMeters,
        dataLinkConductors: extender.pairConductors,
      } : {}),
      nominalVoltage: nominalVoltageForChipset(chipset),
      desiredCurrentCapMa: powerCapMa,
    },
    reasons: !BUILD_DIAGRAM_5V_ONE_WIRE_CHIPSETS.has(chipset)
      ? [`${chipset} needs a dedicated Build Diagram signal and power profile before physical wiring can be generated.`]
      : undefined,
  }
}

function buildStereoVuMeterItems(node: StudioNode, pinUses: HardwarePinUse[]): HardwareManifestItem[] {
  const props = node.data.properties as Record<string, unknown>
  const ledCount = Math.max(1, Math.round(Number(props.ledCount ?? 60)))
  const chipset = String(props.chipset ?? 'WS2812B')
  const supported = BUILD_DIAGRAM_5V_ONE_WIRE_CHIPSETS.has(chipset)
  const pairCap = props.powerLimit === true ? Math.max(0, Number(props.milliamps ?? 0)) : null
  return (['left', 'right'] as const).map((side) => {
    const propertyKey = `${side}DataPin`
    const direction = String(props[`${side}Direction`] ?? 'Bottom')
    return {
      id: `output:${node.id}:${side}`,
      kind: 'matrix-output',
      title: `${nodeLabel(node)} — ${side === 'left' ? 'Left' : 'Right'}`,
      subtitle: `${ledCount}-LED ${chipset} vertical rail; data-in at ${direction.toLowerCase()}`,
      sourceNodeId: node.id,
      sourceNodeType: node.data.nodeType,
      supported,
      pins: pinUses.filter((pin) => pin.propertyKey === propertyKey),
      facts: {
        pixelCount: ledCount,
        width: 1,
        height: ledCount,
        form: 'strip',
        layout: 'strip',
        side,
        dataIn: direction,
        chipset,
        colorOrder: String(props.colorOrder ?? 'GRB'),
        nominalVoltage: 5,
        desiredCurrentCapMa: pairCap == null ? null : Math.round(pairCap / 2),
        pairedFixtureId: node.id,
      },
      reasons: supported
        ? undefined
        : [`${chipset} is outside the reviewed clockless Stereo VU Meter wiring profile.`],
    }
  })
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
   * since it is a graph-side input that still claims UART pins, and only in
   * DMX512 mode, the one where it has a transceiver to draw. An RTC on a
   * non-DS3231 source claims no pins and is not a part on the bench, which
   * `collectPinUses` already encodes, so it falls out here too.
   */
  const hardwareNodes = nodes.filter((node) => {
    const nodeType = node.data.nodeType
    if (nodeType === 'Board') return false
    if (nodeType === 'DMXInput') return dmxUsesTransceiver(node.data.properties as Record<string, unknown>)
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
      case 'StereoVuMeter':
        return buildStereoVuMeterItems(node, pins)
      case 'MicInput':
        return buildPeripheralItem(
          node,
          'mic-input',
          `${micModuleFor((node.data.properties as Record<string, unknown>).partId).label} microphone input`,
          pins,
        )
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
      case 'TouchButtonInput': {
        const props = node.data.properties as Record<string, unknown>
        const spec = touchButtonSpec(props.partId)
        const item = buildPeripheralItem(node, 'touch-button-input', 'Capacitive touch button', pins)
        return {
          ...item,
          facts: {
            ...item.facts,
            device: spec.device,
            trigger: `active-${spec.activeLevel}`,
            mode: spec.mode,
            supplyVoltage: 3.3,
            responseMs: `${spec.responseMinMs}-${spec.responseMaxMs}`,
          },
        }
      }
      case 'ButtonBank':
        return buildPeripheralItem(node, 'button-input', 'Momentary button bank', pins)
      case 'PotInput':
        return buildPeripheralItem(node, 'pot-input', 'Analog potentiometer input', pins)
      case 'EncoderInput':
        return buildPeripheralItem(node, 'encoder-input', 'Rotary encoder input', pins)
      case 'MotionInput': {
        const partId = String((node.data.properties as Record<string, unknown>).partId ?? 'hc-sr501-pir-sensor')
        const entry = partById(partId)
        return {
          ...buildPeripheralItem(node, 'motion-input', entry?.label ?? 'HC-SR501 PIR motion sensor', pins),
          title: entry?.label ?? nodeLabel(node),
          facts: { partId },
        }
      }
      case 'IRRemoteInput':
        return buildPeripheralItem(node, 'ir-input', 'Demodulating IR receiver', pins)
      // On the power path, not the signal path: no pins. Its role and ratings
      // are the catalogue's, so the plan reads them from the part id.
      case 'PowerConverter': {
        const props = node.data.properties as Record<string, unknown>
        const module = powerConverterModuleFor(props.partId)
        const sourceVoltage = Number(props.sourceVoltage ?? DEFAULT_SOURCE_VOLTAGE)
        return {
          ...buildPeripheralItem(node, 'power-converter', `${sourceVoltage} V to ${module?.spec.outputSetV ?? 5} V buck converter`, pins),
          title: module?.label ?? nodeLabel(node),
          supported: Boolean(module),
          facts: {
            partId: module?.partId ?? String(props.partId ?? ''),
            role: module?.spec.role ?? 'controller',
            sourceVoltage,
          },
          reasons: module ? undefined : ['This converter part is not in the catalogue.'],
        }
      }
      // An upstream source, not a signal device: no pins, and the plan reads the
      // voltage it requests to check it against the converter it feeds.
      case 'PdTriggerSource': {
        const props = node.data.properties as Record<string, unknown>
        const partId = String(props.partId ?? PD_TRIGGER_PART_ID)
        const entry = partById(partId)
        const spec = pdTriggerSpec(partId)
        const voltage = pdTriggerVoltage(props)
        return {
          ...buildPeripheralItem(node, 'pd-trigger', `${voltage ?? '?'} V USB-C PD trigger`, pins),
          title: entry?.label ?? nodeLabel(node),
          supported: voltage !== null,
          facts: {
            partId,
            requestedVoltage: voltage ?? 0,
            maxCurrent: `${spec.maxCurrentA} A`,
            maxPower: `${spec.maxPowerW} W`,
            selection: spec.selection,
          },
          reasons: voltage === null ? [`${String(props.requestedVoltage)} V is not a voltage this trigger can request.`] : undefined,
        }
      }
      case 'EthernetModule': {
        const partId = String((node.data.properties as Record<string, unknown>).partId ?? DEFAULT_ETHERNET_PART_ID)
        const entry = partById(partId)
        const spec = ethernetSpec(partId)
        const wired = ETHERNET_PIN_KEYS.every((key) => pins.some((pin) => pin.propertyKey === key))
        const item = buildPeripheralItem(node, 'ethernet', entry?.label ?? 'Wired Ethernet module', pins)
        return {
          ...item,
          title: entry?.label ?? nodeLabel(node),
          supported: wired,
          facts: {
            ...item.facts,
            controller: spec.controller,
            link: spec.link,
            supplyVoltage: 3.3,
            cable: 'RJ45 to the lighting network; carries Art-Net and NTP in place of Wi-Fi',
          },
          reasons: wired ? undefined : ['This Ethernet module does not have its complete SPI and control pin set configured.'],
        }
      }
      case 'PresenceInput': {
        const entry = partById(String((node.data.properties as Record<string, unknown>).partId ?? DEFAULT_PRESENCE_PART_ID))
        const spec = presenceSensorSpec((node.data.properties as Record<string, unknown>).partId)
        const wired = pins.some((pin) => pin.propertyKey === 'rxPin')
        const item = buildPeripheralItem(node, 'presence-input', entry?.label ?? 'Radar presence sensor', pins)
        return {
          ...item,
          title: entry?.label ?? nodeLabel(node),
          supported: wired,
          facts: {
            ...item.facts,
            uart: `UART${PRESENCE_UART_PORT} receive at ${spec.baud} baud; sensor RX and OUT unwired`,
            range: `${spec.maxRangeMeters} m in ${spec.gateMeters} m gates`,
          },
          reasons: wired ? undefined : ['This presence sensor does not have its RX pin configured.'],
        }
      }
      case 'LightInput': {
        const props = node.data.properties as Record<string, unknown>
        const partId = String(props.partId ?? DEFAULT_LIGHT_SENSOR_PART_ID)
        const entry = partById(partId)
        const transport = lightSensorTransport(partId)
        const address = lightSensorAddress(props)
        const keys = lightSensorPinKeys(props)
        const wired = keys.every((key) => pins.some((pin) => pin.propertyKey === key))
        const item = buildPeripheralItem(node, 'light-input', entry?.label ?? 'Ambient light sensor', pins)
        return {
          ...item,
          title: entry?.label ?? nodeLabel(node),
          supported: wired && (transport !== 'i2c' || address !== null),
          facts: {
            ...item.facts,
            partId,
            transport,
            calibrated: transport === 'i2c',
            ...(transport === 'i2c' ? {
              i2cAddress: address === null ? String(props.i2cAddress ?? '') : formatLightSensorAddress(address),
              range: `0-${entry?.lightSensor?.maxLux ?? 65_535} lux`,
            } : {}),
          },
          reasons: !wired
            ? [`This ${transport === 'i2c' ? 'BH1750 does not have complete SDA/SCL pins' : 'LDR does not have an analog pin'} configured.`]
            : transport === 'i2c' && address === null
              ? [`${String(props.i2cAddress)} is not an address this BH1750 can select.`]
              : undefined,
        }
      }
      case 'RelayOutput': {
        const props = node.data.properties as Record<string, unknown>
        const partId = String(props.partId ?? 'relay-module-1ch-5v')
        const entry = partById(partId)
        const keys = relayPinKeys(partId)
        const complete = keys.every((key) => pins.some((pin) => pin.propertyKey === key))
        return {
          ...buildPeripheralItem(node, 'relay-output', entry?.label ?? '5 V relay module', pins),
          title: entry?.label ?? nodeLabel(node),
          supported: complete,
          facts: {
            partId,
            channels: entry?.relay?.channels ?? keys.length,
            trigger: entry?.relay?.trigger ?? 'active-low',
            contacts: entry?.relay?.contacts ?? 'SPDT (NO/COM/NC)',
            contactRating: entry?.relay?.contactRating ?? '',
          },
          reasons: complete ? undefined : ['This relay module does not have every active channel input pin configured.'],
        }
      }
      case 'DarlingtonDriverOutput': {
        const props = node.data.properties as Record<string, unknown>
        const partId = String(props.partId ?? DARLINGTON_PART_ID)
        const entry = partById(partId)
        const spec = darlingtonSpec(partId)
        const wired = darlingtonPinKeys().every((key) => pins.some((pin) => pin.propertyKey === key))
        return {
          ...buildPeripheralItem(node, 'darlington-driver-output', entry?.label ?? 'ULN2803A driver', pins),
          title: entry?.label ?? nodeLabel(node),
          supported: wired,
          facts: {
            partId,
            channels: String(spec.channels),
            inputActiveLevel: spec.inputActiveLevel,
            outputType: spec.outputType,
            maxOutputVoltage: `${spec.maxOutputVoltageV} V`,
            maxChannelCurrent: `${spec.maxChannelCurrentMa} mA`,
            loadSupply: 'separate; COM to the load supply for coils and motors',
          },
          reasons: wired ? undefined : [`${physicalBoard?.label ?? 'The selected board'} does not have eight free pins for the driver's inputs.`],
        }
      }
      case 'PwmDriverOutput': {
        const props = node.data.properties as Record<string, unknown>
        const partId = String(props.partId ?? PCA9685_PART_ID)
        const entry = partById(partId)
        const spec = pwmDriverSpec(partId)
        const address = pwmDriverAddress(props)
        const wired = pins.some((pin) => pin.propertyKey === 'sdaPin')
          && pins.some((pin) => pin.propertyKey === 'sclPin')
        const reasons = [
          ...(wired ? [] : [`${physicalBoard?.label ?? 'The selected board'} does not have complete SDA/SCL properties for this PWM driver.`]),
          ...(address === null ? [`${String(props.i2cAddress)} is not an address this PCA9685 can be set to.`] : []),
        ]
        return {
          ...buildPeripheralItem(node, 'pwm-driver-output', entry?.label ?? 'PCA9685 PWM driver', pins),
          title: entry?.label ?? nodeLabel(node),
          supported: wired && address !== null,
          facts: {
            partId,
            i2cAddress: address === null ? String(props.i2cAddress ?? '') : formatPwmDriverAddress(address),
            channels: String(spec.channels),
            pwmHz: `${pwmDriverHz(props)} Hz`,
            outputSupply: 'V+ on the module, separate from the controller',
          },
          reasons: reasons.length > 0 ? reasons : undefined,
        }
      }
      case 'BuzzerOutput': {
        const props = node.data.properties as Record<string, unknown>
        const partId = String(props.partId ?? BUZZER_PART_ID)
        const entry = partById(partId)
        const spec = buzzerSpec(partId)
        const wired = pins.some((pin) => pin.propertyKey === 'sigPin')
        return {
          ...buildPeripheralItem(node, 'buzzer-output', entry?.label ?? 'Active buzzer', pins),
          title: entry?.label ?? nodeLabel(node),
          supported: wired,
          facts: {
            partId,
            type: spec.type,
            activeLevel: spec.activeLevel,
            pitch: spec.resonanceKHz === null ? 'set by the controller' : `${spec.resonanceKHz} kHz`,
            maxCurrent: `${spec.maxCurrentMa} mA`,
          },
          reasons: wired ? undefined : ['This buzzer does not have its signal pin configured.'],
        }
      }
      case 'PowerSwitchOutput': {
        // The GPIO side is ordinary wiring; the load side is not, so its
        // limits travel as facts from the catalogued module rather than as
        // pins. The part is described by what it switches, not only what it
        // is wired to.
        const props = node.data.properties as Record<string, unknown>
        const partId = String(props.partId ?? DEFAULT_POWER_SWITCH_PART_ID)
        const entry = partById(partId)
        const spec = entry?.mosfet
        const channels = powerSwitchChannels(partId)
        const wired = channels.every((channel) => pins.some((pin) => pin.propertyKey === channel.pinKey))
        // A dimmed channel's pin carries PWM, which a wiring review needs to
        // know: the load sees the frequency, not only the on/off state.
        const pwmHz = powerSwitchPwmHz(partId)
        const drives = channels.map((channel) => {
          const levelWired = edges.some((edge) => edge.target === node.id && edge.targetHandle === channel.level)
          const drive = pwmHz !== null && powerSwitchDims(partId, props[channel.level], levelWired) ? `PWM ${pwmHz} Hz` : 'on/off'
          return channel.label === null ? drive : `${channel.label} ${drive}`
        })
        return {
          ...buildPeripheralItem(node, 'power-switch-output', entry?.label ?? 'DC MOSFET switch', pins),
          title: entry?.label ?? nodeLabel(node),
          supported: wired,
          facts: {
            partId,
            channels: channels.length,
            drive: drives.join(', '),
            trigger: spec?.trigger ?? 'active-high',
            // Not isolated means the controller's ground is the load
            // supply's negative, which is wiring, not a detail.
            isolation: spec === undefined ? '' : spec.optoIsolated ? 'opto-isolated' : 'none: shares ground with the load supply',
            loadSupply: spec?.loadSupply ?? '',
            continuousCurrent: spec?.continuousCurrent ?? '',
            flybackDiode: spec?.flybackDiode ?? false,
            loadTerminals: (spec?.loadTerminals ?? []).join(' / '),
          },
          reasons: wired
            ? undefined
            : [channels.length === 1
              ? 'This power switch does not have its PWM input pin configured.'
              : 'This power switch does not have every channel input pin configured.'],
        }
      }
      case 'PowerMonitorInput': {
        // What it measures travels as facts: the address the straps select,
        // and the limits a wiring review has to hold the load to.
        const props = node.data.properties as Record<string, unknown>
        const partId = String(props.partId ?? DEFAULT_POWER_MONITOR_PART_ID)
        const entry = partById(partId)
        const spec = powerMonitorSpec(partId)
        const address = powerMonitorAddress(props)
        const wired = pins.some((pin) => pin.propertyKey === 'sdaPin')
          && pins.some((pin) => pin.propertyKey === 'sclPin')
        const reasons = [
          ...(wired ? [] : [`${physicalBoard?.label ?? 'The selected board'} does not have complete SDA/SCL properties for this monitor.`]),
          ...(address === null ? [`${String(props.i2cAddress)} is not an address this board's jumpers can select.`] : []),
        ]
        return {
          ...buildPeripheralItem(node, 'power-monitor-input', entry?.label ?? 'I²C power monitor', pins),
          title: entry?.label ?? nodeLabel(node),
          supported: wired && address !== null,
          facts: {
            partId,
            i2cAddress: address === null ? String(props.i2cAddress ?? '') : formatI2cAddress(address),
            busVoltageMax: `${spec.busVoltageMaxV} V`,
            currentMax: `${spec.currentMaxA} A`,
            shuntOhms: spec.shuntOhms,
            senseSide: spec.senseSide,
            senseTerminals: spec.device === 'INA226' ? 'IN+ from supply / IN- to load' : 'Vin+ from supply / Vin- to load',
          },
          reasons: reasons.length > 0 ? reasons : undefined,
        }
      }
      case 'EnvironmentInput': {
        const props = node.data.properties as Record<string, unknown>
        const partId = String(props.partId ?? BME280_PART_ID)
        const entry = partById(partId)
        const spec = environmentSensorSpec(partId)
        const address = environmentAddress(props)
        const wired = pins.some((pin) => pin.propertyKey === 'sdaPin')
          && pins.some((pin) => pin.propertyKey === 'sclPin')
        const reasons = [
          ...(wired ? [] : [`${physicalBoard?.label ?? 'The selected board'} does not have complete SDA/SCL properties for this sensor.`]),
          ...(address === null ? [`${String(props.i2cAddress)} is not an address this BME280 can select.`] : []),
        ]
        return {
          ...buildPeripheralItem(node, 'environment-input', entry?.label ?? 'BME280 environment sensor', pins),
          title: entry?.label ?? nodeLabel(node),
          supported: wired && address !== null,
          facts: {
            partId,
            i2cAddress: address === null ? String(props.i2cAddress ?? '') : formatEnvironmentAddress(address),
            temperatureRange: `${spec.temperatureMinC} to ${spec.temperatureMaxC} °C`,
            humidityRange: `${spec.humidityMinPercent} to ${spec.humidityMaxPercent} % RH`,
            pressureRange: `${spec.pressureMinHpa} to ${spec.pressureMaxHpa} hPa`,
          },
          reasons: reasons.length > 0 ? reasons : undefined,
        }
      }
      case 'TemperatureInput': {
        const props = node.data.properties as Record<string, unknown>
        const partId = String(props.partId ?? DS18B20_PART_ID)
        const entry = partById(partId)
        const spec = temperatureSensorSpec(partId)
        const wired = pins.some((pin) => pin.propertyKey === 'pin')
        return {
          ...buildPeripheralItem(node, 'temperature-input', entry?.label ?? 'DS18B20 temperature probe', pins),
          title: entry?.label ?? nodeLabel(node),
          supported: wired,
          facts: {
            partId,
            temperatureRange: `${spec.temperatureMinC} to ${spec.temperatureMaxC} °C`,
            pullUp: formatPullUp(spec.pullUpOhms),
          },
          reasons: wired ? undefined : [`${physicalBoard?.label ?? 'The selected board'} has no free pin for the probe's DATA wire.`],
        }
      }
      case 'MotionVectorInput': {
        const props = node.data.properties as Record<string, unknown>
        const partId = String(props.partId ?? MPU6050_PART_ID)
        const entry = partById(partId)
        const spec = motionVectorSpec(partId)
        const address = motionVectorAddress(props)
        const wired = pins.some((pin) => pin.propertyKey === 'sdaPin')
          && pins.some((pin) => pin.propertyKey === 'sclPin')
        const reasons = [
          ...(wired ? [] : [`${physicalBoard?.label ?? 'The selected board'} does not have complete SDA/SCL properties for this sensor.`]),
          ...(address === null ? [`${String(props.i2cAddress)} is not an address this MPU-6050 can select.`] : []),
        ]
        return {
          ...buildPeripheralItem(node, 'motion-vector-input', entry?.label ?? 'GY-521 MPU-6050', pins),
          title: entry?.label ?? nodeLabel(node),
          supported: wired && address !== null,
          facts: {
            partId,
            i2cAddress: address === null ? String(props.i2cAddress ?? '') : formatMotionVectorAddress(address),
            accelRange: `±${spec.accelRangeG} g`,
            gyroRange: `±${spec.gyroRangeDps} °/s`,
          },
          reasons: reasons.length > 0 ? reasons : undefined,
        }
      }
      case 'TouchPadInput': {
        const props = node.data.properties as Record<string, unknown>
        const partId = String(props.partId ?? MPR121_PART_ID)
        const entry = partById(partId)
        const address = touchPadAddress(props)
        const wired = pins.some((pin) => pin.propertyKey === 'sdaPin')
          && pins.some((pin) => pin.propertyKey === 'sclPin')
        const reasons = [
          ...(wired ? [] : [`${physicalBoard?.label ?? 'The selected board'} does not have complete SDA/SCL properties for this touch controller.`]),
          ...(address === null ? [`${String(props.i2cAddress)} is not an address this MPR121 can select.`] : []),
        ]
        return {
          ...buildPeripheralItem(node, 'touch-pad-input', entry?.label ?? 'Adafruit MPR121 touch sensor', pins),
          title: entry?.label ?? nodeLabel(node),
          supported: wired && address !== null,
          facts: {
            partId,
            i2cAddress: address === null ? String(props.i2cAddress ?? '') : formatTouchPadAddress(address),
            electrodes: String(touchPadElectrodeCount(partId)),
          },
          reasons: reasons.length > 0 ? reasons : undefined,
        }
      }
      case 'KeypadInput': {
        const props = node.data.properties as Record<string, unknown>
        const partId = String(props.partId ?? KEYPAD_PART_ID)
        const entry = partById(partId)
        const wired = [...KEYPAD_ROW_KEYS, ...KEYPAD_COL_KEYS].every((key) => pins.some((pin) => pin.propertyKey === key))
        return {
          ...buildPeripheralItem(node, 'keypad-input', entry?.label ?? '4x4 matrix keypad', pins),
          title: entry?.label ?? nodeLabel(node),
          supported: wired,
          facts: { partId, keys: '16 (4 x 4)', supply: 'none (passive matrix)' },
          reasons: wired ? undefined : [`${physicalBoard?.label ?? 'The selected board'} does not have eight free pins for the keypad's rows and columns.`],
        }
      }
      case 'JoystickInput': {
        const props = node.data.properties as Record<string, unknown>
        const partId = String(props.partId ?? KY023_PART_ID)
        const entry = partById(partId)
        const wired = ['xPin', 'yPin', 'swPin'].every((key) => pins.some((pin) => pin.propertyKey === key))
        return {
          ...buildPeripheralItem(node, 'joystick-input', entry?.label ?? 'KY-023 joystick', pins),
          title: entry?.label ?? nodeLabel(node),
          supported: wired,
          facts: { partId, supply: '3.3 V', axes: '2 analog + switch' },
          reasons: wired ? undefined : [`${physicalBoard?.label ?? 'The selected board'} does not have three free pins for VRx, VRy and SW.`],
        }
      }
      case 'DistanceInput': {
        const props = node.data.properties as Record<string, unknown>
        const partId = String(props.partId ?? HCSR04_PART_ID)
        const entry = partById(partId)
        const spec = distanceSensorSpec(partId)
        const transport = distanceSensorTransport(partId)
        if (transport === 'i2c') {
          const address = distanceSensorAddress(props)
          const i2cWired = pins.some((pin) => pin.propertyKey === 'sdaPin') && pins.some((pin) => pin.propertyKey === 'sclPin')
          return {
            ...buildPeripheralItem(node, 'distance-input', entry?.label ?? `${spec.device} laser distance sensor`, pins),
            title: entry?.label ?? nodeLabel(node),
            supported: i2cWired && address !== null,
            facts: {
              partId,
              transport,
              distanceRange: `${spec.minMm / 10} to ${spec.maxMm / 10} cm`,
              i2cAddress: address === null ? String(props.i2cAddress ?? '') : formatDistanceSensorAddress(address),
            },
            reasons: !i2cWired
              ? [`${physicalBoard?.label ?? 'The selected board'} does not have complete SDA/SCL properties for this distance sensor.`]
              : address === null ? [`${String(props.i2cAddress)} is not an address this ${spec.device} answers on.`] : undefined,
          }
        }
        const wired = pins.some((pin) => pin.propertyKey === 'trigPin')
          && pins.some((pin) => pin.propertyKey === 'echoPin')
        return {
          ...buildPeripheralItem(node, 'distance-input', entry?.label ?? 'HC-SR04 ultrasonic sensor', pins),
          title: entry?.label ?? nodeLabel(node),
          supported: wired,
          facts: {
            partId,
            transport,
            distanceRange: `${spec.minMm / 10} to ${spec.maxMm / 10} cm`,
            echoLevel: `${spec.echoVolts ?? 5} V`,
            echoDivider: '1 kΩ / 2 kΩ',
          },
          reasons: wired ? undefined : [`${physicalBoard?.label ?? 'The selected board'} does not have two free pins for Trig and Echo.`],
        }
      }
      case 'DMXInput': {
        // Three GPIOs to the transceiver; the bus side (B, A, GND) goes to the
        // XLR cable, not to the controller, so it travels as facts.
        const entry = partById(DMX_TRANSCEIVER_PART_ID)
        const missing = (['dmxTxPin', 'dmxRxPin', 'dmxEnablePin'] as const)
          .filter((key) => !pins.some((pin) => pin.propertyKey === key))
        return {
          ...buildPeripheralItem(node, 'dmx-input', entry?.label ?? 'RS-485 transceiver', pins),
          title: entry?.label ?? nodeLabel(node),
          supported: missing.length === 0,
          facts: {
            partId: DMX_TRANSCEIVER_PART_ID,
            supply: '5 V',
            rxLevel: 'RO to RX through 1 kΩ, RX to GND through 2 kΩ (5 V down to 3.3 V)',
            enable: 'RE and DE bridged, on one GPIO',
            dmxCable: 'XLR pin 1 to GND, pin 2 (Data-) to B, pin 3 (Data+) to A',
            termination: '120 Ω fitted (R7): keep only on the last device in the chain',
          },
          reasons: missing.length === 0
            ? undefined
            : [`${physicalBoard?.label ?? 'The selected board'} does not have the DMX512 TX, RX and enable pins configured.`],
        }
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
      // The Touch node names no peripheral item of its own: it is the
      // digitiser of a panel this diagram already draws, one module with two
      // chips rather than two parts on the bench.
      case 'TouchInput':
        return []
      case 'TransportDisplay': {
        const props = node.data.properties as Record<string, unknown>
        const partId = String(props.partId ?? 'st7789-tft-240x240')
        const entry = partById(partId)
        // A tied reset or an always-on backlight is configured, not missing:
        // it contributes no pin use, so asking for one would report a
        // correctly-wired integrated panel as incomplete.
        const keys = transportDisplayPinKeysForProps(props)
          .filter((key) => !pinPropertyIsUnwired('TransportDisplay', key, props[key]))
        const complete = keys.every((key) => pins.some((pin) => pin.propertyKey === key))
        const bus = tftTransportForProps(props) === 'parallel' ? 'parallel' : 'SPI'
        return {
          ...buildPeripheralItem(node, 'transport-display', `${entry?.label ?? 'Colour TFT'} display`, pins),
          supported: complete,
          facts: {
            partId,
            controller: entry?.display?.controller ?? 'ST7789',
            resolution: entry?.display?.resolutionPx?.join('x') ?? '240x240',
            transport: entry?.display?.interface ?? 'SPI',
            touchController: entry?.display?.touchController ?? null,
          },
          reasons: complete
            ? undefined
            : [`This colour display does not have its complete ${bus} pin set configured.`],
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
        // Named by the module, not by the role: "Amplifier" on a bench holding
        // a PCM5102A would be wrong twice over — it is a DAC, and it is line
        // level. The part's own summary already says which.
        return {
          ...buildPeripheralItem(node, 'amplifier', identity?.option.summary ?? 'Audio output module', pins),
          title: identity?.entry?.label ?? identity?.option.label ?? nodeLabel(node),
          supported: ['i2sBclk', 'i2sLrc', 'i2sDout'].every((key) => pins.some((pin) => pin.propertyKey === key)),
          facts: { partId, stage: 'i2s', output: identity?.option.output ?? 'speaker' },
          reasons: pins.length === 3
            ? undefined
            : ['This audio module has no complete set of I2S pins configured.'],
        }
      }
      case 'PowerAmplifier': {
        const identity = resolvePartIdentity('PowerAmplifier', node.data.properties as Record<string, unknown>)
        const partId = identity?.option.id ?? 'pam8403-3w-stereo-amplifier'
        const feed = powerAmplifierFeed(nodes) ?? 'internalDac'
        const source = i2sAudioStage(nodes)
        const sourceIdentity = source
          ? resolvePartIdentity('Amplifier', source.data.properties as Record<string, unknown>)
          : null
        // The full title matches the DAC's own row on the sheet and in the
        // connection table; the short module name fits a caption.
        const sourceTitle = source
          ? sourceIdentity?.entry?.label ?? sourceIdentity?.option.label ?? nodeLabel(source)
          : null
        const reasons = feed === 'speakerAmp'
          ? [`${sourceTitle ?? 'The I2S amplifier'} drives a speaker, not a line input — use a PCM5102A or UDA1334A to feed this amplifier.`]
          : feed === 'internalDac' && pins.length !== 2
            ? ['Nothing feeds this amplifier line level.']
            : undefined
        return {
          ...buildPeripheralItem(node, 'amplifier', identity?.option.summary ?? 'Analog power amplifier', pins),
          title: identity?.entry?.label ?? identity?.option.label ?? nodeLabel(node),
          // Fed by a DAC it has no GPIO, and that is complete rather than
          // missing: its line in comes off the DAC's line out.
          supported: reasons === undefined,
          facts: {
            partId,
            stage: 'power',
            feed,
            ...(sourceTitle ? { fedBy: sourceTitle, fedByModule: sourceIdentity?.option.label ?? sourceTitle } : {}),
          },
          reasons,
        }
      }
      default:
        return buildUnsupportedItem(node, pins)
    }
  }).flat()

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

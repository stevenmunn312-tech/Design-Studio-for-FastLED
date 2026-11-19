// The shape of every part-type block a manifest may carry, mirroring the
// `Part*Spec` interfaces in ../partCatalogue.ts. A block a manifest carries is
// checked against its spec before any code reads it; the manifest test checks
// every bundled part against these, so a drift between the two fails there.

import { KEYPAD_MAX_COLUMNS, KEYPAD_MAX_ROWS } from './keypadBlock'
import { arr, bool, int, nullable, num, obj, oneOf, opt, record, str, tuple, type FieldSpec } from './fieldSpec'

const positive = () => num({ min: 0 })
const i2cAddress = () => int(0x03, 0x77)
const rgb = () => tuple(int(0, 255), int(0, 255), int(0, 255))
const rectPx = () => tuple(num(), num(), positive(), positive())

// Up to the whole 7-bit space: the PCA9685's six straps select 62 addresses.
const i2cAddresses = {
  i2cAddresses: arr(i2cAddress(), 1, 128),
  defaultI2cAddress: i2cAddress(),
}

export const RENDER_SPEC: FieldSpec = obj({
  file: str({ nonEmpty: true, maxLength: 200 }),
  widthPx: int(1, 8192),
  heightPx: int(1, 8192),
  pxPerMm: opt(positive()),
  indicators: opt(arr(obj({
    rectPx: rectPx(),
    color: rgb(),
    drive: oneOf('power', 'channel', 'signal', 'voltage'),
    channel: opt(int(0, 64)),
    colorsByVoltage: opt(record(rgb())),
  }), 0, 64)),
})

export const DIMENSIONS_SPEC: FieldSpec = obj({
  width: num({ min: 0.1, max: 5000 }),
  height: num({ min: 0.1, max: 5000 }),
})

/** Every part-type block, keyed by its property on the manifest. */
export const PART_BLOCK_SPECS = {
  // An LED product. `chipset` is checked against the type's closed list (partTypes.ts); the
  // rules across fields (which size a form needs) are `ledOutputBlockIssue`. `fullWhiteMa` is
  // per LED at `supplyVolts` and is the datasheet maximum, never a typical figure.
  ledOutput: obj({
    form: oneOf('strip', 'matrix', 'ring', 'hub75'),
    chipset: str({ nonEmpty: true, maxLength: 24 }),
    colorOrder: opt(oneOf('GRB', 'RGB', 'BGR', 'BRG', 'GBR', 'RBG')),
    supplyVolts: num({ min: 3, max: 24 }),
    fullWhiteMa: num({ min: 0.01, max: 1000 }),
    pitchMm: opt(num({ min: 0.1, max: 1000 })),
    count: opt(int(1, 4096)),
    maxCount: opt(int(1, 4096)),
    cutEvery: opt(int(1, 64)),
    width: opt(int(1, 64)),
    height: opt(int(1, 64)),
    wiring: opt(obj({
      serpentine: bool(),
      startCorner: oneOf('top-left', 'top-right', 'bottom-left', 'bottom-right'),
      firstRun: oneOf('horizontal', 'vertical'),
    })),
    diameterMm: opt(positive()),
    maxDataRateMhz: opt(num({ min: 0.1, max: 100 })),
    scan: opt(oneOf(16, 32)),
  }),
  relay: obj({
    // The relay type drives up to MAX_RELAY_CHANNELS (state/peripherals/relayModule.ts).
    channels: int(1, 8),
    coilVoltage: str(),
    trigger: str({ nonEmpty: true }),
    contacts: str(),
    contactRating: str(),
    optoIsolated: bool(),
    loadKind: oneOf('ac', 'dc', 'ac-dc'),
    leakage: str(),
    isolation: str(),
    zeroCross: opt(bool()),
    minimumLoad: opt(str()),
    channelInputLabels: opt(arr(str({ maxLength: 40 }), 0, 16)),
  }),
  mosfet: obj({
    channels: int(1, 16),
    device: str({ nonEmpty: true }),
    trigger: str({ nonEmpty: true }),
    loadSupply: str(),
    continuousCurrent: str(),
    optoIsolated: bool(),
    flybackDiode: bool(),
    channelLabels: opt(arr(str({ maxLength: 40 }), 0, 16)),
    channelInputLabels: opt(arr(str({ maxLength: 40 }), 0, 16)),
    loadTerminals: opt(arr(str({ maxLength: 40 }), 0, 32)),
    pwmHz: opt(num({ min: 1, max: 1_000_000 })),
  }),
  pdTrigger: obj({
    protocols: str(),
    selectableVoltagesV: arr(num({ min: 0, max: 60 }), 1, 16),
    defaultVoltageV: num({ min: 0, max: 60 }),
    maxCurrentA: positive(),
    maxPowerW: positive(),
    selection: str(),
  }),
  driverChip: obj({
    device: str({ nonEmpty: true }),
    package: str(),
    channels: int(1, 32),
    outputType: str(),
    inputActiveLevel: oneOf('high', 'low'),
    maxOutputVoltageV: positive(),
    maxChannelCurrentMa: positive(),
    pinout: arr(str({ maxLength: 40 }), 1, 64),
  }),
  pwmDriver: obj({
    device: str({ nonEmpty: true }),
    interface: str({ nonEmpty: true }),
    channels: int(1, 64),
    resolutionBits: int(1, 32),
    ...i2cAddresses,
    oscillatorMHz: positive(),
    minPwmHz: positive(),
    maxPwmHz: positive(),
    defaultPwmHz: positive(),
  }),
  buzzer: obj({
    type: oneOf('active', 'passive'),
    activeLevel: oneOf('high', 'low'),
    resonanceKHz: nullable(positive()),
    soundLevel: str(),
    maxCurrentMa: positive(),
  }),
  fan: obj({
    supplyVoltageV: positive(),
    maxCurrentA: positive(),
    maxRpm: positive(),
    minRpmAt20Percent: positive(),
    pwmHz: num({ min: 1, max: 1_000_000 }),
    tachPulsesPerRevolution: int(1, 16),
    tachOutput: str(),
  }),
  powerMonitor: obj({
    device: str({ nonEmpty: true }),
    interface: str({ nonEmpty: true }),
    ...i2cAddresses,
    shuntOhms: num({ min: 0.00001, max: 100 }),
    busVoltageMaxV: positive(),
    currentMaxA: positive(),
    senseSide: str(),
  }),
  presenceSensor: obj({
    device: str({ nonEmpty: true }),
    interface: str({ nonEmpty: true }),
    baud: int(300, 5_000_000),
    gateMeters: positive(),
    maxRangeMeters: positive(),
  }),
  touchSensor: obj({
    device: str({ nonEmpty: true }),
    interface: str({ nonEmpty: true }),
    activeLevel: oneOf('high', 'low'),
    mode: str(),
    supplyMinV: positive(),
    supplyMaxV: positive(),
    responseMinMs: positive(),
    responseMaxMs: positive(),
  }),
  lightSensor: obj({
    device: str({ nonEmpty: true }),
    interface: str({ nonEmpty: true }),
    ...i2cAddresses,
    maxLux: positive(),
  }),
  environmentSensor: obj({
    device: str({ nonEmpty: true }),
    interface: str({ nonEmpty: true }),
    ...i2cAddresses,
    temperatureMinC: num(),
    temperatureMaxC: num(),
    humidityMinPercent: num({ min: 0, max: 100 }),
    humidityMaxPercent: num({ min: 0, max: 100 }),
    pressureMinHpa: positive(),
    pressureMaxHpa: positive(),
  }),
  motionVectorSensor: obj({
    device: str({ nonEmpty: true }),
    interface: str({ nonEmpty: true }),
    ...i2cAddresses,
    accelRangeG: positive(),
    gyroRangeDps: positive(),
  }),
  touchPad: obj({
    device: str({ nonEmpty: true }),
    interface: str({ nonEmpty: true }),
    electrodes: int(1, 64),
    ...i2cAddresses,
    touchThreshold: int(0, 255),
    releaseThreshold: int(0, 255),
  }),
  joystick: obj({
    device: str({ nonEmpty: true }),
    interface: str({ nonEmpty: true }),
    axisPotOhms: positive(),
    switchActive: oneOf('low', 'high'),
  }),
  encoder: obj({
    device: str({ nonEmpty: true }),
    pulsesPerRevolution: int(1, 10000),
    detents: int(0, 10000),
    switchActive: oneOf('low', 'high'),
    onboardPullUps: bool(),
  }),
  distanceSensor: obj({
    device: str({ nonEmpty: true }),
    interface: str({ nonEmpty: true }),
    minMm: positive(),
    maxMm: positive(),
    triggerPulseUs: opt(positive()),
    echoVolts: opt(positive()),
    i2cAddresses: opt(arr(i2cAddress(), 1, 128)),
    defaultI2cAddress: opt(i2cAddress()),
  }),
  temperatureSensor: obj({
    device: str({ nonEmpty: true }),
    interface: str({ nonEmpty: true }),
    temperatureMinC: num(),
    temperatureMaxC: num(),
    pullUpOhms: positive(),
  }),
  // Shapes only; the sensor modules' `*SpecIssue` rules (curve monotonicity,
  // internal pull-up only when active-low) run on top, as the importer's do.
  digitalSensor: obj({
    activeLevel: oneOf('high', 'low'),
    pullUp: oneOf('none', 'internal', 'external'),
    debounceMs: int(0, 1000),
    supplyVolts: opt(positive()),
    activeLabel: str({ nonEmpty: true, maxLength: 24 }),
    idleLabel: str({ nonEmpty: true, maxLength: 24 }),
  }),
  analogSensor: obj({
    unit: str({ nonEmpty: true, maxLength: 8 }),
    supplyVolts: positive(),
    adcRange: obj({ minVolts: num({ min: 0 }), maxVolts: num({ min: 0, max: 5.5 }) }),
    curve: arr(obj({ volts: num({ min: 0, max: 5.5 }), value: num() }), 2, 16),
    outputMin: num(),
    outputMax: num(),
    decimals: opt(int(0, 4)),
  }),
  motionSensor: obj({
    activeLevel: oneOf('high', 'low'),
    holdSeconds: opt(positive()),
    supplyVolts: positive(),
  }),
  // Shapes only; `keypadBlockIssue` (./keypadBlock) checks that the legends and
  // labels match the row and column counts.
  keypad: obj({
    rows: int(1, KEYPAD_MAX_ROWS),
    columns: int(1, KEYPAD_MAX_COLUMNS),
    legends: arr(str({ nonEmpty: true, maxLength: 4 }), 1, KEYPAD_MAX_ROWS * KEYPAD_MAX_COLUMNS),
    rowLabels: arr(str({ nonEmpty: true, maxLength: 40 }), 1, KEYPAD_MAX_ROWS),
    columnLabels: arr(str({ nonEmpty: true, maxLength: 40 }), 1, KEYPAD_MAX_COLUMNS),
  }),
  irReceiver: obj({
    supplyVolts: positive(),
    carrierKHz: opt(positive()),
  }),
  ethernet: obj({
    controller: str({ nonEmpty: true }),
    interface: str({ nonEmpty: true }),
    maxSpiClockMHz: positive(),
    link: str(),
  }),
  pixelDataExtender: obj({
    mode: str(),
    maxDistanceMeters: positive(),
    maxDataRateMbps: positive(),
    supplyMinV: positive(),
    supplyMaxV: positive(),
    pairConductors: arr(str({ maxLength: 40 }), 1, 16),
  }),
  // A level shifter on an LED data line: the package's pad labels per channel and for the supply,
  // looked up among the part's own `pads`. The diagram routes four lanes per chip at most.
  levelShifter: obj({
    device: str({ nonEmpty: true, maxLength: 40 }),
    packageName: str({ nonEmpty: true, maxLength: 40 }),
    channels: int(1, 4),
    supplyMinV: positive(),
    supplyMaxV: positive(),
    inputHighMinV: positive(),
    channelPads: arr(obj({
      in: str({ nonEmpty: true, maxLength: 40 }),
      out: str({ nonEmpty: true, maxLength: 40 }),
      oe: str({ nonEmpty: true, maxLength: 40 }),
    }), 1, 4),
    vccPad: str({ nonEmpty: true, maxLength: 40 }),
    gndPad: str({ nonEmpty: true, maxLength: 40 }),
  }),
  powerConverter: obj({
    role: oneOf('controller', 'led-rail'),
    roles: opt(arr(oneOf('controller', 'led-rail'), 1, 2)),
    topology: str(),
    inputMinV: positive(),
    inputMaxV: positive(),
    minHeadroomV: num({ min: 0 }),
    outputSetV: positive(),
    continuousCurrentMa: positive(),
    peakCurrentMa: positive(),
    typicalEfficiency: num({ min: 0.01, max: 1 }),
    isolated: bool(),
    adjustable: bool(),
    outputCurrentLimit: oneOf('adjustable', 'fixed', 'none'),
    terminals: arr(str({ maxLength: 40 }), 1, 16),
    terminalPositions: opt(arr(tuple(num({ min: 0, max: 1 }), num({ min: 0, max: 1 })), 1, 16)),
    deratingCurve: opt(arr(tuple(num(), num({ min: 0, max: 100 })), 1, 32)),
  }),
  batteryCell: obj({
    chemistry: oneOf('li-ion', 'lifepo4'),
    formFactor: str(),
    nominalV: positive(),
    chargeV: positive(),
    dischargeCutoffV: positive(),
    capacityMah: positive(),
    maxContinuousDischargeMa: positive(),
    maxChargeMa: positive(),
    internalResistanceMohm: positive(),
    internalResistanceBasis: oneOf('ac-1khz', 'dc'),
    chargeTempC: tuple(num(), num()),
    dischargeTempC: tuple(num(), num()),
  }),
  batteryModule: obj({
    series: int(1, 32),
    chemistries: arr(oneOf('li-ion', 'lifepo4'), 1, 4),
    protection: opt(obj({
      continuousDischargeMa: positive(),
      continuousChargeMa: positive(),
      overchargeV: positive(),
      overDischargeV: positive(),
      port: oneOf('common', 'separate'),
      switchedLine: oneOf('negative', 'positive'),
      temperatureSensor: bool(),
      powerTerminals: arr(str({ maxLength: 40 }), 1, 16),
    })),
    balance: opt(obj({
      type: oneOf('active', 'passive'),
      balanceMa: positive(),
      standbyMa: opt(positive()),
      balanceTerminals: arr(str({ maxLength: 40 }), 1, 32),
      connectionOrder: opt(arr(str({ maxLength: 40 }), 1, 32)),
    })),
    charger: opt(obj({
      device: str({ nonEmpty: true }),
      chargeVPerCell: positive(),
      maxChargeMa: positive(),
      inputMaxW: positive(),
      inputProtocols: str(),
      bidirectional: bool(),
      batteryTerminals: tuple(str({ maxLength: 40 }), str({ maxLength: 40 })),
    })),
    output: opt(obj({
      topology: oneOf('boost', 'buck'),
      outputV: positive(),
      continuousMa: positive(),
      typicalEfficiency: num({ min: 0.01, max: 1 }),
      terminals: arr(str({ maxLength: 40 }), 1, 16),
      usbOutput: bool(),
    })),
  }),
  // A microSD card on SPI. The firmware is the same for every module; what a
  // module changes is what may be fed to it: `supplyVolts` is the rail its
  // power pad takes, and a module that is not `levelShifted` is a bare socket
  // that 5 V power or 5 V SPI can destroy.
  sdCard: obj({
    supplyVolts: num({ min: 1, max: 12 }),
    levelShifted: bool(),
  }),
  // A battery-backed real-time clock on the board's I2C bus. `device` selects
  // the register driver the firmware carries; `i2cAddress` is the address that
  // driver reads, which the bus check and the collision walk use.
  rtc: obj({
    device: str({ nonEmpty: true }),
    i2cAddress: i2cAddress(),
  }),
  // A UART-controlled audio player. `device` selects the command protocol the
  // firmware carries; the rest are its electrical and timing contract.
  uartPlayer: obj({
    device: str({ nonEmpty: true }),
    supplyMinV: positive(),
    supplyMaxV: positive(),
    maxCurrentMa: positive(),
    baud: int(300, 5_000_000),
    commandGapMs: int(1, 5000),
    bootMs: int(0, 60_000),
  }),
  // An RS-485 transceiver that receives DMX512. `rxLogicVolts` is the level
  // the receive output swings to: above 3.6 V the build draws the divider that
  // brings it down to a 3.3 V controller pin.
  rs485: obj({
    device: str({ nonEmpty: true }),
    supplyVolts: num({ min: 1, max: 12 }),
    rxLogicVolts: num({ min: 1, max: 12 }),
    terminationFitted: bool(),
    terminationRef: opt(str({ maxLength: 8 })),
  }),
  // A DIN-5 MIDI receiver on a UART RX pin. `isolated` says an optocoupler
  // separates the cable from the controller; `inputSocket` is which socket of
  // the board is MIDI IN.
  midiDin: obj({
    device: str({ nonEmpty: true }),
    supplyVolts: num({ min: 1, max: 12 }),
    isolated: bool(),
    inputSocket: oneOf('left', 'right'),
  }),
  // The two FastLED words are interpolated into the sketch, so they are a closed list
  // (the factories and profiles the pinned FastLED ships), never free text.
  microphone: obj({
    device: str({ nonEmpty: true }),
    fastledFactory: opt(oneOf('CreateInmp441', 'CreateIcs43434', 'CreateGenericMEMS')),
    fastledProfile: opt(oneOf('INMP441', 'ICS43434', 'GenericMEMS')),
    captureAdapter: opt(oneOf('sph0645-classic-esp32')),
  }),
  lineInput: obj({
    device: str({ nonEmpty: true }),
    channels: int(1, 2),
  }),
  i2sAudio: obj({
    device: str({ nonEmpty: true }),
    output: oneOf('speaker', 'line'),
  }),
  powerAmp: obj({
    device: str({ nonEmpty: true }),
    supplyVolts: num({ min: 1, max: 60 }),
    channels: int(1, 8),
    inputKind: oneOf('line'),
  }),
  // A colour TFT module's bench values; the chip's RAM and init sequence stay in code, and the
  // glass size is the `display` block's. `tftPanelBlockIssue` checks that the glass fits the chip.
  tftPanel: obj({
    colorOrder: oneOf('RGB', 'BGR'),
    mirroredColumns: bool(),
    invert: bool(),
    columnOffset: opt(int(0, 8192)),
    rowOffset: opt(int(0, 8192)),
  }),
  display: obj({
    controller: str({ nonEmpty: true }),
    resolutionPx: tuple(int(1, 8192), int(1, 8192)),
    interface: str({ nonEmpty: true }),
    touchController: nullable(str()),
    touchSurface: opt(nullable(oneOf('resistive-shared'))),
    screensPx: opt(arr(rectPx(), 1, 64)),
  }),
} as const satisfies Record<string, FieldSpec>

export type PartBlockKey = keyof typeof PART_BLOCK_SPECS

export const PART_BLOCK_KEYS = Object.keys(PART_BLOCK_SPECS) as PartBlockKey[]

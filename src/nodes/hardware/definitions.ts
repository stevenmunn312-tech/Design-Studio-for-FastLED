// Hardware node definitions: the portless power, network, clock and DMX/MIDI
// interface parts. They
// carry no signal, live only in the hardware view and never in the sidebar
// (see isHardwareLibraryHiddenNodeType), and are found by scanning the graph.
import type { NodeDefinition } from '../../types'
import { PD_TRIGGER_PART_ID, pdTriggerSpec } from '../../state/peripherals/pdTrigger'
import { DEFAULT_POWER_CONVERTER_PART_ID, DEFAULT_SOURCE_VOLTAGE } from '../../state/peripherals/powerConverter'
import { DEFAULT_BATTERY_CELL_PART_ID } from '../../state/peripherals/battery'
import { DEFAULT_RTC_MODULE_PART_ID, RTC_MODULE_NODE_TYPE } from '../../state/peripherals/rtcModule'
import { DMX_TRANSCEIVER_NODE_TYPE, DMX_TRANSCEIVER_PART_ID } from '../../state/peripherals/dmxTransceiver'
import { MIDI_DIN_PART_ID, MIDI_INTERFACE_NODE_TYPE } from '../../state/peripherals/midiSource'

export const HARDWARE_DEFINITIONS: NodeDefinition[] = [
  {
    // The battery-backed DS3231 real-time clock. It carries no signal: a Clock
    // set to DS3231 reads it, the way Audio reads a Microphone, so time is read
    // in one place. Its I2C pins join the board's one Wire bus and come from
    // the board's default pair. See state/peripherals/rtcModule.ts.
    //
    // Config only, like SD Card: no ports, no evaluation, found by scanning.
    type: RTC_MODULE_NODE_TYPE,
    label: 'DS3231 RTC',
    category: 'hardware',
    inputs: [],
    outputs: [],
    defaultProperties: {
      partId: DEFAULT_RTC_MODULE_PART_ID,
      // Classic-ESP32 Wire defaults; adding the part and every board change
      // move it to the selected board's own I2C pair.
      sdaPin: 21,
      sclPin: 22,
    },
  },
  {
    // The RS-485 transceiver a DMX512 line arrives through. It carries no
    // signal: a DMX / Art-Net node set to DMX512 reads it, the way a Clock set
    // to DS3231 reads its module, so the universe arrives in one place. Its
    // three GPIOs come from the board's free pins; its UART from the allocator
    // (build/pins/uartAssignment.ts). See state/peripherals/dmxTransceiver.ts.
    //
    // Config only, like SD Card: no ports, no evaluation, found by scanning.
    type: DMX_TRANSCEIVER_NODE_TYPE,
    label: 'DMX Transceiver',
    category: 'hardware',
    inputs: [],
    outputs: [],
    defaultProperties: {
      partId: DMX_TRANSCEIVER_PART_ID,
      // Classic-ESP32 fallbacks; adding the part and every board change hand
      // out free pins through its pin plan.
      dmxTxPin: 17,
      dmxRxPin: 16,
      dmxEnablePin: 21,
    },
  },
  {
    // The DIN MIDI jack. It carries no signal: every MIDI node set to DIN on
    // the board reads it through one shared reader, so the jack's bytes are
    // parsed once. Its RX GPIO comes from the board's free pins; its UART from
    // the allocator. See state/peripherals/midiSource.ts.
    //
    // Config only, like SD Card: no ports, no evaluation, found by scanning.
    type: MIDI_INTERFACE_NODE_TYPE,
    label: 'MIDI Interface',
    category: 'hardware',
    inputs: [],
    outputs: [],
    defaultProperties: {
      partId: MIDI_DIN_PART_ID,
      midiRxPin: 16,
    },
  },
  {
    // Wired Ethernet for the sketch's network. It carries no signal: every
    // network user reaches the network through this module instead of Wi-Fi
    // when it is on the bench, still as the Board (its hostname and address).
    // See state/peripherals/ethernetModule.ts.
    //
    // Config only, like SD Card: no ports, no evaluation, found by scanning.
    type: 'EthernetModule',
    label: 'Ethernet',
    category: 'hardware',
    inputs: [],
    outputs: [],
    defaultProperties: {
      partId: 'wiz850io-ethernet-module',
      // Classic-ESP32 fallbacks; adding the part and every board change hand
      // out free pins through its pin plan. Not HSPI's customary 12-15: the
      // module has the host to itself through the GPIO matrix, and GPIO12 and
      // GPIO15 are strapping pins — MISO held high on GPIO12 at reset selects
      // the wrong flash voltage. MISO, which only reads, takes input-only 35.
      sckPin: 25,
      mosiPin: 26,
      misoPin: 35,
      csPin: 32,
      intPin: 33,
      resetPin: 27,
    },
  },
  {
    // A DC-DC converter from a higher-voltage source to 5 V. It carries no
    // signal: the Build Diagram reads the selected part's role to power either
    // the controller or the LED rail. See state/peripherals/powerConverter.ts.
    //
    // Config only, like SD Card: no ports, no evaluation, found by scanning.
    type: 'PowerConverter',
    label: 'DC-DC Converter',
    category: 'hardware',
    inputs: [],
    outputs: [],
    defaultProperties: {
      partId: DEFAULT_POWER_CONVERTER_PART_ID,
      sourceVoltage: DEFAULT_SOURCE_VOLTAGE,
    },
  },
  {
    // Physical DC source. Cell count and exact cell are the only authored
    // facts; voltage, capacity, energy and current are derived from catalogue data.
    type: 'BatteryPack',
    label: 'Battery Pack',
    category: 'hardware',
    inputs: [],
    outputs: [],
    defaultProperties: {
      partId: DEFAULT_BATTERY_CELL_PART_ID,
      series: 4,
      parallel: 1,
    },
  },
  {
    // One real pack board. Its catalogue block declares every function it has.
    type: 'BatteryModule',
    label: 'Pack Electronics',
    category: 'hardware',
    inputs: [],
    outputs: [],
    defaultProperties: {
      partId: 'hx-4s-f30a-bms-balance',
    },
  },
  {
    // A USB-C PD trigger: the upstream DC source. It carries no signal; the
    // electrical plan reads the voltage it requests and checks it against the
    // converter it feeds. Config only, like the converter. See state/peripherals/pdTrigger.ts.
    type: 'PdTriggerSource',
    label: 'USB-C PD Trigger',
    category: 'hardware',
    inputs: [],
    outputs: [],
    defaultProperties: {
      partId: PD_TRIGGER_PART_ID,
      requestedVoltage: String(pdTriggerSpec(PD_TRIGGER_PART_ID).defaultVoltageV),
    },
  },
]

export const HARDWARE_DESCRIPTIONS: Record<string, string> = {
  RtcModule: 'Battery-backed DS3231 clock for a Clock set to DS3231; a bench part.',
  DmxTransceiver: 'MAX485 RS-485 transceiver for a DMX node set to DMX512; a bench part.',
  MidiInterface: 'DIN MIDI jack for every MIDI node set to DIN; a bench part.',
  EthernetModule: 'Wired Ethernet for the board\'s whole network in place of Wi-Fi; a bench part.',
  PowerConverter: 'Converts a DC source to 5 V for the controller or LED rail.',
  BatteryPack: 'Defines a lithium pack from an exact cell and its series-parallel count.',
  BatteryModule: 'Adds pack protection, balancing, charging, or an integrated 5 V output.',
  PdTriggerSource: 'Asks a USB-C charger for a fixed voltage to feed a converter or load.',
}

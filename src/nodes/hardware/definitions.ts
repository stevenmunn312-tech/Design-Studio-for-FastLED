// Hardware node definitions: the portless power and network parts. They
// carry no signal, live only in the hardware view and never in the sidebar
// (see isHardwareLibraryHiddenNodeType), and are found by scanning the graph.
import type { NodeDefinition } from '../../types'
import { PD_TRIGGER_PART_ID, pdTriggerSpec } from '../../state/peripherals/pdTrigger'
import { DEFAULT_POWER_CONVERTER_PART_ID, DEFAULT_SOURCE_VOLTAGE } from '../../state/peripherals/powerConverter'
import { DEFAULT_BATTERY_CELL_PART_ID } from '../../state/peripherals/battery'

export const HARDWARE_DEFINITIONS: NodeDefinition[] = [
  {
    // Wired Ethernet for the sketch's network. It carries no signal: Art-Net
    // receive and NTP time sync keep their own settings and simply reach the
    // network through this module instead of Wi-Fi when it is on the bench.
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
  EthernetModule: 'Wired Ethernet for Art-Net and NTP, in place of Wi-Fi; a bench part, not wired.',
  PowerConverter: 'Converts a DC source to 5 V for the controller or LED rail.',
  BatteryPack: 'Defines a lithium pack from an exact cell and its series-parallel count.',
  BatteryModule: 'Adds pack protection, balancing, charging, or an integrated 5 V output.',
  PdTriggerSource: 'Asks a USB-C charger for a fixed voltage to feed a converter or load.',
}

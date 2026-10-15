import { example } from './example'
import type { NodeReferenceMap } from './types'

const NO_PIXELS = 'The LED preview is unchanged: this part changes the wiring plan, power checks or firmware rather than the picture.'

export const HARDWARE_REFERENCE: NodeReferenceMap = {
  EthernetModule: {
    overview: [
      'Ethernet adds a W5500 wired network module, so the board reaches the network over an RJ45 cable instead of Wi-Fi. Art-Net and NTP use it when it is on the bench.',
      'A cable is steadier than Wi-Fi for a lighting rig. The module talks to the board over SPI, using its own chip-select, interrupt and reset lines.',
    ],
    steps: [
      'Add Ethernet from the Hardware tab.',
      'Wire SCLK, MOSI, MISO, SCNn, INTn and RSTn to the pins shown, plus power and ground as the Build Diagram shows.',
      'Plug in a network cable. Network nodes such as DMX / Art-Net use it automatically.',
    ],
    outcome: NO_PIXELS,
    example: example({
      featured: 'EthernetModule',
      title: 'Receive Art-Net over a cable',
      nodes: {
        ethernet: ['EthernetModule'],
        dmx: ['DMXInput', { inputMode: 'Art-Net', universe: 0, previewPort: 6454 }],
        channel: ['DMXChannel', { channel: 1 }],
        base: ['Pacifica', { palette: 'ocean' }],
        level: ['BrightnessMod'],
      },
      wires: ['dmx.dmx > channel.dmx', 'base.frame > level.frame', 'channel.value > level.brightness'],
      explanation: 'Ethernet carries no wires: with the W5500 on the bench, the flashed sketch reaches the lighting network over its cable instead of Wi-Fi. The DMX / Art-Net node is unchanged, and channel 1 still fades Pacifica through Brightness.',
      preview: 'The {output} is the same as with Wi-Fi: send universe 0, channel 1 to fade Pacifica up from black.',
    }),
  },

  PowerConverter: {
    overview: [
      'DC-DC Converter turns a higher DC supply into 5 V. The LM2596 module powers the controller through its 5 V pin in place of USB; the Mean Well SD-100 makes isolated 5 V power zones for the LEDs from 12 V or 24 V.',
      'Source Volts must sit inside the module’s input range and above its output by the dropout. The Build Diagram draws the converter with its input and output protection and checks it against the load.',
    ],
    steps: [
      'Add the converter from the Hardware tab and choose the module.',
      'Set Source Volts to the supply feeding it.',
      'Wire it as the Build Diagram shows, with the fuse and wire sizes it gives.',
    ],
    outcome: NO_PIXELS,
    example: example({
      featured: 'PowerConverter',
      title: 'Power the controller from 12 V',
      nodes: {
        converter: ['PowerConverter', { partId: 'lm2596-buck-module', sourceVoltage: 12 }],
        pattern: ['Juggle'],
      },
      explanation: 'DC-DC Converter carries no wires. The LM2596 option powers the controller through its 5 V pin in place of USB; the pattern and the LED output are unchanged.',
      preview: 'The {output} is unchanged. Open the Build Diagram to see the converter under the board.',
      workflow: true,
    }),
  },

  BatteryPack: {
    overview: [
      'Battery Pack defines a lithium pack from an exact cell and how many are wired in series and in parallel. Series sets the voltage; parallel strings add capacity and current.',
      'The Build Diagram uses it to work out the pack’s voltage window, current, fuse and runtime, and sizes every converter at the pack’s lowest protected voltage. Protection, balancing and charging come from Pack Electronics boards, which must match the series count.',
    ],
    steps: [
      'Add the pack from the Hardware tab, choose the cell, and set series and parallel counts.',
      'Add Pack Electronics for protection, balancing and charging, and a converter for the 5 V rail.',
      'Check the Build Diagram’s battery rules before building.',
    ],
    outcome: NO_PIXELS,
    example: example({
      featured: 'BatteryPack',
      title: 'Plan a protected 4S LED supply',
      nodes: {
        pack: ['BatteryPack', { partId: 'samsung-inr18650-35e', series: 4, parallel: 2 }],
        bms: ['BatteryModule', { partId: 'hx-4s-f30a-bms-balance' }],
        charger: ['BatteryModule', { partId: 'ip2368-100w-bidirectional-charger' }],
        converter: ['PowerConverter', { partId: 'dgxby-20a-5v-buck-converter' }],
        pattern: ['Juggle'],
      },
      explanation: 'Battery Pack combines eight 18650 cells as 4S2P. Two Pack Electronics boards add protection with balancing and charging, and a converter makes the 5 V LED rail. Battery parts add no firmware.',
      preview: 'The {output} is unchanged. Open the Build Diagram to see the voltage window, pack current, fuse and runtime.',
      workflow: true,
    }),
  },

  BatteryModule: {
    overview: [
      'Pack Electronics is one physical board that does one or more jobs for a battery pack: protection, cell balancing, charging, or an integrated 5 V output.',
      'Choose the exact board on the bench; its functions and terminals come with it. A board that already does a job means you must not add a second board for it.',
    ],
    steps: [
      'Add the board from the Hardware tab and choose the exact module.',
      'Make sure its series count matches the Battery Pack.',
    ],
    outcome: NO_PIXELS,
    example: example({
      featured: 'BatteryModule',
      title: 'One board for several pack jobs',
      nodes: {
        pack: ['BatteryPack', { partId: 'samsung-inr18650-35e', series: 1, parallel: 1 }],
        module: ['BatteryModule', { partId: 'ip5305t-1s-power-module' }],
        pattern: ['Juggle'],
      },
      explanation: 'This Pack Electronics board, an IP5305T module, protects and charges a single-cell pack and makes the 5 V rail, so those jobs must not be repeated by other boards.',
      preview: 'The {output} is unchanged. The Build Diagram reads every function and terminal from the chosen board.',
      workflow: true,
    }),
  },

  PdTriggerSource: {
    overview: [
      'USB-C PD Trigger asks a USB-C Power Delivery charger for a fixed voltage — 5, 9, 12, 15 or 20 V — so an ordinary laptop or phone charger can power a converter or a 12 V load.',
      'The voltage is set on the board itself with its button or solder pads. Set the same value here, and on the converter it feeds; the Build Diagram checks that they agree.',
    ],
    steps: [
      'Add the trigger from the Hardware tab and set the requested voltage to match the board.',
      'Set the converter’s source volts to the same value.',
    ],
    outcome: NO_PIXELS,
    example: example({
      featured: 'PdTriggerSource',
      title: 'Feed a converter from a USB-C charger',
      nodes: {
        trigger: ['PdTriggerSource', { partId: 'zy12pdn-usb-c-pd-trigger', requestedVoltage: '12' }],
        converter: ['PowerConverter', { partId: 'lm2596-buck-module', sourceVoltage: 12 }],
        pattern: ['Juggle'],
      },
      explanation: 'USB-C PD Trigger records the 12 V the ZY12PDN asks the charger for, and the converter says it is fed 12 V. The Build Diagram checks the two agree. It adds no firmware.',
      preview: 'The {output} is unchanged. Change the converter to 24 V and the Build Diagram warns that the two disagree.',
      workflow: true,
    }),
  },
}

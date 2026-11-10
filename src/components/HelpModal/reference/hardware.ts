import { example } from './example'
import type { NodeReferenceMap } from './types'

const NO_PIXELS = 'The LED preview is unchanged: this part changes the wiring plan, power checks or firmware rather than the picture.'

export const HARDWARE_REFERENCE: NodeReferenceMap = {
  RtcModule: {
    overview: [
      'DS3231 RTC is a battery-backed real-time clock on the board’s I2C bus. It keeps the date and time through a power cut, so a schedule or a clock face is right the moment the board starts, with no network.',
      'It has no outputs of its own: a Clock node set to the DS3231 time source reads it, the way the Audio node reads a microphone, so the time of day is read in one place. Every Clock on the board set to DS3231 shares the one module.',
    ],
    steps: [
      'Add a DS3231 from the Hardware tab’s Clocks shelf. If the graph has no Clock yet, one set to DS3231 comes with it.',
      'Wire 3V3, GND, SDA and SCL to the pins the Build Diagram shows; it shares SDA and SCL with any other I2C part.',
      'Upload, then use Set from computer on the Clock to write the date and time to the module once.',
    ],
    outcome: 'The clock keeps time through a power cut. In the preview the browser clock stands in for the module.',
    example: example({
      featured: 'RtcModule',
      title: 'A clock that survives a power cut',
      nodes: {
        ds3231: ['RtcModule'],
        clock: ['RTCInput', { timeSource: 'DS3231' }],
        daylight: ['Expression', { formula: '1800 + 4700*(0.5 - 0.5*cos(a/86400*2*PI))' }],
        white: ['Temperature'],
        fill: ['SolidColor'],
      },
      wires: ['clock.secondsOfDay > daylight.a', 'daylight.result > white.kelvin', 'white.color > fill.color'],
      explanation: 'The DS3231 RTC carries no wires: the Clock set to DS3231 reads it. Expression turns the seconds since midnight into a colour temperature, warm at night and daylight-cool at noon, and the time is still right after the power has been off.',
      preview: 'The {output} is filled with the white for the current time. The preview reads the browser clock in place of the module.',
    }),
  },

  DmxTransceiver: {
    overview: [
      'DMX Transceiver is the MAX485 RS-485 board a wired DMX512 line arrives through, from the XLR cable of a lighting desk.',
      'It has no outputs of its own: a DMX / Art-Net node set to DMX512 reads it, the way a Clock reads its DS3231, so the universe arrives in one place. Studio gives it three free pins and a UART no other part on the board reads, so there is no port to pick.',
      'The board runs on 5 V, so its RO pad reaches the controller through a 1 kΩ / 2 kΩ divider, and RE is bridged to DE so one pin holds it listening.',
    ],
    steps: [
      'Add the MAX485 DMX transceiver from the Hardware tab’s DMX & MIDI shelf. If the graph has no DMX node yet, one set to DMX512 comes with it.',
      'Wire RO, DI and DE as the Build Diagram shows, with the divider on RO and the RE–DE jumper, and the XLR cable to A, B and GND.',
      'Keep the fitted 120 Ω terminator only if this is the last device on the DMX line.',
    ],
    outcome: 'The board reads the desk’s universe over the cable. In the preview the DMX node still listens for Art-Net, since the browser cannot hear the wire.',
    example: example({
      featured: 'DmxTransceiver',
      title: 'A desk fader on a cable',
      nodes: {
        max485: ['DmxTransceiver'],
        dmx: ['DMXInput', { inputMode: 'DMX512', universe: 1 }],
        fader: ['DMXChannel', { channel: 5 }],
        fire: ['Fire'],
        level: ['BrightnessMod'],
      },
      wires: ['dmx.dmx > fader.dmx', 'fire.frame > level.frame', 'fader.value > level.brightness'],
      explanation: 'The DMX Transceiver carries no wires: the DMX / Art-Net node set to DMX512 reads it. Channel 5 of the desk’s universe, picked out by DMX Channel, fades a fire up and down through Brightness.',
      preview: 'With nothing sending, channel 5 reads 0 and the {output} is dark. The preview listens for Art-Net, so send universe 1 from an app to try it; the board reads the same channel off the cable.',
    }),
  },

  MidiInterface: {
    overview: [
      'MIDI Interface is Adafruit’s MIDI FeatherWing: two DIN-5 sockets and an H11L1MS optocoupler that keeps a keyboard’s cable isolated from the board.',
      'It has no outputs of its own: every MIDI node set to DIN reads it, through one shared reader, so several nodes can watch different keys on the one jack. Studio gives it a free RX pin and a UART no other part on the board reads.',
      'Only 3.3V, GND and MIDI_RX are wired. The optocoupler pulls MIDI_RX up to the wing’s own 3.3 V, so it needs no divider.',
    ],
    steps: [
      'Add the MIDI FeatherWing from the Hardware tab’s DMX & MIDI shelf. If the graph has no MIDI node yet, one set to DIN comes with it.',
      'Wire 3.3V, GND and MIDI_RX as the Build Diagram shows.',
      'Plug the keyboard’s MIDI OUT into the left socket, MIDI IN.',
    ],
    outcome: 'A keyboard plays the finished build with no computer. In the preview the MIDI nodes still read Web MIDI and their own pads.',
    example: example({
      featured: 'MidiInterface',
      title: 'Strike sparks from a keyboard',
      nodes: {
        wing: ['MidiInterface'],
        keys: ['MidiInput', { midiSource: 'DIN (UART)', note: 48, cc: 74 }],
        sparks: ['Lightning', { color: '#ffd27a' }],
      },
      wires: ['keys.gate > sparks.trigger', 'keys.note > sparks.intensity'],
      explanation: 'The MIDI Interface carries no wires: the MIDI node set to DIN reads the jack through it. Each press of the C below middle C strikes a warm spark, and how hard it is played sets how bright the spark flashes.',
      preview: 'The {output} is dark until a key is played. Press the MIDI node’s Play note pad, or a key on a Web MIDI controller, to strike a spark.',
    }),
  },

  EthernetModule: {
    overview: [
      'Ethernet adds a W5500 wired network module, so the board reaches the network over an RJ45 cable instead of Wi-Fi. Every network node uses it when it is on the bench: Art-Net and sACN, DDP, the Web Remote, NTP clock sync, Frame Stream and internet radio.',
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
        dmx: ['DMXInput', { inputMode: 'Art-Net', universe: 0, udpPort: 6454 }],
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
      'When the bench already says what feeds it, the converter takes that instead of a typed value: a Battery Pack is its source, and so is a single USB-C PD trigger, at the voltage the trigger requests. Its settings then show the source rather than asking for it.',
    ],
    steps: [
      'Add the converter from the Hardware tab and choose the module.',
      'Set Source Volts to the supply feeding it, unless a Battery Pack or a PD trigger on the bench already supplies it.',
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
      'The voltage is set on the board itself with its button or solder pads. Set the same value here; the converter it feeds takes it as its source voltage, so it is entered once.',
    ],
    steps: [
      'Add the trigger from the Hardware tab and set the requested voltage to match the board.',
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

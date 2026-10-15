import { example, MATRIX, RING, STRIP } from './example'
import type { NodeReferenceMap } from './types'

const DISPLAY_IN = 'One Display wire from the source the screen reports on. The source decides what it shows.'

export const OUTPUT_REFERENCE: NodeReferenceMap = {
  Board: {
    overview: [
      'Board names the exact controller the build is for — not just the chip, but the board in your hand, with its header layout, its pins and what it supports. Choose it from the Hardware shelf.',
      'Pin advice, the Build Diagram, upload settings and feature checks all read it. Its settings are build-wide: the master brightness every output is scaled by, the frame rate the sketch runs at, a power cap, PSRAM and serial options, and telemetry for bench testing.',
      'Board carries no wires. There is one per build.',
    ],
    steps: [
      'Open the Hardware tab and choose your exact board from the shelf.',
      'Set the master brightness and frame rate. Turn on the power cap and give it your supply’s current if the LEDs could draw more than it can give.',
    ],
    propertyNote: 'The power cap dims the LEDs on the board itself; the live preview is not dimmed. PSRAM and serial options are usually best left on Auto.',
    outcome: 'Board changes pin checks, the Build Diagram and the upload, not the pixels.',
    example: example({
      featured: 'Board',
      title: 'Name the controller the patch is built for',
      nodes: {
        board: ['Board'],
        pattern: ['Pride2015', { speed: 0.4 }],
      },
      explanation: 'Board sits on the bench with no wires: it says which controller the rest of the graph is built for. Choosing it is what makes pin advice match the header in your hand and what the Build Diagram draws.',
      preview: 'The {output} shows Pride 2015 unchanged; Board affects the build rather than the picture.',
      workflow: true,
    }),
  },

  MatrixOutput: {
    overview: [
      'The LED output is where a graph becomes light. Its form — a string, a matrix, a ring, a corkscrew, or a HUB75 panel — is chosen on the bench, and the node retitles itself to match: LED String, LED Matrix, LED Ring.',
      'It holds everything about the physical LEDs: chipset, colour order, data pin, size and layout (serpentine rows, tiled panels, custom maps, positioned strings), colour correction, white point and dithering. Its frame is what the preview shows and what the sketch sends.',
      'It also takes live controls: Enabled for a blackout, Brightness as its own dimmer on top of the Board’s master level, and a Controls bundle or step buttons from a panel or remote. Its Display output reports its state to a screen.',
    ],
    steps: [
      'Add the LED output from the Hardware tab and choose its form, chipset and size.',
      'Wire the data pin, power and ground as the Build Diagram shows. Size the supply for full white.',
      'Wire the frame you want to see into Frame.',
    ],
    inputs: {
      frame: 'The picture to show.',
      controls: 'A Controls bundle: blackout toggle and brightness from Player Controls or a touch screen.',
    },
    outputs: {
      display: 'This output’s name, on/blackout state and level, for a Segment Display, Info Display or Display Panel.',
    },
    propertyNote: 'Only the fields for the chosen form and layout are used. Correction, white point and dithering change the LEDs, not the preview.',
    example: example({
      featured: 'MatrixOutput',
      title: 'A finished build with a dimmer and a blackout button',
      nodes: {
        sea: ['Pacifica', { palette: 'ocean' }],
        dimmer: ['PotInput'],
        blackout: ['ButtonInput'],
        output: ['MatrixOutput', MATRIX(16, 16)],
      },
      wires: ['sea.frame > output.frame', 'dimmer.value > output.brightness', 'blackout.pressed > output.ledToggle'],
      explanation: 'The LED Matrix takes Pacifica on its Frame input and two controls of its own: a Potentiometer as its dimmer and a Button that toggles blackout with each press. No extra nodes are needed for either.',
      preview: 'The {output} shows Pacifica at half brightness. Turn the knob to dim it, and press the Button node to black it out and back.',
    }),
  },

  StereoVuMeter: {
    overview: [
      'Stereo VU Meter drives two separate addressable strings as left and right level rails — the classic hi-fi meter — from one Audio wire. It is its own fixture, beside the main LED output rather than part of its frame.',
      'Twelve looks are built in, from the classic ladder and peak caps to comets, centre bursts and beat sparks. It can hold one, cycle on a timer or on beats, or shuffle. Gain, noise gate, response curve, attack, release and peak hold shape how the bars move.',
      'Mono sources move both rails together; a stereo source such as Line In or the decoder moves them independently. A power cap shared by both rails keeps a loud track from browning out the supply.',
    ],
    steps: [
      'Add the Stereo VU Meter from the Hardware tab and wire each rail’s data pin.',
      'Choose which LED output it flanks, if any, so the preview draws the rails beside it.',
      'Wire an Audio node into it.',
    ],
    inputs: {
      audio: 'The sound to meter, from an Audio node.',
    },
    example: example({
      featured: 'StereoVuMeter',
      title: 'Level rails flanking a spectrum display',
      nodes: {
        line: ['LineInput'],
        rails: ['StereoVuMeter', { visualizationMode: 'Peak Cap', visualizationPolicy: 'Manual', palette: 'synthwave' }],
        bars: ['SpectrumVisualizer', { style: 'Bars', palette: 'synthwave' }],
      },
      wires: ['line.audio > rails.audio', 'line.audio > bars.audio'],
      explanation: 'One line-input Audio node drives both the main LED Matrix, through Spectrum Visualizer, and the Stereo VU Meter, whose left and right rails show each channel with a falling peak cap.',
      preview: 'Play a stereo track into the line input. The {output} shows spectrum bars, and the separate VU Meter node shows its two rails bouncing with each channel.',
    }),
  },

  RelayOutput: {
    overview: [
      'Relay Module switches mains or other separate loads — a lamp, a pump, a motor — through one to eight relays, each driven by a true/false signal.',
      'Common relay boards are active-low; the sketch handles that and holds every relay off from power-up until its pin is set up, so nothing clicks on during boot. Choose the exact 1, 2, 4 or 8-channel board on the bench.',
      'Mains wiring is dangerous. Use an enclosed, rated relay module and keep mains away from the low-voltage side.',
    ],
    steps: [
      'Add the relay board from the Hardware tab and choose how many channels it has.',
      'Wire VCC, GND and each IN pin to the GPIOs shown.',
      'Wire a true/false signal into each channel you use.',
    ],
    inputs: {
      channel1: 'True energises relay 1.',
    },
    example: example({
      featured: 'RelayOutput',
      title: 'One button for the LEDs and the lamp',
      nodes: {
        button: ['ButtonInput'],
        power: ['Trigger', { triggerOp: 'toggle', initialState: true }],
        relay: ['RelayOutput', { in1Pin: 5 }],
        glow: ['Pride2015', { speed: 0.35 }],
      },
      wires: ['button.pressed > power.trigger', 'power.out > relay.channel1', 'power.out > output.enabled', 'glow.frame > output.frame'],
      explanation: 'A Trigger set to Toggle turns each press of the Button into on or off. The same state switches channel 1 of the Relay Module — and the lamp plugged into it — and the LED output’s Enabled input, so one button turns the whole display on and off together.',
      preview: 'The {output} shows Pride 2015 with the relay on. Press the Button node to switch both off, and again to switch both on.',
    }),
  },

  PowerSwitchOutput: {
    overview: [
      'Power Switch turns DC loads on and off, or dims them, through MOSFET channels: 12 V lamps, plain LED tape, fans, valves. On switches a channel and Level dims it with PWM.',
      'Choose the board on the bench. The single LR7843 module is opto-isolated and switches 6–28 V; the MonkMakes Mosfetti has four smaller channels with flyback diodes; the YYNMOS-4 has four opto-isolated 5 A channels but needs a 7–28 V supply. Motors and coils need a flyback diode where the board has none.',
      'The sketch holds every channel off until setup has configured its pin, so nothing pulses on at boot.',
    ],
    steps: [
      'Add the MOSFET board from the Hardware tab.',
      'Wire each signal pin to the GPIO shown. Wire the load between its supply and the board’s output, and follow the Build Diagram for grounds.',
    ],
    inputs: {
      on: 'True turns channel 1 on.',
    },
    example: example({
      featured: 'PowerSwitchOutput',
      title: 'Dim a 12 V string of fairy lights beside the matrix',
      nodes: {
        button: ['ButtonInput'],
        knob: ['PotInput'],
        mosfet: ['PowerSwitchOutput', { signalPin: 25 }],
        twinkle: ['TwinkleFox', { palette: 'emberglow', density: 0.5 }],
      },
      wires: ['button.pressed > mosfet.on', 'knob.value > mosfet.level'],
      explanation: 'Power Switch drives a plain 12 V fairy-light string on one MOSFET channel: the Button switches it on while held and the Potentiometer dims it. The matrix shows matching warm twinkles.',
      preview: 'The {output} shows warm twinkles. Hold the Button node and turn the knob: the Power Switch node’s Load bar shows how much power the fairy lights get.',
    }),
  },

  PwmDriverOutput: {
    overview: [
      'PWM Driver sets sixteen PWM levels from one PCA9685 chip over I2C — for single-colour LEDs, dimmable lamps through MOSFETs, or hobby servos.',
      'Wire a 0–1 level into any channel: 0 is off, 1 fully on. Only wired channels are written, and the chip keeps each waveform running between updates. Every channel shares one frequency: about 1000 Hz for LEDs, about 50 Hz for servos.',
      'Give each PCA9685 on the bus its own address with the A0–A5 jumpers.',
    ],
    steps: [
      'Add the PCA9685 board from the Hardware tab.',
      'Wire VCC, GND, SDA and SCL to the controller, and V+ to the supply for the loads.',
    ],
    example: example({
      featured: 'PwmDriverOutput',
      title: 'Two lamps breathing out of step',
      nodes: {
        first: ['Wave', { frequency: 0.2, amplitude: 1, unipolar: true }],
        second: ['Wave', { frequency: 0.2, amplitude: 1, unipolar: true, phase: 0.5 }],
        driver: ['PwmDriverOutput', { i2cAddress: '0x40', pwmHz: 1000 }],
        glow: ['Breathe', { bpm: 12, palette: 'amethyst', minLevel: 0.3 }],
      },
      wires: ['first.result > driver.channel0', 'second.result > driver.channel1'],
      explanation: 'Two Waves half a cycle apart drive PWM Driver channels 0 and 1, so two lamps on the PCA9685 breathe in turn — one brightening as the other fades. The matrix breathes along with them.',
      preview: 'The {output} breathes in violet. The browser makes no PWM; on the board, channels 0 and 1 swell alternately.',
    }),
  },

  DarlingtonDriverOutput: {
    overview: [
      'Darlington Driver switches up to eight loads to ground through a ULN2803A — relays, solenoids, small lamps, buzzers — each from a true/false signal.',
      'A true channel pulls its output to ground, so wire each load between its own supply and the output, and join the load supply’s ground to the controller’s. The array only sinks current and has built-in flyback diodes for inductive loads.',
      'The sketch holds every input low through reset and setup so no load pulses on at boot.',
    ],
    steps: [
      'Add the ULN2803A from the Hardware tab.',
      'Wire each input pin to the GPIO shown and GND to ground. Connect COM to the load supply for inductive loads.',
    ],
    example: example({
      featured: 'DarlingtonDriverOutput',
      title: 'Blink a 12 V warning beacon',
      nodes: {
        tick: ['Interval', { interval: 0.5 }],
        blink: ['Trigger', { triggerOp: 'toggle' }],
        driver: ['DarlingtonDriverOutput', { drive1Pin: 4 }],
        warning: ['Scanner', { palette: 'citrus', width: 3, speed: 0.6 }],
      },
      wires: ['tick.pulse > blink.trigger', 'blink.out > driver.channel1'],
      output: STRIP(30),
      explanation: 'Interval ticks twice a second and a Trigger set to Toggle flips on each tick, so Darlington Driver channel 1 switches a 12 V beacon on and off. The LED string sweeps amber alongside it.',
      preview: 'The {output} shows an amber beam sweeping; on the board the beacon on channel 1 blinks once a second.',
    }),
  },

  BuzzerOutput: {
    overview: [
      'Buzzer sounds a buzzer while Sound is true. Pick the module on the bench: the KY-012 active buzzer beeps at its own fixed pitch; the KY-006 passive buzzer plays the Pitch you set, in hertz.',
      'Short pulses make clicks and beeps; hold Sound for a tone. A One Shot Trigger in front turns any pulse into a beep of set length.',
    ],
    steps: [
      'Add the buzzer module from the Hardware tab.',
      'Wire SIG (or S) to the GPIO shown, and power and ground.',
    ],
    inputs: {
      on: 'True sounds the buzzer.',
    },
    example: example({
      featured: 'BuzzerOutput',
      title: 'A metronome you can see and hear',
      nodes: {
        clock: ['Clock', { bpm: 90 }],
        click: ['Trigger', { triggerOp: 'oneShot', holdTime: 0.05 }],
        buzzer: ['BuzzerOutput', { sigPin: 26 }],
        tempo: ['BeatFlash', { decay: 0.7, r: 255, g: 230, b: 120 }],
        base: ['RadialBurst', { palette: 'deepsea', speed: 0.3 }],
      },
      wires: ['clock.beat > click.trigger', 'click.out > buzzer.on', 'clock.beat > tempo.beat', 'base.frame > tempo.frame'],
      explanation: 'Clock beats at 90 BPM. A One Shot Trigger stretches each beat to a 50 ms pulse, which clicks the Buzzer, and the same beat flashes the LED matrix — a metronome you can both hear and see.',
      preview: 'The {output} flashes warm white on each beat over dark blue rings. The browser is silent; the board clicks in time.',
    }),
  },

  CoolingFanOutput: {
    overview: [
      'Cooling Fan drives a four-wire PWM fan and reads back its speed. Speed sends 25 kHz PWM to the blue wire; RPM counts the green tachometer wire at two pulses a revolution, and Running says the fan is turning.',
      'Use it to cool a sealed enclosure, ideally from a temperature reading, and to raise the alarm if a fan stops.',
    ],
    steps: [
      'Add the fan from the Hardware tab.',
      'Power it from 5 V. Wire the blue PWM wire and the green tachometer wire to the GPIOs shown.',
    ],
    outputs: {
      rpm: 'Measured fan speed in revolutions per minute. Estimated in the browser.',
      running: 'True while the fan is turning.',
    },
    example: example({
      featured: 'CoolingFanOutput',
      title: 'Cool an enclosure and watch its RPM',
      nodes: {
        pot: ['PotInput'],
        fan: ['CoolingFanOutput', { pwmPin: 25, tachPin: 26 }],
        normalize: ['MapRange', { inMin: 0, inMax: 5000, outMin: 0, outMax: 1 }],
        gauge: ['Gauge', { gaugeStyle: 'bar', direction: 'right', palette: 'arctic' }],
      },
      wires: ['pot.value > fan.speed', 'fan.rpm > normalize.value', 'normalize.result > gauge.value'],
      output: STRIP(30),
      explanation: 'The Potentiometer sets Cooling Fan’s speed. Its RPM, scaled by Map Range from 0–5000 to 0–1, fills a Gauge along the string, so you can see the fan respond.',
      preview: 'The {output} shows a bar about half full. Turn the knob and the bar follows the fan’s speed; on the board it shows the measured RPM.',
    }),
  },

  DFPlayerOutput: {
    overview: [
      'DFPlayer Mini plays numbered MP3 files from its own microSD card: 0001.mp3 upward in the /mp3 folder. Play, Next, Previous, Track and Volume control it, and Playing follows the module’s BUSY pin.',
      'It is a simple way to add sound effects and announcements without an I2S amplifier: Speaker mode drives a small speaker directly, Line Out feeds a power amplifier.',
      'Power it from 5 V and put a 1 kΩ resistor between the controller’s TX and the module’s RX.',
    ],
    steps: [
      'Copy the files to the card’s /mp3 folder as 0001.mp3, 0002.mp3 and so on.',
      'Add the DFPlayer from the Hardware tab. Wire 5 V, GND, the UART pins (with the 1 kΩ resistor) and BUSY.',
      'Wire a speaker to SPK1 and SPK2, or DAC_L and DAC_R to an amplifier.',
    ],
    inputs: {
      next: 'Each rising edge plays the next file.',
      previous: 'Each rising edge plays the previous file.',
    },
    outputs: {
      playing: 'True while the module is playing.',
    },
    example: example({
      featured: 'DFPlayerOutput',
      title: 'A doorbell that chimes and flashes',
      nodes: {
        bell: ['ButtonInput'],
        chime: ['DFPlayerOutput', { uartRxPin: 16, uartTxPin: 17, busyPin: 27, track: 1, volume: 0.8, audioOutput: 'Speaker' }],
        flash: ['BeatFlash', { decay: 0.9, intensity: 1, palette: 'sunset' }],
        hall: ['Breathe', { palette: 'amethyst', bpm: 8 }],
      },
      wires: ['bell.pressed > chime.play', 'bell.pressed > flash.beat', 'hall.frame > flash.frame'],
      explanation: 'Pressing the Button plays file 0001 on the DFPlayer Mini and fires Beat Flash on the LEDs at the same moment, so the doorbell is seen as well as heard.',
      preview: 'The {output} breathes softly in violet. Press the Button node to flash it gold. The browser is silent; on the board the chime plays.',
    }),
  },

  InfoDisplay: {
    overview: [
      'Info Display is a small 128×64 OLED that reports on one source. Wire a Display output in and the source picks the screen: RTC Clock gives a clock, Music Player a now-playing screen, Pattern Slideshow a pattern browser, Power Monitor a meter, and an LED output its status.',
      'There is no layout to choose. With nothing wired it says it is unwired rather than sitting blank.',
      'Choose the exact SH1106 or SSD1306 module in Hardware. The SH1106 comes in SPI and I2C versions; the SSD1306 uses I2C.',
    ],
    steps: [
      'Add the OLED from Displays on the Hardware shelf and choose its exact module. Set its pins, and its address for I2C.',
      'Wire the source’s Display output into Info Display.',
      'Choose the rotation to match how it is mounted.',
    ],
    inputs: {
      display: DISPLAY_IN,
    },
    propertyNote: 'Module and pins come from the Hardware tab. Every I2C part in one sketch shares the same SDA and SCL pins.',
    example: example({
      featured: 'InfoDisplay',
      title: 'A bench power meter on an OLED',
      nodes: {
        meter: ['PowerMonitorInput', { i2cAddress: '0x40' }],
        screen: ['InfoDisplay', { i2cAddress: '0x3C' }],
        strip: ['Rainbow', { speed: 0.3 }],
      },
      wires: ['meter.display > screen.display'],
      output: STRIP(60),
      explanation: 'Power Monitor measures the LED supply, and its Display output gives Info Display everything it needs on one wire: volts, amps and watts. The LED string runs a rainbow as the load being measured.',
      preview: 'The {output} shows a rainbow, while the Info Display node shows the measured volts, amps and watts.',
    }),
  },

  TransportDisplay: {
    overview: [
      'Display Panel is a colour TFT. Wire one Display output in and the source decides the content — a clock, a now-playing screen, show status, LED status or a power meter — while the Layout setting picks how it is drawn.',
      'For your own screen, choose Create screen design on the panel and draw it with widgets. The design belongs to this panel; it keeps its Display wire for widgets to read, and its controls appear as outputs on the companion Touch Screen node.',
      'Choose the 1.54-inch 240×240 ST7789 without touch, or the 2.4-inch 240×320 ST7789V with an XPT2046 touch digitiser. Diagnostics shows a self-test and the touch coordinates.',
    ],
    steps: [
      'Add Display Panel from Displays on the Hardware shelf. Choose its exact module and wire it, including the touch header if it has one.',
      'Wire a source’s Display output into the panel and choose a layout, or press Create screen design.',
      'For touch, wire the Touch Screen node’s outputs to what they should control, and run Calibrate touch after uploading.',
    ],
    inputs: {
      display: DISPLAY_IN,
    },
    propertyNote: 'Hardware owns the module and its pins; the graph node owns the layout, rotation and Enabled. Choosing a fixed layout sets a screen design aside; Custom design brings it back.',
    outcome: 'Add patterns to the collection and the panel shows the track, the time and the pattern playing.',
    example: example({
      featured: 'TransportDisplay',
      title: 'A now-playing screen for the music player',
      nodes: {
        patterns: ['PatternCollection'],
        player: ['PatternMaster'],
        panel: ['TransportDisplay', { tftLayout: 'Now Playing' }],
      },
      wires: ['patterns.patternset > player.patternset', 'player.display > panel.display'],
      explanation: 'The Music Player’s Display output carries its whole report — title, artist, elapsed time, the pattern playing — and the Display Panel draws it as the Now Playing screen.',
      preview: 'Once the collection holds patterns, the {output} plays them while the panel shows what is playing.',
      workflow: true,
    }),
  },

  MasterSpeed: {
    overview: [
      'Master Speed scales time for the whole graph: 1 is normal, 2 twice as fast, 0 frozen. Every animated node keeps its own speed, and they all stay in proportion.',
      'It is a terminal like the LED output: nothing reads it. Wire a knob in for one speed control on the finished build. The Music Player ignores it, because the track’s position is its clock.',
    ],
    example: example({
      featured: 'MasterSpeed',
      title: 'One knob for the speed of everything',
      nodes: {
        rate: ['PotInput'],
        master: ['MasterSpeed'],
        plasma: ['Plasma', { speed: 0.4, palette: 'party' }],
        sparkle: ['Glitter', { density: 0.2 }],
      },
      wires: ['rate.value > master.speed', 'plasma.frame > sparkle.frame'],
      explanation: 'Master Speed scales the clock underneath every node. With the Potentiometer at half, the Plasma and everything else run at half speed; at full, at normal speed. The plasma’s own Speed of 0.4 is never changed.',
      preview: 'The {output} shows a party plasma moving at half speed. Drag the Potentiometer to slow everything down or bring it back up.',
    }),
  },

  SegmentDisplay: {
    overview: [
      'Segment Display is a separate 7-segment readout: a TM1637 with four digits and a colon, or a MAX7219 with eight digits. Wire a Display output in and the source decides the digits.',
      'RTC Clock shows the time, Music Player the elapsed time, Pattern Slideshow the pattern number, an LED output its brightness in percent, and Power Monitor the amps (or amps and watts on eight digits). Unwired, it shows dashes.',
    ],
    steps: [
      'Add the module from Displays on the Hardware shelf and choose the TM1637 or the MAX7219.',
      'Wire its pins as shown. The TM1637 is not I2C and cannot share its two pins.',
      'Wire the source’s Display output into Segment Display.',
    ],
    inputs: {
      display: DISPLAY_IN,
    },
    propertyNote: 'The colon exists only on the TM1637. Brightness uses the controller’s own steps: 0–7 on a TM1637, 0–15 on a MAX7219.',
    example: example({
      featured: 'SegmentDisplay',
      title: 'A desk clock with a light show',
      nodes: {
        rtc: ['RTCInput', { timeSource: 'DS3231' }],
        digits: ['SegmentDisplay', { showColon: true, brightness: 5 }],
        lamp: ['Plasma', { palette: 'sunset', speed: 0.25 }],
      },
      wires: ['rtc.display > digits.display'],
      output: RING(24),
      explanation: 'RTC Clock reads a DS3231, and its Display output gives the Segment Display the time over one wire, colon blinking each second. The LED ring glows with a slow sunset plasma beside it.',
      preview: 'The {output} shows a warm sunset plasma; the Segment Display node shows the time, such as 10:04.',
    }),
  },

  Amplifier: {
    overview: [
      'Amplifier names the I2S amplifier or DAC that the music player feeds, and owns its three I2S pins: BCLK, LRC and DIN. The MAX98357A drives a speaker directly; DACs such as the PCM5102A give line level for a separate power amplifier.',
      'It carries no wires. Without an Amplifier on the bench the player uses its built-in pin defaults. Max Volume is the volume the player starts at.',
    ],
    steps: [
      'Add the amplifier from the Hardware tab and choose its exact board.',
      'Wire BCLK, LRC and DIN to the pins shown, plus power and ground.',
    ],
    outcome: 'Amplifier changes the player’s firmware and pin checks, not the LED preview.',
    example: example({
      featured: 'Amplifier',
      title: 'Name the amplifier the show player drives',
      nodes: {
        music: ['MusicLibrary'],
        performance: ['PerformanceGenerator'],
        sd: ['SDCard'],
        amp: ['Amplifier'],
      },
      wires: ['music.music > performance.music'],
      explanation: 'The Amplifier sits on the bench beside the SD Card. The songs come off the card, and the player sends them to whichever amplifier this node names, on the pins it owns.',
      preview: 'The {output} is unchanged; the Amplifier affects how the board plays the songs.',
      workflow: true,
    }),
  },

  PowerAmplifier: {
    overview: [
      'Power Amplifier is the analogue amplifier at the end of the audio chain, driving the speakers. A DAC such as the PCM5102A or UDA1334A gives it line level; it needs no GPIO of its own.',
      'With no DAC on the bench, it takes line level from the classic ESP32’s built-in DAC on GPIO 25 and 26 instead, which no other board has. A 12 V amplifier is drawn on its own supply, never on the controller’s 5 V rail.',
    ],
    steps: [
      'Add the power amplifier from the Hardware tab.',
      'Wire its line input from the DAC, its supply, and the speakers, as the Build Diagram shows.',
    ],
    outcome: 'Power Amplifier changes the wiring plan and the player’s audio output mode, not the LED preview.',
    example: example({
      featured: 'PowerAmplifier',
      title: 'Put a power amplifier after the DAC',
      nodes: {
        music: ['MusicLibrary'],
        performance: ['PerformanceGenerator'],
        sd: ['SDCard'],
        dac: ['Amplifier', { model: 'pcm5102a-i2s-dac' }],
        amp: ['PowerAmplifier', { partId: 'dx-0809-stereo-amplifier' }],
      },
      wires: ['music.music > performance.music'],
      explanation: 'The PCM5102A Amplifier turns the player’s I2S into line level, and the Power Amplifier takes that line level and drives the speakers. Neither carries wires on the canvas; the Build Diagram draws how they connect.',
      preview: 'The {output} is unchanged; the amplifiers affect the sound and the wiring plan.',
      workflow: true,
    }),
  },

  StreamOutput: {
    overview: [
      'Frame Stream sends a frame on to another device. DDP sends packets over the network to a WLED controller, xLights or anything else that listens on port 4048. Adalight writes the frames to the USB serial for Prismatik or Hyperion.',
      'It is a second destination beside the LED output: the same frame can light local LEDs and a remote display at once. The stream runs only on the board.',
    ],
    steps: [
      'Choose DDP or Adalight. For DDP, set the receiver’s address and port, and the board’s network settings.',
      'Wire the frame to send into Frame.',
    ],
    inputs: {
      frame: 'The frame to send.',
    },
    example: example({
      featured: 'StreamOutput',
      title: 'Mirror the matrix to a WLED controller',
      nodes: {
        wave: ['Pacifica'],
        stream: ['StreamOutput', { streamProtocol: 'ddp', host: '192.168.1.50', port: 4048 }],
      },
      wires: ['wave.frame > stream.frame'],
      show: 'wave',
      explanation: 'Frame Stream is a second terminal beside the LED output: the same Pacifica frame lights the local matrix and leaves the board as DDP packets for a WLED controller at 192.168.1.50. Switch the protocol to Adalight to send it over USB serial instead.',
      preview: 'The {output} shows Pacifica as usual; the stream is invisible in the preview and only runs on the board.',
    }),
  },

  AnalogStripOutput: {
    overview: [
      'Analog RGB Strip drives an ordinary, non-addressable 12 V RGB strip on three PWM pins, one per colour. The whole strip shows one colour.',
      'Each pin drives a MOSFET gate that switches that colour’s line. Tick Common Anode for strips whose +12 V is shared and whose colours sink to ground; the PWM is inverted to match.',
    ],
    steps: [
      'Wire each GPIO to a MOSFET gate, and each MOSFET to its colour line. Power the strip from its own 12 V supply and join the grounds.',
      'Wire a colour into Color, or set the R, G and B fields.',
    ],
    inputs: {
      color: 'The strip’s colour. Replaces the R, G and B fields.',
    },
    example: example({
      featured: 'AnalogStripOutput',
      title: 'A 12 V cove light that follows the matrix',
      nodes: {
        hue: ['HueCycle', { rate: 0.05 }],
        cove: ['AnalogStripOutput', { rPin: 25, gPin: 26, bPin: 27 }],
        fill: ['SolidColor'],
      },
      wires: ['hue.color > cove.color', 'hue.color > fill.color'],
      explanation: 'One Hue Cycle colour drives both the LED matrix, through Solid Color, and Analog RGB Strip, so a plain 12 V cove light round the room slowly cycles in step with the panel.',
      preview: 'The {output} slowly cycles through the rainbow; the analog strip shows the same colour on the board.',
    }),
  },
}

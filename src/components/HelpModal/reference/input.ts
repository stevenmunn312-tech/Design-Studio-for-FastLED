import { irRemoteButtonHandle } from '../../../state/peripherals/irRemote'
import { buttonBankHandle } from '../../../state/player/buttonBank'
import { example, RING, STRIP } from './example'
import type { NodeReferenceMap } from './types'

const PREVIEW_STAND_IN = 'The browser has no sensor attached, so the node body carries controls that stand in for the readings while you design. The uploaded sketch reads the real part instead.'

export const INPUT_REFERENCE: NodeReferenceMap = {
  Audio: {
    overview: [
      'Audio is the one place a graph gets its sound. Choose the source in its body — a microphone, a line input, or the Music Player’s own decoder — and every analyser wired to it hears the same signal.',
      'The same choice holds in both worlds. In the browser, a microphone or line input is captured through your computer’s audio input; on the board, the Microphone or Line In part on the bench is read over I2S. Pick the source once and the preview and the firmware agree.',
      'Fan a single Audio node out to as many analysers and audio patterns as you like. Add a second one only when you really have two sources, such as a microphone for the room and the decoder for the music.',
    ],
    steps: [
      'Add a Microphone or Line In part from the Hardware tab if the board will listen to the room or a player. The decoder needs no part.',
      'Pick the source in the Audio node’s body.',
      'Wire Audio into FFT Analyzer, Beat Detect, or any audio pattern. Allow microphone access in the browser when Studio asks.',
    ],
    outputs: {
      audio: 'The selected source’s audio. Every analyser or audio pattern wired here hears the same stream.',
    },
    example: example({
      featured: 'Audio',
      title: 'One source, two listeners',
      nodes: {
        mic: ['MicInput'],
        spectrum: ['SpectrumVisualizer', { style: 'Centre Mirror', palette: 'synthwave' }],
        beat: ['BeatDetect', { threshold: 0.45 }],
        flash: ['BeatFlash', { intensity: 0.7, decay: 0.8, palette: 'ultraviolet' }],
      },
      wires: [
        'mic.audio > spectrum.audio',
        'mic.audio > beat.audio',
        'spectrum.frame > flash.frame',
        'beat.beat > flash.beat',
      ],
      explanation: 'A single Audio node feeds two very different listeners. Spectrum Visualizer draws the whole spectrum as mirrored bars, while Beat Detect listens to the same stream for hits and flashes the picture through Beat Flash.',
      preview: 'Allow microphone access and play music nearby. The {output} shows bars rising from the centre line, and each detected beat washes the frame violet for a moment.',
    }),
  },

  Storage: {
    overview: [
      'Storage names where a build keeps its files: the SD card on the bench, the board’s own flash, or files sent over USB. The choices in its body come from the hardware you have added, so it lists only what exists.',
      'With exactly one provider available Storage picks it for you; with several it waits for your choice and reports nothing until you make one.',
      'No node takes a Storage input yet, so for now the node records the decision on the canvas. Song files for the music player are still placed by the SD Card part and the Performance Generator.',
    ],
    outputs: {
      storage: 'The chosen provider: which card or flash, and what kind it is. Empty until a provider exists and is chosen.',
    },
    outcome: 'The node records which storage the build uses. It draws nothing on the LEDs.',
    example: example({
      featured: 'Storage',
      title: 'Point the build at the SD card',
      nodes: {
        sd: ['SDCard'],
        storage: ['Storage'],
        pattern: ['Breathe', { palette: 'amethyst', bpm: 10 }],
      },
      explanation: 'The SD Card part on the bench becomes a storage provider, and Storage offers it in its body. Breathe keeps the LEDs alive beside it, because choosing storage changes no pixels.',
      preview: 'The {output} breathes slowly in violet. Storage has no picture of its own; open its body to see the SD card listed.',
      workflow: true,
    }),
  },

  MicInput: {
    overview: [
      'Microphone is the physical I2S MEMS microphone on the bench. It is a hardware part rather than a node you wire: an Audio node selects it, and the analysers read the Audio node.',
      'Module picks the breakout — INMP441, ICS-43434 or a generic board. All three wire the same three signals; the choice changes the pin names, the Build Diagram picture, and the response correction FastLED applies on ESP32 and Teensy. On other boards the module changes only the drawing.',
      'Gain is FastLED’s own Processor::setGain, so the preview and the board scale the signal the same way. In the browser Studio listens through your computer’s microphone; on the board the sketch reads the module at 44.1 kHz.',
    ],
    steps: [
      'Add the microphone from the Hardware tab and pick its module.',
      'Wire VDD to 3.3 V, GND to ground, and the WS, SCK and SD pads to the pins shown. Tie L/R low for the Left channel, or high for Right.',
      'Select Microphone in an Audio node’s body, then wire the Audio node into an analyser.',
    ],
    outputs: {
      audio: 'The microphone’s sound, delivered through the Audio node that selects it.',
    },
    propertyNote: 'Gain shapes both the preview and the board. The pins and channel matter only to the uploaded sketch; turn on Serial Debug to check a new microphone’s wiring from the serial monitor.',
    example: example({
      featured: 'MicInput',
      title: 'See your own voice as a waveform',
      nodes: {
        mic: ['MicInput', { gain: 1.4 }],
        scope: ['Waveform', { style: 'ring', gain: 3, thickness: 1.5, palette: 'aurora' }],
      },
      wires: ['mic.audio > scope.audio'],
      explanation: 'The Microphone part is selected by an Audio node, which feeds Waveform its raw samples. Ring style bends the trace into a circle, so the microphone becomes a living oscilloscope.',
      preview: 'Allow microphone access and speak or clap. The {output} shows a ring that wobbles with every sound, and stays a calm circle in silence.',
    }),
  },

  LineInput: {
    overview: [
      'Line In is a PCM1802 analogue-to-digital board that brings a line-level source — a phone, a mixer, a record player — onto the board over I2S. Like the microphone it is a hardware part, selected by an Audio node.',
      'The PCM1802 needs four clocks and data: a master clock (MCLK) the board supplies, the bit clock, the word clock, and the data line back. Channel picks the left side, the right side, or both averaged.',
      'Line level is much louder and cleaner than a microphone in a room, so Gain usually stays at 1. In the browser, play the same source into your computer’s audio input to preview it.',
    ],
    steps: [
      'Add Line In from the Hardware tab and wire MCLK, BCLK, LRCLK and DOUT to the pins shown, plus 5 V and ground.',
      'Connect the source to the RCA inputs.',
      'Select Line In in an Audio node’s body and wire that node into an analyser or audio pattern.',
    ],
    outputs: {
      audio: 'The line-level source’s sound, delivered through the Audio node that selects it.',
    },
    propertyNote: 'Pins and Channel describe the PCM1802 wiring for the sketch; Gain scales the signal before every analyser.',
    example: example({
      featured: 'LineInput',
      title: 'A scrolling spectrogram of the record player',
      nodes: {
        line: ['LineInput', { gain: 1 }],
        waterfall: ['SpectrumVisualizer', { style: 'Waterfall', waterfallSpeed: 8, palette: 'deepsea' }],
      },
      wires: ['line.audio > waterfall.audio'],
      explanation: 'Line In carries the RCA inputs into an Audio node. Spectrum Visualizer in Waterfall style draws each moment of the spectrum as a row and scrolls it down, so the track’s history slides across the matrix.',
      preview: 'Play music into the line input. The {output} shows bright bands falling from the top: bass on one side, cymbals on the other.',
    }),
  },

  ButtonInput: {
    overview: [
      'Button reads one momentary push-button as a true/false signal. Pressed is true for as long as the button is held, and false otherwise.',
      'In the preview, the press control on the node stands in for the button, so you can try a trigger patch before anything is wired. On the board the pin uses INPUT_PULLUP by default: wire the button between the pin and ground and a press reads LOW.',
      'Pressed is a level, not a single pulse. Feed it to Select inputs and switches directly, or through Trigger when you want a toggle, a one-shot, or a count of presses.',
    ],
    steps: [
      'Wire one leg of the button to the GPIO shown and the other to ground.',
      'Keep Pull-Up on unless your circuit already has its own resistor.',
    ],
    outputs: {
      pressed: 'True while the button is held down.',
    },
    propertyNote: 'Pin and Pull-Up describe the wiring for the uploaded sketch. In the browser, the press control on the node drives Pressed.',
    example: example({
      featured: 'ButtonInput',
      title: 'Hold the button to stoke the fire',
      nodes: {
        button: ['ButtonInput'],
        stoke: ['Switch', { a: 0.3, b: 1 }],
        fire: ['Fire', { fireStyle: 'classic', palette: 'fire', cooling: 70 }],
      },
      wires: ['button.pressed > stoke.sel', 'stoke.result > fire.intensity'],
      explanation: 'Button drives the Select input of Switch, which hands Fire a low intensity of 0.3 at rest and full intensity while the button is held. The fire settles back to embers the moment you let go.',
      preview: 'The {output} shows a low campfire. Hold the press control on the Button node and the flames roar up the matrix; release it and they die back down.',
    }),
  },

  TouchButtonInput: {
    overview: [
      'Touch Button reads a capacitive touch module, the Seeed Grove Touch Sensor. Touched is true while a finger is on, or very near, the pad.',
      'The module drives its SIG pin high itself, so the sketch reads the pin as a plain input with no pull-up — the opposite of a mechanical button, which is why this is its own node.',
      'Capacitive pads can usually sense through a thin layer of plastic, wood or glass, which makes the module a good hidden switch for a lamp or a sculpture — test your material first. In the preview, press the Touch control on the node to stand in for a finger.',
    ],
    steps: [
      'Add the touch module from the Hardware tab.',
      'Wire VCC to 3.3 V, GND to ground, and SIG to the GPIO shown.',
    ],
    outputs: {
      touched: 'True while a finger is on the pad.',
    },
    example: example({
      featured: 'TouchButtonInput',
      title: 'A touch lamp you tap on and off',
      nodes: {
        candle: ['Candle', { mode: 'perPixel', flicker: 0.45, warmth: 0.35 }],
        touch: ['TouchButtonInput', { pin: 4 }],
        latch: ['Trigger', { triggerOp: 'toggle', initialState: true }],
        output: ['MatrixOutput', RING(16)],
      },
      wires: ['touch.touched > latch.trigger', 'latch.out > output.enabled', 'candle.frame > output.frame'],
      explanation: 'Touch Button stays true only while a finger is on the pad, so a Trigger set to Toggle turns each tap into a lasting on or off. That state drives the LED output’s Enabled input, and a per-pixel Candle gives the lamp its glow.',
      preview: 'The {output} starts lit with a gentle candle flicker. Tap the Touch control on the node to switch it off, and tap again to bring it back.',
    }),
  },

  TouchInput: {
    overview: [
      'Touch Screen is the glass in front of a Display Panel. A touch panel is two chips — the display and an XPT2046 digitiser — so the panel draws and this node listens.',
      'On the fixed transport screens its Controls output carries what a finger did: Fixed Transport has Previous, Play / Pause, Next and a volume strip; Now Playing has Play / Pause and volume. Wire Controls to a Music Player. The other fixed layouts only report, so they publish nothing here.',
      'When the panel shows your own screen design, every widget gets an output of its own on this node — a slider, a button, a colour picker — and design templates also fold their transport buttons into Controls. That is the way to put a brightness slider or a blackout button on the glass.',
      'The node arrives with its panel when you add a touch module from the Hardware tab, and it always belongs to that panel. Calibrate touch measures where the glass reads its edges; run it once on the real module rather than typing the numbers.',
    ],
    steps: [
      'Add a Display Panel module with touch from the Hardware tab. Its Touch Screen node comes with it.',
      'Wire a Music Player’s Display output into the panel and choose Fixed Transport or Now Playing, or draw a screen design for the panel.',
      'Wire Controls to the Music Player, or the design’s widget outputs to the inputs they should drive.',
      'After uploading, press Calibrate touch on the node and follow the prompts on the panel.',
    ],
    outputs: {
      controls: 'Presses on the panel’s transport controls as a controls bundle: play, pause, previous, next, and the volume while a finger holds the strip.',
    },
    propertyNote: 'The six calibration values are measured by Calibrate touch on the real module. They map raw digitiser readings onto the panel’s pixels.',
    outcome: 'Add patterns to the collection to see the show. Presses on the panel then play, pause and skip it.',
    example: example({
      featured: 'TouchInput',
      title: 'Play, pause and skip from the screen',
      nodes: {
        patterns: ['PatternCollection'],
        player: ['PatternMaster', { order: 'Sequential' }],
        panel: ['TransportDisplay', { tftLayout: 'Fixed Transport' }],
        touch: ['TouchInput'],
      },
      wires: ['patterns.patternset > player.patternset', 'player.display > panel.display', 'touch.controls > player.controls'],
      explanation: 'The Music Player reports its state to the Display Panel, which draws the Fixed Transport screen. Touch Screen turns presses on that glass into Controls, and the player obeys them: previous, play or pause, next, and a volume strip.',
      preview: 'Once the collection holds patterns the {output} plays them in order. Press the buttons on the panel preview to pause or skip.',
      workflow: true,
    }),
  },

  ButtonBank: {
    overview: [
      'Button Bank collects several push-buttons into one node. Each button you add in its body gets a name, a pin and an output of its own, so a control panel reads as one tidy block instead of a column of separate Button nodes.',
      'Drag from Connect button… to a node’s input to add a button and wire it in one move. Every output behaves exactly like a Button: true while held, with the pin pulled up and a press reading LOW.',
      'In the preview, each button row in the body has its own press control.',
    ],
    steps: [
      'Add a button in the body for each physical button, and name it after what it does.',
      'Wire each button between its GPIO and ground.',
    ],
    outputs: {
      'add-button': 'Drag from here to an input to add a new button already wired to it.',
    },
    propertyNote: 'Every button’s name and pin are edited in the body. Each one becomes an output port named after it.',
    example: example({
      featured: 'ButtonBank',
      title: 'Two buttons that flick through palettes',
      nodes: {
        bank: ['ButtonBank', {
          buttons: [
            { id: 'back', label: 'Previous palette', pin: 12 },
            { id: 'forward', label: 'Next palette', pin: 14 },
          ],
        }],
        palettes: ['PaletteBank', { palettes: ['synthwave', 'emberglow', 'laguna', 'meadow'], blend: 24 }],
        plasma: ['Plasma', { speed: 0.4 }],
      },
      wires: [
        `bank.${buttonBankHandle('back')} > palettes.previous`,
        `bank.${buttonBankHandle('forward')} > palettes.next`,
        'palettes.palette > plasma.paletteIn',
      ],
      explanation: 'Button Bank holds two named buttons. Next palette and Previous palette step Palette Bank through four palettes, wrapping at either end, and Plasma blends smoothly into each new one.',
      preview: 'The {output} shows a synthwave plasma. Press Next palette on the Button Bank node and the colours melt into embers, then a lagoon, then a meadow.',
    }),
  },

  IRRemoteInput: {
    overview: [
      'IR Remote turns the keys of an ordinary handheld remote into graph signals. Add the receiver from the Hardware tab, then learn each key in the body by pointing your own remote at it; every learned key becomes a named output.',
      'A key output pulses true once per press, or keeps pulsing while the key is held when that key is set to repeat. That makes keys events rather than levels: wire them to Next and Previous style inputs, to Trigger, or to Step Value to turn presses into a number.',
      'In the preview, click a key square on the node to press it. Turn on Debug and the uploaded sketch prints every code it receives, which helps with an unfamiliar remote.',
    ],
    steps: [
      'Add an IR receiver module from the Hardware tab and wire OUT to the GPIO shown.',
      'Open Map IR remote buttons in the body and press each key on your remote to learn it.',
      'Wire the new key outputs to the inputs they should operate.',
    ],
    outputs: {
      'learn-button': 'Opens key learning. It is a doorway, not a signal: learned keys appear as their own outputs above it.',
    },
    propertyNote: 'One receiver pin serves every learned key. Debug adds code printouts to the upload for the serial monitor at 115200 baud.',
    example: example({
      featured: 'IRRemoteInput',
      title: 'Change a pattern’s speed from the sofa',
      nodes: {
        remote: ['IRRemoteInput', {
          pin: 13,
          buttons: [
            { id: 'up', label: 'Speed +', protocol: 'NEC', address: 0, command: 21, repeat: 'held' },
            { id: 'down', label: 'Speed −', protocol: 'NEC', address: 0, command: 7, repeat: 'held' },
          ],
        }],
        step: ['StepValue', { initial: 0.5, minimum: 0.05, maximum: 1, step: 0.05, wrap: false }],
        pattern: ['Juggle', { palette: 'rainbow', count: 6, fade: 0.22 }],
      },
      wires: [
        `remote.${irRemoteButtonHandle('up')} > step.increase`,
        `remote.${irRemoteButtonHandle('down')} > step.decrease`,
        'step.value > pattern.speed',
      ],
      explanation: 'IR Remote has two learned keys. Each press is a pulse, so Step Value turns the pulses into a held number that Speed + raises and Speed − lowers, and that number sets how fast Juggle’s dots swing.',
      preview: 'The {output} shows six dots juggling at middle speed. Click Speed + on the IR Remote node to speed them up, and hold Speed − to slow them to a drift.',
    }),
  },

  MotionInput: {
    overview: [
      'Motion Sensor reads a motion module and reports Motion as true while it sees movement. Pick the module on the bench: an HC-SR501 PIR, which sees a warm body move, or an RCWL-0516 microwave sensor, which senses movement even through a plastic case.',
      'Both hold their output high for a moment after the last movement — the HC-SR501 for as long as its time trimmer is set, the RCWL-0516 for about two seconds. Neither sees a person sitting still; use Presence Sensor when stillness matters.',
      'In the preview, the motion control on the node stands in for the sensor.',
    ],
    steps: [
      'Add the motion module from the Hardware tab.',
      'Power it from 5 V and wire OUT to the GPIO on the node. OUT is 3.3 V logic on both modules.',
      'Give a PIR a minute after power-up before trusting it; it settles slowly.',
    ],
    outputs: {
      motion: 'True while the sensor sees movement.',
    },
    example: example({
      featured: 'MotionInput',
      title: 'A hallway light that wakes as you pass',
      nodes: {
        pir: ['MotionInput', { pin: 5 }],
        level: ['Switch', { a: 0.3, b: 1 }],
        ease: ['Smooth', { response: 0.8 }],
        glow: ['Sunrise', { mode: 'manual', progress: 0.8 }],
      },
      wires: ['pir.motion > level.sel', 'level.result > ease.value', 'ease.result > output.brightness', 'glow.frame > output.frame'],
      explanation: 'Motion Sensor picks between a 30% glow and full light through Switch. Smooth eases every change over about a second, so the warm Sunrise colour swells as someone walks by and drifts down after they have gone.',
      preview: 'The {output} glows softly warm. Toggle Motion on the sensor node and it brightens smoothly to full; toggle it off and it fades back.',
    }),
  },

  PresenceInput: {
    overview: [
      'Presence Sensor reads an HLK-LD2410C millimetre-wave radar. Unlike a PIR it sees people who are sitting still, so Presence stays true while someone reads in a chair.',
      'Moving and Still report the two kinds of target separately, and Distance gives the detected range in metres, from 0 to 6. The sketch only listens to the radar’s serial stream, so one RX pin is the whole connection.',
      PREVIEW_STAND_IN,
    ],
    steps: [
      'Add the radar module from the Hardware tab.',
      'Wire 5 V and GND, and the module’s TX pad to the RX pin on the node. Its RX needs no wire.',
    ],
    outputs: {
      presence: 'True while anyone is detected, moving or still.',
      moving: 'True while a moving target is detected.',
      still: 'True while a stationary target is detected.',
      distance: 'Distance to the detected target in metres, 0 to 6. It reads 0 with nobody there.',
    },
    propertyNote: 'The radar talks at its own fixed baud, so the receive pin is the only setting.',
    example: example({
      featured: 'PresenceInput',
      title: 'Breathe faster as someone comes closer',
      nodes: {
        radar: ['PresenceInput', { rxPin: 18 }],
        closeness: ['MapRange', { inMin: 0, inMax: 6, outMin: 40, outMax: 8 }],
        breathe: ['Breathe', { palette: 'sunset', minLevel: 0.1, curve: 'natural' }],
      },
      wires: ['radar.distance > closeness.value', 'closeness.result > breathe.bpm'],
      explanation: 'Presence Sensor reports the target’s distance in metres. Map Range turns six metres into a slow 8 breaths a minute and arm’s length into a quick 40, so Breathe quickens as someone approaches.',
      preview: 'The {output} breathes in sunset colours. Toggle Moving on the radar node and drag its distance slider: far away the breathing is slow and calm, up close it races.',
    }),
  },

  LightInput: {
    overview: [
      'Light Sensor reads how bright the room is. With an LDR module it reports a relative Level from 0 to 1; with a BH1750 it also reports calibrated Lux.',
      'The module you pick on the bench decides the wiring: an LDR needs one analogue pin, a BH1750 shares the I2C bus. For a BH1750, Max Lux sets which reading counts as a Level of 1, so the same graph suits a dim bedroom or a sunny window.',
      'Ambient light changes slowly, so it is ideal for automatic brightness: dim the LEDs at night, or let them glow brighter as the room darkens.',
      PREVIEW_STAND_IN,
    ],
    steps: [
      'Add an LDR module or a BH1750 from the Hardware tab.',
      'Wire the pins the Build Diagram shows: one analogue pin for the LDR, or SDA and SCL for the BH1750.',
    ],
    outputs: {
      level: 'Room brightness from 0 (dark) to 1 (bright). For a BH1750 it is Lux divided by Max Lux.',
      lux: 'Calibrated illuminance in lux from a BH1750. An LDR has no calibration, so use Level instead.',
    },
    propertyNote: 'Pin serves the LDR; SDA, SCL, address and Max Lux serve the BH1750. Only the fields for the chosen module are used.',
    example: example({
      featured: 'LightInput',
      title: 'Stars that come out as the room darkens',
      nodes: {
        light: ['LightInput'],
        dusk: ['MapRange', { inMin: 0, inMax: 1, outMin: 1, outMax: 0.1 }],
        stars: ['TwinkleFox', { palette: 'arctic', density: 0.35, speed: 0.35 }],
      },
      wires: ['light.level > dusk.value', 'dusk.result > output.brightness', 'stars.frame > output.frame'],
      explanation: 'Light Sensor’s Level is reversed by Map Range — a bright room gives 0.1, a dark one 1 — and that sets the LED output’s Brightness. TwinkleFox supplies the stars.',
      preview: 'The {output} twinkles at half brightness. Drag the light slider on the sensor node down and the stars brighten; raise it and they fade into the daylight.',
    }),
  },

  EnvironmentInput: {
    overview: [
      'Environment Sensor reads a BME280: temperature in °C, relative humidity in percent, and barometric pressure in hectopascals, all calibrated by the chip.',
      'The readings keep their real units, so put a Map Range between them and any 0–1 input. That is where you decide what “hot” or “humid” means for this build.',
      'The BME280 shares the I2C bus with other parts. Its address is 0x77, or 0x76 with SDO tied low.',
      PREVIEW_STAND_IN,
    ],
    steps: [
      'Add the BME280 from the Hardware tab.',
      'Wire VIN to 3.3 V, GND to ground, and SDA and SCL to the board’s I2C pins.',
    ],
    outputs: {
      temperature: 'Air temperature in degrees Celsius.',
      humidity: 'Relative humidity in percent, 0 to 100.',
      pressure: 'Barometric pressure in hectopascals; about 1013 at sea level.',
    },
    propertyNote: 'SDA and SCL are shared with every other I2C part. Change the address only when two sensors share the bus or the jumper is closed.',
    example: example({
      featured: 'EnvironmentInput',
      title: 'A barometer that forecasts in colour',
      nodes: {
        bme: ['EnvironmentInput', { i2cAddress: '0x77' }],
        weather: ['MapRange', { inMin: 990, inMax: 1030, outMin: 0, outMax: 1 }],
        sky: ['PaletteBlend', { paletteA: 'deepsea', paletteB: 'sunset' }],
        plasma: ['Plasma', { speed: 0.25 }],
      },
      wires: ['bme.pressure > weather.value', 'weather.result > sky.amount', 'sky.palette > plasma.paletteIn'],
      explanation: 'Falling air pressure usually means a storm is coming. Environment Sensor reads the pressure, Map Range turns 990–1030 hPa into 0–1, and Blend Palettes slides from a stormy deep-sea palette to a fair-weather sunset as the pressure rises. Plasma shows the result.',
      preview: 'The {output} shows a plasma halfway between storm and sunset at normal pressure. Drag the pressure slider on the sensor node down for stormy blues, or up for warm sunset colours.',
    }),
  },

  TemperatureInput: {
    overview: [
      'Temperature Probe reads a waterproof DS18B20 in degrees Celsius over a single data wire. It suits liquids and places a board cannot go: an aquarium, a hot tub, a fermenter, a cold frame.',
      'Connected is false while the probe does not answer, so a graph can hold a safe look instead of following a stale reading. The data line needs a 4.7 kΩ pull-up to 3.3 V, which the Build Diagram draws.',
      PREVIEW_STAND_IN,
    ],
    steps: [
      'Add the probe from the Hardware tab.',
      'Wire red to 3.3 V, black to ground, and yellow to the GPIO shown, with a 4.7 kΩ resistor from yellow to 3.3 V.',
    ],
    outputs: {
      temperature: 'The probe’s temperature in degrees Celsius.',
      connected: 'True while the probe answers. False when it is unplugged or its wire is broken.',
    },
    propertyNote: 'Use one probe per pin; the sketch reads the first probe it finds on the wire.',
    example: example({
      featured: 'TemperatureInput',
      title: 'An aquarium that blushes when it gets too warm',
      nodes: {
        probe: ['TemperatureInput', { pin: 4 }],
        warning: ['MapRange', { inMin: 24, inMax: 32, outMin: 0, outMax: 0.45 }],
        water: ['Pacifica', { palette: 'ocean', speed: 0.3 }],
        tint: ['HueShift'],
      },
      wires: ['probe.temperature > warning.value', 'warning.result > tint.shift', 'water.frame > tint.frame'],
      explanation: 'Temperature Probe reads the tank in °C. Map Range turns 24–32 °C into a hue shift of up to 0.45, which Hue Shift applies to Pacifica: cool water stays ocean-blue, warm water drifts toward red.',
      preview: 'The {output} shows calm blue waves at 22 °C. Drag the temperature slider on the probe node above 28 °C and the waves turn purple, then red.',
    }),
  },

  MotionVectorInput: {
    overview: [
      'Accel & Gyro reads an MPU-6050: acceleration on three axes in g, and rotation rate on three axes in degrees per second.',
      'Lying flat, gravity reads about +1 g on Z and 0 on X and Y, so tilting the board swings X and Y between −1 and +1. Rotation rates are 0 while the board is still and jump while it turns. The values keep their units, so a Map Range usually sits between this node and a control.',
      'The sensor shares the I2C bus. Its address is 0x68, the same as a DS3231 clock, so tie AD0 high and pick 0x69 when both are fitted. Connected goes false if the chip stops answering.',
      PREVIEW_STAND_IN,
    ],
    steps: [
      'Add the MPU-6050 board from the Hardware tab.',
      'Wire VCC to 3.3 V, GND to ground, and SDA and SCL to the board’s I2C pins.',
      'Mount it firmly; the axes are printed on the board.',
    ],
    outputs: {
      accelX: 'Acceleration along X in g. Reads between −1 and +1 as the board tilts left and right.',
      accelY: 'Acceleration along Y in g. Reads between −1 and +1 as the board tilts forward and back.',
      accelZ: 'Acceleration along Z in g. About +1 lying flat face up.',
      gyroX: 'Rotation rate about X in degrees per second.',
      gyroY: 'Rotation rate about Y in degrees per second.',
      gyroZ: 'Rotation rate about Z in degrees per second.',
      connected: 'True while the sensor answers on the bus.',
    },
    propertyNote: 'SDA and SCL are shared with every other I2C part. Use 0x69 when a DS3231 clock is on the same bus.',
    example: example({
      featured: 'MotionVectorInput',
      title: 'A spirit level made of light',
      nodes: {
        imu: ['MotionVectorInput', { i2cAddress: '0x68' }],
        sideways: ['MapRange', { inMin: -1, inMax: 1, outMin: 0.15, outMax: 0.85 }],
        forward: ['MapRange', { inMin: -1, inMax: 1, outMin: 0.15, outMax: 0.85 }],
        bubble: ['Shape', { shape: 'ellipse', size: 2.5, filled: true, fill: '#9dff5a', edge: '#ffffff', thickness: 0.8 }],
      },
      wires: ['imu.accelX > sideways.value', 'imu.accelY > forward.value', 'sideways.result > bubble.cx', 'forward.result > bubble.cy'],
      explanation: 'Accel & Gyro feels gravity pull on X and Y as the board tilts. Two Map Range nodes turn −1 to +1 g into a position across the matrix, and Shape draws a green bubble there, so the bubble slides toward the low side just like a spirit level.',
      preview: 'The {output} shows the bubble centred, because the board lies flat. Drag Accel X or Accel Y on the sensor node and the bubble rolls across the matrix.',
    }),
  },

  TouchPadInput: {
    overview: [
      'Touch Pad reads an MPR121: twelve capacitive electrodes on one I2C chip. Wire foil, copper tape or conductive paint to the electrodes and anything can become a touch key.',
      'Electrode is the lowest pad currently touched, numbered 0 to 11, and it holds that number after release. Touched is true while any pad is down, and Count says how many are.',
      'Touch Threshold sets how far a pad’s reading must fall to count as a touch; Release Threshold how far it must recover. Lower the touch threshold for thin pads behind glass, and raise it if a pad triggers by itself.',
      PREVIEW_STAND_IN,
    ],
    steps: [
      'Add the MPR121 from the Hardware tab.',
      'Wire VIN, GND, SDA and SCL. Tie ADDR to ground for 0x5A, and leave IRQ unconnected.',
      'Connect each electrode to its pad with a short wire.',
    ],
    outputs: {
      electrode: 'The lowest pad touched, 0 to 11. It keeps the last value after release.',
      touched: 'True while any pad is touched.',
      count: 'How many pads are touched at once.',
      connected: 'True while the chip answers on the bus.',
    },
    propertyNote: 'Address is set by the ADDR pin. The two thresholds are the chip’s own registers, written by the sketch at start-up.',
    example: example({
      featured: 'TouchPadInput',
      title: 'Twelve pads, twelve colours',
      nodes: {
        pads: ['TouchPadInput', { sdaPin: 21, sclPin: 22, i2cAddress: '0x5A', touchThreshold: 12, releaseThreshold: 6 }],
        hue: ['MapRange', { inMin: 0, inMax: 12, outMin: 0, outMax: 1 }],
        spiral: ['Spiral', { palette: 'rainbow', arms: 3, speed: 0.4 }],
        tint: ['HueShift'],
      },
      wires: ['pads.electrode > hue.value', 'hue.result > tint.shift', 'spiral.frame > tint.frame'],
      explanation: 'Touch Pad reports which of its twelve pads was touched last. Map Range spreads 0–12 across one full turn of the colour wheel, so each pad rotates the Spiral’s colours by a twelfth.',
      preview: 'The {output} shows a three-armed rainbow spiral. Click the pads on the Touch Pad node: each one turns the colours to a new place and they stay there after you let go.',
    }),
  },

  KeypadInput: {
    overview: [
      'Keypad reads a 4×4 membrane keypad over eight GPIOs: four rows and four columns. Key is the last key pressed, numbered 0 to 15 row by row (1 2 3 A, 4 5 6 B, 7 8 9 C, * 0 # D), and Pressed is true while any key is down.',
      'Key holds its value after release, so it works as a selector: pick a pattern, a palette or a level by number. The keypad is passive — no power, no ground — and rows use the internal pull-up, so avoid input-only pins for them.',
      'In the preview, click the keys drawn on the node.',
    ],
    steps: [
      'Add the keypad from the Hardware tab.',
      'Wire its eight pins R1–R4 and C1–C4 to the GPIOs shown.',
    ],
    outputs: {
      key: 'The last key pressed, 0 to 15, row by row from the top left. Held after release.',
      pressed: 'True while any key is held.',
    },
    propertyNote: 'Rows need pull-up capable pins; columns must be able to drive an output.',
    example: example({
      featured: 'KeypadInput',
      title: 'Dial in a kaleidoscope by number',
      nodes: {
        keypad: ['KeypadInput'],
        mirrors: ['MapRange', { inMin: 0, inMax: 15, outMin: 2, outMax: 16 }],
        plasma: ['Plasma', { palette: 'peacock', speed: 0.35 }],
        scope: ['Kaleidoscope'],
      },
      wires: ['keypad.key > mirrors.value', 'mirrors.result > scope.segments', 'plasma.frame > scope.frame'],
      explanation: 'Keypad reports the last key pressed. Map Range turns keys 0 to 15 into 2 to 16 mirror wedges, and Kaleidoscope folds a Plasma into that many segments.',
      preview: 'The {output} starts as a simple two-way mirror. Click keys on the Keypad node: further along the keypad, the more segments the kaleidoscope gets.',
    }),
  },

  JoystickInput: {
    overview: [
      'Joystick reads a two-axis thumb stick with a push switch, such as the KY-023. X and Y run from −1 to +1 with 0 at rest; Pressed is true while the stick is pushed down.',
      'Real sticks rarely rest exactly at the centre, so Dead Zone holds an axis at 0 until it moves past that distance. Power the module from 3.3 V so both axes stay inside the controller’s analogue range, and use ADC1 pins on a classic ESP32 if Wi-Fi is on.',
      PREVIEW_STAND_IN,
    ],
    steps: [
      'Add the joystick module from the Hardware tab.',
      'Wire +5V (to 3.3 V), GND, VRx, VRy and SW to the pins shown.',
    ],
    outputs: {
      x: 'Along one axis, −1 to +1, 0 at rest.',
      y: 'Along the other axis, −1 to +1, 0 at rest. Which end is +1 depends on how the module is mounted.',
      pressed: 'True while the stick is pushed down.',
    },
    propertyNote: 'X and Y need analogue-capable pins; the switch pin uses the internal pull-up.',
    example: example({
      featured: 'JoystickInput',
      title: 'Turn a 3D cube with your thumb',
      nodes: {
        stick: ['JoystickInput'],
        yaw: ['MapRange', { inMin: -1, inMax: 1, outMin: -150, outMax: 150 }],
        pitch: ['MapRange', { inMin: -1, inMax: 1, outMin: -150, outMax: 150 }],
        cube: ['Wireframe3D', { model: 'cube', spinY: 0, projection: 'perspective', perspectiveStrength: 0.5, r: 255, g: 150, b: 40 }],
      },
      wires: ['stick.x > yaw.value', 'stick.y > pitch.value', 'yaw.result > cube.spinY', 'pitch.result > cube.spinX'],
      explanation: 'The Joystick’s X and Y each pass through Map Range, which turns −1 to +1 into a spin of −150 to +150 degrees a second. Push sideways and the cube turns about its vertical axis; push up or down and it tumbles. Let go and it stops where it is.',
      preview: 'The {output} shows an orange cube in perspective, standing still. Drag the X and Y sliders on the Joystick node to spin it.',
    }),
  },

  DistanceInput: {
    overview: [
      'Distance Sensor measures how far away something is, in millimetres. Pick the module on the bench: an HC-SR04 ultrasonic ranger (about 2 cm to 4 m), or a VL53L0X or VL53L1X laser time-of-flight sensor for tighter, quicker readings.',
      'The ultrasonic module uses Trig and Echo pins, and its 5 V Echo needs the divider the Build Diagram draws. The laser sensors share the I2C bus; to fit two, give each its own SHDN pin and an address from 0x30 to 0x33.',
      'Connected is false when no echo or reading comes back, so a graph can tell an empty room from an unplugged sensor.',
      PREVIEW_STAND_IN,
    ],
    steps: [
      'Add the distance module from the Hardware tab.',
      'For the HC-SR04, wire VCC to 5 V, Trig directly, and Echo through the 1 kΩ / 2 kΩ divider. For a laser sensor, wire VIN, GND, SDA and SCL.',
    ],
    outputs: {
      distance: 'Distance to the nearest object in millimetres.',
      connected: 'True while the sensor is returning readings.',
    },
    propertyNote: 'Trig and Echo serve the ultrasonic module; SDA, SCL, address and SHDN serve the laser modules. Only the fields for the chosen module are used.',
    example: example({
      featured: 'DistanceInput',
      title: 'Rings that race as you reach for them',
      nodes: {
        ranger: ['DistanceInput', { trigPin: 27, echoPin: 26 }],
        urgency: ['MapRange', { inMin: 100, inMax: 1500, outMin: 1, outMax: 0.1 }],
        burst: ['RadialBurst', { palette: 'ultraviolet', arms: 6 }],
      },
      wires: ['ranger.distance > urgency.value', 'urgency.result > burst.speed'],
      explanation: 'Distance Sensor reports millimetres. Map Range turns 1.5 m into a lazy speed of 0.1 and 10 cm into full speed, so Radial Burst’s rings ripple outward faster the closer a hand comes.',
      preview: 'The {output} shows violet rings drifting outward. Drag the distance slider on the sensor node toward near and the rings race from the centre.',
    }),
  },

  PotInput: {
    overview: [
      'Potentiometer reads a knob or slider as a value from 0 to 1. It is the simplest way to give a build a physical control.',
      'Most inputs that take a level expect 0 to 1 already, so a potentiometer can often be wired straight in. Use Map Range when the target wants degrees, a count or a speed.',
      'Wire the outer legs to 3.3 V and ground and the wiper to an analogue pin. On a classic ESP32 with Wi-Fi on, use an ADC1 pin (32 to 39). In the preview, drag the slider on the node.',
    ],
    steps: [
      'Wire one outer leg to 3.3 V, the other to ground, and the middle leg to the GPIO shown.',
    ],
    outputs: {
      value: 'The knob’s position, 0 at one end to 1 at the other.',
    },
    propertyNote: 'Pin must be analogue-capable. The preview slider drives Value in the browser.',
    example: example({
      featured: 'PotInput',
      title: 'A brightness knob for the whole display',
      nodes: {
        knob: ['PotInput', { pin: 34 }],
        pride: ['Pride2015', { speed: 0.4 }],
        output: ['MatrixOutput', STRIP(60)],
      },
      wires: ['knob.value > output.brightness', 'pride.frame > output.frame'],
      explanation: 'Potentiometer already speaks 0 to 1, exactly what the LED output’s Brightness input expects, so the knob is wired straight in. Pride 2015 runs underneath at whatever level the knob sets.',
      preview: 'The {output} shows Pride 2015 at half brightness. Drag the Potentiometer slider to fade the whole string down to dark or up to full.',
    }),
  },

  EncoderInput: {
    overview: [
      'Encoder reads a rotary encoder: a knob with no end stops, plus the push switch most of them carry. Position counts up one way and down the other, as far as you keep turning; Pressed is true while the knob is pushed in.',
      'Because it never runs out of travel, an encoder suits values that should wrap or keep going — rotation, hue, a menu position. Turn on Reset On Press to zero Position with each push.',
      'In the preview, drag the dial on the node up or down to turn it and click it to press. On the board the sketch polls the A and B lines and reads the switch like a button.',
    ],
    steps: [
      'Wire CLK (A), DT (B) and SW to the GPIOs shown, + to 3.3 V and GND to ground.',
    ],
    outputs: {
      position: 'Steps turned since start-up: up one way, down the other, without limit.',
      pressed: 'True while the knob is pushed in.',
    },
    propertyNote: 'Pin A, Pin B and Pin SW describe the wiring for the sketch. Pull-Up applies to all three pins.',
    example: example({
      featured: 'EncoderInput',
      title: 'Turn a star and flash it from one knob',
      nodes: {
        encoder: ['EncoderInput'],
        angle: ['MapRange', { inMin: -24, inMax: 24, outMin: -180, outMax: 180 }],
        star: ['Shape', { shape: 'polygon', sides: 5, size: 6.5, fill: '#ff3080', edge: '#00e0ff' }],
        trails: ['Trails', { decay: 0.45 }],
        flash: ['BeatFlash', { intensity: 0.85 }],
      },
      wires: [
        'encoder.position > angle.value',
        'angle.result > star.rotation',
        'star.frame > trails.frame',
        'trails.frame > flash.frame',
        'encoder.pressed > flash.beat',
      ],
      explanation: 'Encoder’s Position turns the star — Map Range makes 24 clicks one half turn either way — and Trails leaves a soft ghost of each turn. Pressing the knob fires Beat Flash, so one control both steers and punctuates.',
      preview: 'The {output} shows a pink star outlined in cyan. Drag the Encoder dial to turn it, and click the dial to flash the whole frame.',
    }),
  },

  DMXInput: {
    overview: [
      'DMX / Art-Net brings a lighting desk into the graph. It receives one universe of 512 channels over the network as Art-Net or sACN, or from a wired DMX512 line through an RS-485 transceiver.',
      'The node outputs the whole universe on one wire; DMX Channel picks out a single channel as a 0–1 value. Use several DMX Channel nodes to patch the build as a fixture with dimmer, colour and effect channels.',
      'In the preview, the local helper listens on the same UDP port and forwards what it hears. On the board, network modes join Wi-Fi (or wired Ethernet when that part is on the bench) and DMX512 reads a UART.',
    ],
    steps: [
      'Choose Art-Net, sACN or DMX512 as the firmware source and set the universe your desk sends.',
      'For network modes, set the hostname and either DHCP or a fixed address. For DMX512, add an RS-485 transceiver and wire its RO, DI and DE/RE pins.',
      'Add a DMX Channel node for each channel you want to use.',
    ],
    outputs: {
      dmx: 'The latest universe of 512 channel values. Feed it to DMX Channel nodes.',
    },
    propertyNote: 'Universe and port must match the sender. The network fields apply to Art-Net and sACN; the UART pins apply to DMX512.',
    example: example({
      featured: 'DMXInput',
      title: 'Patch the matrix as a two-channel fixture',
      nodes: {
        dmx: ['DMXInput', { inputMode: 'Art-Net', universe: 0, previewPort: 6454 }],
        dimmer: ['DMXChannel', { channel: 1 }],
        colour: ['DMXChannel', { channel: 2 }],
        wheel: ['PaletteSampler', { palette: 'rainbow' }],
        fill: ['SolidColor'],
      },
      wires: [
        'dmx.dmx > dimmer.dmx',
        'dmx.dmx > colour.dmx',
        'dimmer.value > output.brightness',
        'colour.value > wheel.t',
        'wheel.color > fill.color',
      ],
      explanation: 'One DMX / Art-Net node receives universe 0. Two DMX Channel nodes patch it like a simple fixture: channel 1 is the dimmer, wired to the LED output’s Brightness, and channel 2 picks a colour from a rainbow palette for Solid Color.',
      preview: 'With nothing sending, both channels read 0 and the {output} is dark. Send universe 0 from a desk or app: raise channel 1 to bring the light up, and move channel 2 to sweep its colour.',
    }),
  },

  PowerMonitorInput: {
    overview: [
      'Power Monitor measures a supply rail with an INA219 or INA226 on the I2C bus: volts, amps, and the watts they make. Put it between the supply and a load — the supply on Vin+, the load on Vin−, and a shared ground.',
      'Overcurrent goes true while the current is above your limit, which is a quick way to warn, dim or shut down. Display carries the whole reading to a Segment Display, Info Display or Display Panel over one wire.',
      'Turn on Debug for a once-a-second printout of the raw readings on the serial monitor.',
      PREVIEW_STAND_IN,
    ],
    steps: [
      'Add the INA219 or INA226 board from the Hardware tab.',
      'Wire VCC, GND, SDA and SCL to the controller. Run the supply into Vin+ and the load out of Vin−, and join the load’s ground to the controller’s.',
      'Set the address to match the board’s A0/A1 jumpers.',
    ],
    outputs: {
      volts: 'Bus voltage on the load side, in volts.',
      amps: 'Current through the shunt, in amps.',
      watts: 'Volts times amps.',
      overcurrent: 'True while the current is above the Overcurrent limit.',
      display: 'The full reading for a display: volts, amps and watts on one wire.',
    },
    propertyNote: 'The limit only drives the Overcurrent output; it does not cut the power by itself.',
    example: example({
      featured: 'PowerMonitorInput',
      title: 'A power meter on a strip',
      nodes: {
        meter: ['PowerMonitorInput', { i2cAddress: '0x40', overcurrentAmps: 2.5 }],
        scale: ['MapRange', { inMin: 0, inMax: 3.2, outMin: 0, outMax: 1 }],
        bar: ['Gauge', { gaugeStyle: 'bar', direction: 'right', segments: 10, palette: 'heat', peakHold: 2 }],
        output: ['MatrixOutput', STRIP(30)],
      },
      wires: ['meter.amps > scale.value', 'scale.result > bar.value'],
      explanation: 'Power Monitor reads the load’s current. Map Range turns the INA219’s 0–3.2 A range into 0–1, and Gauge draws it as ten blocks along the strip, from cool red to white-hot, with a marker that holds the peak for two seconds.',
      preview: 'The {output} lights a few blocks for the resting current. Drag the amps slider on the Power Monitor node up and the bar fills toward white.',
    }),
  },

  RTCInput: {
    overview: [
      'RTC Clock is the graph’s sense of time of day. It can seed itself from the moment the sketch was built, from the date and time you type, from an NTP server over Wi-Fi, or from a battery-backed DS3231 module.',
      'Its outputs cover every way a graph uses time: separate hour, minute and day fields, a seconds-of-day count, a weekend flag, one DateTime wire for clocks and formatters, and one Display wire for a panel. Valid, Synced and Stale say how far to trust the reading.',
      'The preview runs the clock the chosen source will produce on the board, so a Manual time starts ticking from the moment you enter it.',
    ],
    steps: [
      'Choose a time source. For NTP, set the network and UTC offset. For a DS3231, add the module from the Hardware tab and wire it to the I2C pins.',
      'Wire DateTime to Clock Display or Format Date/Time, Display to a panel, or the separate fields to a Schedule Trigger.',
    ],
    outputs: {
      display: 'The time for a Segment Display, Info Display or Display Panel, which then shows a clock.',
      dateTime: 'The complete reading — date, time and health — on one wire for Clock Display, Format Date/Time and Schedule Trigger.',
      valid: 'True once the clock holds a real time.',
      synced: 'True when the time comes from an authority: NTP, or a healthy DS3231.',
      stale: 'True when the time has nothing behind it that survives a power cut — a Compile Time or Manual seed.',
      hour: 'Hour of the day, 0 to 23.',
      minute: 'Minute, 0 to 59.',
      second: 'Second, 0 to 59.',
      weekday: 'Day of the week, 0 (Sunday) to 6 (Saturday).',
      day: 'Day of the month, 1 to 31.',
      month: 'Month, 1 to 12.',
      year: 'Four-digit year.',
      secondsOfDay: 'Seconds since midnight, 0 to 86399. Handy for smooth daily cycles.',
      weekend: 'True on Saturday and Sunday.',
    },
    propertyNote: 'Only the fields for the chosen source are used: network settings for NTP, the pins for a DS3231, and the start fields for Manual.',
    example: example({
      featured: 'RTCInput',
      title: 'White light that follows the sun',
      nodes: {
        rtc: ['RTCInput', { timeSource: 'Compile Time' }],
        daylight: ['Expression', { formula: '0.5 - 0.5*cos(a/86400*2*PI)' }],
        white: ['Temperature'],
        fill: ['SolidColor'],
      },
      wires: ['rtc.secondsOfDay > daylight.a', 'daylight.result > white.warmth', 'white.color > fill.color'],
      explanation: 'RTC Clock counts seconds since midnight. Expression turns the day into a smooth curve — 0 at midnight, 1 at noon — and Color Temperature reads it as warmth, so the light is candle-warm at night and clear-sky cool at midday.',
      preview: 'The {output} is filled with the white for the current time: warm in the evening, cool around noon. Set a Manual time on the clock to jump through the day.',
    }),
  },

  MidiInput: {
    overview: [
      'MIDI listens to one note and one controller. Velocity is how hard that note was struck, from 0 to 1, Gate is true while it is held, and CC is the controller’s last value, also 0 to 1.',
      'In the browser it reads any controller the Web MIDI API can see. Set Source to DIN (UART) and the uploaded sketch reads a MIDI jack wired to the board as well, so a keyboard can play the finished build.',
      'Channel 0 listens to every channel. Use several MIDI nodes to map several keys or knobs.',
    ],
    steps: [
      'For the preview, plug a MIDI controller into your computer and allow MIDI access.',
      'For the board, set Source to DIN (UART) and wire a MIDI FeatherWing or opto-isolated input to the RX pin shown.',
    ],
    outputs: {
      note: 'How hard the watched note was struck, 0 to 1. Returns to 0 on release.',
      gate: 'True while the watched note is held.',
      cc: 'The watched controller’s last value, 0 to 1.',
    },
    propertyNote: 'Note and CC choose what to listen for. The UART fields apply only to DIN.',
    example: example({
      featured: 'MidiInput',
      title: 'Play a storm at sea from a keyboard',
      nodes: {
        keys: ['MidiInput', { note: 60, cc: 1 }],
        storm: ['MapRange', { inMin: 0, inMax: 1, outMin: 1, outMax: 40 }],
        bolt: ['Lightning', { color: '#dfe8ff' }],
        sea: ['Pacifica', { palette: 'deepsea', speed: 0.3 }],
        mix: ['Blend', { blendMode: 'screen', amount: 1 }],
      },
      wires: [
        'keys.gate > bolt.trigger',
        'keys.note > bolt.intensity',
        'keys.cc > storm.value',
        'storm.result > bolt.rate',
        'sea.frame > mix.a',
        'bolt.frame > mix.b',
      ],
      explanation: 'MIDI watches middle C: each press fires a lightning strike, and how hard you play it sets the flash. The mod wheel, through Map Range, sets how often the storm strikes on its own, from once a minute to forty. Blend screens the flashes over a dark Pacifica sea.',
      preview: 'The {output} shows a deep blue sea. Play middle C to throw lightning across it, and push the mod wheel up to let the storm rage.',
    }),
  },

  DdpInput: {
    overview: [
      'DDP Input receives a whole frame over the network using DDP, the protocol xLights, LedFx and WLED send. The sender does the drawing; this node puts the pixels into the graph, where you can still process them.',
      'Pixels arrive in row order, the way xLights addresses a matrix by default. Bytes not yet received read black.',
      'In the preview, the local helper listens on the same UDP port; point your sender at this computer. On the board, the sketch joins Wi-Fi and listens on that port.',
    ],
    steps: [
      'Set the network: hostname, and DHCP or a fixed address.',
      'In the sender, add a DDP output aimed at the board’s address on port 4048, sized to your matrix.',
    ],
    outputs: {
      frame: 'The most recent frame the sender delivered.',
    },
    propertyNote: 'The port must match the sender’s; 4048 is DDP’s standard port.',
    example: example({
      featured: 'DdpInput',
      title: 'Sparkle over a streamed sequence',
      nodes: {
        ddp: ['DdpInput', { previewPort: 4048 }],
        glitter: ['Glitter', { density: 0.18, glitterMode: 'add', r: 255, g: 240, b: 200 }],
      },
      wires: ['ddp.frame > glitter.frame'],
      explanation: 'DDP Input brings in frames from xLights or LedFx, and Glitter adds the board’s own sparkle on top. The sequence and the local effect mix on the controller, so the sparkle keeps going even between songs.',
      preview: 'With nothing streaming, the {output} shows only scattered warm sparkles. Start a DDP stream aimed at this computer and the sequence appears beneath them.',
    }),
  },
}

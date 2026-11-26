// Debug profiles for the rest of the shelf, built on `moduleProfile`: sensors,
// audio, storage, displays, switched loads, network and serial interfaces.

import type { DebugContext, DebugFinding, MeterReadings } from '../debugProfile'
import { near, num, pinLabel, volts, yes } from '../debugProfile'
import { offI2c } from './i2c'
import { modulePins, moduleProfile, signalStep } from './moduleProfile'
import { digitalProbe } from './probes'
import { analogProbe } from './controls'

const logicSupply = (ctx: DebugContext) => `about ${volts(ctx.logicVolts)}, or 5 V if the module’s label asks for it`
const threeVolt = () => 'about 3.3 V'
const fiveVolt = () => 'about 5 V'

function firstPin(ctx: DebugContext): number | undefined {
  return modulePins(ctx)[0]?.pin
}

/** Verdicts for a digital output that should rest at one level and move when triggered. */
function digitalFindings(ctx: DebugContext, readings: MeterReadings, restHigh: boolean, name: string): DebugFinding[] {
  const rest = num(readings, 'rest')
  const moved = yes(readings, 'moves')
  const findings: DebugFinding[] = []
  if (rest !== undefined && ctx.logicVolts < 4 && rest > 4) {
    findings.push({
      id: 'rest', tone: 'fault', title: `The ${name} drives 5 V into a 3.3 V pin`,
      detail: `Based on your readings, its output sits at ${volts(rest)}. Power it from 3V3 if it allows, or add a divider (10 kΩ over 20 kΩ) on the signal.`,
    })
  } else if (rest !== undefined && !near(rest, restHigh ? ctx.logicVolts : 0, 0.3) && (restHigh ? rest < 0.5 : rest > ctx.logicVolts * 0.7)) {
    findings.push({
      id: 'rest', tone: 'suspect', title: `The ${name} output rests at the wrong level`,
      detail: `Based on your readings, it sits at ${volts(rest)} when it should rest ${restHigh ? 'high' : 'low'}. Check the module is powered and settled, and the wire is on its output pin.`,
    })
  }
  if (moved === false) {
    findings.push({
      id: 'moves', tone: 'fault', title: `The ${name} output never changes`,
      detail: `Based on your readings, the output does not respond. Check its supply and that you are probing the output pad, then try the module alone.`,
    })
  } else if (moved === true && rest !== undefined && findings.length === 0) {
    findings.push({
      id: 'moves', tone: 'ok', title: `The ${name} responds`,
      detail: `Based on your readings, it rests at ${volts(rest)} and changes when triggered. If the project still misses it, check the pin number matches ${pinLabel(firstPin(ctx))}.`,
    })
  }
  return findings
}

/** Verdicts for an analog output swept from one end of its range to the other. */
function analogFindings(ctx: DebugContext, readings: MeterReadings, name: string): DebugFinding[] {
  const low = num(readings, 'low')
  const high = num(readings, 'high')
  if (low === undefined || high === undefined) return []
  if (Math.max(low, high) > ctx.logicVolts + 0.3) {
    return [{
      id: 'sweep', tone: 'fault', title: `The ${name} exceeds the board’s ${ctx.logicVolts} V`,
      detail: `Based on your readings, it reaches ${volts(Math.max(low, high))}. Feed it from the board’s logic supply, or divide the signal down.`,
    }]
  }
  if (near(low, high, 0.1)) {
    return [{
      id: 'sweep', tone: 'fault', title: `The ${name} output does not change`,
      detail: `Based on your readings, it stays at about ${volts(low)}. ${low < 0.2 ? 'Near 0 V points to a missing supply or GND, or a signal not landing on the pin.' : 'Check you are on the signal pad and the sensor sees a change.'}`,
    }]
  }
  return [{
    id: 'sweep', tone: 'ok', title: `The ${name} responds`,
    detail: `Based on your readings, it moves from ${volts(Math.min(low, high))} to ${volts(Math.max(low, high))}. Take your working readings in the conditions it will live in; a short sample can mislead calibration.`,
  }]
}

// ── Inputs ──────────────────────────────────────────────────────────────────

export const MOTION_PROFILE = moduleProfile({
  nodeTypes: ['MotionInput'],
  commonIssues: [
    { symptom: 'Triggers constantly for the first minute.', cause: 'A PIR sensor settles for up to a minute after power-up.', fix: 'Wait a minute with nobody moving in front of it before judging it.' },
    { symptom: 'Stays on far too long, or misses repeat movement.', cause: 'The module’s time and sensitivity trimmers, or its retrigger jumper.', fix: 'Turn the time trimmer down and set the jumper to repeat trigger (H).' },
    { symptom: 'A microwave module triggers with nobody near.', cause: 'It sees through plastic and thin walls, and moving fans or curtains count.', fix: 'Point it away from moving objects and keep metal off its back.' },
  ],
  scopeTips: ['The output is a clean high pulse lasting as long as the module’s time setting.'],
  supply: fiveVolt,
  steps: (ctx) => [
    signalStep('rest', 'Output, nothing moving', `Black probe on GND, red probe on ${pinLabel(firstPin(ctx))}. Stay still for a minute.`, 'about 0 V'),
    { id: 'moves', title: 'Output on movement', kind: 'yesno', power: 'on', how: 'Same probes. Wave a hand in front of it.', question: 'Does the reading rise to about 3.3 V?' },
  ],
  findings: (ctx, readings) => digitalFindings(ctx, readings, false, 'motion sensor'),
  probe: digitalProbe('Stay still for a minute, then wave a hand in front of it.', 'Wave a hand in front of it', (ctx) => [
    { pin: firstPin(ctx) ?? -1, pullup: false, name: 'The motion sensor', restLevel: 0 },
  ]),
})

export const DIGITAL_SENSOR_PROFILE = moduleProfile({
  nodeTypes: ['DigitalSensorInput'],
  commonIssues: [
    { symptom: 'Reads the wrong way round.', cause: 'The module is active-low: its output drops when triggered.', fix: 'Invert the signal in the graph with a Not node.' },
    { symptom: 'Never triggers.', cause: 'The module’s sensitivity trimmer is turned fully one way.', fix: 'Turn the trimmer until the module’s indicator LED just changes.' },
  ],
  scopeTips: ['The output should switch cleanly between 0 V and the logic level; slow or wobbling edges mean a weak or noisy module.'],
  supply: logicSupply,
  steps: (ctx) => [
    signalStep('rest', 'Output at rest', `Black probe on GND, red probe on ${pinLabel(firstPin(ctx))}.`, 'about 0 V or the logic level, depending on the module'),
    { id: 'moves', title: 'Output when triggered', kind: 'yesno', power: 'on', how: 'Same probes. Trigger the sensor.', question: 'Does the reading change?' },
  ],
  findings: (ctx, readings) => digitalFindings(ctx, readings, num(readings, 'rest') !== undefined && (num(readings, 'rest') ?? 0) > 1, 'sensor'),
  probe: digitalProbe('Trigger the sensor a few times.', 'Trigger it', (ctx) => [
    { pin: firstPin(ctx) ?? -1, pullup: false, name: 'The sensor', restLevel: null },
  ]),
})

export const IR_RECEIVER_PROFILE = moduleProfile({
  nodeTypes: ['IRRemoteInput'],
  commonIssues: [
    { symptom: 'Nothing is received.', cause: 'The module’s pins are in another order than expected: many have signal, +, − in different places.', fix: 'Check the pin labels on the module, not the order in a picture.' },
    { symptom: 'Works only up close, or not in daylight.', cause: 'Sunlight and some LED lighting swamp the receiver.', fix: 'Shade the receiver and test away from bright lights.' },
    { symptom: 'Some remotes work and others do not.', cause: 'The receiver is tuned to 38 kHz remotes.', fix: 'Use a 38 kHz remote; most TV remotes are.' },
  ],
  scopeTips: ['The output idles high and pulses low in bursts while a remote button is held: one burst per code, then short repeat codes.'],
  supply: logicSupply,
  steps: (ctx) => [
    signalStep('rest', 'Output at rest', `Black probe on GND, red probe on ${pinLabel(firstPin(ctx))}.`, `about ${volts(ctx.logicVolts)}`),
    { id: 'moves', title: 'Output with a remote', kind: 'yesno', power: 'on', how: 'Same probes. Hold a remote button aimed at the receiver.', question: 'Does the reading dip a little while you hold the button?' },
  ],
  findings: (ctx, readings) => digitalFindings(ctx, readings, true, 'IR receiver'),
  probe: digitalProbe('Aim a remote at the receiver and press any button.', 'Press a remote button aimed at it', (ctx) => [
    { pin: firstPin(ctx) ?? -1, pullup: false, name: 'The IR receiver', restLevel: 1 },
  ]),
})

const ANALOG_SWEEP = (what: string) => (ctx: DebugContext) => [
  signalStep('low', `Signal, ${what} low`, `Black probe on GND, red probe on ${pinLabel(firstPin(ctx))}.`, 'near one end of 0 V to the supply'),
  signalStep('high', `Signal, ${what} high`, 'Same probes.', 'clearly different from the first reading'),
]

export const ANALOG_SENSOR_PROFILE = moduleProfile({
  nodeTypes: ['AnalogSensorInput', 'LightInput'],
  applies: offI2c,
  commonIssues: [
    { symptom: 'Stuck at full or stuck at zero.', cause: 'A missing GND or supply, or the signal on the wrong pin. On an inverted mapping, stuck full means the reading is pinned low.', fix: 'Check GND first: a loose ground reads exactly like a dead sensor.' },
    { symptom: 'Saturates early.', cause: 'A 5 V-powered module overdriving a 3.3 V ADC, or an ESP32 ADC2 pin while Wi-Fi is on.', fix: 'Power the module from the board’s logic supply and use an ADC1 pin on ESP32.' },
    { symptom: 'The level is right in one room and wrong in another.', cause: 'Calibration taken from a short sample in different conditions.', fix: 'Set In Min and In Max from readings taken where the fixture will live.' },
  ],
  scopeTips: ['A steady sensor should read flat with small noise. Spikes in step with the LED frame rate point to a shared, noisy supply; add a 100 nF capacitor at the sensor.'],
  supply: logicSupply,
  steps: ANALOG_SWEEP('sensor'),
  findings: (ctx, readings) => analogFindings(ctx, readings, 'sensor'),
  probe: analogProbe('sensor', 'Take the sensor from one extreme to the other: cover it, then light it, or whatever it measures.'),
})

export const JOYSTICK_PROFILE = moduleProfile({
  nodeTypes: ['JoystickInput'],
  commonIssues: [
    { symptom: 'Centre is not in the middle.', cause: 'Cheap sticks rest off centre.', fix: 'Leave a dead zone around the centre in the graph.' },
    { symptom: 'An axis only covers part of its travel.', cause: 'A 5 V stick on a 3.3 V board, or an ADC2 pin on ESP32 with Wi-Fi on.', fix: 'Feed the stick from the board’s logic supply and use ADC1 pins.' },
  ],
  scopeTips: ['Each axis should ramp smoothly with the stick; jumps mean a worn track or loose lead.'],
  supply: logicSupply,
  steps: (ctx) => {
    const pins = modulePins(ctx)
    const x = pins.find((use) => use.propertyKey === 'xPin')?.pin
    return [
      signalStep('low', 'X axis, stick fully left', `Black probe on GND, red probe on ${pinLabel(x)}.`, 'near 0 V'),
      signalStep('high', 'X axis, stick fully right', 'Same probes.', `near ${volts(ctx.logicVolts)}`),
      signalStep('centre', 'X axis, stick released', 'Same probes.', `about ${volts(ctx.logicVolts / 2)}`),
    ]
  },
  findings: (ctx, readings) => analogFindings(ctx, readings, 'X axis'),
  probe: analogProbe('X axis', 'Push the stick fully left, then fully right.', 'xPin'),
})

export const TEMPERATURE_PROFILE = moduleProfile({
  nodeTypes: ['TemperatureInput'],
  commonIssues: [
    { symptom: 'Reads −127 °C.', cause: 'The probe does not answer: no pull-up, a broken wire, or the data line on another pin.', fix: 'Fit a 4.7 kΩ resistor from DATA to VCC and check the three wires.' },
    { symptom: 'Reads 85 °C.', cause: 'The probe’s power-up value: it reset or was read before converting, often from a weak supply.', fix: 'Check VCC at the probe and keep the leads short or use a stronger pull-up on long runs.' },
  ],
  scopeTips: ['The one-wire line idles high and shows short low pulses during each read; a line that never returns high has no pull-up.'],
  supply: logicSupply,
  steps: (ctx) => [signalStep('rest', 'DATA at rest', `Black probe on GND, red probe on ${pinLabel(firstPin(ctx))}.`, `about ${volts(ctx.logicVolts)}: the pull-up holds it high`)],
  findings: (_ctx, readings) => {
    const rest = num(readings, 'rest')
    if (rest === undefined) return []
    return rest < 0.5
      ? [{ id: 'rest', tone: 'fault', title: 'The data line is held low', detail: 'Based on your readings, DATA sits at 0 V. It has no 4.7 kΩ pull-up to VCC, or it is shorted to GND.' }]
      : [{ id: 'rest', tone: 'ok', title: 'The data line idles high', detail: `Based on your readings, DATA rests at ${volts(rest)}. If it still reads −127 °C, check the wire order against the probe’s colours.` }]
  },
})

export const ULTRASONIC_PROFILE = moduleProfile({
  nodeTypes: ['DistanceInput'],
  applies: offI2c,
  commonIssues: [
    { symptom: 'Reads 0 or the maximum all the time.', cause: 'The HC-SR04 needs 5 V; at 3.3 V it often does not range.', fix: 'Power it from 5 V.' },
    { symptom: 'Works, but a 3.3 V board resets or the pin is damaged.', cause: 'ECHO returns a 5 V pulse.', fix: 'Divide ECHO down: 1 kΩ in series, 2 kΩ to GND, before the board pin.' },
    { symptom: 'Jumpy or missing readings.', cause: 'Soft or angled surfaces scatter the sound; anything under about 2 cm is too close.', fix: 'Aim at a flat, hard target and keep it in range.' },
  ],
  scopeTips: ['Each reading is a 10 µs pulse on TRIG, then an ECHO pulse whose width is the distance (about 58 µs per centimetre).'],
  supply: fiveVolt,
  inputsOnly: false,
  findings: (_ctx, readings) => {
    const vcc = num(readings, 'vcc')
    return vcc !== undefined && vcc >= 1 && vcc < 4.5
      ? [{ id: 'vcc-low', tone: 'fault', title: 'The sensor gets less than 5 V', detail: `Based on your readings, it gets ${volts(vcc)}. Most ultrasonic modules will not range below 5 V.` }]
      : []
  },
})

export const KEYPAD_PROFILE = moduleProfile({
  nodeTypes: ['KeypadInput'],
  commonIssues: [
    { symptom: 'Keys report as other keys.', cause: 'Row and column wires in the wrong order.', fix: 'Follow the pin order on the keypad’s connector, not the colour of the ribbon.' },
    { symptom: 'A whole row or column is dead.', cause: 'One wire open.', fix: 'Find it with the wire checks below.' },
  ],
  scopeTips: ['While scanning, each row pin pulses low in turn; a pressed key shows that pulse on its column pin.'],
  inputsOnly: true,
  steps: () => [{ id: 'key', title: 'One key', kind: 'yesno', power: 'off', how: 'Meter on continuity, probes on the row and column pins of the 1 key. Press and hold it.', question: 'Does it beep only while held?' }],
  findings: (_ctx, readings) => (yes(readings, 'key') === false
    ? [{ id: 'key', tone: 'fault', title: 'The key does not close', detail: 'Based on your readings, pressing joins nothing. Check you are on that key’s row and column; if so, the keypad is damaged.' }]
    : []),
})

export const PRESENCE_PROFILE = moduleProfile({
  nodeTypes: ['PresenceInput'],
  commonIssues: [
    { symptom: 'No data arrives.', cause: 'TX and RX not crossed: the module’s TX goes to the board’s RX.', fix: 'Cross them, and check the module is powered from 5 V.' },
    { symptom: 'Sees people who are not there.', cause: 'Radar sees through thin walls and picks up fans and curtains.', fix: 'Tune its gates and point it away from moving objects.' },
  ],
  scopeTips: ['The module streams serial frames continuously; a logic analyser at its baud rate shows them on its TX.'],
  supply: fiveVolt,
})

export const TOUCH_SCREEN_PROFILE = moduleProfile({
  nodeTypes: ['TouchInput'],
  commonIssues: [
    { symptom: 'Touches land in the wrong place.', cause: 'The touch layer is not calibrated to the panel or its rotation.', fix: 'Run the calibration on the Touch Screen node.' },
    { symptom: 'No touches at all.', cause: 'T_CS shares the display’s CS, or T_IRQ is not wired.', fix: 'Give the touch controller its own chip-select pin.' },
  ],
  scopeTips: ['T_IRQ drops low while the glass is pressed; that is the quickest proof the touch layer is alive.'],
  inputsOnly: true,
})

// ── Audio ───────────────────────────────────────────────────────────────────

export const MIC_PROFILE = moduleProfile({
  nodeTypes: ['MicInput'],
  commonIssues: [
    { symptom: 'Silence.', cause: 'WS and SCK swapped, or the L/R pin selects the other channel.', fix: 'Tie L/R to GND for Left or 3V3 for Right, matching the Channel setting.' },
    { symptom: 'Loud hiss or noise.', cause: 'SD on the wrong pin, or long unshielded wires.', fix: 'Keep the I2S wires short and check SD.' },
    { symptom: 'The microphone died.', cause: 'I2S MEMS microphones are 3.3 V parts; 5 V damages them.', fix: 'Power it from 3V3 only.' },
  ],
  scopeTips: ['SCK runs continuously (about 1–3 MHz) and WS toggles at the sample rate; SD changes on SCK edges. No SCK means the board is not driving the bus.'],
  supply: threeVolt,
  findings: (_ctx, readings) => {
    const vcc = num(readings, 'vcc')
    return vcc !== undefined && vcc > 4
      ? [{ id: 'vcc-5v', tone: 'fault', title: 'The microphone gets 5 V', detail: `Based on your readings, it gets ${volts(vcc)}. Move it to 3V3 at once; it may already be damaged.` }]
      : []
  },
})

export const LINE_IN_PROFILE = moduleProfile({
  nodeTypes: ['LineInput'],
  commonIssues: [
    { symptom: 'Silence or noise.', cause: 'The ADC’s format jumpers do not match I2S, or MCLK is missing.', fix: 'Set the module to I2S, slave mode, and wire MCLK.' },
    { symptom: 'Distorted sound.', cause: 'A headphone or speaker output overdrives a line input.', fix: 'Turn the source volume down to a line level.' },
  ],
  scopeTips: ['MCLK, BCLK and LRCLK all run continuously while the board records; DOUT carries data only with audio present.'],
  supply: logicSupply,
})

export const AMPLIFIER_PROFILE = moduleProfile({
  nodeTypes: ['Amplifier'],
  commonIssues: [
    { symptom: 'Silence.', cause: 'BCLK and LRC swapped, or the amplifier’s SD (shutdown) pin held low.', fix: 'Check the I2S wires and leave SD unconnected or tied high.' },
    { symptom: 'Loud click or hum on start.', cause: 'Grounding through the speaker or a long shared ground with the LEDs.', fix: 'Give the amplifier its own ground wire to the supply.' },
    { symptom: 'Distorted at volume.', cause: 'A supply too weak for the speaker.', fix: 'Power the amplifier from 5 V with enough current, not the board’s 3V3.' },
  ],
  scopeTips: ['BCLK and LRC run continuously while sound plays. Never connect a speaker terminal to GND: these outputs are bridged.'],
  supply: fiveVolt,
  inputsOnly: true,
})

export const POWER_AMPLIFIER_PROFILE = moduleProfile({
  nodeTypes: ['PowerAmplifier'],
  commonIssues: [
    { symptom: 'Hum or buzz.', cause: 'The amplifier and the LEDs share a thin ground, or its input floats.', fix: 'Run a separate ground and keep the input wires short.' },
    { symptom: 'The amplifier shuts down or gets hot.', cause: 'A speaker terminal tied to GND: these outputs are bridged.', fix: 'Connect each speaker only across its own two output terminals.' },
  ],
  scopeTips: ['The line input should carry the audio around the middle of the supply; a flat line means the board’s DAC output is not reaching it.'],
  supply: fiveVolt,
  inputsOnly: true,
})

export const DFPLAYER_PROFILE = moduleProfile({
  nodeTypes: ['DFPlayerOutput'],
  commonIssues: [
    { symptom: 'No reply from the module.', cause: 'TX and RX not crossed, or no SD card.', fix: 'Board TX to module RX through a 1 kΩ resistor, module TX to board RX.' },
    { symptom: 'Plays nothing, or the wrong track.', cause: 'Files not named or placed as the module expects.', fix: 'Format the card FAT32 and name files 0001.mp3, 0002.mp3 in /mp3.' },
    { symptom: 'Hiss or loud pops.', cause: 'The 1 kΩ resistor missing on RX, or a speaker terminal tied to GND.', fix: 'Fit the resistor and connect the speaker only across SPK1 and SPK2.' },
  ],
  scopeTips: ['BUSY drops low while a track plays: the simplest proof that playback started.'],
  supply: fiveVolt,
})

// ── Storage ─────────────────────────────────────────────────────────────────

export const SD_CARD_PROFILE = moduleProfile({
  nodeTypes: ['SDCard'],
  commonIssues: [
    { symptom: 'The card is not found.', cause: 'The card is not FAT32, is over 32 GB, or is not fully seated.', fix: 'Format it FAT32 (use a card of 32 GB or less) and push it in until it clicks.' },
    { symptom: 'Works alone, fails with the display.', cause: 'Two SPI devices share a chip-select, or one does not release the bus.', fix: 'Give each SPI device its own CS pin.' },
    { symptom: 'A 3.3 V breakout fails on a 5 V supply.', cause: 'Breakouts without a regulator take 3.3 V only.', fix: 'Feed a bare breakout from 3V3; a module with a regulator from 5 V.' },
  ],
  scopeTips: ['CS drops low for each transfer while SCK clocks; MISO answering with all ones (0xFF) means the card is not responding.'],
  supply: (ctx) => (String(ctx.props.partId ?? '').includes('5v') ? 'about 5 V (this module has its own regulator)' : 'about 3.3 V'),
})

// ── Displays ────────────────────────────────────────────────────────────────

export const SEGMENT_DISPLAY_PROFILE = moduleProfile({
  nodeTypes: ['SegmentDisplay'],
  commonIssues: [
    { symptom: 'Blank.', cause: 'A TM1637 uses CLK and DIO, which look like I2C but are not: any two pins work, but not swapped.', fix: 'Swap CLK and DIO to test, and check brightness is above 0.' },
    { symptom: 'Garbled digits.', cause: 'Long wires on CLK, or a MAX7219 board on 3.3 V logic.', fix: 'Keep wires short; a MAX7219 wants 5 V, with a level shifter from a 3.3 V board.' },
  ],
  scopeTips: ['CLK only toggles during updates; between them both lines idle high.'],
  supply: fiveVolt,
  inputsOnly: true,
})

export const SPI_DISPLAY_PROFILE = moduleProfile({
  nodeTypes: ['TransportDisplay', 'InfoDisplay'],
  applies: offI2c,
  commonIssues: [
    { symptom: 'Backlight on, picture blank or white.', cause: 'The wrong driver chip chosen, or DC and CS swapped.', fix: 'Match the module to its driver chip (the chosen part names it) and check DC and CS.' },
    { symptom: 'No backlight.', cause: 'The backlight pin is not driven or not wired.', fix: 'Wire BL (LED) to its pin, or to 3V3 to test.' },
    { symptom: 'Picture mirrored or rotated.', cause: 'A rotation setting that does not match how the panel is mounted.', fix: 'Change the display’s rotation in the project.' },
  ],
  scopeTips: ['During a redraw SCK bursts at several MHz with CS low; DC toggles between commands and pixel data. A flat SCK means the board never sends.'],
  supply: logicSupply,
  inputsOnly: true,
})

// ── Switched loads ──────────────────────────────────────────────────────────

const SAFE_LOAD = 'If it switches a high-voltage load, leave that side disconnected and unpowered while you test, and judge the module by its click and indicator LED.'

export const RELAY_PROFILE = moduleProfile({
  nodeTypes: ['RelayOutput'],
  commonIssues: [
    { symptom: 'The relay never clicks.', cause: 'The coil needs 5 V on VCC (JD-VCC), or the module is active-low.', fix: 'Power the module from 5 V; most boards switch on when IN goes low.' },
    { symptom: 'The board resets when a relay switches.', cause: 'Coil current or switching noise on the board’s supply.', fix: 'Power the relay module from its own 5 V and join the grounds at one point.' },
  ],
  scopeTips: [SAFE_LOAD],
  supply: fiveVolt,
  inputsOnly: true,
  isolation: () => [SAFE_LOAD],
  steps: () => [{ id: 'clicks', title: 'Relay switching', kind: 'yesno', power: 'on', how: 'Run the project and switch the channel on and off.', question: 'Does the module’s LED light and the relay click?' }],
  findings: (_ctx, readings) => (yes(readings, 'clicks') === false
    ? [{ id: 'clicks', tone: 'fault', title: 'The relay does not respond', detail: 'Based on your readings, it neither lights nor clicks. Check VCC is 5 V and the IN wire; on an active-low module, the project must drive IN low to switch on.' }]
    : []),
})

export const POWER_SWITCH_PROFILE = moduleProfile({
  nodeTypes: ['PowerSwitchOutput', 'DarlingtonDriverOutput'],
  commonIssues: [
    { symptom: 'The load stays half on or never fully on.', cause: 'A MOSFET that needs more gate voltage than the board gives.', fix: 'Use a logic-level MOSFET module rated for 3.3 V gate drive.' },
    { symptom: 'The load never turns on.', cause: 'No common ground between the load supply and the board.', fix: 'Join the load supply’s GND to the board’s GND.' },
    { symptom: 'Spikes or resets when a motor or solenoid switches off.', cause: 'No flyback diode on an inductive load.', fix: 'Fit a diode across the load, or wire the driver’s COM pin to the load supply.' },
  ],
  scopeTips: ['At the gate (or input), a clean square wave should follow the project; at the load, slow edges mean a weak gate drive.'],
  inputsOnly: true,
  steps: () => [{ id: 'clicks', title: 'Load switching', kind: 'yesno', power: 'on', how: 'Run the project and switch the channel on and off.', question: 'Does the load follow?' }],
  findings: (_ctx, readings) => (yes(readings, 'clicks') === false
    ? [{ id: 'clicks', tone: 'fault', title: 'The load does not follow', detail: 'Based on your readings, switching does nothing. Check the common ground first, then the gate drive and the load’s own supply.' }]
    : []),
})

export const BUZZER_PROFILE = moduleProfile({
  nodeTypes: ['BuzzerOutput'],
  commonIssues: [
    { symptom: 'Only clicks.', cause: 'A passive buzzer driven with a steady level; it needs a tone.', fix: 'Choose the passive module in the project so it is driven with a tone.' },
    { symptom: 'One fixed pitch whatever the project asks.', cause: 'An active buzzer makes its own tone.', fix: 'Choose the active module, or swap to a passive one for pitches.' },
  ],
  scopeTips: ['A passive buzzer’s pin shows a square wave at the requested pitch; an active one shows a steady level.'],
  supply: logicSupply,
  inputsOnly: true,
})

export const FAN_PROFILE = moduleProfile({
  nodeTypes: ['CoolingFanOutput'],
  commonIssues: [
    { symptom: 'Runs flat out whatever the setting.', cause: 'A 3-wire fan has no PWM input, or PWM is unwired.', fix: 'Use a 4-wire PWM fan, with PWM on the board pin.' },
    { symptom: 'Speed reads 0.', cause: 'The tach output is open-collector and needs a pull-up.', fix: 'Fit 10 kΩ from TACH to the board’s logic supply.' },
  ],
  scopeTips: ['PWM fans want about 25 kHz; TACH gives two pulses per turn.'],
  supply: () => 'the fan’s rated voltage, often 5 V or 12 V',
  inputsOnly: true,
})

// ── Network and serial interfaces ───────────────────────────────────────────

export const ETHERNET_PROFILE = moduleProfile({
  nodeTypes: ['EthernetModule'],
  commonIssues: [
    { symptom: 'No link.', cause: 'The module draws more than the board’s 3V3 regulator spares, or the cable is unplugged at the switch.', fix: 'Check the link LEDs at the jack; feed a 5 V module from 5 V.' },
    { symptom: 'Not found at start-up.', cause: 'SPI wires swapped or CS shared with another device.', fix: 'Give it its own CS and check MOSI/MISO are not crossed.' },
  ],
  scopeTips: ['At start-up the board reads the chip’s version register: a short SPI burst with CS low. No answer on MISO means it is unpowered or miswired.'],
  supply: logicSupply,
})

export const DMX_PROFILE = moduleProfile({
  nodeTypes: ['DmxTransceiver'],
  commonIssues: [
    { symptom: 'Fixtures ignore it.', cause: 'Data+ and Data− (A and B) swapped.', fix: 'Swap the two data lines at the transceiver.' },
    { symptom: 'Flicker on long runs.', cause: 'No terminator at the end of the line.', fix: 'Fit a 120 Ω terminator at the last fixture.' },
    { symptom: 'Sends nothing.', cause: 'The driver-enable pin is not set to transmit.', fix: 'Wire DE/RE to the enable pin the project names.' },
  ],
  scopeTips: ['DMX starts each frame with a long low break, then bytes at 250 kbit/s; A and B are mirror images.'],
  supply: logicSupply,
})

export const MIDI_PROFILE = moduleProfile({
  nodeTypes: ['MidiInterface'],
  commonIssues: [
    { symptom: 'Nothing received.', cause: 'The DIN socket’s pins 4 and 5 swapped, or the cable plugged into MIDI OUT on the interface.', fix: 'Swap pins 4 and 5, and use the interface’s MIDI IN.' },
  ],
  scopeTips: ['The opto-isolated output idles high and carries bytes at 31.25 kbit/s while keys are played.'],
  supply: logicSupply,
})

export const VU_METER_PROFILE = moduleProfile({
  nodeTypes: ['StereoVuMeter'],
  commonIssues: [
    { symptom: 'A rail stays dark.', cause: 'No common ground, or data on the strip’s output end.', fix: 'Join the LED supply’s GND to the board’s GND, and feed each rail at its DIN end.' },
    { symptom: 'The rails grow from the wrong end.', cause: 'The rail direction does not match how the strip is mounted.', fix: 'Change Left and Right direction on the meter.' },
  ],
  scopeTips: ['Each data pin carries an 800 kHz burst per frame; a flat line on one rail’s pin means that rail is not being sent.'],
  inputsOnly: true,
})

export const MODULE_PROFILES = [
  MOTION_PROFILE, DIGITAL_SENSOR_PROFILE, IR_RECEIVER_PROFILE, ANALOG_SENSOR_PROFILE, JOYSTICK_PROFILE,
  TEMPERATURE_PROFILE, ULTRASONIC_PROFILE, KEYPAD_PROFILE, PRESENCE_PROFILE, TOUCH_SCREEN_PROFILE,
  MIC_PROFILE, LINE_IN_PROFILE, AMPLIFIER_PROFILE, POWER_AMPLIFIER_PROFILE, DFPLAYER_PROFILE,
  SD_CARD_PROFILE, SEGMENT_DISPLAY_PROFILE, SPI_DISPLAY_PROFILE,
  RELAY_PROFILE, POWER_SWITCH_PROFILE, BUZZER_PROFILE, FAN_PROFILE,
  ETHERNET_PROFILE, DMX_PROFILE, MIDI_PROFILE, VU_METER_PROFILE,
]

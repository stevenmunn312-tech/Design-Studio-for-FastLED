// GPIO controls shared by normal sketches and the fixed show controller.
import { sanitizePin } from './hardwarePins'
import { buttonBankHandle, normalizeButtonBankEntries } from '../state/buttonBank'
import { irRemoteButtonHandle, normalizeIrRemoteButtons } from '../state/irRemote'
import type { IrRemoteProjectNode } from './irRemoteCpp'
import { presenceSensorLoopCpp, presenceSensorSetupCpp, PRESENCE_SENSOR_HELPER_CPP } from './presenceSensorCpp'
import { LIGHT_SENSOR_HELPER_CPP, lightSensorLoopCpp, lightSensorSetupCpp } from './lightSensorCpp'
import { lightSensorTransport } from '../state/lightSensor'
import { touchButtonPressedLevel } from '../state/touchButton'
import { ENVIRONMENT_SENSOR_HELPER_CPP, environmentSensorLoopCpp } from './environmentSensorCpp'
import { TEMPERATURE_SENSOR_HELPER_CPP, temperatureSensorLoopCpp } from './temperatureSensorCpp'
import { MOTION_VECTOR_HELPER_CPP, motionVectorLoopCpp, motionVectorSetupCpp } from './motionVectorCpp'
import { TOUCH_PAD_HELPER_CPP, touchPadLoopCpp, touchPadSetupCpp } from './touchPadCpp'
import { KEYPAD_HELPER_CPP, keypadLoopCpp, keypadSetupCpp } from './keypadCpp'
import { JOYSTICK_HELPER_CPP, joystickLoopCpp, joystickSetupCpp } from './joystickCpp'
import { DISTANCE_SENSOR_HELPER_CPP, distanceSensorIncludes, distanceSensorLoopCpp, distanceSensorSetupCpp } from './distanceSensorCpp'
import { distanceSensorTransport } from '../state/distanceSensor'

export interface ControlInputEmission {
  setup: string[]
  loop: string[]
  outputs: Record<string, 'bool' | 'float'>
  /** File-scope helpers required by this input, deduped by the caller. */
  helpers?: string[]
  /** Headers needed by this input, deduped by the caller. */
  includes?: string[]
  /**
   * Set for an IR receiver. The poll itself is not in `loop`: one decode
   * serves every key, so the caller aggregates these and emits it once.
   */
  ir?: IrRemoteProjectNode
}

export function controlInputCpp(nodeType: string, id: string, p: Record<string, unknown>): ControlInputEmission | null {
  const setup: string[] = [], loop: string[] = []
  const outputs: ControlInputEmission['outputs'] = {}
  let ir: IrRemoteProjectNode | undefined
  const v = (port: string) => `n_${id}_${port.replace(/[^a-zA-Z0-9_]/g, '_')}`
  const button = (port: string, pin: number, pullup: boolean) => {
    setup.push(`  pinMode(${pin}, ${pullup ? 'INPUT_PULLUP' : 'INPUT'});`)
    loop.push(`  bool ${v(port)} = digitalRead(${pin}) == ${pullup ? 'LOW' : 'HIGH'};`)
    outputs[port] = 'bool'
  }
  switch (nodeType) {
    case 'ButtonInput':
      button('pressed', sanitizePin(p.pin, 0), p.pullup !== false)
      break
    case 'TouchButtonInput': {
      const pin = sanitizePin(p.pin, 4)
      setup.push(`  pinMode(${pin}, INPUT);`)
      loop.push(`  bool ${v('touched')} = digitalRead(${pin}) == ${touchButtonPressedLevel(p.partId)};`)
      outputs.touched = 'bool'
      break
    }
    case 'ButtonBank':
      for (const b of normalizeButtonBankEntries(p.buttons)) button(buttonBankHandle(b.id), sanitizePin(b.pin, 0), b.pullup)
      break
    case 'PotInput':
      loop.push(`  float ${v('value')} = analogRead(${sanitizePin(p.pin, 4)}) / 4095.0f;`)
      outputs.value = 'float'
      break
    case 'EncoderInput': {
      const pinA = sanitizePin(p.pinA, 6), pinB = sanitizePin(p.pinB, 7), pinSW = sanitizePin(p.pinSW, 8)
      const mode = p.pullup === false ? 'INPUT' : 'INPUT_PULLUP'
      for (const pin of [pinA, pinB]) setup.push(`  pinMode(${pin}, ${mode});`)
      loop.push(`  static int8_t _encLast_${id} = 0; static float _encPos_${id} = 0;`)
      loop.push(`  { int8_t _a=digitalRead(${pinA}),_b=digitalRead(${pinB}); int8_t _s=(_a<<1)|_b;`)
      loop.push(`    static const int8_t _encTbl_${id}[16]={0,-1,1,0, 1,0,0,-1, -1,0,0,1, 0,1,-1,0};`)
      loop.push(`    _encPos_${id}+=_encTbl_${id}[(_encLast_${id}<<2)|_s]; _encLast_${id}=_s; }`)
      button('pressed', pinSW, p.pullup !== false)
      if (p.resetOnPress === true) {
        loop.push(`  static bool _encSwLast_${id} = false;`)
        loop.push(`  if (${v('pressed')} && !_encSwLast_${id}) _encPos_${id} = 0;`)
        loop.push(`  _encSwLast_${id} = ${v('pressed')};`)
      }
      loop.push(`  float ${v('position')} = _encPos_${id};`)
      outputs.position = 'float'
      break
    }
    case 'IRRemoteInput': {
      const buttons = normalizeIrRemoteButtons(p.buttons)
      for (const button of buttons) outputs[irRemoteButtonHandle(button.id)] = 'bool'
      ir = { id, pin: sanitizePin(p.pin, 13), buttons, debug: p.debug === true }
      break
    }
    case 'PresenceInput': {
      setup.push(...presenceSensorSetupCpp(p, sanitizePin(p.rxPin, 18)))
      loop.push(...presenceSensorLoopCpp((port) => v(port)))
      outputs.presence = 'bool'
      outputs.moving = 'bool'
      outputs.still = 'bool'
      outputs.distance = 'float'
      break
    }
    case 'LightInput': {
      const digital = lightSensorTransport(p.partId) === 'i2c'
      if (digital) {
        setup.push(`  Wire.begin(${sanitizePin(p.sdaPin, 21)}, ${sanitizePin(p.sclPin, 22)});  // BH1750 I2C bus`)
        setup.push(...lightSensorSetupCpp(p))
      }
      loop.push(...lightSensorLoopCpp(p, id, (port) => v(port)))
      outputs.level = 'float'
      outputs.lux = 'float'
      break
    }
    case 'EnvironmentInput': {
      setup.push(`  Wire.begin(${sanitizePin(p.sdaPin, 21)}, ${sanitizePin(p.sclPin, 22)});  // BME280 I2C bus`)
      loop.push(...environmentSensorLoopCpp(p, id, (port) => v(port)))
      outputs.temperature = 'float'
      outputs.humidity = 'float'
      outputs.pressure = 'float'
      break
    }
    case 'TemperatureInput': {
      // The pin is driven and released by the probe helpers; the external
      // pull-up holds the idle level, so no pinMode is emitted here.
      loop.push(...temperatureSensorLoopCpp(p, id, (port) => v(port)))
      outputs.temperature = 'float'
      outputs.connected = 'bool'
      break
    }
    case 'MotionVectorInput': {
      setup.push(motionVectorSetupCpp(p))
      loop.push(...motionVectorLoopCpp(p, id, (port) => v(port)))
      for (const port of ['accelX', 'accelY', 'accelZ', 'gyroX', 'gyroY', 'gyroZ']) outputs[port] = 'float'
      outputs.connected = 'bool'
      break
    }
    case 'TouchPadInput': {
      setup.push(touchPadSetupCpp(p))
      loop.push(...touchPadLoopCpp(p, id, (port) => v(port)))
      outputs.electrode = 'float'
      outputs.touched = 'bool'
      outputs.count = 'float'
      outputs.connected = 'bool'
      break
    }
    case 'KeypadInput': {
      setup.push(...keypadSetupCpp(p))
      loop.push(...keypadLoopCpp(p, id, (port) => v(port)))
      outputs.key = 'float'
      outputs.pressed = 'bool'
      break
    }
    case 'JoystickInput': {
      setup.push(...joystickSetupCpp(p))
      loop.push(...joystickLoopCpp(p, (port) => v(port)))
      outputs.x = 'float'
      outputs.y = 'float'
      outputs.pressed = 'bool'
      break
    }
    case 'DistanceInput': {
      setup.push(...distanceSensorSetupCpp(p))
      loop.push(...distanceSensorLoopCpp(p, id, (port) => v(port)))
      outputs.distance = 'float'
      outputs.connected = 'bool'
      break
    }
    default: return null
  }
  return {
    setup,
    loop,
    outputs,
    ...(nodeType === 'PresenceInput' ? { helpers: [PRESENCE_SENSOR_HELPER_CPP.join('\n')] } : {}),
    ...(nodeType === 'LightInput' && lightSensorTransport(p.partId) === 'i2c'
      ? { helpers: [LIGHT_SENSOR_HELPER_CPP.join('\n')], includes: ['#include <Wire.h>'] }
      : {}),
    ...(nodeType === 'EnvironmentInput'
      ? { helpers: [ENVIRONMENT_SENSOR_HELPER_CPP.join('\n')], includes: ['#include <Wire.h>'] }
      : {}),
    ...(nodeType === 'TemperatureInput' ? { helpers: [TEMPERATURE_SENSOR_HELPER_CPP.join('\n')] } : {}),
    ...(nodeType === 'TouchPadInput'
      ? { helpers: [TOUCH_PAD_HELPER_CPP.join('\n')], includes: ['#include <Wire.h>'] }
      : {}),
    ...(nodeType === 'MotionVectorInput'
      ? { helpers: [MOTION_VECTOR_HELPER_CPP.join('\n')], includes: ['#include <Wire.h>'] }
      : {}),
    ...(nodeType === 'KeypadInput' ? { helpers: [KEYPAD_HELPER_CPP.join('\n')] } : {}),
    ...(nodeType === 'JoystickInput' ? { helpers: [JOYSTICK_HELPER_CPP.join('\n')] } : {}),
    ...(nodeType === 'DistanceInput'
      ? (distanceSensorTransport(p.partId) === 'i2c'
        ? { includes: distanceSensorIncludes(p.partId) }
        : { helpers: [DISTANCE_SENSOR_HELPER_CPP.join('\n')] })
      : {}),
    ...(ir ? { ir } : {}),
  }
}

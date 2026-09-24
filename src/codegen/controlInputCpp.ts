// GPIO controls shared by normal sketches and the fixed show controller.
import { sanitizePin } from './hardwarePins'
import { buttonBankHandle, normalizeButtonBankEntries } from '../state/buttonBank'
import { irRemoteButtonHandle, normalizeIrRemoteButtons } from '../state/irRemote'
import type { IrRemoteProjectNode } from './irRemoteCpp'
import { presenceSensorLoopCpp, presenceSensorSetupCpp, PRESENCE_SENSOR_HELPER_CPP } from './presenceSensorCpp'

export interface ControlInputEmission {
  setup: string[]
  loop: string[]
  outputs: Record<string, 'bool' | 'float'>
  /** File-scope helpers required by this input, deduped by the caller. */
  helpers?: string[]
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
      ir = { id, pin: sanitizePin(p.pin, 13), buttons }
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
    default: return null
  }
  return {
    setup,
    loop,
    outputs,
    ...(nodeType === 'PresenceInput' ? { helpers: [PRESENCE_SENSOR_HELPER_CPP.join('\n')] } : {}),
    ...(ir ? { ir } : {}),
  }
}

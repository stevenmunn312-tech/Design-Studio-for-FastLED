import { sanitizePin } from './hardwarePins'
import { joystickDeadzone } from '../state/joystick'

/**
 * Two potentiometer axes and a push switch. Each axis is read as a 12-bit ADC
 * count, like PotInput, centred on half scale so 0 is the stick at rest, with
 * the dead zone taken out and the rest rescaled to reach -1 and 1. The switch
 * pulls SW to ground, so it reads LOW when pressed.
 */
export const JOYSTICK_HELPER_CPP: readonly string[] = [
  '// Joystick axis: ADC count to -1..1 with a dead zone around the centre.',
  'static float _joyAxis(int raw, float dead) {',
  '  float v = (float)raw / 4095.0f * 2.0f - 1.0f;',
  '  float a = fabsf(v);',
  '  if (a <= dead) return 0.0f;',
  '  float s = (a - dead) / (1.0f - dead);',
  '  if (s > 1.0f) s = 1.0f;',
  '  return v < 0.0f ? -s : s;',
  '}',
]

export function joystickSetupCpp(props: Record<string, unknown>): string[] {
  return [`  pinMode(${sanitizePin(props.swPin, 25)}, INPUT_PULLUP);`]
}

export function joystickLoopCpp(
  props: Record<string, unknown>,
  local: (port: 'x' | 'y' | 'pressed') => string,
): string[] {
  const dead = joystickDeadzone(props.deadzone).toFixed(3)
  return [
    `  float ${local('x')} = _joyAxis(analogRead(${sanitizePin(props.xPin, 32)}), ${dead}f);`,
    `  float ${local('y')} = _joyAxis(analogRead(${sanitizePin(props.yPin, 33)}), ${dead}f);`,
    `  bool ${local('pressed')} = digitalRead(${sanitizePin(props.swPin, 25)}) == LOW;`,
  ]
}

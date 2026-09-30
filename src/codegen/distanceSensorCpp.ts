import { sanitizePin } from './hardwarePins'
import { distanceSensorSpec } from '../state/distanceSensor'

/**
 * HC-SR04 ranging by pulse width. No library: raise Trig for the part's trigger
 * pulse, then time the Echo pulse, which lasts as long as the sound takes to go
 * out and back. Sound covers about 0.343 mm per microsecond at 20 C, so the
 * one-way distance is the pulse width times 0.1715 mm.
 *
 * `pulseIn` waits for the echo, so a timeout one round trip past the maximum
 * range bounds the wait when nothing answers. The sketch takes a reading at most
 * every 60 ms, the module's own recommended cycle, and holds the last good one
 * between readings, so a missing sensor costs a bounded stall about sixteen
 * times a second rather than one on every frame.
 */
export const DISTANCE_SENSOR_HELPER_CPP: readonly string[] = [
  '// HC-SR04 ultrasonic ranging: a Trig pulse out, an Echo pulse width back.',
  'static bool _sr04Measure(uint8_t trig, uint8_t echo, uint16_t triggerUs, uint32_t timeoutUs, float &mm) {',
  '  digitalWrite(trig, LOW); delayMicroseconds(4);',
  '  digitalWrite(trig, HIGH); delayMicroseconds(triggerUs); digitalWrite(trig, LOW);',
  '  uint32_t width = pulseIn(echo, HIGH, timeoutUs);',
  '  if (width == 0) return false;',
  '  mm = (float)width * 0.1715f;',
  '  return true;',
  '}',
]

/** Trig is an output held low and Echo an input, set once in setup. */
export function distanceSensorSetupCpp(props: Record<string, unknown>): string[] {
  const trig = sanitizePin(props.trigPin, 27)
  const echo = sanitizePin(props.echoPin, 26)
  return [`  pinMode(${trig}, OUTPUT); digitalWrite(${trig}, LOW); pinMode(${echo}, INPUT);`]
}

/**
 * `connected` follows the last measurement: false until an echo arrives, and
 * again when one stops. The distance keeps its last good value while the sensor
 * is missing, so a brief dropout does not flick a mapped output to zero.
 */
export function distanceSensorLoopCpp(
  props: Record<string, unknown>,
  id: string,
  local: (port: 'distance' | 'connected') => string,
): string[] {
  const trig = sanitizePin(props.trigPin, 27)
  const echo = sanitizePin(props.echoPin, 26)
  const spec = distanceSensorSpec(props.partId)
  // One round trip past the maximum range, in microseconds.
  const timeoutUs = Math.round((spec.maxMm * 2) / 0.343) + 1000
  return [
    `  static float _sr04Mm_${id} = 0.0f; static bool _sr04Ok_${id} = false; static uint32_t _sr04T_${id} = 0;`,
    '  {',
    '    uint32_t _sr04Now = millis();',
    `    if (_sr04Now - _sr04T_${id} >= 60) {`,
    `      _sr04T_${id} = _sr04Now;`,
    `      float _sr04Value = 0.0f; _sr04Ok_${id} = _sr04Measure(${trig}, ${echo}, ${spec.triggerPulseUs}, ${timeoutUs}, _sr04Value);`,
    `      if (_sr04Ok_${id}) _sr04Mm_${id} = _sr04Value;`,
    '    }',
    '  }',
    `  float ${local('distance')} = _sr04Mm_${id};`,
    `  bool ${local('connected')} = _sr04Ok_${id};`,
  ]
}

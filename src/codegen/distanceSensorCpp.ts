import { sanitizePin } from './hardwarePins'
import { distanceSensorDevice, distanceSensorSpec, distanceSensorTransport } from '../state/peripherals/distanceSensor'

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
  if (distanceSensorTransport(props.partId) === 'i2c') {
    return [`  Wire.begin(${sanitizePin(props.sdaPin, 21)}, ${sanitizePin(props.sclPin, 22)});  // VL53L0X / VL53L1X I2C bus`]
  }
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
  if (distanceSensorTransport(props.partId) === 'i2c') {
    return distanceSensorDevice(props.partId) === 'VL53L1X' ? vl53l1xLoopCpp(id, local) : vl53l0xLoopCpp(id, local)
  }
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
    `      float _sr04Value = 0.0f; _sr04Ok_${id} = _sr04Measure(${trig}, ${echo}, ${spec.triggerPulseUs ?? 10}, ${timeoutUs}, _sr04Value);`,
    `      if (_sr04Ok_${id}) _sr04Mm_${id} = _sr04Value;`,
    '    }',
    '  }',
    `  float ${local('distance')} = _sr04Mm_${id};`,
    `  bool ${local('connected')} = _sr04Ok_${id};`,
  ]
}

/*
 * VL53L0X ranging through Pololu's VL53L0X library, pinned to the release the
 * sketch was compiled against. The sensor's start-up and calibration sequence
 * is long and sensitive, so it is the library's, not generated here.
 *
 * The sensor runs back to back and is read at most every 60 ms, the same cadence
 * as the ultrasonic part, so a read finds a finished measurement rather than
 * blocking the frame for the sensor's own budget. A sensor that does not answer,
 * or times out, leaves `connected` false and is set up again once a second; that
 * set-up can stall for a few timeouts, so an unplugged sensor costs a short hitch
 * each second. A reading of 8190 or more is the library's "nothing in range", and
 * the distance holds its last good value rather than jumping.
 */
export const VL53L0X_VERSION = '1.3.1'
export const VL53L1X_VERSION = '1.3.1'

/** The library header a sensor's chip needs. */
export function distanceSensorLibraryInclude(partId: unknown): string {
  return distanceSensorDevice(partId) === 'VL53L1X' ? '#include <VL53L1X.h>' : '#include <VL53L0X.h>'
}

/** Wire and the chip's library, for the show and player compilers. */
export function distanceSensorIncludes(partId: unknown): string[] {
  return ['#include <Wire.h>', distanceSensorLibraryInclude(partId)]
}

function vl53l0xLoopCpp(id: string, local: (port: 'distance' | 'connected') => string): string[] {
  return [
    `  static VL53L0X _vl_${id}; static bool _vlReady_${id} = false, _vlTried_${id} = false, _vlOk_${id} = false;`,
    `  static uint32_t _vlInit_${id} = 0, _vlRead_${id} = 0; static float _vlMm_${id} = 0.0f;`,
    `  if (!_vlReady_${id} && (!_vlTried_${id} || millis() - _vlInit_${id} >= 1000)) {`,
    `    _vlTried_${id} = true; _vlInit_${id} = millis();`,
    `    _vl_${id}.setTimeout(50);`,
    `    _vlReady_${id} = _vl_${id}.init();`,
    `    if (_vlReady_${id}) _vl_${id}.startContinuous();`,
    '  }',
    `  if (_vlReady_${id} && millis() - _vlRead_${id} >= 60) {`,
    `    _vlRead_${id} = millis();`,
    `    uint16_t _vlRaw_${id} = _vl_${id}.readRangeContinuousMillimeters();`,
    `    if (_vl_${id}.timeoutOccurred()) { _vlReady_${id} = false; _vlOk_${id} = false; }`,
    `    else { _vlOk_${id} = true; if (_vlRaw_${id} < 8190) _vlMm_${id} = (float)_vlRaw_${id}; }`,
    '  }',
    `  if (!_vlReady_${id}) _vlOk_${id} = false;`,
    `  float ${local('distance')} = _vlMm_${id};`,
    `  bool ${local('connected')} = _vlOk_${id};`,
  ]
}

/*
 * VL53L1X ranging through Pololu's VL53L1X library, pinned like the VL53L0X's.
 * The chip is set to long distance mode with a 50 ms timing budget and read every
 * 50 ms, which reaches about 4 m. Unlike the VL53L0X it is read without blocking:
 * `dataReady` says a measurement is waiting, and a reading is accepted only when
 * the library reports a valid range status, so a poor reflection holds the last good
 * distance instead of publishing noise. The library's `init` checks the chip's model
 * id, so an absent sensor fails at once with no stall; one that stops answering
 * for a second is set up again. `connected` is false until the first measurement.
 */
function vl53l1xLoopCpp(id: string, local: (port: 'distance' | 'connected') => string): string[] {
  return [
    `  static VL53L1X _vl_${id}; static bool _vlReady_${id} = false, _vlTried_${id} = false, _vlOk_${id} = false;`,
    `  static uint32_t _vlInit_${id} = 0, _vlSeen_${id} = 0; static float _vlMm_${id} = 0.0f;`,
    `  if (!_vlReady_${id} && (!_vlTried_${id} || millis() - _vlInit_${id} >= 1000)) {`,
    `    _vlTried_${id} = true; _vlInit_${id} = millis();`,
    `    _vlReady_${id} = _vl_${id}.init();`,
    `    if (_vlReady_${id}) {`,
    `      _vl_${id}.setDistanceMode(VL53L1X::Long); _vl_${id}.setMeasurementTimingBudget(50000);`,
    `      _vl_${id}.startContinuous(50); _vlSeen_${id} = millis();`,
    '    }',
    '  }',
    `  if (_vlReady_${id} && _vl_${id}.dataReady()) {`,
    `    uint16_t _vlRaw_${id} = _vl_${id}.read(false);`,
    `    _vlSeen_${id} = millis(); _vlOk_${id} = true;`,
    `    if (_vl_${id}.ranging_data.range_status == VL53L1X::RangeValid) _vlMm_${id} = (float)_vlRaw_${id};`,
    '  }',
    `  if (_vlReady_${id} && millis() - _vlSeen_${id} >= 1000) _vlReady_${id} = false;`,
    `  if (!_vlReady_${id}) _vlOk_${id} = false;`,
    `  float ${local('distance')} = _vlMm_${id};`,
    `  bool ${local('connected')} = _vlOk_${id};`,
  ]
}

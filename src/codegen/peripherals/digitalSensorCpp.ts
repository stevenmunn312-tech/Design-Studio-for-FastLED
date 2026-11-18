import { sanitizePin } from '../hardwarePins'
import { digitalSensorActiveLevelCpp, digitalSensorSpec } from '../../state/peripherals/digitalSensor'

/** The part named by a node, as a C++ comment: never free text, only the id with unsafe characters removed. */
const partComment = (partId: unknown) => String(partId ?? '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80)

/** Pin setup: the controller's pull-up only where the part's block asks for it. */
export function digitalSensorSetupCpp(props: Record<string, unknown>): string[] {
  const spec = digitalSensorSpec(props.partId)
  if (!spec) return []
  return [`  pinMode(${sanitizePin(props.pin, 5)}, ${spec.pullUp === 'internal' ? 'INPUT_PULLUP' : 'INPUT'});`]
}

/**
 * The reading, in the sense the preview's toggle has: true while the sensor is
 * actuated, whichever level that is on the pin. A debounced part holds a new
 * level for its debounce time before the output follows. A part that is not in
 * the catalogue reads false; the validator blocks the upload for it.
 */
export function digitalSensorLoopCpp(
  props: Record<string, unknown>,
  nodeId: string,
  local: (port: 'active') => string,
): string[] {
  const spec = digitalSensorSpec(props.partId)
  const out = local('active')
  if (!spec) return [`  bool ${out} = false;  // part ${partComment(props.partId)} is not in the catalogue`]
  const pin = sanitizePin(props.pin, 5)
  const read = `digitalRead(${pin}) == ${digitalSensorActiveLevelCpp(spec)}`
  if (spec.debounceMs === 0) return [`  bool ${out} = ${read};`]
  const id = nodeId.replace(/[^a-zA-Z0-9_]/g, '_')
  return [
    `  static bool _dsRaw_${id} = false, _dsStable_${id} = false; static uint32_t _dsSince_${id} = 0;`,
    `  bool _dsNow_${id} = ${read};`,
    `  if (_dsNow_${id} != _dsRaw_${id}) { _dsRaw_${id} = _dsNow_${id}; _dsSince_${id} = millis(); }`,
    `  if (_dsRaw_${id} != _dsStable_${id} && (uint32_t)(millis() - _dsSince_${id}) >= ${spec.debounceMs}u) _dsStable_${id} = _dsRaw_${id};`,
    `  bool ${out} = _dsStable_${id};`,
  ]
}

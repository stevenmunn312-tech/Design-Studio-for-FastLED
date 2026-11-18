import { floatLit } from '../cppLiterals'
import { sanitizePin } from '../hardwarePins'
import { ANALOG_FULL_SCALE_CPP, analogLevelCpp } from '../helpers/analogReadCpp'
import { analogSensorSpec } from '../../state/peripherals/analogSensor'
import { CALIBRATION_CURVE_CPP } from '../../state/peripherals/calibrationCurve'

/** The part named by a node, as a C++ comment: only the id, with unsafe characters removed. */
const partComment = (partId: unknown) => String(partId ?? '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80)

/** Six decimals: a table entry must survive the trip into a float. Every value was validated finite and bounded. */
const lit = (value: number) => floatLit(value, 6)

/** The shared interpolation helper, needed by any sketch with an analog sensor. */
export const ANALOG_SENSOR_HELPER_CPP = CALIBRATION_CURVE_CPP

/**
 * The reading in the part's unit: the pin as a fraction of ADC full scale,
 * mapped onto the part's ADC range in volts, through its calibration curve,
 * held to its output window. The same three steps as `analogSensorReading`.
 * A part that is not in the catalogue reads 0; the validator blocks the upload.
 */
export function analogSensorLoopCpp(
  props: Record<string, unknown>,
  nodeId: string,
  local: (port: 'value') => string,
): string[] {
  const spec = analogSensorSpec(props.partId)
  const out = local('value')
  if (!spec) return [`  float ${out} = 0.0f;  // part ${partComment(props.partId)} is not in the catalogue`]
  const id = nodeId.replace(/[^a-zA-Z0-9_]/g, '_')
  const count = spec.curve.length
  const { minVolts, maxVolts } = spec.adcRange
  return [
    ...ANALOG_FULL_SCALE_CPP,
    `  static const float _asVolts_${id}[${count}] = { ${spec.curve.map((point) => lit(point.volts)).join(', ')} };`,
    `  static const float _asValues_${id}[${count}] = { ${spec.curve.map((point) => lit(point.value)).join(', ')} };`,
    `  float _asPin_${id} = ${analogLevelCpp(sanitizePin(props.pin, 4))};`,
    `  float ${out} = constrain(_calCurve(_asVolts_${id}, _asValues_${id}, ${count}, ${lit(minVolts)} + _asPin_${id} * ${lit(maxVolts - minVolts)}), ${lit(spec.outputMin)}, ${lit(spec.outputMax)});`,
  ]
}

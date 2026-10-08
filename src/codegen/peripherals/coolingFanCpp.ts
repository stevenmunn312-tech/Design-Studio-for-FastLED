import type { PartFanSpec } from '../../build/parts/partCatalogue'

export interface CoolingFanEmit {
  id: string
  pwmPin: number
  tachPin: number
  /** ESP32 core-2 LEDC channel; core 3 assigns one from the PWM pin. */
  channel: number
  speedExpr: string
  rpmVar: string
  runningVar: string
  spec: PartFanSpec
}

/** One ISR per fan keeps tachometer pulses independent and allocation-free. */
export function coolingFanGlobalCpp(emit: CoolingFanEmit): string[] {
  return [
    '#if defined(ARDUINO_ARCH_ESP32)',
    `static volatile uint32_t _fanPulses_${emit.id} = 0;`,
    `static void IRAM_ATTR _fanTach_${emit.id}() { ++_fanPulses_${emit.id}; }`,
    '#endif',
  ]
}

/** ESP32 LEDC drives the fan's required 25 kHz signal, off before attach. */
export function coolingFanSetupCpp(emit: CoolingFanEmit): string[] {
  return [
    `  digitalWrite(${emit.pwmPin}, LOW);`,
    `  pinMode(${emit.pwmPin}, OUTPUT);`,
    `  pinMode(${emit.tachPin}, INPUT_PULLUP);`,
    '#if defined(ARDUINO_ARCH_ESP32)',
    '#if ESP_ARDUINO_VERSION_MAJOR >= 3',
    `  ledcAttach(${emit.pwmPin}, ${Math.round(emit.spec.pwmHz)}, 8);`,
    `  ledcWrite(${emit.pwmPin}, 0);`,
    '#else',
    `  ledcSetup(${emit.channel}, ${Math.round(emit.spec.pwmHz)}, 8);`,
    `  ledcAttachPin(${emit.pwmPin}, ${emit.channel});`,
    `  ledcWrite(${emit.channel}, 0);`,
    '#endif',
    `  attachInterrupt(digitalPinToInterrupt(${emit.tachPin}), _fanTach_${emit.id}, FALLING);`,
    '#endif',
  ]
}

/** Drive requested duty and publish RPM measured over a half-second window. */
export function coolingFanLoopCpp(emit: CoolingFanEmit): string[] {
  const pulses = emit.spec.tachPulsesPerRevolution.toFixed(1)
  return [
    `  float _fanSpeed_${emit.id} = constrain(${emit.speedExpr}, 0.0f, 1.0f);`,
    `  uint8_t _fanDuty_${emit.id} = (uint8_t)(_fanSpeed_${emit.id} * 255.0f + 0.5f);`,
    '#if defined(ARDUINO_ARCH_ESP32)',
    '#if ESP_ARDUINO_VERSION_MAJOR >= 3',
    `  ledcWrite(${emit.pwmPin}, _fanDuty_${emit.id});`,
    '#else',
    `  ledcWrite(${emit.channel}, _fanDuty_${emit.id});`,
    '#endif',
    `  static uint32_t _fanSampleMs_${emit.id} = millis();`,
    `  static float _fanRpm_${emit.id} = 0.0f;`,
    `  uint32_t _fanNow_${emit.id} = millis();`,
    `  uint32_t _fanElapsed_${emit.id} = _fanNow_${emit.id} - _fanSampleMs_${emit.id};`,
    `  if (_fanElapsed_${emit.id} >= 500u) {`,
    '    noInterrupts();',
    `    uint32_t _fanCount_${emit.id} = _fanPulses_${emit.id};`,
    `    _fanPulses_${emit.id} = 0;`,
    '    interrupts();',
    `    _fanRpm_${emit.id} = _fanSpeed_${emit.id} > 0.0f ? (_fanCount_${emit.id} * 60000.0f) / (_fanElapsed_${emit.id} * ${pulses}f) : 0.0f;`,
    `    _fanSampleMs_${emit.id} = _fanNow_${emit.id};`,
    '  }',
    `  float ${emit.rpmVar} = _fanRpm_${emit.id};`,
    `  bool ${emit.runningVar} = _fanRpm_${emit.id} > 0.5f;`,
    '#else',
    `  float ${emit.rpmVar} = 0.0f;`,
    `  bool ${emit.runningVar} = false;`,
    '#endif',
  ]
}

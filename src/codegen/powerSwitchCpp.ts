/*
 * PWM for a dimmed Power Switch.
 *
 * Every Arduino core has PWM and each names it differently, so the sketch
 * carries one small shim rather than assuming ESP32. Eight bits everywhere:
 * AVR's timer PWM cannot do more, and 256 steps is finer than a load driven
 * through an optocoupler at a few hundred hertz can resolve. The frequency is
 * the part's (`powerSwitchPwmHz`). AVR cannot set one and keeps its fixed
 * ~490 Hz, which is close to the LR7843's 500 Hz on purpose.
 *
 * On ESP32 core 2 each channel is chosen by the caller. Core 3 assigns its
 * own and ignores the argument.
 */
export const POWER_SWITCH_PWM_HELPER_CPP = `// Power Switch dimming: one PWM shim for every Arduino core.
static void flsPwmBegin(uint8_t pin, uint8_t channel, uint32_t hz) {
#if defined(ESP32)
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  (void)channel;
  ledcAttach(pin, hz, 8);
#else
  ledcSetup(channel, hz, 8);
  ledcAttachPin(pin, channel);
#endif
#elif defined(ESP8266) || defined(ARDUINO_ARCH_RP2040)
  (void)pin; (void)channel;
  analogWriteFreq(hz);
  analogWriteRange(255);
#elif defined(TEENSYDUINO)
  (void)channel;
  analogWriteFrequency(pin, hz);
#else
  (void)pin; (void)channel; (void)hz;
#endif
}

// 0-1 to an 8-bit duty. Anything that is not a positive number is off.
static uint8_t flsPwmDuty(float level, bool activeHigh) {
  float clamped = level > 0.0f ? (level < 1.0f ? level : 1.0f) : 0.0f;
  uint8_t duty = (uint8_t)(clamped * 255.0f + 0.5f);
  return activeHigh ? duty : (uint8_t)(255 - duty);
}

static void flsPwmWrite(uint8_t pin, uint8_t channel, uint8_t duty) {
#if defined(ESP32)
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  (void)channel;
  ledcWrite(pin, duty);
#else
  ledcWrite(channel, duty);
#endif
#else
  (void)channel;
  analogWrite(pin, duty);
#endif
}
`

export interface PowerSwitchPwmEmit {
  /** Sanitised C++ identifier stem for this node. */
  id: string
  pin: number
  /** LEDC channel on ESP32 core 2; ignored everywhere else. */
  channel: number
  hz: number
  activeHigh: boolean
  /** C++ bool: may the load run at all. */
  gateExpr: string
  /** C++ float: the requested 0-1 level. */
  levelExpr: string
}

/** Setup lines: held off, then handed to PWM still off. */
export function powerSwitchPwmSetupCpp(emit: PowerSwitchPwmEmit): string[] {
  const off = emit.activeHigh ? 'LOW' : 'HIGH'
  return [
    `  digitalWrite(${emit.pin}, ${off});`,
    `  pinMode(${emit.pin}, OUTPUT);`,
    `  flsPwmBegin(${emit.pin}, ${emit.channel}, ${Math.round(emit.hz)});`,
    `  flsPwmWrite(${emit.pin}, ${emit.channel}, flsPwmDuty(0.0f, ${emit.activeHigh}));`,
  ]
}

/**
 * Loop lines. The duty is written only when it changes: rewriting the same
 * value every frame restarts the waveform on some cores (ESP8266's software
 * PWM among them), which would show as flicker on the load.
 */
export function powerSwitchPwmLoopCpp(emit: PowerSwitchPwmEmit): string[] {
  const last = `n_${emit.id}_pwmDuty`
  return [
    `  {`,
    `    static int16_t ${last} = -1;`,
    `    uint8_t duty = flsPwmDuty((${emit.gateExpr}) ? (float)(${emit.levelExpr}) : 0.0f, ${emit.activeHigh});`,
    `    if (duty != ${last}) {`,
    `      flsPwmWrite(${emit.pin}, ${emit.channel}, duty);`,
    `      ${last} = duty;`,
    `    }`,
    `  }`,
  ]
}

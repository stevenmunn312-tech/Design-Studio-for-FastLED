/*
 * PWM for a dimmed Power Switch channel.
 *
 * Every Arduino core has PWM and each names it differently, so the sketch
 * carries one small shim rather than assuming ESP32. Eight bits everywhere:
 * AVR's timer PWM cannot do more, and 256 steps is finer than a load driven
 * through an optocoupler at a few hundred hertz can resolve. The frequency is
 * the part's (`powerSwitchPwmHz`), which two boards need not share: the
 * LR7843 dims at 500 Hz and the Mosfetti at 1 kHz. AVR cannot set one and
 * keeps its fixed ~490 Hz, which is close to the LR7843's on purpose.
 *
 * ESP8266 and RP2040 set one frequency for every PWM pin, so the shim is
 * built with the lowest any dimmed part in the sketch asks for. Slower is the
 * safe direction: the LR7843's gate drive loses more to switching as the
 * frequency rises, while the Mosfetti's GPIO-driven gate is as happy at
 * 500 Hz as at 1 kHz. Teensy takes the same frequency: it sets one per timer,
 * and pins on a shared timer would otherwise run at whichever part started
 * last, which could be the LR7843 at 1 kHz.
 *
 * On ESP32 core 2 each channel is chosen by the caller (`powerSwitchPwmPlan`).
 * Core 3 assigns its own and ignores the argument.
 */
export function powerSwitchPwmHelperCpp(sharedHz: number): string {
  return `// Power Switch dimming: one PWM shim for every Arduino core.
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
  // One frequency for every PWM pin on these cores: the slowest part's.
  (void)pin; (void)channel; (void)hz;
  analogWriteFreq(${Math.round(sharedHz)});
  analogWriteRange(255);
#elif defined(TEENSYDUINO)
  // One frequency per timer here, and the generator does not know which pins
  // share one: the slowest part's, as above.
  (void)channel; (void)hz;
  analogWriteFrequency(pin, ${Math.round(sharedHz)});
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
}

/** One dimmed channel in the sketch: `key` is `${nodeId}:${channelIndex}`. */
export interface DimmedPowerSwitchChannel {
  key: string
  hz: number
}

export interface PowerSwitchPwmPlan {
  /** The ESP32 core-2 LEDC channel for each dimmed channel, by key. */
  ledcChannels: Map<string, number>
  /** The one frequency ESP8266 and RP2040 run every PWM pin at. */
  sharedHz: number
}

/**
 * LEDC channels for every dimmed switch channel in the sketch.
 *
 * Core 2's LEDC channels share a timer in pairs (0 and 1, 2 and 3, and so on),
 * and a timer runs at one frequency: setting up a 1 kHz channel beside a
 * 500 Hz one retunes both. So channels are handed out one frequency at a
 * time, and each new frequency starts on an even channel. With one frequency
 * in the sketch this is simply 0, 1, 2 in order.
 */
export function powerSwitchPwmPlan(dimmed: readonly DimmedPowerSwitchChannel[]): PowerSwitchPwmPlan {
  const ledcChannels = new Map<string, number>()
  const frequencies = [...new Set(dimmed.map((entry) => entry.hz))]
  let next = 0
  for (const hz of frequencies) {
    if (next % 2 === 1) next += 1
    for (const entry of dimmed) {
      if (entry.hz === hz) ledcChannels.set(entry.key, next++)
    }
  }
  return {
    ledcChannels,
    sharedHz: dimmed.length > 0 ? Math.min(...dimmed.map((entry) => entry.hz)) : 0,
  }
}

export interface PowerSwitchPwmEmit {
  /** Sanitised C++ identifier stem for this channel. */
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

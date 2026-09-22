import { describe, expect, it } from 'vitest'
import { generateIrLearnSketch } from '../irLearnSketch'

describe('IR learn sketch', () => {
  const sketch = generateIrLearnSketch({ pin: 13 })

  it('prints a versioned FLS_IR line from the receiver pin and nothing else', () => {
    expect(sketch).toContain('IrReceiver.begin(IR_LEARN_PIN, DISABLE_LED_FEEDBACK)')
    expect(sketch).toContain('static constexpr uint8_t IR_LEARN_PIN = 13;')
    expect(sketch).toContain('FLS_IR v=1 protocol=%s address=0x%lX command=0x%lX repeat=%d')
    expect(sketch).toContain('#include <IRremote.hpp>')
    expect(sketch).toContain('#define DECODE_NEC')
    expect(sketch).not.toContain('#include <FastLED')
  })
})

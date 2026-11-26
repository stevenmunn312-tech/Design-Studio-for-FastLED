import { describe, expect, it } from 'vitest'
import { generateIrLearnSketch } from '../irLearnSketch'
import { IR_RMT_RECEIVER_CPP } from '../../peripherals/irRmtReceiverCpp'

describe('IR learn sketch', () => {
  const sketch = generateIrLearnSketch({ pin: 13 })

  it('prints a versioned FLS_IR line from the receiver pin and nothing else', () => {
    expect(sketch).toContain('FLS_IR_RECEIVER.begin(IR_LEARN_PIN, DISABLE_LED_FEEDBACK)')
    expect(sketch).toContain(IR_RMT_RECEIVER_CPP)
    expect(sketch).toContain('if (!FLS_IR_RECEIVER.decode()) return;')
    expect(sketch).toContain('FLS_IR_RECEIVER.resume();')
    expect(sketch).toContain('static constexpr uint8_t IR_LEARN_PIN = 13;')
    expect(sketch).toContain('Serial.print(F("FLS_IR v=1 protocol="));')
    expect(sketch).toContain('Serial.print((unsigned long)IrReceiver.decodedIRData.command, HEX);')
    // Learning must build on AVR and Renesas, whose cores have no Serial.printf.
    expect(sketch).not.toContain('printf(')
    expect(sketch).toContain('#include <IRremote.hpp>')
    expect(sketch).toContain('#define DECODE_NEC')
    expect(sketch).not.toContain('#include <FastLED')
  })
})

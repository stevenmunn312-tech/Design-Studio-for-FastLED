/*
 * The probe exists because a pin map copied from documentation and one
 * measured on the board look identical in the source. So what is asserted here
 * is mostly about honesty: that it reports misses as well as hits, that it
 * refuses to call a mount a pass on the library's word alone, and that it
 * cannot clock a shared bus while another device on it is still selected.
 */
import { describe, expect, it } from 'vitest'
import {
  CYD_DESELECT_PINS,
  CYD_SD_CANDIDATES,
  generateSdPinProbeSketch,
} from '../sdPinProbeSketch'
import { CYD_TOUCH_DISPLAY } from '../../state/integratedBoardHardware'

const cyd = () => generateSdPinProbeSketch({
  candidates: CYD_SD_CANDIDATES, deselectPins: CYD_DESELECT_PINS,
})

describe('the SD pin probe', () => {
  it('refuses to generate with nothing to try', () => {
    expect(() => generateSdPinProbeSketch({ candidates: [] }))
      .toThrow(/at least one candidate/)
  })

  it('emits every candidate, in the order given', () => {
    const sketch = cyd()
    const offsets = CYD_SD_CANDIDATES.map((candidate) =>
      sketch.indexOf(`{ ${candidate.csPin}, ${candidate.sckPin}, ${candidate.misoPin}, ${candidate.mosiPin},`))
    expect(offsets.every((offset) => offset > -1)).toBe(true)
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets)
  })

  /*
   * The one that would ruin a panel rather than merely fail.
   *
   * A candidate sharing the display's bus clocks data past it, which is safe
   * only while the panel's chip select is high. The CYD's panel and digitiser
   * selects come from `integratedBoardHardware.ts` rather than being restated,
   * so a bench correction there carries into the probe.
   */
  it('holds every other chip select on the board high before clocking', () => {
    const sketch = cyd()
    expect(sketch).toContain(`static const uint8_t DESELECT[] = { ${CYD_DESELECT_PINS.join(', ')} };`)
    const deselect = sketch.indexOf('digitalWrite(DESELECT[i], HIGH)')
    expect(deselect).toBeGreaterThan(-1)
    // In setup, before loop() ever calls a candidate.
    expect(deselect).toBeLessThan(sketch.indexOf('void loop()'))
  })

  it("names the panel's own chip select among them", () => {
    // Not a literal: the panel's CS is wherever the board model says it is.
    expect(CYD_DESELECT_PINS).toContain(CYD_TOUCH_DISPLAY.panelProperties.csPin as number)
    expect(CYD_DESELECT_PINS).toContain(CYD_TOUCH_DISPLAY.panelProperties.touchCsPin as number)
  })

  it('does not take the Arduino SPI singleton the panel may own', () => {
    const sketch = cyd()
    expect(sketch).toContain('static SPIClass probeBus(HSPI)')
    expect(sketch).not.toMatch(/\bSPI\.begin\(/)
  })

  /*
   * A mount is not evidence. A floating MISO can read as a reply, so the probe
   * asks the card to name itself and state a size before calling it a find —
   * otherwise the first candidate tried would "pass" on any board.
   */
  it('only calls it a find when the card answers with a type and a size', () => {
    const sketch = cyd()
    expect(sketch).toContain('if (type == CARD_NONE || bytes == 0)')
    const guard = sketch.indexOf('type == CARD_NONE || bytes == 0')
    expect(guard).toBeLessThan(sketch.indexOf('FLS_SD FOUND'))
  })

  it('reports a miss rather than staying silent, and retries', () => {
    const sketch = generateSdPinProbeSketch({ candidates: CYD_SD_CANDIDATES, retrySeconds: 9 })
    expect(sketch).toContain('no card mounted on these pins')
    expect(sketch).toContain('no candidate mounted a card')
    expect(sketch).toContain('delay(9000)')
  })

  it('releases the bus after every attempt, hit or miss', () => {
    const sketch = cyd()
    // Three exits from tryCandidate: failed mount, unanswering card, success.
    expect((sketch.match(/SD\.end\(\);/g) ?? []).length).toBe(3)
    expect((sketch.match(/probeBus\.end\(\);/g) ?? []).length).toBe(3)
  })

  it('writes nothing to the card', () => {
    const sketch = cyd()
    expect(sketch).not.toMatch(/FILE_WRITE|SD\.remove|SD\.mkdir|\.print\(/)
  })
})

/*
 * The trap this sketch actually fell into, and it is not specific to this file.
 *
 * Generated C++ lives inside TypeScript template literals, where `\n` is a real
 * newline and only `\n` survives into the C source as an escape. Get it wrong
 * and every `printf` string is split across two lines: the literal terminates at
 * the line end and its remaining text becomes code. The compiler then reports
 * whatever that text happens to start with — here "extended character — is not
 * valid in an identifier", pointing at an em dash that was never the problem.
 *
 * CLAUDE.md already records the backtick version of this trap. Rather than add
 * a second thing to remember, assert the property that fails: a C string cannot
 * span a line, so every line of the emitted sketch must have balanced quotes.
 */
describe('the emitted sketch survives its own template literal', () => {
  const BACKSLASH = String.fromCharCode(92)

  /** Quotes on one line, ignoring escaped ones and character literals. */
  function unescapedQuotes(line: string): number {
    let count = 0
    for (let i = 0; i < line.length; i++) {
      if (line[i] !== '"') continue
      let backslashes = 0
      for (let j = i - 1; j >= 0 && line[j] === BACKSLASH; j--) backslashes++
      if (backslashes % 2 === 0) count++
    }
    return count
  }

  it('never leaves a string literal open at the end of a line', () => {
    const offenders = cyd().split('\n')
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => unescapedQuotes(line) % 2 !== 0)
      .map(({ line, index }) => `${index + 1}: ${line.trim()}`)
    expect(offenders, 'a C string cannot span a line: check the newline escapes').toEqual([])
  })

  it('emits newline escapes rather than actual newlines inside strings', () => {
    /*
     * Both forms are built rather than written, because writing them is the
     * mistake: in a test about an escape that does not survive its own source,
     * a literal would be subject to the very substitution under test.
     */
    const escaped = BACKSLASH + 'n'
    const real = String.fromCharCode(10)
    const sketch = cyd()
    expect(sketch).toContain('no card mounted on these pins' + escaped)
    expect(sketch).not.toContain('no card mounted on these pins' + real)
  })
})

/**
 * The power-on register sequence each controller needs, as data.
 *
 * Both colour-panel drivers used to carry the same hardcoded block, described
 * in `tftDisplayCpp.ts` as "from the ST7789 application notes" — and sent it to
 * every panel, including the ILI9341. Those opcodes do not mean the same thing
 * on that silicon: 0xBB and 0xD0 are undefined there, 0xB2 is a different
 * register with a different argument count, and the power, VCOM and gamma set
 * an ILI9341 actually needs (0xC0/0xC1, 0xC5/0xC7, 0xE0/0xE1) was never sent at
 * all. A panel left unconfigured that way comes up dark, which is
 * indistinguishable from a wiring fault and was read as one for a long time.
 *
 * Kept as data in one module rather than as code in two, because the two
 * emitters had already drifted into duplicating it and a third controller would
 * have had to be added twice. The rendering stays with each emitter, since they
 * name their own command primitives.
 */
export interface TftInitCommand {
  /** Controller opcode. */
  cmd: number
  /** Parameter bytes, if the opcode takes any. */
  data?: readonly number[]
  /** Settling time the datasheet asks for after this command. */
  delayMs?: number
}

/**
 * ST7789 / ST7789V — byte-for-byte what both drivers already emitted, so a
 * working panel sees no change from this refactor.
 */
const ST7789_INIT: readonly TftInitCommand[] = [
  { cmd: 0xB2, data: [0x0C, 0x0C, 0x00, 0x33, 0x33] },
  { cmd: 0xB7, data: [0x35] },
  { cmd: 0xBB, data: [0x19] },
  { cmd: 0xC0, data: [0x2C] },
  { cmd: 0xC2, data: [0x01, 0xFF] },
  { cmd: 0xC3, data: [0x12] },
  { cmd: 0xC4, data: [0x20] },
  { cmd: 0xC6, data: [0x0F] },
  { cmd: 0xD0, data: [0xA4, 0xA1] },
]

/**
 * ILI9341 — the manufacturer's power-on sequence.
 *
 * The leading vendor-specific commands (0xEF, 0xCF, 0xED, 0xE8, 0xCB, 0xF7,
 * 0xEA) are undocumented in the datasheet's register list but are in every
 * working driver for this part; they set the charge pump and power-on timing,
 * and a panel without them can come up blank or unstable. Everything after is
 * documented: power control, VCOM, frame rate, display function, then the two
 * fifteen-entry gamma tables.
 *
 * MADCTL and COLMOD are deliberately absent — both drivers already send those
 * themselves, MADCTL from the rotation the node carries.
 */
const ILI9341_INIT: readonly TftInitCommand[] = [
  { cmd: 0xEF, data: [0x03, 0x80, 0x02] },
  { cmd: 0xCF, data: [0x00, 0xC1, 0x30] },
  { cmd: 0xED, data: [0x64, 0x03, 0x12, 0x81] },
  { cmd: 0xE8, data: [0x85, 0x00, 0x78] },
  { cmd: 0xCB, data: [0x39, 0x2C, 0x00, 0x34, 0x02] },
  { cmd: 0xF7, data: [0x20] },
  { cmd: 0xEA, data: [0x00, 0x00] },
  { cmd: 0xC0, data: [0x23] },
  { cmd: 0xC1, data: [0x10] },
  { cmd: 0xC5, data: [0x3E, 0x28] },
  { cmd: 0xC7, data: [0x86] },
  { cmd: 0xB1, data: [0x00, 0x18] },
  { cmd: 0xB6, data: [0x08, 0x82, 0x27] },
  { cmd: 0xF2, data: [0x00] },
  { cmd: 0x26, data: [0x01] },
  { cmd: 0xE0, data: [0x0F, 0x31, 0x2B, 0x0C, 0x0E, 0x08, 0x4E, 0xF1,
    0x37, 0x07, 0x10, 0x03, 0x0E, 0x09, 0x00] },
  { cmd: 0xE1, data: [0x00, 0x0E, 0x14, 0x03, 0x11, 0x07, 0x31, 0xC1,
    0x48, 0x08, 0x0F, 0x0C, 0x31, 0x36, 0x0F] },
]

/**
 * The electrical setup for a controller, by descriptor id.
 *
 * An id with no entry falls back to the ST7789 block, which is what every panel
 * received before this existed — the safer wrong answer for a controller nobody
 * has characterised, and unchanged behaviour for the ones that already worked.
 */
export function tftInitSequence(controllerId: string): readonly TftInitCommand[] {
  return controllerId === 'ILI9341' ? ILI9341_INIT : ST7789_INIT
}

/**
 * A controller's sequence as a C array the drivers can walk.
 *
 * Flat `opcode, count, bytes...` rather than a struct array, so the walk needs
 * no type and therefore never meets the .ino prototype hoist that
 * `displayForwardDeclarations.test.ts` exists to catch.
 */
export function tftInitStreamCpp(name: string, controllerId: string): { name: string; lines: string[] } {
  const bytes: number[] = []
  for (const step of tftInitSequence(controllerId)) {
    const data = step.data ?? []
    bytes.push(step.cmd, data.length, ...data)
  }
  const hex = bytes.map((b) => `0x${b.toString(16).toUpperCase().padStart(2, '0')}`)
  // Wrapped, because one of these is over eighty bytes and a single line of
  // that in a generated sketch is unreadable when something goes wrong.
  const rows: string[] = []
  for (let i = 0; i < hex.length; i += 12) rows.push(`    ${hex.slice(i, i + 12).join(', ')},`)
  return {
    name,
    lines: [`  static const uint8_t ${name}[] = {`, ...rows, `  };`],
  }
}

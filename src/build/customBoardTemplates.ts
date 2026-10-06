/** Reviewed module constraints. Never derive these from stock header omissions
 * or the mixed boardReservedOrNotExposed prose. Unknown exclusions stay blocked. */
export interface CustomBoardTemplate {
  referenceProfileId: string
  capabilityFqbn: string
  /** Pins the module itself makes unusable, whatever a custom PCB brings out. */
  blockedGpios: Readonly<Record<number, string>>
  /**
   * Usable pins that are never handed out automatically: boot straps, the
   * upload/monitor UART and native USB. A user may still choose one by hand,
   * with this caution shown, exactly as on the stock boards.
   */
  cautionGpios: Readonly<Record<number, string>>
  sources: readonly string[]
}

const classicBlocked: Readonly<Record<number, string>> = Object.fromEntries([
  ...[6, 7, 8, 9, 10, 11].map((pin) => [pin, 'Connected to the WROOM module SPI flash.']),
  ...[20, 24, 28, 29, 30, 31, 37, 38].map((pin) => [pin, 'Not available as GPIO on this WROOM module.']),
])
const classicCaution: Readonly<Record<number, string>> = {
  0: 'Strapping pin — must be high at boot.',
  1: 'UART0 TX — used for upload and the serial monitor.',
  2: 'Strapping pin — check the required boot level.',
  3: 'UART0 RX — used for upload and the serial monitor.',
  5: 'Strapping pin — check the required boot level.',
  12: 'Strapping pin sets flash voltage — usually must be low at boot.',
  15: 'Strapping pin — check the required boot level.',
}
const s3Blocked: Readonly<Record<number, string>> = Object.fromEntries([
  ...[22, 23, 24, 25].map((pin) => [pin, 'Not present as GPIO on ESP32-S3.']),
  ...[26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37].map((pin) => [pin, 'Unavailable on the selected WROOM-1 module with octal PSRAM.']),
])
const s3Caution: Readonly<Record<number, string>> = {
  0: 'Strapping pin — must be high at boot.',
  3: 'Strapping pin — check the required boot level.',
  19: 'Native USB D− — used when uploading or monitoring over native USB.',
  20: 'Native USB D+ — used when uploading or monitoring over native USB.',
  43: 'UART0 TX — used for upload and the serial monitor.',
  44: 'UART0 RX — used for upload and the serial monitor.',
  45: 'Strapping pin — check the required boot level.',
  46: 'Strapping pin and input-only.',
}

const classicSources = ['https://documentation.espressif.com/esp32-wroom-32_datasheet_en.html']
const s3Sources = ['https://docs.espressif.com/projects/esp-idf/en/v5.3/esp32s3/hw-reference/esp32s3/user-guide-devkitc-1.html']

export const CUSTOM_BOARD_TEMPLATES: readonly CustomBoardTemplate[] = [
  {
    referenceProfileId: 'esp32-generic-devkit-38pin', capabilityFqbn: 'esp32:esp32:esp32',
    blockedGpios: classicBlocked, cautionGpios: classicCaution, sources: classicSources,
  },
  {
    referenceProfileId: 'esp32-devkit-v1-30pin-esp32d', capabilityFqbn: 'esp32:esp32:esp32',
    blockedGpios: classicBlocked, cautionGpios: classicCaution, sources: classicSources,
  },
  {
    referenceProfileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc', capabilityFqbn: 'esp32:esp32:esp32s3',
    blockedGpios: s3Blocked, cautionGpios: s3Caution, sources: s3Sources,
  },
]

export function customBoardTemplate(referenceProfileId: string): CustomBoardTemplate | undefined {
  return CUSTOM_BOARD_TEMPLATES.find((template) => template.referenceProfileId === referenceProfileId)
}

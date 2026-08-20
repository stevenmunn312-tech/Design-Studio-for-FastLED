import { targetFamilyFromFqbn, type BuildTargetFamily } from '../build/buildProfile'
import type { PhysicalBoardProfile } from '../build/boardProfiles'

// Arduino-ESP32 SD/SPI defaults. These are the core's SS aliases used by
// SD.begin() for each Espressif target, not arbitrary free-pin suggestions.
export interface SdSpiPins {
  cs: number
  sck: number
  miso: number
  mosi: number
}

const ESPRESSIF_SD_SPI: Partial<Record<BuildTargetFamily, SdSpiPins>> = {
  esp32: { cs: 5, sck: 18, miso: 19, mosi: 23 },
  'esp32-s2': { cs: 34, sck: 36, miso: 37, mosi: 35 },
  'esp32-s3': { cs: 10, sck: 12, miso: 13, mosi: 11 },
  'esp32-c3': { cs: 7, sck: 4, miso: 5, mosi: 6 },
  'esp32-c6': { cs: 18, sck: 21, miso: 20, mosi: 19 },
  'esp32-h2': { cs: 0, sck: 10, miso: 11, mosi: 25 },
  esp8266: { cs: 15, sck: 14, miso: 12, mosi: 13 },
}

export function sdCsPinDefaultForBoard(
  profile: PhysicalBoardProfile | undefined,
  fqbn = '',
): number | null {
  const family = profile?.targetFamilies[0] ?? targetFamilyFromFqbn(fqbn)
  return ESPRESSIF_SD_SPI[family]?.cs ?? null
}

export function sdSpiPinsForBoard(
  profile: PhysicalBoardProfile | undefined,
  fqbn = '',
): SdSpiPins | null {
  const family = profile?.targetFamilies[0] ?? targetFamilyFromFqbn(fqbn)
  return ESPRESSIF_SD_SPI[family] ?? null
}

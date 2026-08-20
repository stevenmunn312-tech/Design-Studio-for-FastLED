import { targetFamilyFromFqbn, type BuildTargetFamily } from '../build/buildProfile'
import type { PhysicalBoardProfile } from '../build/boardProfiles'

// Arduino-ESP32 SD/SPI defaults. These are the core's SS aliases used by
// SD.begin() for each Espressif target, not arbitrary free-pin suggestions.
const ESPRESSIF_SD_CS: Partial<Record<BuildTargetFamily, number>> = {
  esp32: 5,
  'esp32-s2': 34,
  'esp32-s3': 10,
  'esp32-c3': 7,
  'esp32-c6': 18,
  'esp32-h2': 0,
  esp8266: 15,
}

export function sdCsPinDefaultForBoard(
  profile: PhysicalBoardProfile | undefined,
  fqbn = '',
): number | null {
  const family = profile?.targetFamilies[0] ?? targetFamilyFromFqbn(fqbn)
  return ESPRESSIF_SD_CS[family] ?? null
}

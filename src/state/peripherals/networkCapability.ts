/**
 * What a board target can do on the network, by FQBN.
 *
 * Two questions, answered separately because they differ on one board. The
 * Arduino UNO R4 WiFi has a radio and its `WiFiS3` core library offers
 * `WiFiUDP`, which is all Art-Net, sACN, DDP, the network Frame Stream and
 * the SNTP exchange need. It has no `WebServer`/`ESP8266WebServer`, so the Web
 * Remote's page stays on the ESP cores. See docs/design/dmx-artnet-input.md
 * and docs/design/rtc-clock-and-schedule.md.
 */

/** An ESP32 target with a radio: every chip except the H2 and P4. */
function espWithRadio(fqbn: string): boolean {
  if (fqbn.startsWith('esp8266:')) return true
  if (!fqbn.startsWith('esp32:')) return false
  const board = fqbn.split(':')[2] ?? ''
  return !/^esp32(h2|p4)/.test(board)
}

export const UNO_R4_WIFI_FQBN = 'arduino:renesas_uno:unor4wifi'

/**
 * Whether a board target has a Wi-Fi radio the generated sketch can join:
 * every ESP8266, every ESP32 except the H2 and P4, and the UNO R4 WiFi.
 */
export function fqbnHasWifi(fqbn: string): boolean {
  return espWithRadio(fqbn) || fqbn === UNO_R4_WIFI_FQBN
}

/**
 * Whether the Web Remote's page can be served from the board: the generated
 * server uses the ESP cores' `WebServer` / `ESP8266WebServer`, so only an ESP
 * target with a radio qualifies.
 */
export function fqbnServesWebRemote(fqbn: string): boolean {
  return espWithRadio(fqbn)
}

import { describe, expect, it } from 'vitest'
import { UNO_R4_WIFI_FQBN, fqbnHasWifi, fqbnServesWebRemote } from '../networkCapability'
import { fqbnHasWifi as reExported } from '../webRemote'

/*
 * Which board targets can join Wi-Fi, and which of those can also serve the
 * Web Remote's page. The UNO R4 WiFi is the one board where the two differ.
 */

const WIFI_AND_PAGE = ['esp32:esp32:esp32', 'esp32:esp32:esp32s3', 'esp32:esp32:esp32c6', 'esp8266:esp8266:d1_mini', 'esp8266:esp8266:nodemcuv2']
const NO_RADIO = ['esp32:esp32:esp32h2', 'esp32:esp32:esp32p4', 'arduino:avr:uno', 'arduino:renesas_uno:minima', 'rp2040:rp2040:rpipico', '']

describe('fqbnHasWifi', () => {
  it('is true for every ESP target with a radio and for the UNO R4 WiFi', () => {
    for (const fqbn of [...WIFI_AND_PAGE, UNO_R4_WIFI_FQBN]) expect(fqbnHasWifi(fqbn), fqbn).toBe(true)
    expect(UNO_R4_WIFI_FQBN).toBe('arduino:renesas_uno:unor4wifi')
  })

  it('is false without a radio, including the R4 Minima and the ESP32-H2/P4', () => {
    for (const fqbn of NO_RADIO) expect(fqbnHasWifi(fqbn), fqbn).toBe(false)
  })

  it('is the function the Web Remote module re-exports', () => {
    expect(reExported).toBe(fqbnHasWifi)
  })
})

describe('fqbnServesWebRemote', () => {
  it('follows the ESP cores that ship WebServer / ESP8266WebServer', () => {
    for (const fqbn of WIFI_AND_PAGE) expect(fqbnServesWebRemote(fqbn), fqbn).toBe(true)
  })

  it('refuses the UNO R4 WiFi, which has the radio but no page server', () => {
    expect(fqbnServesWebRemote(UNO_R4_WIFI_FQBN)).toBe(false)
    for (const fqbn of NO_RADIO) expect(fqbnServesWebRemote(fqbn), fqbn).toBe(false)
  })
})

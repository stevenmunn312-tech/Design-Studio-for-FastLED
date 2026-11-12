import { afterEach, describe, expect, it, vi } from 'vitest'
import { engineVersionNumber, uploadShow } from '../backendClient'

describe('backendClient uploadShow', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('serializes the physical flash size and native-USB route in show metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)

    await uploadShow({
      fqbn: 'esp32:esp32:esp32s3:PSRAM=opi',
      port: 'COM7',
      player: 'player-ino',
      files: [],
      flashMb: 16,
      usbCdcOnBoot: true,
    }, vi.fn())

    const body = fetchMock.mock.calls[0][1]?.body as FormData
    expect(JSON.parse(String(body.get('meta')))).toEqual({
      fqbn: 'esp32:esp32:esp32s3:PSRAM=opi',
      port: 'COM7',
      paths: [],
      flashMb: 16,
      usbCdcOnBoot: true,
    })
  })
})

describe('engineVersionNumber', () => {
  it('keeps only the version from each tool banner', () => {
    expect(engineVersionNumber('fbuild 2.5.45')).toBe('2.5.45')
    expect(engineVersionNumber('arduino-cli  Version: 1.3.1 Commit: 08ff7e2b Date: 2025-08-28T12:00:00Z')).toBe('1.3.1')
    expect(engineVersionNumber('2.5.51')).toBe('2.5.51')
  })

  it('passes an unrecognised banner through and drops an empty one', () => {
    expect(engineVersionNumber('nightly')).toBe('nightly')
    expect(engineVersionNumber('  ')).toBeNull()
    expect(engineVersionNumber(null)).toBeNull()
  })
})

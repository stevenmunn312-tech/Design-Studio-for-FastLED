import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadShow } from '../backendClient'

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

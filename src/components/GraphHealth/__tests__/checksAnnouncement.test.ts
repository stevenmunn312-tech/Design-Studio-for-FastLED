import { describe, expect, it } from 'vitest'
import { checksAnnouncement } from '../checksAnnouncement'

describe('checksAnnouncement', () => {
  it('says all good when nothing is found', () => {
    expect(checksAnnouncement(0, 0)).toBe('Checks: all good.')
  })

  it('counts problems and suggestions and names the worst issue', () => {
    expect(checksAnnouncement(1, 1, 'LED output has no input'))
      .toBe('Checks: 1 problem blocks upload, 1 suggestion. LED output has no input.')
    expect(checksAnnouncement(2, 0)).toBe('Checks: 2 problems block upload.')
    expect(checksAnnouncement(0, 3, 'Field Blur is disconnected'))
      .toBe('Checks: 3 suggestions. Field Blur is disconnected.')
  })
})

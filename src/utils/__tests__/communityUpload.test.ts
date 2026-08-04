import { afterEach, describe, expect, it, vi } from 'vitest'
import { openCommunityTab, postToCommunityTab } from '../communityUpload'

const pattern = {
  name: 'Aurora Grid',
  fileName: 'Aurora Grid.fastled-pattern.json',
  patternJson: '{"name":"Aurora Grid","subgraph":{"nodes":[],"edges":[]}}',
  controller: 'ESP32',
  ledCount: 256,
}

describe('community upload handoff', () => {
  afterEach(() => vi.restoreAllMocks())

  it('opens a blank named tab synchronously', () => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window)

    const { target, opened } = openCommunityTab()

    expect(opened).toBe(true)
    expect(target).toMatch(/^design-studio-community-/)
    expect(window.open).toHaveBeenCalledWith('', target)
  })

  it('reports a blocked popup', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)

    expect(openCommunityTab().opened).toBe(false)
  })

  it('posts the pattern into the named tab', async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})

    await postToCommunityTab('design-studio-community-123', pattern)

    expect(submit).toHaveBeenCalledOnce()
    const form = submit.mock.instances[0] as HTMLFormElement
    expect(form.method).toBe('post')
    expect(form.target).toBe('design-studio-community-123')
    expect(form.action).toBe('https://design-studio-for-fastled.design-studio-for-fastled.workers.dev/upload/handoff')
    expect(new FormData(form).get('patternName')).toBe('Aurora Grid')
    expect(new FormData(form).get('patternJson')).toBe(pattern.patternJson)
    expect(new FormData(form).get('ledCount')).toBe('256')
    expect(new FormData(form).get('previewMediaBase64')).toBeNull()
  })

  it('includes the captured preview clip as base64 when provided', async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
    const previewMedia = new Blob(['fake-webm-bytes'], { type: 'video/webm' })

    await postToCommunityTab('design-studio-community-456', { ...pattern, previewMedia })

    const form = submit.mock.instances[0] as HTMLFormElement
    const data = new FormData(form)
    expect(data.get('previewMediaType')).toBe('video/webm')
    expect(typeof data.get('previewMediaBase64')).toBe('string')
    expect((data.get('previewMediaBase64') as string).length).toBeGreaterThan(0)
  })

  it('includes the sharer’s personal rating when set', async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})

    await postToCommunityTab('design-studio-community-789', { ...pattern, personalRating: 4 })

    const form = submit.mock.instances[0] as HTMLFormElement
    expect(new FormData(form).get('personalRating')).toBe('4')
  })

  it('omits the personal rating when unset or out of range', async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})

    await postToCommunityTab('design-studio-community-000', pattern)
    expect(new FormData(submit.mock.instances[0] as HTMLFormElement).get('personalRating')).toBeNull()

    await postToCommunityTab('design-studio-community-001', { ...pattern, personalRating: 0 })
    expect(new FormData(submit.mock.instances[1] as HTMLFormElement).get('personalRating')).toBeNull()

    await postToCommunityTab('design-studio-community-002', { ...pattern, personalRating: 6 })
    expect(new FormData(submit.mock.instances[2] as HTMLFormElement).get('personalRating')).toBeNull()
  })
})

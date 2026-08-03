import { afterEach, describe, expect, it, vi } from 'vitest'
import { openCommunityUpload } from '../communityUpload'

const project = {
  projectName: 'Aurora Grid',
  fileName: 'Aurora Grid.fastled-project.json',
  projectJson: '{"workspace":{"nodes":[],"edges":[]}}',
  controller: 'ESP32',
  ledCount: 256,
}

describe('community upload handoff', () => {
  afterEach(() => vi.restoreAllMocks())

  it('posts the project to the community handoff in a new tab', () => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window)
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})

    expect(openCommunityUpload(project).opened).toBe(true)
    expect(window.open).toHaveBeenCalledWith('', expect.stringMatching(/^design-studio-community-/))
    expect(submit).toHaveBeenCalledOnce()

    const form = submit.mock.instances[0] as HTMLFormElement
    expect(form.method).toBe('post')
    expect(form.enctype).toBe('application/x-www-form-urlencoded')
    expect(form.action).toBe('https://design-studio-for-fastled.design-studio-for-fastled.workers.dev/upload/handoff')
    expect(new FormData(form).get('projectName')).toBe('Aurora Grid')
    expect(new FormData(form).get('projectJson')).toBe(project.projectJson)
    expect(new FormData(form).get('ledCount')).toBe('256')
  })

  it('reports a blocked popup without posting the project', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})

    expect(openCommunityUpload(project).opened).toBe(false)
    expect(submit).not.toHaveBeenCalled()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const KEY = 'design-studio-for-fastled.network-credentials.v1'

describe('networkCredentials storage', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('still updates credentials when storage refuses the write', async () => {
    const { useNetworkCredentialsStore } = await import('../networkCredentials')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })

    expect(() => useNetworkCredentialsStore.getState().setCredentials('dmx', { ssid: 'studio' })).not.toThrow()
    expect(useNetworkCredentialsStore.getState().byNodeId.dmx).toEqual({ ssid: 'studio', password: '' })

    expect(() => useNetworkCredentialsStore.getState().removeCredentials('dmx')).not.toThrow()
    expect(useNetworkCredentialsStore.getState().byNodeId.dmx).toBeUndefined()
  })

  it('starts empty when storage is unreadable or holds a damaged value', async () => {
    localStorage.setItem(KEY, '{not json')
    const damaged = await import('../networkCredentials')
    expect(damaged.useNetworkCredentialsStore.getState().byNodeId).toEqual({})

    vi.resetModules()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    const blocked = await import('../networkCredentials')
    expect(blocked.useNetworkCredentialsStore.getState().byNodeId).toEqual({})
  })
})

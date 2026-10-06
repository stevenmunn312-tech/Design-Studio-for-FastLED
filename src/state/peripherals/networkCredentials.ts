// Wi-Fi SSID/password for DMXInput (Art-Net) and RTCInput (NTP) nodes.
// Deliberately kept OUT of node `properties` — unlike ordinary node
// properties, these never travel with the graph: not in project files, not
// in share links, not in the helper-backed Projects/ JSON mirror. They live
// browser-local only, like a saved Wi-Fi password on a phone. Generated
// firmware still embeds the plaintext credential (there's no other way for
// it to join Wi-Fi), but it no longer round-trips through project storage.
import { create } from 'zustand'

export interface NetworkCredentials {
  ssid: string
  password: string
}

// Shared reference so a selector falling back to "no credentials yet" (e.g.
// `s.byNodeId[nodeId] ?? EMPTY_CREDENTIALS`) returns the same object identity
// every call — a fresh `{ ssid: '', password: '' }` literal each render
// defeats useSyncExternalStore's snapshot caching and loops the component.
export const EMPTY_CREDENTIALS: NetworkCredentials = { ssid: '', password: '' }

const KEY = 'design-studio-for-fastled.network-credentials.v1'

function loadFromStorage(): Record<string, NetworkCredentials> {
  const raw = localStorage.getItem(KEY)
  if (!raw) return {}
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object') return {}
  const out: Record<string, NetworkCredentials> = {}
  for (const [nodeId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    out[nodeId] = {
      ssid: typeof v.ssid === 'string' ? v.ssid : '',
      password: typeof v.password === 'string' ? v.password : '',
    }
  }
  return out
}

interface NetworkCredentialsState {
  byNodeId: Record<string, NetworkCredentials>
  setCredentials: (nodeId: string, patch: Partial<NetworkCredentials>) => void
  removeCredentials: (nodeId: string) => void
}

export const useNetworkCredentialsStore = create<NetworkCredentialsState>()((set) => ({
  byNodeId: loadFromStorage(),
  setCredentials: (nodeId, patch) =>
    set((state) => {
      const byNodeId = {
        ...state.byNodeId,
        [nodeId]: { ...EMPTY_CREDENTIALS, ...state.byNodeId[nodeId], ...patch },
      }
      localStorage.setItem(KEY, JSON.stringify(byNodeId))
      return { byNodeId }
    }),
  removeCredentials: (nodeId) =>
    set((state) => {
      if (!(nodeId in state.byNodeId)) return state
      const byNodeId = { ...state.byNodeId }
      delete byNodeId[nodeId]
      localStorage.setItem(KEY, JSON.stringify(byNodeId))
      return { byNodeId }
    }),
}))

/** Non-hook accessor for callers outside React (codegen, validateGraph). */
export function getNetworkCredentials(nodeId: string): NetworkCredentials {
  return useNetworkCredentialsStore.getState().byNodeId[nodeId] ?? EMPTY_CREDENTIALS
}

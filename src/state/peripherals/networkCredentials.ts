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
  /**
   * An internet radio Music Player's station-page access code: what lets a
   * phone add or remove stations. A secret like the password, so it is kept
   * here rather than in the project.
   */
  accessCode?: string
}

// Shared reference so a selector falling back to "no credentials yet" (e.g.
// `s.byNodeId[nodeId] ?? EMPTY_CREDENTIALS`) returns the same object identity
// every call — a fresh `{ ssid: '', password: '' }` literal each render
// defeats useSyncExternalStore's snapshot caching and loops the component.
export const EMPTY_CREDENTIALS: NetworkCredentials = { ssid: '', password: '' }

const KEY = 'design-studio-for-fastled.network-credentials.v1'

function loadFromStorage(): Record<string, NetworkCredentials> {
  // Storage can be blocked (private browsing, disabled site data) or hold a
  // damaged value; either way the store starts empty rather than failing to
  // load at all.
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return {}
  }
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object') return {}
  const out: Record<string, NetworkCredentials> = {}
  for (const [nodeId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    out[nodeId] = {
      ssid: typeof v.ssid === 'string' ? v.ssid : '',
      password: typeof v.password === 'string' ? v.password : '',
      ...(typeof v.accessCode === 'string' && v.accessCode ? { accessCode: v.accessCode } : {}),
    }
  }
  return out
}

function persist(byNodeId: Record<string, NetworkCredentials>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(byNodeId))
  } catch {
    // Private mode or a full quota: the in-memory credentials still apply
    // for this session, they just will not be remembered.
  }
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
      persist(byNodeId)
      return { byNodeId }
    }),
  removeCredentials: (nodeId) =>
    set((state) => {
      if (!(nodeId in state.byNodeId)) return state
      const byNodeId = { ...state.byNodeId }
      delete byNodeId[nodeId]
      persist(byNodeId)
      return { byNodeId }
    }),
}))

/** Non-hook accessor for callers outside React (codegen, validateGraph). */
export function getNetworkCredentials(nodeId: string): NetworkCredentials {
  return useNetworkCredentialsStore.getState().byNodeId[nodeId] ?? EMPTY_CREDENTIALS
}

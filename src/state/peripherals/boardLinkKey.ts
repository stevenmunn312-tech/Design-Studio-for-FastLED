// Board link identity and secret. The link id and radio channel are project
// settings stored on the primary Board node (`linkId`, `linkChannel`); the
// 128-bit key that authenticates every frame is a secret, so like the Wi-Fi
// passwords it never travels with the project: it lives browser-local, keyed
// by the link id. A project opened on another machine has the id but no key,
// which validation reports with a fix that makes a new one (and so means
// reflashing every linked board). See docs/design/board-links.md.
import { create } from 'zustand'

export const BOARD_LINK_KEY_BYTES = 16
export const BOARD_LINK_CHANNEL_MIN = 1
export const BOARD_LINK_CHANNEL_MAX = 13
export const DEFAULT_BOARD_LINK_CHANNEL = 1

const KEY = 'design-studio-for-fastled.board-link-keys.v1'
const HEX_ID = /^[0-9a-f]{8}$/
const HEX_KEY = new RegExp(`^[0-9a-f]{${BOARD_LINK_KEY_BYTES * 2}}$`)

/** The project's link settings, read off the primary Board's properties. */
export interface BoardLinkSettings {
  /** Eight lower-case hex digits, or null until the first link is made. */
  linkId: string | null
  /** The Wi-Fi channel every linked board uses when none joins a network. */
  channel: number
}

export function boardLinkSettings(primaryBoardProperties: Readonly<Record<string, unknown>> | undefined): BoardLinkSettings {
  const rawId = primaryBoardProperties?.linkId
  const rawChannel = Number(primaryBoardProperties?.linkChannel)
  return {
    linkId: typeof rawId === 'string' && HEX_ID.test(rawId) ? rawId : null,
    channel: Number.isInteger(rawChannel) && rawChannel >= BOARD_LINK_CHANNEL_MIN && rawChannel <= BOARD_LINK_CHANNEL_MAX
      ? rawChannel : DEFAULT_BOARD_LINK_CHANNEL,
  }
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return [...buffer].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** A fresh link id: eight hex digits, the 32-bit id every frame carries. */
export function newBoardLinkId(): string {
  return randomHex(4)
}

function loadFromStorage(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [linkId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (HEX_ID.test(linkId) && typeof value === 'string' && HEX_KEY.test(value)) out[linkId] = value
    }
    return out
  } catch {
    return {}
  }
}

function save(byLinkId: Record<string, string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(byLinkId))
  } catch {
    // A private window keeps the key for this session only.
  }
}

interface BoardLinkKeyState {
  /** Link id → the key as 32 lower-case hex digits. */
  byLinkId: Record<string, string>
  /** Make a new key for `linkId`, replacing any it had; returns the key. */
  createKey: (linkId: string) => string
}

export const useBoardLinkKeyStore = create<BoardLinkKeyState>()((set, get) => ({
  byLinkId: loadFromStorage(),
  createKey: (linkId) => {
    const key = randomHex(BOARD_LINK_KEY_BYTES)
    const byLinkId = { ...get().byLinkId, [linkId]: key }
    save(byLinkId)
    set({ byLinkId })
    return key
  },
}))

/** Non-hook accessor for codegen and validation: the key's bytes, or null. */
export function getBoardLinkKey(linkId: string | null): Uint8Array | null {
  if (!linkId) return null
  const hex = useBoardLinkKeyStore.getState().byLinkId[linkId]
  if (!hex) return null
  const bytes = new Uint8Array(BOARD_LINK_KEY_BYTES)
  for (let i = 0; i < BOARD_LINK_KEY_BYTES; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

/** Whether this machine holds the key for `linkId`. */
export function useHasBoardLinkKey(linkId: string | null): boolean {
  return useBoardLinkKeyStore((state) => Boolean(linkId && state.byLinkId[linkId]))
}

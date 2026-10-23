import { ROOT_BOARD_NODE_ID } from '../build/hardware'

/** The board and port a project last uploaded one of its boards to. */
export interface ProjectUploadTarget {
  selectedFqbn: string
  selectedPort: string
  /**
   * The board link schema hash (`boardLinkSchema(...).hash`, 0 with no link)
   * of the project firmware last flashed onto this board, so the Upload tab
   * can say which linked boards run an older link. Absent until the board's
   * first project upload. See docs/design/board-links.md, "Upload".
   */
  linkSchemaHash?: number
}

/**
 * One upload target per Board node, keyed by the Board's id. The primary
 * board's entry is always under `PRIMARY_UPLOAD_TARGET_KEY`, whatever the
 * primary Board node happens to be called, so the pre-multi-board
 * `uploadTarget` field and this map agree on which entry is "the project's".
 * See docs/design/multi-board.md, "Upload targets".
 */
export type ProjectUploadTargets = Record<string, ProjectUploadTarget>

export const PRIMARY_UPLOAD_TARGET_KEY = ROOT_BOARD_NODE_ID

export function normalizeUploadTarget(value: unknown): ProjectUploadTarget | undefined {
  if (!value || typeof value !== 'object') return undefined
  const maybe = value as Partial<ProjectUploadTarget>
  if (typeof maybe.selectedFqbn !== 'string' || typeof maybe.selectedPort !== 'string') return undefined
  const hash = maybe.linkSchemaHash
  return {
    selectedFqbn: maybe.selectedFqbn,
    selectedPort: maybe.selectedPort,
    // A 32-bit FNV-1a value, or nothing: a hand-edited save cannot make a
    // board read as up to date with a hash no schema produces.
    ...(typeof hash === 'number' && Number.isInteger(hash) && hash >= 0 && hash <= 0xffffffff
      ? { linkSchemaHash: hash } : {}),
  }
}

export function sameUploadTarget(a: ProjectUploadTarget | undefined, b: ProjectUploadTarget | undefined): boolean {
  return (a?.selectedFqbn ?? '') === (b?.selectedFqbn ?? '')
    && (a?.selectedPort ?? '') === (b?.selectedPort ?? '')
    && a?.linkSchemaHash === b?.linkSchemaHash
}

/**
 * The two save-shape fields, normalised together: the map is read first and
 * the legacy single target fills the primary's slot when the map has none.
 * `uploadTarget` comes back as the primary's entry, so every reader of the old
 * field still sees the right board.
 */
export function normalizeProjectUploadTargets(
  source: { uploadTarget?: unknown; uploadTargets?: unknown } | null | undefined,
): { uploadTarget: ProjectUploadTarget | undefined; uploadTargets: ProjectUploadTargets | undefined } {
  const targets: ProjectUploadTargets = {}
  const raw = source?.uploadTargets
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [boardId, value] of Object.entries(raw as Record<string, unknown>)) {
      const target = normalizeUploadTarget(value)
      if (boardId && target) targets[boardId] = target
    }
  }
  const legacy = normalizeUploadTarget(source?.uploadTarget)
  if (legacy && !targets[PRIMARY_UPLOAD_TARGET_KEY]) targets[PRIMARY_UPLOAD_TARGET_KEY] = legacy
  const uploadTarget = targets[PRIMARY_UPLOAD_TARGET_KEY]
  return {
    uploadTarget,
    uploadTargets: Object.keys(targets).length > 0 ? targets : undefined,
  }
}

// Why Upload can't run right now, as one sentence and the button that fixes it.
//
// A disabled button with a tooltip makes someone hunt for the reason, and a
// list of every reason at once reads as a wall. So this names only the first
// thing in the way, in the order the work is done, together with the one
// action that clears it. When that is done, the next reason (if any) takes
// its place. The Upload tab shows it beside the button, and it is the only
// place the Upload tab says it.
//
// Pure so the ordering and wording are testable without mounting the tab.

export type UploadBlockAction =
  | { kind: 'open-graph' }
  | { kind: 'show-graph-health' }
  | { kind: 'trust' }
  /** One of the Build tools & port rows; the tab runs that row's own action. */
  | { kind: 'tool'; label: string }

export interface UploadBlockReason {
  text: string
  actionLabel?: string
  action?: UploadBlockAction
}

export interface UploadToolRow {
  label: string
  state: 'ready' | 'checking' | 'missing'
  detail: string
  actionLabel?: string
}

export interface UploadBlockInput {
  busy: boolean
  /** Something is wired to build at all: a frame into an LED output, a screen. */
  hasBuildOutput: boolean
  /** The SD-show path, and whether it has songs or a player collection. */
  isShowUpload: boolean
  showHasContent: boolean
  /** Something the build needs (display images) is waiting for trust. An
   *  untrusted project on its own does not block Upload — it asks first. */
  waitingForTrust: boolean
  /** Graph rules that stop a build, which Graph Health explains and repairs. */
  graphBlockerCount: number
  /** Display images still being prepared. */
  preparing: boolean
  /** Anything else that stops it, already in words (a size overflow, a RAM
   *  budget, a display image that could not be prepared). */
  otherBlockers: readonly string[]
  /** The Build tools & port rows, in their own order. */
  tools: readonly UploadToolRow[]
}

const things = (count: number) => (count === 1 ? '1 thing' : `${count} things`)

export function uploadBlockReason(input: UploadBlockInput): UploadBlockReason | null {
  if (input.busy) return null
  if (input.isShowUpload ? !input.showHasContent : !input.hasBuildOutput) {
    return input.isShowUpload
      ? { text: 'Give the Music Player a pattern collection, or analyse a song, to have something to upload.' }
      : {
          text: 'Connect a pattern to an LED output to have something to upload.',
          actionLabel: 'Go to Graph', action: { kind: 'open-graph' },
        }
  }
  if (input.waitingForTrust) {
    return {
      text: 'Part of this project was made on another computer. Trust it to build it.',
      actionLabel: 'Trust it', action: { kind: 'trust' },
    }
  }
  if (input.graphBlockerCount > 0) {
    return {
      text: `${things(input.graphBlockerCount)} to fix first. Graph Health shows what, and fixes some for you.`,
      actionLabel: 'Show me', action: { kind: 'show-graph-health' },
    }
  }
  if (input.preparing) return { text: 'Preparing display images…' }
  if (input.otherBlockers.length > 0) return { text: input.otherBlockers[0] }

  const tool = input.tools.find((row) => row.state !== 'ready')
  if (!tool) return null
  if (tool.state === 'checking') return { text: tool.detail }
  return tool.actionLabel
    ? { text: tool.detail, actionLabel: tool.actionLabel, action: { kind: 'tool', label: tool.label } }
    : { text: tool.detail }
}

import { describe, expect, it } from 'vitest'
import { uploadBlockReason, type UploadBlockInput } from '../uploadBlockReason'

const ready = [
  { label: 'Helper', state: 'ready' as const, detail: 'Online' },
  { label: 'Engine', state: 'ready' as const, detail: 'Using fbuild' },
  { label: 'Toolchain', state: 'ready' as const, detail: 'Installed' },
  { label: 'Connection', state: 'ready' as const, detail: 'COM6 is connected.' },
]

function input(overrides: Partial<UploadBlockInput> = {}): UploadBlockInput {
  return {
    busy: false,
    hasBuildOutput: true,
    isShowUpload: false,
    showHasContent: false,
    waitingForTrust: false,
    graphBlockerCount: 0,
    preparing: false,
    otherBlockers: [],
    tools: ready,
    ...overrides,
  }
}

describe('uploadBlockReason', () => {
  it('says nothing when nothing is in the way, or while a build runs', () => {
    expect(uploadBlockReason(input())).toBeNull()
    expect(uploadBlockReason(input({ busy: true, graphBlockerCount: 3 }))).toBeNull()
  })

  it('names one thing at a time, in the order the work is done', () => {
    const everything = input({
      hasBuildOutput: false, waitingForTrust: true, graphBlockerCount: 2, preparing: true,
      otherBlockers: ['Too big'],
      tools: [{ label: 'Connection', state: 'missing', detail: 'COM6 is selected but no board is connected to it.', actionLabel: 'Refresh ports' }],
    })
    const order: string[] = []
    let current = everything
    for (;;) {
      const reason = uploadBlockReason(current)
      if (!reason) break
      order.push(reason.actionLabel ?? reason.text)
      // Clear whatever was named, and ask again.
      if (reason.action?.kind === 'open-graph') current = { ...current, hasBuildOutput: true }
      else if (reason.action?.kind === 'trust') current = { ...current, waitingForTrust: false }
      else if (reason.action?.kind === 'show-graph-health') current = { ...current, graphBlockerCount: 0 }
      else if (reason.text.startsWith('Preparing')) current = { ...current, preparing: false }
      else if (reason.text === 'Too big') current = { ...current, otherBlockers: [] }
      else current = { ...current, tools: ready }
    }
    expect(order).toEqual(['Go to Graph', 'Trust it', 'Show me', 'Preparing display images…', 'Too big', 'Refresh ports'])
  })

  it('counts graph problems and sends them to Graph Health', () => {
    expect(uploadBlockReason(input({ graphBlockerCount: 1 }))).toEqual({
      text: '1 thing to fix first. Graph Health shows what, and fixes some for you.',
      actionLabel: 'Show me', action: { kind: 'show-graph-health' },
    })
    expect(uploadBlockReason(input({ graphBlockerCount: 3 }))?.text).toMatch(/^3 things to fix first/)
  })

  it('hands a tools-and-port problem its own row’s button', () => {
    const reason = uploadBlockReason(input({
      tools: [...ready.slice(0, 3), { label: 'Connection', state: 'missing', detail: 'Pick the board’s USB/serial port.', actionLabel: 'Choose port' }],
    }))
    expect(reason).toEqual({
      text: 'Pick the board’s USB/serial port.',
      actionLabel: 'Choose port', action: { kind: 'tool', label: 'Connection' },
    })
  })

  it('waits quietly while the helper is still being checked', () => {
    const reason = uploadBlockReason(input({ tools: [{ label: 'Helper', state: 'checking', detail: 'Checking for the local upload helper…' }] }))
    expect(reason).toEqual({ text: 'Checking for the local upload helper…' })
  })

  it('asks the SD show path for something to play rather than a frame', () => {
    expect(uploadBlockReason(input({ isShowUpload: true, hasBuildOutput: false, showHasContent: false }))?.text)
      .toMatch(/pattern collection, or analyse a song/)
  })
})

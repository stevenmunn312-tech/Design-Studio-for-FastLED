import { describe, it, expect } from 'vitest'
import { parseStatus } from '../uploadStore'

// parseStatus turns the helper's streamed compile/upload log into the compact
// status the MatrixOutput node shows. It must track phase order and surface
// errors (which auto-open the console).
describe('parseStatus', () => {
  it('reports compiling once the compile phase starts', () => {
    const s = parseStatus('=== Sketch · compile ===\n$ arduino-cli compile\n')
    expect(s.phase).toBe('compiling')
    expect(s.message).toBe('Compiling…')
  })

  it('switches to uploading and tracks the latest esptool percent', () => {
    const log =
      '=== Sketch · compile ===\nSketch uses 51% of program storage\n' +
      '=== Sketch · upload ===\nWriting at 0x10000... (12 %)\nWriting at 0x20000... (47 %)\n'
    const s = parseStatus(log)
    expect(s.phase).toBe('uploading')
    expect(s.percent).toBe(47)
    expect(s.message).toBe('Uploading 47%')
  })

  it('does not pick up the compile flash-usage percent as upload progress', () => {
    // 51% appears before the upload marker, so it must be ignored.
    const log = '=== Sketch · compile ===\nSketch uses 51% of program storage\n=== Sketch · upload ===\n'
    const s = parseStatus(log)
    expect(s.phase).toBe('uploading')
    expect(s.percent).toBeUndefined()
  })

  it('reports done on a successful upload', () => {
    expect(parseStatus('=== Sketch · upload ===\n...\nUpload complete.\n').phase).toBe('done')
  })

  it('reports error on a non-zero exit code', () => {
    expect(parseStatus('[Sketch · compile exit code: 1]\n').phase).toBe('error')
  })

  it('reports error on an explicit failure banner', () => {
    expect(parseStatus('\n*** FAILED (exit code 74) ***\n').phase).toBe('error')
  })

  it('is idle/working with no recognised markers', () => {
    expect(parseStatus('Uploading to COM4…\n').phase).toBe('working')
  })
})

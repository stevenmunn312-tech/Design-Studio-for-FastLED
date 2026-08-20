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

  it('says an upload is queued while it waits for the build directory', () => {
    // Builds are serialized on one shared project directory, so an upload can
    // wait minutes before its first compiler output. That wait used to be
    // silent and the button sat on "Starting…" with nothing to say whether it
    // was queued, compiling, or wedged.
    const log = 'Uploading to COM4 (esp32:esp32:esp32)…\n'
      + '  [waiting] the build directory is busy with another build — queued behind it, nothing is wrong\n'
    const s = parseStatus(log)
    expect(s.phase).toBe('working')
    expect(s.message).toBe('Queued behind another build…')
  })

  it('stops reporting queued once the compile it waited for begins', () => {
    const log = '  [waiting] still queued (5s of 180s)…\n=== Sketch · compile ===\n'
    expect(parseStatus(log).phase).toBe('compiling')
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

  it('reports error on the phase-specific failure banners', () => {
    // The helper now says which phase failed (build vs upload) — both wordings
    // must still register as errors.
    expect(parseStatus("\n*** BUILD FAILED (exit code 1) *** The sketch didn't compile, so nothing was sent to the board — see the errors above.\n").phase).toBe('error')
    expect(parseStatus('\n*** UPLOAD FAILED (exit code 74) *** The sketch compiled, but flashing failed.\n').phase).toBe('error')
  })

  it('is idle/working with no recognised markers', () => {
    expect(parseStatus('Uploading to COM4…\n').phase).toBe('working')
  })

  it('reports a specific "won\'t fit" message on a capacity overflow', () => {
    // The overflow also produces a non-zero exit code, but the size-error tag
    // must win so the message is specific rather than the generic one.
    const log =
      '=== Sketch · compile ===\nregion `iram0_0_seg\' overflowed by 2048 bytes\n' +
      '  [size-error] won\'t fit on this board\n[Sketch · compile exit code: 1]\n'
    const s = parseStatus(log)
    expect(s.phase).toBe('error')
    expect(s.message).toBe("Won't fit — too big for this board")
  })

  it('surfaces flash headroom from the compile size report', () => {
    const s = parseStatus('=== Sketch · compile ===\n  [size] flash 21% · ram 13%\n')
    expect(s.phase).toBe('compiling')
    expect(s.message).toBe('Compiling… · flash 21%')
  })

  it('flags a tight fit with a warning marker on done', () => {
    const log =
      '=== Sketch · compile ===\n  [size] flash 96% · ram 71%\n  [size-warning] little headroom left (flash 96%)\n' +
      '=== Sketch · upload ===\nUpload complete.\n'
    const s = parseStatus(log)
    expect(s.phase).toBe('done')
    expect(s.message).toBe('Done · flash 96% ⚠')
  })

  it('names a refused build rather than reporting a generic error', () => {
    // Builds share one project directory and are serialized, so a request can
    // be refused with nothing compiled. Saying "Error — see output" sends the
    // user to inspect a graph that is fine; the actionable fact is that
    // something else is building and they should retry.
    const log =
      '=== ✗ Sketch: another fbuild build is still running (waited 180s) ===\n' +
      '  Nothing was compiled or sent to the board — your sketch is fine.\n' +
      '*** DID NOT RUN *** Another build was already using the build directory.\n'
    const s = parseStatus(log)
    expect(s.phase).toBe('error')
    expect(s.message).toBe('Another build is running — try again')
  })

  it('still reports a real compile failure as an error', () => {
    // The rule above must not swallow genuine failures.
    const log = '=== Sketch · compile ===\nerror: expected \';\'\n[Sketch · compile exit code: 1]\n'
    expect(parseStatus(log)).toEqual({ phase: 'error', message: 'Error — see output' })
  })
})

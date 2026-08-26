// Albums live in folders.
//
// The player used to read /music as a flat list, so a card whose songs sit in
// "Artist - Album" folders — which is how everyone actually keeps music —
// looked completely empty to it. These pin the emitted walk, since the C++ is
// only exercised on real hardware.

import { describe, it, expect } from 'vitest'
import { generatePlayerSketch } from '../playerSketchGenerator'
import type { PatternRenderers } from '../showGenerator'

// Two patterns, because the generic-player block — the one that scans the card
// for any MP3 — is only emitted for a player with a collection behind it.
const RENDERERS: PatternRenderers = {
  buffers: [], helpers: [], params: [], count: 2,
  functions: ['void render_p0(uint32_t ms) {}', 'void render_p1(uint32_t ms) {}'],
}

const sketch = () => generatePlayerSketch({}, RENDERERS, { genericPlayer: true })

describe('the emitted music walk', () => {
  it('recurses into folders rather than reading one flat listing', () => {
    const src = sketch()
    expect(src).toContain('bool isDir = entry.isDirectory();')
    expect(src).toContain('found = _musicWalk(path.c_str(), seen, wanted, wantLeaf, outPath, outLeaf, depth + 1);')
  })

  it('bounds the depth, because each level holds an open handle', () => {
    const src = sketch()
    expect(src).toContain('#define MUSIC_MAX_DEPTH')
    expect(src).toContain('if (depth + 1 < MUSIC_MAX_DEPTH) {')
  })

  // A card written on a macOS machine carries a "._Track.mp3" stub beside every
  // song. Counted as tracks, every other Next lands on something undecodable.
  it('skips dot-files', () => {
    expect(sketch()).toContain('if (leaf.length() && !leaf.startsWith(".")) {')
  })

  it('builds a nested path rather than assuming the top level', () => {
    const src = sketch()
    expect(src).toContain('String path = String(dir) + "/" + leaf;')
    expect(src).not.toContain('"/music/" + name')
  })

  it('takes the leaf, since the SD library reports names both ways', () => {
    const src = sketch()
    expect(src).toContain('static String _musicLeaf(const String &name) {')
    expect(src).toContain("int slash = name.lastIndexOf('/');")
  })

  it('counts the whole library, however deeply nested', () => {
    const src = sketch()
    expect(src).toContain('uint16_t playerTrackCount() {')
    expect(src).toContain('_musicWalk("/music", seen, -1, nullptr, path, leaf, 0);')
  })

  it('names the show from the track leaf, not from its folder', () => {
    expect(sketch()).toContain(`String showPath = "/shows/" + leaf.substring(0, leaf.lastIndexOf('.')) + ".show";`)
  })
})

describe('a track that will not open', () => {
  // One unreadable file used to cost the rest of the card: the scan gave up and
  // restarted at zero, which either replayed track 0 or found nothing.
  it('steps past it and wraps rather than restarting the scan', () => {
    const src = sketch()
    expect(src).toContain('for (uint16_t tries = 0; tries < total; tries++) {')
    expect(src).toContain('uint16_t index = (uint16_t)((genericTrackIndex + tries) % total);')
    expect(src).not.toContain('genericTrackIndex = 0;\n      return startPlayback();')
  })

  it('bounds the retry by the track count so an all-broken card still ends', () => {
    const src = sketch()
    expect(src).toContain('uint16_t total = playerTrackCount();')
    expect(src).toContain('Serial.println("No playable MP3 found on the card");')
  })

  it('remembers which track actually opened', () => {
    // Without this, Next from a skipped track steps from the index that failed.
    expect(sketch()).toContain('genericTrackIndex = index;')
  })
})

describe('a preferred track filed into an album', () => {
  it('searches by filename when it is not at the top level', () => {
    const src = sketch()
    expect(src).toContain('String wanted = String(PREFERRED_TRACK) + ".mp3";')
    expect(src).toContain('if (_musicWalk("/music", seen, -1, wanted.c_str(), found, leaf, 0)) mp3 = found;')
  })

  it('matches the name case-insensitively, as the card may not preserve it', () => {
    expect(sketch()).toContain('leaf.equalsIgnoreCase(wantLeaf)')
  })
})

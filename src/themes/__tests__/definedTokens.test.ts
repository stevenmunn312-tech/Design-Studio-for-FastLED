import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A `var(--name)` with no fallback for a property nobody defines makes the
 * whole declaration invalid, and the browser quietly drops it: a background
 * turns transparent, a `color-mix` falls back to nothing. Seven such names
 * (`--bg-secondary`, `--bg-app`, `--text-muted`, ...) had crept in this way,
 * and jsdom draws nothing, so no other test could see them. Every name read
 * without a fallback must be declared somewhere: in tokens.css, in a
 * stylesheet, or set from code as a quoted `'--name'`.
 */
const root = resolve(process.cwd(), 'src')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return entry === '__tests__' ? [] : sources(path)
    return /\.(css|ts|tsx)$/.test(entry) ? [path] : []
  })
}

describe('theme tokens', () => {
  it('declares every custom property used by CSS, including reads with fallbacks', () => {
    const declared = new Set<string>()
    const read = new Map<string, Set<string>>()
    for (const path of sources(root)) {
      const text = readFileSync(path, 'utf8')
      for (const match of text.matchAll(/(--[\w-]+)\s*:/g)) declared.add(match[1])
      for (const match of text.matchAll(/['"`](--[\w-]+)['"`]/g)) declared.add(match[1])
      if (!path.endsWith('.css')) continue
      for (const match of text.matchAll(/var\(\s*(--[\w-]+)/g)) {
        const files = read.get(match[1]) ?? new Set<string>()
        files.add(relative(root, path).replace(/\\/g, '/'))
        read.set(match[1], files)
      }
    }
    const undeclared = [...read].filter(([name]) => !declared.has(name)).map(([name, files]) => `${name} in ${[...files].join(', ')}`)
    expect(undeclared).toEqual([])
  })

  it('declares every custom property read without a fallback', () => {
    const declared = new Set<string>()
    const read = new Map<string, Set<string>>()
    for (const path of sources(root)) {
      const text = readFileSync(path, 'utf8')
      for (const match of text.matchAll(/(--[\w-]+)\s*:/g)) declared.add(match[1])
      for (const match of text.matchAll(/['"`](--[\w-]+)['"`]/g)) declared.add(match[1])
      for (const match of text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
        const files = read.get(match[1]) ?? new Set<string>()
        files.add(relative(root, path).replace(/\\/g, '/'))
        read.set(match[1], files)
      }
    }
    const undeclared = [...read].filter(([name]) => !declared.has(name)).map(([name, files]) => `${name} in ${[...files].join(', ')}`)
    expect(undeclared).toEqual([])
  })
})

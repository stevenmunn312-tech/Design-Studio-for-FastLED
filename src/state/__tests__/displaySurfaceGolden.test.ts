import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { INFO_DISPLAY_LAYOUTS } from '../infoDisplay'
import { TRANSPORT_DISPLAY_LAYOUTS } from '../transportDisplay'
import {
  displaySurfaceCases, oledGeometries, profileSurface, tftGeometries,
  type SurfaceProfile,
} from './displaySurfaceCases'

/**
 * Golden digests for every fixed display layout.
 *
 * This is the snapshot half of HW-08's visual pass. Each catalogued panel
 * geometry, each layout, each reading of that layout — including at rest,
 * which is what a disabled panel draws — is rendered and frozen, so a change
 * to a font, a field position, a colour or a bar's fill has to be stated
 * rather than found on a bench.
 *
 * A hash alone would report "something moved" and nothing else, so each case
 * also records its size, its distinct colour count and the share of the panel
 * that is not background. A layout that quietly stops drawing shows up as a
 * coverage collapse; a palette change shows up in the colour count; anything
 * subtler is what the hash is for.
 *
 * Regenerate deliberately, never to make a red test green:
 *   DISPLAY_SURFACE_UPDATE_GOLDEN=1 npx vitest run src/state/__tests__/displaySurfaceGolden.test.ts
 * then read the diff, and look at the sheets `npm run gen:display-sheets`
 * writes before accepting it.
 */

const VECTOR_PATH = path.join(__dirname, 'displaySurfaceGolden.vectors.json')

type RecordedVectors = Record<string, SurfaceProfile>

const cases = displaySurfaceCases()

const produced: RecordedVectors = {}
for (const entry of cases) produced[entry.id] = profileSurface(entry.render())

describe('Fixed display surface golden digests', () => {
  if (process.env.DISPLAY_SURFACE_UPDATE_GOLDEN === '1') {
    writeFileSync(VECTOR_PATH, `${JSON.stringify(produced, null, 2)}\n`, 'utf8')
  }

  it('has a recorded vector file to compare against', () => {
    // Without this the suite would pass by writing whatever it just computed,
    // which is the one way a golden-vector test can be worse than none.
    expect(existsSync(VECTOR_PATH)).toBe(true)
  })

  const recorded: RecordedVectors = existsSync(VECTOR_PATH)
    ? JSON.parse(readFileSync(VECTOR_PATH, 'utf8')) as RecordedVectors
    : {}

  it('records exactly the cases the enumeration produces', () => {
    // Derived on both sides, so a new controller, rotation or layout arrives
    // here as a failure rather than as a silently unpictured case.
    expect(Object.keys(produced).sort()).toEqual(Object.keys(recorded).sort())
  })

  for (const entry of cases) {
    it(`reproduces ${entry.id}`, () => {
      expect(produced[entry.id]).toEqual(recorded[entry.id])
    })
  }

  it('pictures every layout of both families', () => {
    const layouts = new Set(cases.map((entry) => entry.layout))
    for (const layout of TRANSPORT_DISPLAY_LAYOUTS) expect(layouts.has(layout)).toBe(true)
    for (const layout of INFO_DISPLAY_LAYOUTS) expect(layouts.has(layout)).toBe(true)
  })

  it('pictures every distinct panel geometry', () => {
    const sizes = new Set(cases.map((entry) => `${entry.width}x${entry.height}`))
    for (const geometry of tftGeometries()) expect(sizes.has(geometry.key)).toBe(true)
    for (const geometry of oledGeometries()) expect(sizes.has(geometry.key)).toBe(true)
  })

  it('draws something on every case', () => {
    // A layout whose fields all fell outside a smaller panel would otherwise
    // record a perfectly stable digest of an empty screen.
    for (const entry of cases) {
      expect(produced[entry.id].coverage, entry.id).toBeGreaterThan(0)
    }
  })

  it('distinguishes the states it pictures each layout in', () => {
    // Two readings that render identically are a fixture that is not
    // exercising the difference, or a layout that is not showing it.
    const byLayout = new Map<string, Map<string, string>>()
    for (const entry of cases) {
      const key = `${entry.family}/${entry.width}x${entry.height}/${entry.layout}`
      const seen = byLayout.get(key) ?? new Map<string, string>()
      const hash = produced[entry.id].hash
      expect(seen.get(hash), `${entry.id} draws the same as ${key}/${seen.get(hash)}`).toBeUndefined()
      seen.set(hash, entry.state)
      byLayout.set(key, seen)
    }
  })
})

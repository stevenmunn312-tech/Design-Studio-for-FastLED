import { describe, expect, it } from 'vitest'
import { ensureBuildProfile, normalizeBuildProfile } from '../buildProfile'

describe('buildProfile', () => {
  it('keeps a valid export mode when normalizing build profile data', () => {
    expect(normalizeBuildProfile({
      version: 1,
      exportMode: 'current-view',
    })?.exportMode).toBe('current-view')
  })

  it('defaults back to complete-build semantics when export mode is missing or invalid', () => {
    expect(normalizeBuildProfile({
      version: 1,
      exportMode: 'not-real',
    })?.exportMode).toBeUndefined()
    expect(ensureBuildProfile(undefined).exportMode).toBeUndefined()
  })

  it('retains explicit branch-part assignments and drops malformed values', () => {
    const profile = normalizeBuildProfile({
      version: 1,
      signalConditioning: { output: true, pending: false, bad: 'yes' },
      ownedParts: {
        wireAssignments: { output: 'wire-1', bad: 42 },
        connectorAssignments: { output: 'connector-1' },
        fuseAssignments: { output: 'fuse-1' },
      },
    })
    expect(profile?.ownedParts).toEqual({
      wireAssignments: { output: 'wire-1' },
      connectorAssignments: { output: 'connector-1' },
      fuseAssignments: { output: 'fuse-1' },
    })
    expect(profile?.signalConditioning).toEqual({ output: true, pending: false })
  })
})

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
})

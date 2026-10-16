import type { SavedProject } from '../state/projectStore'
import { saveProjectWithDialog } from './backendClient'
import { saveProjectWithNativePicker } from './projectFileIO'

type SaveStrategy = () => Promise<SavedProject | null>

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function firstSuccessfulResult<T>(strategies: Array<() => Promise<T | null>>): Promise<T | null> {
  for (const strategy of strategies) {
    try {
      const result = await strategy()
      if (result) return result
    } catch (error) {
      if (isAbortError(error)) throw error
    }
  }
  return null
}

export async function saveProjectWithFallbacks(
  project: SavedProject,
  order: 'native-first' | 'dialog-first' = 'native-first',
): Promise<SavedProject | null> {
  const nativeStrategy: SaveStrategy = () => saveProjectWithNativePicker(project)
  const dialogStrategy: SaveStrategy = () => saveProjectWithDialog(project)
  const strategies = order === 'dialog-first'
    ? [dialogStrategy, nativeStrategy]
    : [nativeStrategy, dialogStrategy]
  return firstSuccessfulResult(strategies)
}

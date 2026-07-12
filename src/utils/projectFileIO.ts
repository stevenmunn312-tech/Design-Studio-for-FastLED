import type { SavedProject } from '../state/projectStore'
import type { PersistedWorkspace } from '../state/workspacePersistence'
import { cloneWorkspace } from '../state/workspacePersistence'

interface FilePickerAcceptType {
  description?: string
  accept: Record<string, string[]>
}

interface OpenFilePickerOptions {
  multiple?: boolean
  excludeAcceptAllOption?: boolean
  types?: FilePickerAcceptType[]
}

interface SaveFilePickerOptions extends OpenFilePickerOptions {
  suggestedName?: string
}

interface FileSystemWritableFileStream {
  write(data: Blob | BufferSource | string): Promise<void>
  close(): Promise<void>
}

interface FileSystemFileHandle {
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<FileSystemWritableFileStream>
}

interface NativeFilePickerWindow extends Window {
  showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
}

const PROJECT_FILE_SUFFIX = '.fastled-project.json'
const PROJECT_FILE_TYPES: FilePickerAcceptType[] = [{
  description: 'FastLED Studio Project',
  accept: { 'application/json': ['.json', PROJECT_FILE_SUFFIX] },
}]

function trimProjectName(name: string): string {
  return name.trim().slice(0, 80)
}

function normalizeUploadTarget(value: unknown): SavedProject['uploadTarget'] {
  if (!value || typeof value !== 'object') return undefined
  const maybe = value as Partial<NonNullable<SavedProject['uploadTarget']>>
  return typeof maybe.selectedFqbn === 'string' && typeof maybe.selectedPort === 'string'
    ? { selectedFqbn: maybe.selectedFqbn, selectedPort: maybe.selectedPort }
    : undefined
}

function isWorkspace(value: unknown): value is PersistedWorkspace {
  if (!value || typeof value !== 'object') return false
  const workspace = value as Partial<PersistedWorkspace>
  return Array.isArray(workspace.nodes) && Array.isArray(workspace.edges)
}

export function projectFileBaseName(name: string): string {
  return name
    .replace(/\.fastled-project\.json$/i, '')
    .replace(/\.json$/i, '')
    .trim()
}

function makeProjectId(): string {
  return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function suggestProjectFileName(name: string): string {
  const safe = trimProjectName(name)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return `${safe || 'Untitled Project'}${PROJECT_FILE_SUFFIX}`
}

export function buildProjectSnapshot(
  workspace: PersistedWorkspace,
  options?: {
    sourceProject?: SavedProject
    name?: string
    duplicate?: boolean
  },
): SavedProject {
  const now = Date.now()
  const sourceProject = options?.sourceProject
  const nextName = trimProjectName(options?.name ?? sourceProject?.name ?? 'Untitled Project') || 'Untitled Project'
  return {
    id: sourceProject && !options?.duplicate ? sourceProject.id : makeProjectId(),
    name: nextName,
    createdAt: sourceProject && !options?.duplicate ? sourceProject.createdAt : now,
    updatedAt: now,
    workspace: cloneWorkspace(workspace),
    uploadTarget: normalizeUploadTarget(sourceProject?.uploadTarget),
  }
}

export function serializeProject(project: SavedProject): string {
  return JSON.stringify(project, null, 2)
}

export function parseProjectFile(text: string, fallbackName: string): SavedProject {
  const parsed = JSON.parse(text) as unknown
  const derivedName = trimProjectName(fallbackName) || 'Imported Project'
  const now = Date.now()

  if (isWorkspace(parsed)) {
    return {
      id: makeProjectId(),
      name: derivedName,
      createdAt: now,
      updatedAt: now,
      workspace: cloneWorkspace(parsed),
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid project file')
  }

  const candidate = parsed as Partial<SavedProject> & { workspace?: PersistedWorkspace }
  if (!isWorkspace(candidate.workspace)) {
    throw new Error('Invalid project file')
  }

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : makeProjectId(),
    name: trimProjectName(typeof candidate.name === 'string' ? candidate.name : derivedName) || derivedName,
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : now,
    workspace: cloneWorkspace(candidate.workspace),
    uploadTarget: normalizeUploadTarget(candidate.uploadTarget),
  }
}

export async function openProjectWithNativePicker(): Promise<{ file: File; fallbackName: string } | null> {
  const pickerWindow = window as NativeFilePickerWindow
  if (typeof pickerWindow.showOpenFilePicker !== 'function') return null
  const [handle] = await pickerWindow.showOpenFilePicker({
    multiple: false,
    excludeAcceptAllOption: false,
    types: PROJECT_FILE_TYPES,
  })
  const file = await handle.getFile()
  return {
    file,
    fallbackName: projectFileBaseName(handle.name || file.name),
  }
}

export async function saveProjectWithNativePicker(project: SavedProject): Promise<SavedProject | null> {
  const pickerWindow = window as NativeFilePickerWindow
  if (typeof pickerWindow.showSaveFilePicker !== 'function') return null
  const handle = await pickerWindow.showSaveFilePicker({
    suggestedName: suggestProjectFileName(project.name),
    excludeAcceptAllOption: false,
    types: PROJECT_FILE_TYPES,
  })
  const normalized = {
    ...project,
    name: trimProjectName(projectFileBaseName(handle.name) || project.name) || project.name,
  }
  const writable = await handle.createWritable()
  await writable.write(serializeProject(normalized))
  await writable.close()
  return normalized
}

import { create } from 'zustand'
import { listProjects, saveProjectToDisk, deleteProjectFromDisk } from '../utils/backendClient'
import type { PersistedWorkspace } from './workspacePersistence'
import { blankWorkspace, cloneWorkspace } from './workspacePersistence'

export interface ProjectUploadTarget {
  selectedFqbn: string
  selectedPort: string
}

export interface SavedProject {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  workspace: PersistedWorkspace
  uploadTarget?: ProjectUploadTarget
}

interface PersistedState {
  currentProjectId: string
  projects: SavedProject[]
}

interface PersistedCurrentWorkspace {
  projectId: string
  name?: string
  createdAt?: number
  updatedAt: number
  workspace: PersistedWorkspace
  uploadTarget?: ProjectUploadTarget
}

interface ProjectState {
  projects: SavedProject[]
  currentProjectId: string
  createProject: (name: string, workspace?: PersistedWorkspace, options?: { uploadTarget?: ProjectUploadTarget }) => SavedProject
  renameProject: (id: string, name: string) => void
  deleteProject: (id: string) => SavedProject | null
  switchProject: (id: string) => SavedProject | null
  saveCurrentWorkspace: (workspace: PersistedWorkspace) => void
  setProjectUploadTarget: (uploadTarget: ProjectUploadTarget, id?: string) => void
  refreshFromDisk: () => Promise<void>
}

const KEY = 'fastled-studio.projects.v1'
const CURRENT_PROJECT_KEY = 'fastled-studio.current-project.v1'
const CURRENT_WORKSPACE_KEY = 'fastled-studio.current-workspace.v1'
const LEGACY_AUTOSAVE_KEY = 'fastled-studio-graph'
const DISK_SYNC = !import.meta.env.VITEST

function trimName(name: string): string {
  return name.trim().slice(0, 80)
}

function sortProjects(projects: SavedProject[]): SavedProject[] {
  return [...projects].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
}

function uniqueProjectName(existing: SavedProject[], preferred: string): string {
  const base = trimName(preferred) || 'Untitled Project'
  const used = new Set(existing.map((project) => project.name.toLocaleLowerCase()))
  if (!used.has(base.toLocaleLowerCase())) return base
  let suffix = 2
  for (;;) {
    const candidate = `${base} ${suffix}`
    if (!used.has(candidate.toLocaleLowerCase())) return candidate
    suffix += 1
  }
}

function normalizeUploadTarget(value: unknown): ProjectUploadTarget | undefined {
  if (!value || typeof value !== 'object') return undefined
  const maybe = value as Partial<ProjectUploadTarget>
  return typeof maybe.selectedFqbn === 'string' && typeof maybe.selectedPort === 'string'
    ? { selectedFqbn: maybe.selectedFqbn, selectedPort: maybe.selectedPort }
    : undefined
}

function loadCurrentProjectHint(): string | null {
  try {
    const raw = localStorage.getItem(CURRENT_PROJECT_KEY)
    return raw ? String(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function persistCurrentProjectHint(projectId: string): void {
  try {
    localStorage.setItem(CURRENT_PROJECT_KEY, JSON.stringify(projectId))
  } catch {
    // Keep running when storage is unavailable or full.
  }
}

function loadCurrentWorkspaceSnapshot(): SavedProject | null {
  try {
    const raw = localStorage.getItem(CURRENT_WORKSPACE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedCurrentWorkspace>
    if (typeof parsed?.projectId !== 'string' || typeof parsed?.updatedAt !== 'number') return null
    const workspace = parsed.workspace
    if (!workspace || !Array.isArray(workspace.nodes) || !Array.isArray(workspace.edges)) return null
    return {
      id: parsed.projectId,
      name: typeof parsed.name === 'string' ? (trimName(parsed.name) || 'Recovered Project') : 'Recovered Project',
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : parsed.updatedAt,
      updatedAt: parsed.updatedAt,
      workspace: cloneWorkspace(workspace),
      uploadTarget: normalizeUploadTarget(parsed.uploadTarget),
    }
  } catch {
    return null
  }
}

function persistCurrentWorkspaceSnapshot(project: SavedProject | undefined): void {
  if (!project) {
    // No current project: drop the snapshot too, so a deleted project can't
    // resurrect from it on the next load.
    try {
      localStorage.removeItem(CURRENT_WORKSPACE_KEY)
    } catch {
      // Keep running when storage is unavailable.
    }
    return
  }
  try {
    localStorage.setItem(CURRENT_WORKSPACE_KEY, JSON.stringify({
      projectId: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      workspace: project.workspace,
      uploadTarget: project.uploadTarget,
    }))
  } catch {
    // Keep running when storage is unavailable or full.
  }
}

function sameUploadTarget(a: ProjectUploadTarget | undefined, b: ProjectUploadTarget | undefined): boolean {
  return (a?.selectedFqbn ?? '') === (b?.selectedFqbn ?? '')
    && (a?.selectedPort ?? '') === (b?.selectedPort ?? '')
}

function makeProject(
  name: string,
  workspace: PersistedWorkspace = blankWorkspace(),
  uploadTarget?: ProjectUploadTarget,
): SavedProject {
  const now = Date.now()
  return {
    id: `proj-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimName(name) || 'Untitled Project',
    createdAt: now,
    updatedAt: now,
    workspace: cloneWorkspace(workspace),
    uploadTarget: normalizeUploadTarget(uploadTarget),
  }
}

function normalizeState(parsed: Partial<PersistedState> | null | undefined): PersistedState {
  const currentWorkspace = loadCurrentWorkspaceSnapshot()
  const rawProjects = Array.isArray(parsed?.projects) ? parsed.projects : []
  const projects = rawProjects
    .filter((project): project is SavedProject =>
      !!project
      && typeof project.id === 'string'
      && typeof project.name === 'string'
      && typeof project.createdAt === 'number'
      && typeof project.updatedAt === 'number'
      && !!project.workspace
      && Array.isArray(project.workspace.nodes)
      && Array.isArray(project.workspace.edges))
    .map((project) => ({
      ...project,
      name: trimName(project.name) || 'Untitled Project',
      uploadTarget: normalizeUploadTarget(project.uploadTarget),
    }))
  const sorted = sortProjects(projects)
  const preferredProjectId =
    loadCurrentProjectHint()
    ?? (typeof parsed?.currentProjectId === 'string' ? parsed.currentProjectId : null)
    ?? currentWorkspace?.id
    ?? null
  const projectsWithSnapshot = currentWorkspace
    ? (() => {
        const existing = sorted.find((project) => project.id === currentWorkspace.id)
        if (!existing) return sortProjects([currentWorkspace, ...sorted])
        return sortProjects(sorted.map((project) =>
          project.id === currentWorkspace.id && currentWorkspace.updatedAt >= project.updatedAt
            ? currentWorkspace
            : project))
      })()
    : sorted
  if (projectsWithSnapshot.length === 0) {
    persistCurrentProjectHint('')
    persistCurrentWorkspaceSnapshot(undefined)
    return { currentProjectId: '', projects: [] }
  }
  const currentProjectId = projectsWithSnapshot.some((project) => project.id === preferredProjectId)
    ? String(preferredProjectId)
    : projectsWithSnapshot[0].id
  persistCurrentProjectHint(currentProjectId)
  persistCurrentWorkspaceSnapshot(projectsWithSnapshot.find((project) => project.id === currentProjectId))
  return { currentProjectId, projects: projectsWithSnapshot }
}

function load(): PersistedState {
  try {
    // The pre-projects single-slot autosave is dead weight: it was only ever
    // read to mint an implicit "Main" project, which kept resurrecting an
    // ancient graph whenever the project blob failed to load. Projects are
    // only ever created by the user now, so drop the stale payload (and
    // reclaim its localStorage quota) permanently.
    localStorage.removeItem(LEGACY_AUTOSAVE_KEY)
  } catch {
    // Keep running when storage is unavailable.
  }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return normalizeState(undefined)
    return normalizeState(JSON.parse(raw) as Partial<PersistedState>)
  } catch {
    return normalizeState(undefined)
  }
}

function persist(state: PersistedState) {
  persistCurrentProjectHint(state.currentProjectId)
  persistCurrentWorkspaceSnapshot(state.projects.find((project) => project.id === state.currentProjectId))
  try {
    localStorage.setItem(KEY, JSON.stringify({
      currentProjectId: state.currentProjectId,
      projects: state.projects,
    }))
  } catch {
    // Keep the in-memory copy when storage is unavailable or full.
  }
}

const initial = load()

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: initial.projects,
  currentProjectId: initial.currentProjectId,

  createProject: (name, workspace = blankWorkspace(), options) => {
    const state = get()
    const project = makeProject(uniqueProjectName(state.projects, name), workspace, options?.uploadTarget)
    const projects = sortProjects([project, ...state.projects])
    const next = { currentProjectId: project.id, projects }
    persist(next)
    set(next)
    if (DISK_SYNC) void saveProjectToDisk(project)
    return project
  },

  renameProject: (id, name) => {
    const nextName = trimName(name)
    if (!nextName) return
    const state = get()
    const projects = state.projects.map((project) =>
      project.id === id ? { ...project, name: nextName, updatedAt: Date.now() } : project)
    const next = { currentProjectId: state.currentProjectId, projects: sortProjects(projects) }
    persist(next)
    set(next)
    const renamed = next.projects.find((project) => project.id === id)
    if (DISK_SYNC && renamed) void saveProjectToDisk(renamed)
  },

  deleteProject: (id) => {
    const state = get()
    const projects = sortProjects(state.projects.filter((project) => project.id !== id))
    const currentProjectId = state.currentProjectId === id
      ? (projects[0]?.id ?? '')
      : state.currentProjectId
    const next = { currentProjectId, projects }
    persist(next)
    set(next)
    if (DISK_SYNC) void deleteProjectFromDisk(id)
    return next.projects.find((project) => project.id === next.currentProjectId) ?? null
  },

  switchProject: (id) => {
    const project = get().projects.find((entry) => entry.id === id) ?? null
    if (!project) return null
    const next = { currentProjectId: id, projects: get().projects }
    persist(next)
    set({ currentProjectId: id })
    return project
  },

  saveCurrentWorkspace: (workspace) => {
    const state = get()
    const now = Date.now()
    const snapshot = cloneWorkspace(workspace)
    const projects = state.projects.map((project) =>
      project.id === state.currentProjectId ? { ...project, workspace: snapshot, updatedAt: now } : project)
    const next = { currentProjectId: state.currentProjectId, projects: sortProjects(projects) }
    persist(next)
    set({ projects: next.projects })
    const current = next.projects.find((project) => project.id === next.currentProjectId)
    if (DISK_SYNC && current) void saveProjectToDisk(current)
  },

  setProjectUploadTarget: (uploadTarget, id) => {
    const state = get()
    const projectId = id ?? state.currentProjectId
    const current = state.projects.find((project) => project.id === projectId)
    const normalized = normalizeUploadTarget(uploadTarget)
    if (!current || sameUploadTarget(current.uploadTarget, normalized)) return
    const now = Date.now()
    const projects = state.projects.map((project) =>
      project.id === projectId ? { ...project, uploadTarget: normalized, updatedAt: now } : project)
    const next = { currentProjectId: state.currentProjectId, projects: sortProjects(projects) }
    persist(next)
    set({ projects: next.projects })
    const updated = next.projects.find((project) => project.id === projectId)
    if (DISK_SYNC && updated) void saveProjectToDisk(updated)
  },

  refreshFromDisk: async () => {
    if (!DISK_SYNC) return
    const disk = await listProjects()
    if (!disk) return
    const state = get()
    const merged = new Map<string, SavedProject>()
    for (const project of disk) merged.set(project.id, project)
    for (const project of state.projects) {
      const existing = merged.get(project.id)
      if (!existing) {
        merged.set(project.id, project)
        void saveProjectToDisk(project)
        continue
      }
      if (project.updatedAt >= existing.updatedAt) {
        merged.set(project.id, project)
        if (project.updatedAt > existing.updatedAt) void saveProjectToDisk(project)
      }
    }
    const projects = sortProjects([...merged.values()])
    const preferredProjectId = loadCurrentProjectHint() ?? state.currentProjectId
    const currentProjectId = projects.some((project) => project.id === preferredProjectId)
      ? preferredProjectId
      : (projects[0]?.id ?? '')
    const next = { currentProjectId, projects }
    persist(next)
    set(next)
  },
}))

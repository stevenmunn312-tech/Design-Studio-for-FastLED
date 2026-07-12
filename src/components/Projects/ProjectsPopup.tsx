import { useEffect, useMemo } from 'react'
import { useUiStore } from '../../state/uiStore'
import { useGraphStore } from '../../state/graphStore'
import { useProjectStore } from '../../state/projectStore'
import { captureWorkspace, blankWorkspace } from '../../state/workspacePersistence'
import {
  buildProjectSnapshot,
  nextDefaultProjectName,
  saveProjectWithNativePicker,
  serializeProject,
  suggestProjectFileName,
} from '../../utils/projectFileIO'
import { saveProjectWithDialog } from '../../utils/backendClient'
import styles from './ProjectsPopup.module.css'

function relativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (diffSec < 60) return 'just now'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  const diffHour = Math.round(diffMin / 60)
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`
  const diffDay = Math.round(diffHour / 24)
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
}

export default function ProjectsPopup() {
  const closeProjects = useUiStore((s) => s.closeProjects)
  const setStatus = useUiStore((s) => s.setStatus)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const requestNewProjectDecision = useUiStore((s) => s.requestNewProjectDecision)
  const requestPrompt = useUiStore((s) => s.requestPrompt)
  const projects = useProjectStore((s) => s.projects)
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const createProject = useProjectStore((s) => s.createProject)
  const renameProject = useProjectStore((s) => s.renameProject)
  const deleteProject = useProjectStore((s) => s.deleteProject)
  const switchProject = useProjectStore((s) => s.switchProject)
  const refreshFromDisk = useProjectStore((s) => s.refreshFromDisk)
  const currentProject = projects.find((project) => project.id === currentProjectId) ?? projects[0]
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt),
    [projects]
  )

  useEffect(() => {
    void refreshFromDisk()
  }, [refreshFromDisk])

  const loadProject = (id: string) => {
    if (!currentProject) return
    useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
    const next = switchProject(id)
    if (!next) return
    const { nodes, edges, graphData, graphs, activeGraphId } = next.workspace
    useGraphStore.getState().loadGraph(nodes, edges, { graphData, graphs, activeGraphId })
    useGraphStore.temporal.getState().clear()
    setStatus(`Opened project "${next.name}"`, 'success')
    closeProjects()
  }

  const createBlankProjectWithFileDialog = async (saveCurrentFirst: boolean) => {
    const defaultName = nextDefaultProjectName(projects.map((project) => project.name))
    const draft = buildProjectSnapshot(blankWorkspace(), { name: defaultName })
    try {
      // After the yes/no/cancel prompt resolves, browsers may drop the user
      // activation needed for showSaveFilePicker(). The helper-backed dialog
      // does not have that limitation, so prefer it for new-project creation.
      const saved = await saveProjectWithDialog(draft) ?? await saveProjectWithNativePicker(draft)
      if (!saved) throw new Error('Native picker unavailable')
      if (saveCurrentFirst && currentProject) {
        useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
      }
      const project = useProjectStore.getState().upsertProject(saved)
      useGraphStore.getState().loadGraph([], [])
      useGraphStore.temporal.getState().clear()
      setStatus(`Created project "${project.name}"`, 'success')
      closeProjects()
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      const blob = new Blob([serializeProject(draft)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = suggestProjectFileName(draft.name)
      a.click()
      URL.revokeObjectURL(url)
      if (saveCurrentFirst && currentProject) {
        useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
      }
      const project = useProjectStore.getState().upsertProject(draft)
      useGraphStore.getState().loadGraph([], [])
      useGraphStore.temporal.getState().clear()
      setStatus(`Created project "${project.name}"`, 'success')
      closeProjects()
    }
  }

  const createBlank = () => {
    void (async () => {
      const decision = currentProject ? await requestNewProjectDecision(currentProject.name) : 'no'
      if (decision === 'cancel') return
      await createBlankProjectWithFileDialog(decision === 'yes')
    })()
  }

  const duplicateCurrent = async () => {
    if (!currentProject) return
    const suggested = `${currentProject.name} Copy`
    const name = await requestPrompt({
      title: 'Duplicate project',
      message: 'Name for the duplicated project:',
      inputLabel: 'Project name',
      initialValue: suggested,
      confirmLabel: 'Duplicate',
    })
    if (name === null) return
    const workspace = structuredClone(captureWorkspace(useGraphStore.getState()))
    useProjectStore.getState().saveCurrentWorkspace(workspace)
    const project = createProject(name, workspace, { uploadTarget: currentProject.uploadTarget })
    useGraphStore.getState().loadGraph(
      project.workspace.nodes,
      project.workspace.edges,
      {
        graphData: project.workspace.graphData,
        graphs: project.workspace.graphs,
        activeGraphId: project.workspace.activeGraphId,
      }
    )
    useGraphStore.temporal.getState().clear()
    setStatus(`Duplicated into "${project.name}"`, 'success')
    closeProjects()
  }

  const rename = async (id: string, currentName: string) => {
    const next = await requestPrompt({
      title: 'Rename project',
      message: 'Rename project:',
      inputLabel: 'Project name',
      initialValue: currentName,
      confirmLabel: 'Rename',
    })
    if (next === null || !next.trim()) return
    renameProject(id, next)
    setStatus('Project renamed', 'success')
  }

  const remove = async (id: string, name: string) => {
    const ok = await requestConfirm({
      title: 'Delete project?',
      message: `Delete project "${name}"? Its saved workspace will be removed from the switcher.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      tone: 'danger',
    })
    if (!ok) return
    const nextActive = deleteProject(id)
    if (id === currentProjectId) {
      if (nextActive) {
        const { nodes, edges, graphData, graphs, activeGraphId } = nextActive.workspace
        useGraphStore.getState().loadGraph(nodes, edges, { graphData, graphs, activeGraphId })
      } else {
        useGraphStore.getState().loadGraph([], [])
      }
      useGraphStore.temporal.getState().clear()
    }
    setStatus(`Deleted project "${name}"`, 'success')
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeProjects() }}>
      <div className={styles.popup} role="dialog" aria-label="Projects">
        <div className={styles.header}>
          <span>Projects</span>
          <button className={styles.closeBtn} onClick={closeProjects} title="Close">×</button>
        </div>
        <div className={styles.hint}>
          Named workspaces backed by the same save format as JSON export. The current project autosaves in place, and this list is ordered by most recent activity.
        </div>
        <div className={styles.actions}>
          <button className={styles.primaryBtn} onClick={createBlank}>New Project</button>
          <button className={styles.secondaryBtn} onClick={() => { void duplicateCurrent() }} disabled={!currentProject}>Duplicate Current</button>
        </div>
        <div className={styles.list}>
          {sortedProjects.map((project) => {
            const nodeCount = project.workspace.nodes.length
            const active = project.id === currentProjectId
            return (
              <div key={project.id} className={`${styles.row} ${active ? styles.rowActive : ''}`}>
                <div className={styles.rowInfo}>
                  <div className={styles.rowTitle}>
                    <span className={styles.rowName}>{project.name}</span>
                    {active && <span className={styles.badge}>Current</span>}
                  </div>
                  <span className={styles.rowMeta}>
                    {nodeCount} node{nodeCount === 1 ? '' : 's'} · updated {relativeTime(project.updatedAt)}
                  </span>
                </div>
                <div className={styles.rowActions}>
                  <button className={styles.actionBtn} onClick={() => loadProject(project.id)} disabled={active}>Open</button>
                  <button className={styles.actionBtn} onClick={() => { void rename(project.id, project.name) }}>Rename</button>
                  <button className={styles.deleteBtn} onClick={() => { void remove(project.id, project.name) }}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

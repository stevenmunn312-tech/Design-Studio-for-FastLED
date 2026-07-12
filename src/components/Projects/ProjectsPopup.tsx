import { useEffect, useMemo } from 'react'
import { useUiStore } from '../../state/uiStore'
import { useGraphStore } from '../../state/graphStore'
import { useProjectStore } from '../../state/projectStore'
import { captureWorkspace, blankWorkspace } from '../../state/workspacePersistence'
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

  const createBlank = () => {
    const suggested = `Project ${projects.length + 1}`
    const name = window.prompt('Name for the new blank project:', suggested)
    if (name === null) return
    useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
    const project = createProject(name, blankWorkspace())
    useGraphStore.getState().loadGraph([], [])
    useGraphStore.temporal.getState().clear()
    setStatus(`Created project "${project.name}"`, 'success')
    closeProjects()
  }

  const duplicateCurrent = () => {
    if (!currentProject) return
    const suggested = `${currentProject.name} Copy`
    const name = window.prompt('Name for the duplicated project:', suggested)
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

  const rename = (id: string, currentName: string) => {
    const next = window.prompt('Rename project:', currentName)
    if (next === null || !next.trim()) return
    renameProject(id, next)
    setStatus('Project renamed', 'success')
  }

  const remove = (id: string, name: string) => {
    const ok = window.confirm(`Delete project "${name}"? Its saved workspace will be removed from the switcher.`)
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
          <button className={styles.primaryBtn} onClick={createBlank}>New Blank</button>
          <button className={styles.secondaryBtn} onClick={duplicateCurrent} disabled={!currentProject}>Duplicate Current</button>
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
                  <button className={styles.actionBtn} onClick={() => rename(project.id, project.name)}>Rename</button>
                  <button className={styles.deleteBtn} onClick={() => remove(project.id, project.name)}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGraphStore } from '../../state/graphStore'
import {
  defaultPropertiesForNodeType,
  presettableProperties,
  presetsForNodeType,
  useNodePresets,
  variationProperties,
} from '../../state/nodePresets'
import { saveGroupToLibrary, usePatternLibrary } from '../../state/patternLibrary'
import { useUiStore } from '../../state/uiStore'
import CreateGroupDialog, { type CreateGroupResult } from './CreateGroupDialog'
import styles from './NodeContextMenu.module.css'

interface Props {
  nodeId: string
  x: number
  y: number
  onClose: () => void
}

export default function NodeContextMenu({ nodeId, x, y, onClose }: Props) {
  const { duplicateNode, deleteNode, disconnectNode, copyNode, ungroupNode, createGroup, updateNodeProperties } = useGraphStore()
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const requestPrompt = useUiStore((s) => s.requestPrompt)
  const setStatus = useUiStore((s) => s.setStatus)
  const patterns = usePatternLibrary((s) => s.patterns)
  const nodePresets = useNodePresets((s) => s.presets)
  const savePreset = useNodePresets((s) => s.savePreset)
  const nodes = useGraphStore((s) => s.nodes)
  const node = useMemo(() => nodes.find((n) => n.id === nodeId), [nodeId, nodes])
  const isGroup = node?.data.nodeType === 'Group'
  const groupLabel = node?.data.label
  const nodeType = String(node?.data.nodeType ?? '')
  const presettable = useMemo(
    () => node ? Object.keys(presettableProperties(nodeType, node.data.properties)).length !== 0 : false,
    [node, nodeType],
  )
  const presets = useMemo(() => presetsForNodeType(nodeType, nodePresets), [nodeType, nodePresets])
  const selectedIds = useMemo(() => nodes.filter((n) => n.selected).map((n) => n.id), [nodes])
  const isMultiSelected = selectedIds.length > 1 && selectedIds.includes(nodeId)
  const [showGroupDialog, setShowGroupDialog] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleSaveToLibrary = async () => {
    const name = String(groupLabel ?? 'Pattern').trim()
    const replacing = patterns.some((pattern) => pattern.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())
    if (replacing) {
      const ok = await requestConfirm({
        title: 'Replace library pattern?',
        message: `A library pattern named “${name}” already exists. Replace it?`,
        confirmLabel: 'Replace',
        cancelLabel: 'Cancel',
        tone: 'danger',
      })
      if (!ok) return
    }
    const result = saveGroupToLibrary(nodeId, { replaceByName: replacing })
    if (result) {
      setStatus(
        result.replaced ? `Replaced “${result.name}” in the library` : `Saved “${result.name}” to the library`,
        'success',
      )
    }
  }

  const handleUngroup = () => {
    if (!ungroupNode(nodeId)) {
      setStatus('Could not ungroup that node', 'error')
      return
    }
    setStatus(`Ungrouped “${String(groupLabel ?? 'Group')}”`, 'success')
  }

  const handleSavePreset = async () => {
    if (!node) return
    const name = await requestPrompt({
      title: 'Save node preset',
      message: `Save the current ${String(node.data.label)} settings as a reusable preset:`,
      inputLabel: 'Preset name',
      initialValue: String(node.data.label ?? nodeType),
      confirmLabel: 'Save preset',
      selectText: true,
    })
    if (!name?.trim()) return
    const saved = savePreset(nodeType, name, node.data.properties)
    if (!saved) {
      setStatus('That node has no preset-friendly settings to save', 'error')
      return
    }
    setStatus(`Saved preset “${saved.name}”`, 'success')
  }

  const handleLoadPreset = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId)
    if (!preset) return
    updateNodeProperties(nodeId, preset.properties)
    setStatus(`Loaded preset “${preset.name}”`, 'success')
  }

  const handleVariation = (mode: 'randomize' | 'mutate') => {
    if (!node) return
    const updates = variationProperties(nodeType, node.data.properties, mode)
    if (Object.keys(updates).length === 0) {
      setStatus('That node has no safe look settings to vary', 'error')
      return
    }
    updateNodeProperties(nodeId, updates)
    setStatus(mode === 'randomize' ? 'Randomized node look' : 'Mutated node look', 'success')
  }

  const handleReset = () => {
    if (!node) return
    const safe = presettableProperties(nodeType, node.data.properties)
    const defaults = defaultPropertiesForNodeType(nodeType)
    const updates: Record<string, unknown> = {}
    for (const key of Object.keys(safe)) updates[key] = key in defaults ? defaults[key] : undefined
    updateNodeProperties(nodeId, updates)
    setStatus('Reset node settings', 'success')
  }

  // Mirrors GroupControls' "⊞ Group" dialog flow so grouping + saving to the
  // library can happen in one action from a multi-selection's right-click menu,
  // instead of select → group → reopen the node menu → Save to Library.
  const handleCreateGroup = async (name: string, { saveToLibrary, exposePaletteNodeIds }: CreateGroupResult) => {
    const groupId = createGroup(name, selectedIds, { saveToLibrary, exposePaletteNodeIds })
    let savedToLibrary = false
    let replacedLibraryPattern = false
    if (saveToLibrary) {
      const trimmedName = name.trim()
      const replacing = patterns.some((pattern) => pattern.name.trim().toLocaleLowerCase() === trimmedName.toLocaleLowerCase())
      const ok = !replacing || await requestConfirm({
        title: 'Replace library pattern?',
        message: `A library pattern named “${trimmedName}” already exists. Replace it?`,
        confirmLabel: 'Replace',
        cancelLabel: 'Cancel',
        tone: 'danger',
      })
      if (ok) {
        const result = saveGroupToLibrary(`groupnode-${groupId}`, { replaceByName: replacing })
        savedToLibrary = !!result
        replacedLibraryPattern = !!result?.replaced
      }
    }
    setStatus(
      `Grouped ${selectedIds.length} node(s) into “${name}”${
        savedToLibrary
          ? replacedLibraryPattern ? ' and replaced its library copy' : ' and saved to library'
          : ''
      }`,
      'success',
    )
    setShowGroupDialog(false)
    onClose()
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [onClose])

  const act = (fn: () => void) => { fn(); onClose() }

  if (showGroupDialog) {
    return (
      <CreateGroupDialog
        selectedIds={selectedIds}
        onClose={() => { setShowGroupDialog(false); onClose() }}
        onCreate={handleCreateGroup}
      />
    )
  }

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ left: x, top: y }}
    >
      <button className={styles.item} onClick={() => act(() => copyNode(nodeId))}>
        Copy
      </button>
      <button className={styles.item} onClick={() => act(() => duplicateNode(nodeId))}>
        Duplicate
      </button>
      <button className={styles.item} onClick={() => act(() => disconnectNode(nodeId))}>
        Disconnect All
      </button>
      {isMultiSelected && (
        <button className={styles.item} onClick={() => setShowGroupDialog(true)}>
          Group {selectedIds.length} Nodes…
        </button>
      )}
      {isGroup && (
        <button className={styles.item} onClick={() => { onClose(); void handleSaveToLibrary() }}>
          Save to Library
        </button>
      )}
      {isGroup && (
        <button className={styles.item} onClick={() => act(handleUngroup)}>
          Ungroup
        </button>
      )}
      {presettable && (
        <>
          <div className={styles.divider} />
          <button className={styles.item} onClick={() => { onClose(); void handleSavePreset() }}>
            Save Preset…
          </button>
          {presets.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Load preset</div>
              {presets.map((preset) => (
                <button key={preset.id} className={styles.item} onClick={() => act(() => handleLoadPreset(preset.id))}>
                  {preset.name}
                </button>
              ))}
            </div>
          )}
          <button className={styles.item} onClick={() => act(() => handleVariation('randomize'))}>
            Randomize Look
          </button>
          <button className={styles.item} onClick={() => act(() => handleVariation('mutate'))}>
            Mutate
          </button>
          <button className={styles.item} onClick={() => act(handleReset)}>
            Reset
          </button>
        </>
      )}
      <div className={styles.divider} />
      <button className={`${styles.item} ${styles.danger}`} onClick={() => act(() => deleteNode(nodeId))}>
        Delete
      </button>
    </div>,
    document.body,
  )
}

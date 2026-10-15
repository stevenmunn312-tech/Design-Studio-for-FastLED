/**
 * Every node's Node Reference page, by node type.
 *
 * Split by library category so each file stays readable; the coverage test
 * holds the merged map to exactly the types in NODE_LIBRARY.
 */
import type { NodeDefinition } from '../../../types'
import type { NodeReferenceEntry, NodeReferenceMap } from './types'
import { INPUT_REFERENCE } from './input'
import { AUDIO_REFERENCE } from './audio'
import { SIGNAL_REFERENCE } from './signal'
import { MATH_REFERENCE } from './math'
import { COLOR_REFERENCE } from './color'
import { PATTERN_REFERENCE } from './pattern'
import { FIELD_REFERENCE } from './field'
import { COMPOSITE_REFERENCE } from './composite'
import { SHOW_REFERENCE } from './show'
import { OUTPUT_REFERENCE } from './output'
import { HARDWARE_REFERENCE } from './hardware'
import { NOTE_REFERENCE } from './note'

export const NODE_REFERENCE: NodeReferenceMap = {
  ...INPUT_REFERENCE,
  ...AUDIO_REFERENCE,
  ...SIGNAL_REFERENCE,
  ...MATH_REFERENCE,
  ...COLOR_REFERENCE,
  ...PATTERN_REFERENCE,
  ...FIELD_REFERENCE,
  ...COMPOSITE_REFERENCE,
  ...SHOW_REFERENCE,
  ...OUTPUT_REFERENCE,
  ...HARDWARE_REFERENCE,
  ...NOTE_REFERENCE,
}

export function nodeReferenceEntry(node: NodeDefinition): NodeReferenceEntry {
  const entry = NODE_REFERENCE[node.type]
  if (!entry) throw new Error(`No Node Reference entry for ${node.type}`)
  return entry
}

export type { NodeReferenceEntry } from './types'
export type { ReferenceLiveExample } from './example'

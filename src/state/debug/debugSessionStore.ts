// What the user has entered on each Debug node this session: meter readings
// and ticked isolation steps. Never persisted, like the node itself.

import { create } from 'zustand'
import type { MeterReadings } from './debugProfile'

interface DebugSessionState {
  readings: Record<string, MeterReadings>
  isolated: Record<string, Record<number, boolean>>
  setReading: (debugNodeId: string, stepId: string, value: number | boolean | string | undefined) => void
  setIsolated: (debugNodeId: string, index: number, done: boolean) => void
  clear: (debugNodeId: string) => void
}

const NO_READINGS: MeterReadings = {}
const NO_TICKS: Record<number, boolean> = {}

export const useDebugSessionStore = create<DebugSessionState>((set) => ({
  readings: {},
  isolated: {},
  setReading: (debugNodeId, stepId, value) => set((s) => {
    const next = { ...(s.readings[debugNodeId] ?? {}) }
    if (value === undefined) delete next[stepId]
    else next[stepId] = value
    return { readings: { ...s.readings, [debugNodeId]: next } }
  }),
  setIsolated: (debugNodeId, index, done) => set((s) => ({
    isolated: { ...s.isolated, [debugNodeId]: { ...(s.isolated[debugNodeId] ?? {}), [index]: done } },
  })),
  clear: (debugNodeId) => set((s) => {
    const readings = { ...s.readings }
    const isolated = { ...s.isolated }
    delete readings[debugNodeId]
    delete isolated[debugNodeId]
    return { readings, isolated }
  }),
}))

export function readingsFor(state: DebugSessionState, debugNodeId: string): MeterReadings {
  return state.readings[debugNodeId] ?? NO_READINGS
}

export function isolatedFor(state: DebugSessionState, debugNodeId: string): Record<number, boolean> {
  return state.isolated[debugNodeId] ?? NO_TICKS
}

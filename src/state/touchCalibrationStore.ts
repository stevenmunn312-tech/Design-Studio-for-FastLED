// Browser state for one guided touch-calibration run.
//
// The serial reader remains deviceTelemetryStore: the helper owns a port
// exclusively, so this store receives already-parsed raw samples and never
// opens hardware itself. The capture rules and calibration math live in
// transportTouch.ts beside coordinate rotation and hit regions.

import { create } from 'zustand'
import {
  beginTouchCalibrationCorner,
  captureTouchCalibrationSample,
  createTouchCalibrationCapture,
  retryTouchCalibrationCorner,
  type RawTouchPoint,
  type TouchCalibrationCapture,
} from './transportTouch'

export interface TouchCalibrationSession extends TouchCalibrationCapture {
  nodeId: string
}

interface TouchCalibrationState {
  session: TouchCalibrationSession | null
  start: (nodeId: string) => void
  beginCorner: () => void
  retryCorner: () => void
  ingestRawSample: (sample: RawTouchPoint) => void
  cancel: () => void
}

export const useTouchCalibrationStore = create<TouchCalibrationState>((set) => ({
  session: null,

  start: (nodeId) => set({ session: { nodeId, ...createTouchCalibrationCapture() } }),

  beginCorner: () => set((state) => state.session
    ? { session: { ...state.session, ...beginTouchCalibrationCorner(state.session) } }
    : state),

  retryCorner: () => set((state) => state.session
    ? { session: { ...state.session, ...retryTouchCalibrationCorner(state.session) } }
    : state),

  ingestRawSample: (sample) => set((state) => state.session
    ? { session: { ...state.session, ...captureTouchCalibrationSample(state.session, sample) } }
    : state),

  cancel: () => set({ session: null }),
}))

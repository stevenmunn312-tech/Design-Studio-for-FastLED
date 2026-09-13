// Browser state for one guided touch-calibration run.
//
// The serial reader remains deviceTelemetryStore: the helper owns a port
// exclusively, so this store receives already-parsed raw samples and never
// opens hardware itself. The capture rules and calibration math live in
// transportTouch.ts beside coordinate rotation and hit regions.
//
// It also owns the *run*, not just the capture — put the board in a state
// where it can answer, and put it back afterwards. Calibration used to be a
// checklist the user performed around the wizard (turn on a Board property,
// give the panel a layout that samples touch, upload a graph that passes
// deploy validation, connect serial) and the last two were often impossible
// for the graph being calibrated. Here it is one button: a measuring sketch
// generated from the panel alone, uploaded, listened to, and disconnected when
// the bounds are saved.

import { create } from 'zustand'
import {
  beginTouchCalibrationCorner,
  captureTouchCalibrationSample,
  createTouchCalibrationCapture,
  retryTouchCalibrationCorner,
  type RawTouchPoint,
  type TouchCalibrationCapture,
} from './transportTouch'
import { generateTouchCalibrationSketch, touchCalibrationTargetFor } from '../codegen/touchCalibrationSketch'
import { rootGraphNodes, useGraphStore } from './graphStore'
import { tftControllerForProps } from './nodeLibrary'
import { asTftRotation } from './tftSurface'
import { useUploadStore } from './uploadStore'

export interface TouchCalibrationSession extends TouchCalibrationCapture {
  nodeId: string
  /** True while the measuring sketch is compiling and flashing. */
  preparing: boolean
  /** Set once the board has been flashed with the measuring sketch, so the
   *  wizard can say the project needs uploading again when it finishes. */
  sketchUploaded: boolean
}

interface TouchCalibrationState {
  session: TouchCalibrationSession | null
  start: (nodeId: string) => void
  /** Build, upload and listen — everything between "Calibrate" and "press a corner". */
  prepare: () => Promise<void>
  /** Start the four corners again without reflashing a board already measuring. */
  restart: () => void
  beginCorner: () => void
  retryCorner: () => void
  ingestRawSample: (sample: RawTouchPoint) => void
  cancel: () => void
}

/**
 * The panel this Touch node reads, and the sketch that measures it.
 *
 * Null when the pairing is broken — a Touch node whose `panelId` names nothing,
 * which the wizard reports rather than uploading a sketch built from defaults
 * that would drive whatever pins the library happens to suggest.
 */
function calibrationSketchFor(nodeId: string): string | null {
  const nodes = rootGraphNodes(useGraphStore.getState())
  const touch = nodes.find((node) => node.id === nodeId)
  const panelId = String((touch?.data.properties as Record<string, unknown> | undefined)?.panelId ?? '')
  const panel = nodes.find((node) => node.id === panelId && node.data.nodeType === 'TransportDisplay')
  if (!panel) return null
  const properties = panel.data.properties as Record<string, unknown>
  return generateTouchCalibrationSketch(touchCalibrationTargetFor(
    properties,
    tftControllerForProps(properties),
    asTftRotation(properties.tftRotation),
  ))
}

export const useTouchCalibrationStore = create<TouchCalibrationState>((set, get) => ({
  session: null,

  start: (nodeId) => set({
    session: {
      nodeId,
      ...createTouchCalibrationCapture(),
      // Capture starts at `ready`; a fresh run starts one step earlier,
      // because nothing can be read until the board is measuring.
      phase: 'prepare',
      preparing: false,
      sketchUploaded: false,
    },
  }),

  prepare: async () => {
    const session = get().session
    if (!session || session.preparing) return
    const sketch = calibrationSketchFor(session.nodeId)
    if (!sketch) {
      set((state) => state.session
        ? { session: { ...state.session, error: 'This Touch node is not linked to a display panel.' } }
        : state)
      return
    }
    set((state) => state.session
      ? { session: { ...state.session, preparing: true, error: null } }
      : state)
    const upload = useUploadStore.getState()
    // Not cached as the project's last sketch: this is an instrument, and
    // "upload last sketch" must never reflash it in place of the project.
    await upload.runUpload(sketch, undefined, { cache: false })
    const failed = useUploadStore.getState().status.phase === 'error'
    if (failed) {
      set((state) => state.session
        ? { session: { ...state.session, preparing: false, error: 'The measuring sketch did not upload. The Output console has the build log.' } }
        : state)
      return
    }
    // `runUpload` stops serial before flashing and the helper holds the port
    // through it, so the listener can only be started once it has finished.
    await useUploadStore.getState().startSerial()
    set((state) => state.session
      ? {
        session: {
          ...state.session,
          preparing: false,
          sketchUploaded: true,
          phase: 'ready',
          error: useUploadStore.getState().serialConnected
            ? null
            : 'Uploaded, but the serial port did not open. Reconnect it to continue.',
        },
      }
      : state)
  },

  restart: () => set((state) => state.session
    ? {
      session: {
        ...state.session,
        ...createTouchCalibrationCapture(),
        // A board already running the measuring sketch does not need it twice,
        // and `createTouchCalibrationCapture` already starts at `ready`.
        ...(state.session.sketchUploaded ? {} : { phase: 'prepare' as const }),
      },
    }
    : state),

  beginCorner: () => set((state) => state.session
    ? { session: { ...state.session, ...beginTouchCalibrationCorner(state.session) } }
    : state),

  retryCorner: () => set((state) => state.session
    ? { session: { ...state.session, ...retryTouchCalibrationCorner(state.session) } }
    : state),

  ingestRawSample: (sample) => set((state) => state.session
    ? { session: { ...state.session, ...captureTouchCalibrationSample(state.session, sample) } }
    : state),

  /*
   * Closing releases the port.
   *
   * The wizard opened it, so the wizard gives it back — leaving it held would
   * block the next upload, which is exactly what the user has to do next. Only
   * when this run actually connected: a wizard closed before uploading must
   * not stop a serial monitor the user had already running.
   */
  cancel: () => {
    if (get().session?.sketchUploaded) useUploadStore.getState().stopSerial()
    set({ session: null })
  },
}))

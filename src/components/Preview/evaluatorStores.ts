import { useNetworkCredentialsStore } from '../../state/peripherals/networkCredentials'
import { useUiStore } from '../../state/uiStore'
import { useDisplayRuntimeStore } from '../../state/displays/displayRuntimeStore'
import { useBoardLinkKeyStore } from '../../state/peripherals/boardLinkKey'
import { useProjectStore } from '../../state/projectStore'
import { useStreamStore } from '../../state/output/streamStore'
import { useStreamReceiverRecord } from '../../state/output/streamReceiverRecord'
import { useTouchCalibrationStore } from '../../state/displays/touchCalibrationStore'
import { useIrLearnStore } from '../../state/peripherals/irLearnStore'
import { useDeviceTelemetryStore } from '../../state/upload/deviceTelemetryStore'
import { useUploadStore } from '../../state/upload/uploadStore'
import { useNodeDefaults } from '../../state/nodeDefaults'
import { useGraphStore } from '../../state/graphStore'
import { useAudioStore } from '../../state/audio/audioStore'
import { useDecoderAudioStore } from '../../state/audio/decoderAudioStore'
import { useDmxStore } from '../../state/peripherals/dmxStore'
import { useDdpStore } from '../../state/peripherals/ddpStore'
import { useHardwareInputStore } from '../../state/peripherals/hardwareInputStore'
import { useTransportDisplayTouchStore } from '../../state/displays/transportDisplayTouchStore'
import { useMidiStore } from '../../state/midiStore'
import { usePlayerTransport } from '../../state/player/playerTransport'

/**
 * Every Zustand store the evaluator's modules can reach. In the preview
 * worker these stores exist but hold nothing, so the worker makes each
 * `getState` throw, and workerGate.test.ts spies on each while the allowed
 * node types run. Found by bundling `graphEvaluator.ts` with esbuild and
 * listing the reached modules that `export const use… = create`; repeat that
 * when a node starts reading a new store.
 */
export const EVALUATOR_STORES: ReadonlyArray<readonly [string, { getState: () => unknown }]> = [
  ['useNetworkCredentialsStore', useNetworkCredentialsStore],
  ['useUiStore', useUiStore],
  ['useDisplayRuntimeStore', useDisplayRuntimeStore],
  ['useBoardLinkKeyStore', useBoardLinkKeyStore],
  ['useProjectStore', useProjectStore],
  ['useStreamStore', useStreamStore],
  ['useStreamReceiverRecord', useStreamReceiverRecord],
  ['useTouchCalibrationStore', useTouchCalibrationStore],
  ['useIrLearnStore', useIrLearnStore],
  ['useDeviceTelemetryStore', useDeviceTelemetryStore],
  ['useUploadStore', useUploadStore],
  ['useNodeDefaults', useNodeDefaults],
  ['useGraphStore', useGraphStore],
  ['useAudioStore', useAudioStore],
  ['useDecoderAudioStore', useDecoderAudioStore],
  ['useDmxStore', useDmxStore],
  ['useDdpStore', useDdpStore],
  ['useHardwareInputStore', useHardwareInputStore],
  ['useTransportDisplayTouchStore', useTransportDisplayTouchStore],
  ['useMidiStore', useMidiStore],
  ['usePlayerTransport', usePlayerTransport],
]

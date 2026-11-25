import { useNetworkCredentialsStore } from '../../state/peripherals/networkCredentials'
import { useUiStore } from '../../state/uiStore'
import { useDisplayRuntimeStore } from '../../state/displays/displayRuntimeStore'
import { useBoardLinkKeyStore } from '../../state/peripherals/boardLinkKey'
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
 * worker those not sent with each request hold nothing, so the worker makes
 * their `getState` throw, and workerGate.test.ts spies on each while the
 * allowed node types run. `evaluatorStores.test.ts` bundles the evaluator
 * with esbuild and holds this list to the stores it reaches, so a node that
 * starts reading a new store fails there first. The graph store is not one:
 * the evaluator reads it through `state/graphReader.ts`, which keeps it, and
 * React Flow and the catalogues behind it, out of the worker.
 */
export interface EvaluatorStore {
  getState: () => unknown
  setState: (partial: Record<string, unknown>) => void
}

export const EVALUATOR_STORES: ReadonlyArray<readonly [string, EvaluatorStore]> = [
  ['useNetworkCredentialsStore', useNetworkCredentialsStore],
  ['useUiStore', useUiStore],
  ['useDisplayRuntimeStore', useDisplayRuntimeStore],
  ['useBoardLinkKeyStore', useBoardLinkKeyStore],
  ['useAudioStore', useAudioStore],
  ['useDecoderAudioStore', useDecoderAudioStore],
  ['useDmxStore', useDmxStore],
  ['useDdpStore', useDdpStore],
  ['useHardwareInputStore', useHardwareInputStore],
  ['useTransportDisplayTouchStore', useTransportDisplayTouchStore],
  ['useMidiStore', useMidiStore],
  ['usePlayerTransport', usePlayerTransport],
]

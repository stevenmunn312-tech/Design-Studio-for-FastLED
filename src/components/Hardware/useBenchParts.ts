// What is on the Hardware workspace's bench, read from the root graph: each
// input part, fixture and LED output paired with its catalogue entry and the
// geometry the bench draws it with.
import { useMemo } from 'react'
import { nextFreeLedDataPin } from '../../state/ledPinAssignment'
import { ringDiameterMm, partPinLabelForProperty, partRenderSrc } from '../../state/partCatalogue'
import { normalizeButtonBankEntries, buttonBankHandle } from '../../state/buttonBank'
import { resolvePartIdentity } from '../../state/partOptions'
import { boardProfileById, type PhysicalBoardProfile } from '../../build/boardProfiles'
import { ledPitchMm, DEFAULT_BOARD_PROFILE_ID, WS2812B_PITCH_MM } from '../../state/hardware'
import {
  outputForm, outputGridDims, LED_OUTPUT_FORM_LABELS, ringStartAngle, ringDirection, corkscrewTurns,
  corkscrewStartAngle, corkscrewDirection, corkscrewDiameterMm, corkscrewHeightMm,
} from '../../state/ledOutputForm'
import {
  INPUT_PARTS, LED_OUTPUT_NODE_TYPE, FIXTURE_PARTS, modulePinKeys, MODULE_PIN_LABELS, numericPinSummary,
  VU_PAIR_WIDTH_MM,
} from './hardwarePartCatalog'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

export interface BenchPartsInputs {
  nodes: StudioNode[]
  edges: StudioEdge[]
  selectedBoard: PhysicalBoardProfile | undefined
}

/** The parts on the bench, recomputed only when the root graph changes. */
export function useBenchParts({ nodes, edges, selectedBoard }: BenchPartsInputs) {
  /*
   * Every input part on the canvas, paired with its catalogue entry. Several
   * buttons are ordinary, so a part id has to distinguish them — the entry's
   * own id for the first, then the node id, which is stable across re-renders.
   */
  const inputParts = useMemo(() => {
    const seen = new Map<string, number>()
    return nodes
      .flatMap((node) => {
        const props = node.data.properties as Record<string, unknown>
        const entry = INPUT_PARTS.find((candidate) =>
          candidate.nodeType === node.data.nodeType
          && candidate.properties?.partId === props.partId,
        ) ?? INPUT_PARTS.find((candidate) => candidate.nodeType === node.data.nodeType)
        if (!entry) return []
        const index = seen.get(entry.nodeType) ?? 0
        seen.set(entry.nodeType, index + 1)
        const bankFirst = entry.nodeType === 'ButtonBank'
          ? normalizeButtonBankEntries(props.buttons)[0]
          : undefined
        return [{
          entry,
          node,
          partId: index === 0 ? entry.partId : `${entry.partId}-${node.id}`,
          signalKey: `${node.id}:${bankFirst ? buttonBankHandle(bankFirst.id) : entry.signalPort}`,
        }]
      })
  }, [nodes])
  /*
   * Every LED output, in graph order. Not one strip and one panel: a board can
   * drive several, each on its own pin, and the view has to show what is
   * actually on the bench rather than the first of each kind.
  */
  const ledOutputs = useMemo(() => {
    return nodes
      .filter((node) => node.data.nodeType === LED_OUTPUT_NODE_TYPE)
      .map((node) => {
        const props = node.data.properties as Record<string, unknown>
        const form = outputForm(props)
        const isStrip = form === 'strip'
        const isRing = form === 'ring'
        const isCorkscrew = form === 'corkscrew'
        const grid = outputGridDims(props)
        const ledCount = grid.width
        const cols = grid.width
        const rows = grid.height
        // Every part at true scale through the view's one mm-to-pixel factor: a
        // ring's diameter follows from its own circumference, and a HUB75 panel
        // is much denser than addressable tape, which is exactly the difference
        // worth seeing on the bench.
        // Measured where the ring exists, interpolated where it does not — real
        // rings are not linear in LED count, because a small one needs a hub
        // whatever sits on it. See partCatalogue.ringDiameterMm.
        const ringMm = ringDiameterMm(ledCount)
        const pitch = ledPitchMm(form)
        const feed = edges.find((edge) => edge.target === node.id)
        return {
          node,
          partId: `led-${node.id}`,
          form,
          isStrip,
          isRing,
          isCorkscrew,
          pitchMm: pitch,
          /** Emitters on a grid, at `pitchMm` — a panel or a string, not a ring. */
          gridded: !isRing && !isCorkscrew,
          label: LED_OUTPUT_FORM_LABELS[form],
          cols,
          rows,
          ring: isRing
            ? {
              ledCount,
              startAngle: ringStartAngle(props),
              direction: ringDirection(props),
            }
            : null,
          corkscrew: isCorkscrew
            ? {
              ledCount,
              turns: corkscrewTurns(props),
              startAngle: corkscrewStartAngle(props),
              direction: corkscrewDirection(props),
            }
            : null,
          // A string is a line of emitters, so the bench may draw it broken
          // rather than let a 60-LED run leave the stage. A corkscrew is the
          // same run but wound: its length is already bounded by the cylinder.
          run: isStrip
            ? { axis: 'x' as const, units: cols, unitMm: pitch }
            : null,
          // A string asks for nothing of its own here: its grid is already
          // `N x 1`, so the plain `cols x rows` of square cells every panel is
          // sized by draws it as the one-row panel it is.
          widthMm: isRing
            ? ringMm
            : isCorkscrew
              ? corkscrewDiameterMm(props)
              : cols * pitch,
          heightMm: isRing
            ? ringMm
            : isCorkscrew
              ? corkscrewHeightMm(props)
              : rows * pitch,
          dataPin: Number(props.dataPin ?? 0),
          signalKey: feed ? `${feed.source}:${feed.sourceHandle ?? 'frame'}` : null,
        }
      })
  }, [edges, nodes])
  const boardProfile = selectedBoard ?? boardProfileById(DEFAULT_BOARD_PROFILE_ID)
  /*
   * LED outputs are limited by the board, not by a count. Multi-output routing
   * is a real feature — several strips and panels on their own pins — so the
   * only true ceiling is a free GPIO. `null` means this board is full, and the
   * action says so rather than adding a colliding pin.
   */
  const nextLedPin = useMemo(
    () => nextFreeLedDataPin(boardProfile, nodes),
    [boardProfile, nodes],
  )
  /*
   * Every fixture on the bench, pictured as the module it actually is.
   *
   * FIXTURE_PARTS can only name a default — its render and footprint are
   * resolved once at module load — so an Amplifier was drawn as a MAX98357A
   * and an SD Card as the 5 V module whatever you had chosen. That is the
   * hardware view telling a quiet lie about the bench, and the SD pair is the
   * case where it bites: the 5 V module and the bare 3.3 V breakout are
   * visibly different boards, and confusing them destroys cards.
   *
   * The catalogue already carries a render and a datasheet-checked size per
   * module, so the part looks itself up rather than inheriting the default's
   * picture.
   */
  const fixtureParts = useMemo(() => {
    // Layout ids must be unique per part, not per type: SD Card and Amplifier
    // are singletons, but a bench can carry several displays and they would
    // otherwise stack on one another's coordinates.
    const seen = new Map<string, number>()
    return nodes.flatMap((node) => {
    const entry = FIXTURE_PARTS.find((candidate) => candidate.nodeType === node.data.nodeType)
    if (!entry) return []
    const ordinal = seen.get(entry.nodeType) ?? 0
    seen.set(entry.nodeType, ordinal + 1)
    const identity = resolvePartIdentity(node.data.nodeType, node.data.properties as Record<string, unknown>)
    const chosen = identity?.entry
    const moduleKeys = modulePinKeys(entry.nodeType, identity?.option.id)
    const pinFields = moduleKeys
      ? moduleKeys.map((key) => ({
        key,
        label: partPinLabelForProperty(identity?.option.id ?? '', key) ?? MODULE_PIN_LABELS[key] ?? key,
      }))
      : entry.pinFields ?? []
    const props = node.data.properties as Record<string, unknown>
    const pinSummary = numericPinSummary(props, pinFields)
    const vuLedCount = entry.nodeType === 'StereoVuMeter'
      ? Math.max(1, Math.round(Number(props.ledCount ?? 16)))
      : null
    const footprint = vuLedCount
      ? { width: VU_PAIR_WIDTH_MM, height: vuLedCount * WS2812B_PITCH_MM }
      : chosen?.dimensionsMm ?? entry.footprint
    return [{
      entry: {
        ...entry,
        label: identity?.option.label ?? entry.label,
        footprint,
        render: (chosen && partRenderSrc(chosen.partId)) ?? entry.render,
      },
      node,
      partId: ordinal === 0 ? entry.partId : `${entry.partId}-${node.id}`,
      pinSummary,
      // A rail stands on end, so an unbroken one sets the height every other
      // part is scaled against — the case the break was written for.
      run: vuLedCount
        ? { axis: 'y' as const, units: vuLedCount, unitMm: WS2812B_PITCH_MM }
        : null,
    }]
    })
  }, [nodes])

  return { inputParts, ledOutputs, boardProfile, nextLedPin, fixtureParts }
}

/** The bench as useBenchParts reads it; handlers that act on parts take its lists. */
export type BenchParts = ReturnType<typeof useBenchParts>

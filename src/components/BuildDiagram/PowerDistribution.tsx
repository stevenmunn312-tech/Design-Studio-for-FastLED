// The power section of the physical assembly diagram: supply, main fuse,
// fuse block and the feed harness to each LED output.
import type { SupplyRecommendation, ElectricalPlanSummary } from '../../build/electricalPlan'
import { type FuseBlockCircuitCount, fuseBlockAllocations } from '../../build/powerDistribution'
import { partRenderSrc } from '../../state/partCatalogue'
import psuRender from '../../assets/components/5v-psu.webp'
import capacitorRender from '../../assets/components/panasonic-eeufr0j102b-1000uf.webp'
import fuseBlock2Render from '../../assets/components/fuse-block-2-circuit.webp'
import fuseBlock4Render from '../../assets/components/fuse-block-4-circuit.webp'
import fuseBlock6Render from '../../assets/components/fuse-block-6-circuit.webp'
import fuseBlock8Render from '../../assets/components/fuse-block-8-circuit.webp'
import fuseBlock10Render from '../../assets/components/fuse-block-10-circuit.webp'
import fuseBlock12Render from '../../assets/components/fuse-block-12-circuit.webp'
import styles from './BuildDiagramWorkspace.module.css'
import { NetStub } from './netStubs'
import { HoverWire } from './wireHover'
import {
  FUSE_BLOCK_START_X,
  FUSE_BLOCK_CELL_WIDTH,
  POWER_FEED_PAIR_GAP,
  type PowerZoneBand,
  powerDistributionSectionLayout,
  fuseColumnSplit,
  fuseSlotForFeed,
  fuseBlockPoints,
  feedIndexForFuseSlot,
  groundCombLaneY,
  FUSE_BLOCK_CELL_HEIGHT,
  POWER_BRANCH_ROW_SPACING,
  feedCombLaneY,
} from './physicalDiagramLayout'
import { formatAmps } from './signalPresentation'

const FUSE_BLOCK_RENDERS: Record<FuseBlockCircuitCount, string> = {
  2: fuseBlock2Render,
  4: fuseBlock4Render,
  6: fuseBlock6Render,
  8: fuseBlock8Render,
  10: fuseBlock10Render,
  12: fuseBlock12Render,
}

/**
 * Feed-lane harness for one PSU zone.
 *
 * Every branch runs down and to the right into its own vertical lane, and the
 * lanes are ordered right to left as the destination row gets deeper. A lane
 * drop therefore always happens to the left of every shallower row's run, so
 * the fan-out never crosses itself. Each pair keeps its ground immediately
 * left of its positive for the same reason: the ground lands 32px lower, so it
 * has to pass the positive row on the outside.
 */
const LANE_BAND_RIGHT = 742
const LANE_BAND_LEFT = FUSE_BLOCK_START_X + FUSE_BLOCK_CELL_WIDTH + 28
const LANE_MAX_PITCH = 24
const LANE_MIN_PITCH = 7
/** Rails the left-column feeds drop down, outside the block and inside the PSU. */
const LEFT_RAIL_X = FUSE_BLOCK_START_X - 16
const LEFT_RAIL_STEP = 10
const LEFT_RAIL_MIN_X = 230
/**
 * PSU trunk risers, kept left of every branch rail. The ground riser is the
 * outer one so the two trunks never cross each other on their way in.
 */
const PSU_POSITIVE_TRUNK_X = 212
/** Main fuse on the short run between the PSU terminal and the positive riser. */
const MAIN_FUSE_X = 180
const PSU_GROUND_TRUNK_X = 196

/**
 * Panasonic EEUFR0J102B render, cropped to its own alpha bounds. The part is
 * drawn from the side with both leads out the left, positive above the striped
 * negative, so the leads sit straight on the two feed wires.
 */
const CAPACITOR_ASPECT = 1382 / 504
const CAPACITOR_POSITIVE_LEAD_RATIO = 142 / 504
const CAPACITOR_NEGATIVE_LEAD_RATIO = 361 / 504
const CAPACITOR_HEIGHT = Math.round(POWER_FEED_PAIR_GAP / (CAPACITOR_NEGATIVE_LEAD_RATIO - CAPACITOR_POSITIVE_LEAD_RATIO))
const CAPACITOR_WIDTH = Math.round(CAPACITOR_HEIGHT * CAPACITOR_ASPECT)
/**
 * The feed run ends on the LED panel terminals and the capacitor's own leads
 * pick up from there, so the part reads as bridging the pair at the injection
 * point rather than sitting in series with it.
 */
const FEED_RUN_END = 900
const LED_TERMINAL_X = FEED_RUN_END - 16
const CAPACITOR_X = FEED_RUN_END - 2
const FEED_LABEL_X = 748
const FEED_LABEL_MAX_WIDTH = 344
const APPROX_WIRE_LABEL_CHARACTER_WIDTH = 6.6

/**
 * Terminal centres measured from the SD-100 render after it is fitted into
 * the same 123 x 220 cell as the generic 5 V supply. The seven screws run
 * left-to-right as input +, input -, FG, -V, -V, +V, +V.
 */
function supplyTerminalPoints(supply: SupplyRecommendation, psuY: number) {
  if (!supply.converter) {
    return {
      outputPositive: { x: 153, y: psuY + 64 },
      outputGround: { x: 153, y: psuY + 87 },
    }
  }
  const screwY = psuY + 207
  return {
    inputPositive: { x: 62, y: screwY },
    inputGround: { x: 73, y: screwY },
    frameGround: { x: 83, y: screwY },
    outputGround: { x: 105, y: screwY },
    outputPositive: { x: 127, y: screwY },
  }
}

function laneGeometry(feedCount: number) {
  const pitch = Math.round(Math.min(
    LANE_MAX_PITCH,
    Math.max(LANE_MIN_PITCH, (LANE_BAND_RIGHT - LANE_BAND_LEFT) / Math.max(1, feedCount)),
  ))
  const pairGap = Math.max(3, Math.min(7, Math.round(pitch * 0.45)))
  return {
    positive: (index: number) => LANE_BAND_RIGHT - (index * pitch),
    ground: (index: number) => LANE_BAND_RIGHT - (index * pitch) - pairGap,
  }
}

function leftRailGeometry(leftColumnFeedCount: number) {
  const step = leftColumnFeedCount > 1
    ? Math.min(LEFT_RAIL_STEP, (LEFT_RAIL_X - LEFT_RAIL_MIN_X) / (leftColumnFeedCount - 1))
    : LEFT_RAIL_STEP
  return (rank: number) => Math.round(LEFT_RAIL_X - (rank * step))
}

export function PowerDistributionSections({ plan, bands }: { plan: ElectricalPlanSummary; bands: PowerZoneBand[] }) {
  const injections = plan.outputs.flatMap((output) => output.injections)
  const sections = (plan.totals?.supplies ?? []).map((supply, index) => {
    const assigned = injections.filter((injection) => injection.supplyId === supply.id)
    const sectionLayout = powerDistributionSectionLayout(assigned.length)
    return {
      supply,
      assigned,
      sectionY: bands[index]?.y ?? 0,
      sectionHeight: sectionLayout.sectionHeight,
      sectionLayout,
    }
  })
  return <g>
    {sections.map(({ supply, assigned, sectionY, sectionHeight, sectionLayout }, supplyIndex) => {
      const blocks = fuseBlockAllocations(assigned.length).map((allocation, blockIndex) => ({
        ...allocation,
        blockIndex,
        x: FUSE_BLOCK_START_X,
        y: sectionLayout.blockTops[blockIndex] ?? sectionLayout.fuseBlockY,
      }))
      const lanes = laneGeometry(assigned.length)
      const leftColumnTotal = blocks.reduce((sum, block) => sum + fuseColumnSplit(block.assignedFeedCount).leftCount, 0)
      const leftRail = leftRailGeometry(leftColumnTotal)
      // Left-column feeds share one rail fan and one comb, ranked by feed order
      // so the deepest row takes the outermost rail and the lowest comb lane.
      const leftColumnRanks = new Map<string, number>()
      assigned.forEach((injection, index) => {
        const block = blocks.find((candidate) => index >= candidate.firstFeedIndex && index < candidate.firstFeedIndex + candidate.assignedFeedCount)
        if (!block) return
        if (fuseSlotForFeed(index - block.firstFeedIndex, block.assignedFeedCount).isRightColumn) return
        leftColumnRanks.set(injection.id, leftColumnRanks.size)
      })
      const terminals = supplyTerminalPoints(supply, sectionLayout.psuY)
      const psuPositive = terminals.outputPositive
      const mainFuseText = supply.trunk.mainFuse.ratingMa ? formatAmps(supply.trunk.mainFuse.ratingMa) : 'RATED'
      const trunkWireText = supply.trunk.conductor ? `AWG ${supply.trunk.conductor.awg}` : 'WIRE TBD'
      const psuGround = terminals.outputGround
      // The +5 V trunk enters each block through the clear band between its
      // negative bus and its first fuse row, then drops the gutter between the
      // two screw columns onto the positive input. Going round the outside
      // instead would have to cut across the branch rails that wrap the block.
      const positiveBus = blocks.map((block, blockIndex) => {
        const points = fuseBlockPoints(block.circuitCount, block.x, block.y)
        const point = points.positive
        // Level with the PSU terminal for the first block, so that run is dead
        // straight; later blocks step down the same riser.
        const entryY = blockIndex === 0
          ? sectionLayout.trunkEntryY
          : Math.round((points.groundCircuit(0).y + points.circuit(0).y) / 2)
        return `M${psuPositive.x} ${psuPositive.y}H${PSU_POSITIVE_TRUNK_X}V${entryY}H${point.x}V${point.y}`
      }).join('')
      const groundBus = blocks.map((block) => {
        const point = fuseBlockPoints(block.circuitCount, block.x, block.y).ground
        return supply.converter
          ? `M${psuGround.x} ${psuGround.y}V${psuGround.y + 14}H${PSU_GROUND_TRUNK_X}V${point.y}H${point.x}`
          : `M${psuGround.x} ${psuGround.y}H${PSU_GROUND_TRUNK_X}V${point.y}H${point.x}`
      }).join('')

      return <g key={supply.id} data-power-zone={supply.id} data-power-zone-y={sectionY} transform={`translate(0 ${sectionY})`}>
        <rect x="24" y="0" width="1072" height={sectionHeight} rx="12" fill="none" stroke="#a9afac" strokeWidth="2" />
        <text x="42" y="32" className={styles.physicalPowerLabel}>{supply.converter ? 'CONVERTER' : 'PSU'} ZONE {supplyIndex + 1} · {supply.converter ? supply.converter.label : 'RECOMMENDED POWER SUPPLY'}</text>
        <text data-psu-recommendation={supply.recommendedCurrentMa} x="42" y="58" className={styles.physicalPowerValue}>
          {supply.converter
            ? `${supply.converter.sourceVoltage} V IN · 5 V OUT · ${formatAmps(supply.converter.deratedCurrentMa)} AT 40 °C`
            : `5 V · ${formatAmps(supply.recommendedCurrentMa)} · ${supply.recommendedWattage} W`}
        </text>
        {/* Beside the rating rather than on the trunk, where the branch rails climb past. */}
        <text data-main-fuse-label={supply.id} x="290" y="58" className={styles.physicalMetaLabel}>{`MAIN FUSE ${mainFuseText} · TRUNK ${trunkWireText}`}</text>

        <image
          data-component-render={supply.converter?.partId ?? '5v-psu'}
          href={supply.converter ? partRenderSrc(supply.converter.partId) ?? psuRender : psuRender}
          x="42"
          y={sectionLayout.psuY}
          width="123"
          height="220"
          preserveAspectRatio="xMidYMid meet"
          className={styles.physicalBoardRender}
          filter="url(#component-shadow)"
        />
        <circle cx={psuPositive.x} cy={psuPositive.y} r="6" fill="#d84938" stroke="#f0a093" strokeWidth="2" data-terminal={`${supply.id}-positive`}>
          <title>{supply.converter ? 'Converter terminals 6-7 +V output' : 'PSU +5 V output terminal'}</title>
        </circle>
        <circle cx={psuGround.x} cy={psuGround.y} r="6" fill="#202425" stroke="#f2c766" strokeWidth="2" data-terminal={`${supply.id}-ground`}>
          <title>{supply.converter ? 'Converter terminals 4-5 -V output / common-ground bond' : 'PSU negative output terminal / common ground'}</title>
        </circle>

        {supply.converter && terminals.inputPositive && terminals.inputGround && terminals.frameGround && <g data-rail-converter-input={supply.id}>
          <HoverWire
            tip={`${supply.converter.sourceVoltage} V source positive · ${supply.converter.inputFuse.ratingMa ? formatAmps(supply.converter.inputFuse.ratingMa) : 'rated'} fuse · ${supply.converter.inputConductor ? `AWG ${supply.converter.inputConductor.awg}` : 'wire TBD'}`}
            data-wire={`${supply.id}-converter-input-positive`}
            d={`M26 ${sectionLayout.psuY + 180}H46V${terminals.inputPositive.y}H${terminals.inputPositive.x}`}
            className={styles.mainPowerWire}
          />
          <HoverWire
            tip={`${supply.converter.sourceVoltage} V source negative · converter terminal 2 V-`}
            data-wire={`${supply.id}-converter-input-negative`}
            d={`M26 ${sectionLayout.psuY + 232}H${terminals.inputGround.x}V${terminals.inputGround.y}`}
            className={styles.mainGroundWire}
          />
          <HoverWire
            tip="Protective earth / metal enclosure · converter terminal 3 FG"
            data-wire={`${supply.id}-converter-frame-ground`}
            d={`M26 ${sectionLayout.psuY + 244}H${terminals.frameGround.x}V${terminals.frameGround.y}`}
            className={styles.groundWire}
          />
          <circle cx="26" cy={sectionLayout.psuY + 180} r="5" fill="#d84938"><title>{supply.converter.sourceVoltage} V source positive</title></circle>
          <circle cx="26" cy={sectionLayout.psuY + 232} r="5" fill="#202425"><title>{supply.converter.sourceVoltage} V source negative</title></circle>
          <circle cx="26" cy={sectionLayout.psuY + 244} r="5" fill="#6f8b73"><title>Protective earth / metal enclosure</title></circle>
          <g data-converter-input-fuse={supply.converter.inputFuse.ratingMa ?? 'unresolved'}>
            <rect x="34" y={sectionLayout.psuY + 172} width="24" height="16" rx="3" fill="#f4f2ea" stroke="#1f2426" strokeWidth="2" />
            <line x1="34" y1={sectionLayout.psuY + 180} x2="58" y2={sectionLayout.psuY + 180} stroke="#1f2426" strokeWidth="1.5" />
          </g>
        </g>}

        {/* Origin of the rails the level shifter and controller reach by shared-net symbol. */}
        <NetStub x={244} y={82} kind="v5" direction="up" wireId={`${supply.id}-rail-positive`} />
        <NetStub x={264} y={82} kind="gnd" direction="up" wireId={`${supply.id}-rail-ground`} />

        <g data-fuse-value-schedule={`${supply.id}`}>
          <text x="42" y={sectionLayout.scheduleY} className={styles.physicalLegendTitle}>FUSE BLOCK VALUES</text>
          {blocks.flatMap((block) => {
            const values = Array.from({ length: block.circuitCount }, (_, slot) => {
              const localIndex = feedIndexForFuseSlot(slot, block.assignedFeedCount)
              const injection = localIndex < 0 ? undefined : assigned[block.firstFeedIndex + localIndex]
              const value = injection?.fuse.ratingMa ? formatAmps(injection.fuse.ratingMa) : 'SPARE'
              return `${slot + 1}: ${value}`
            })
            const lines = []
            for (let start = 0; start < values.length; start += 6) {
              lines.push({ block: block.blockIndex + 1, values: values.slice(start, start + 6), continuation: start > 0 })
            }
            return lines
          }).map((line, lineIndex) => (
            <text key={`${line.block}-${lineIndex}`} x="42" y={sectionLayout.scheduleY + 21 + (lineIndex * 18)} className={styles.physicalWireLabel}>
              {line.continuation ? '           ' : `BLOCK ${line.block} · `}{line.values.join('  ·  ')}
            </text>
          ))}
        </g>

        {blocks.map((block) => {
          const points = fuseBlockPoints(block.circuitCount, block.x, block.y)
          const { x: positiveX, y: positiveY } = points.positive
          const { x: groundX, y: groundY } = points.ground
          const spareCount = block.circuitCount - block.assignedFeedCount
          return <g key={`${supply.id}-block-${block.blockIndex + 1}`} data-fuse-block-circuits={block.circuitCount}>
            <text
              x={block.x + (FUSE_BLOCK_CELL_WIDTH / 2)}
              y={groundCombLaneY(block.y, 0, block.assignedFeedCount) - 14}
              textAnchor="middle"
              className={styles.physicalMetaLabel}
            >
              {block.circuitCount}-CIRCUIT FIXED FUSE BLOCK{spareCount ? ` · ${spareCount} SPARE` : ''}
            </text>
            <image
              data-component-render={`fuse-block-${block.circuitCount}-circuit`}
              href={FUSE_BLOCK_RENDERS[block.circuitCount]}
              x={block.x}
              y={block.y}
              width={FUSE_BLOCK_CELL_WIDTH}
              height={FUSE_BLOCK_CELL_HEIGHT}
              preserveAspectRatio="xMidYMid meet"
              className={styles.physicalBoardRender}
            />
            <circle data-terminal={`${supply.id}-fuse-block-${block.blockIndex + 1}-positive`} cx={positiveX} cy={positiveY} r="5" fill="#d84938" stroke="#ffd1d7" strokeWidth="2" />
            <circle data-terminal={`${supply.id}-fuse-block-${block.blockIndex + 1}-ground`} cx={groundX} cy={groundY} r="5" fill="#202425" stroke="#f2c766" strokeWidth="2" />
          </g>
        })}

        {/* Drawn after the block renders: both trunks land on terminals that sit
            inside the artwork, so they have to read as wires over the block. */}
        <HoverWire tip={`${supply.converter ? 'Converter' : 'PSU'} zone ${supplyIndex + 1} +5 V · ${mainFuseText} main fuse, then ${trunkWireText} trunk to the fuse blocks`} data-wire={`${supply.id}-positive-bus`} data-wire-role="main-psu-positive" d={positiveBus} className={styles.mainPowerWire} />
        {/* Main fuse, drawn over the trunk at the supply terminal where it is
            fitted: between the PSU artwork and the ground riser, which the
            positive run crosses on its way to the fuse blocks. */}
        <g data-main-fuse={supply.trunk.mainFuse.ratingMa ?? 'unresolved'} data-trunk-awg={supply.trunk.conductor?.awg ?? 'unresolved'}>
          <rect x={MAIN_FUSE_X - 12} y={psuPositive.y - 8} width="24" height="16" rx="3" fill="#f4f2ea" stroke="#1f2426" strokeWidth="2" />
          <line x1={MAIN_FUSE_X - 12} y1={psuPositive.y} x2={MAIN_FUSE_X + 12} y2={psuPositive.y} stroke="#1f2426" strokeWidth="1.5" />
          <title>{`${mainFuseText} main fuse at the supply positive · ${trunkWireText} trunk, ${supply.trunk.oneWayLengthMm} mm`}</title>
        </g>
        <HoverWire tip={`${supply.converter ? 'Converter' : 'PSU'} zone ${supplyIndex + 1} GND · main ground bus`} data-wire={`${supply.id}-ground-bus`} data-wire-role="main-psu-ground" d={groundBus} className={styles.mainGroundWire} />

        {assigned.map((injection, index) => {
          const rowY = sectionLayout.firstBranchY + (index * POWER_BRANCH_ROW_SPACING)
          const fuseText = injection.fuse.ratingMa ? formatAmps(injection.fuse.ratingMa) : 'RATED'
          const wireText = injection.conductor ? `AWG ${injection.conductor.awg}` : 'WIRE TBD'
          const destination = `${injection.outputTitle} · ${injection.role.toUpperCase()} @ ${injection.positionMm} mm`
          const feedLabel = `${destination} · ${formatAmps(injection.designCurrentMa)} · ${wireText} · 500 mm`
          const fitFeedLabel = feedLabel.length * APPROX_WIRE_LABEL_CHARACTER_WIDTH > FEED_LABEL_MAX_WIDTH
          const block = blocks.find((candidate) => index >= candidate.firstFeedIndex && index < candidate.firstFeedIndex + candidate.assignedFeedCount)!
          const localIndex = index - block.firstFeedIndex
          const { slot, isRightColumn, columnRank } = fuseSlotForFeed(localIndex, block.assignedFeedCount)
          const leftRank = leftColumnRanks.get(injection.id) ?? 0
          const points = fuseBlockPoints(block.circuitCount, block.x, block.y)
          const { x: fuseX, y: fuseY } = points.circuit(slot)
          const { x: groundX, y: groundY } = points.groundCircuit(slot)
          const { x: positiveX, y: positiveY } = points.positive
          const positiveLaneX = lanes.positive(index)
          const groundLaneX = lanes.ground(index)
          const groundRowY = rowY + POWER_FEED_PAIR_GAP
          // Right-column feeds leave straight out to their lane. Left-column
          // feeds drop down a rail beside the block and cross under it in the
          // feed comb, so nothing ever has to climb back over the block.
          const railX = leftRail(leftRank)
          const feedCombY = feedCombLaneY(sectionLayout.feedCombY, leftRank)
          const positivePath = isRightColumn
            ? `M${fuseX} ${fuseY}H${positiveLaneX}V${rowY}H${FEED_RUN_END}`
            : `M${fuseX} ${fuseY}H${railX}V${feedCombY}H${positiveLaneX}V${rowY}H${FEED_RUN_END}`
          const groundCombY = groundCombLaneY(block.y, localIndex, block.assignedFeedCount)
          const capacitorY = rowY - (CAPACITOR_HEIGHT * CAPACITOR_POSITIVE_LEAD_RATIO)
          // Lead tips: where the part's own leads meet the two feed wires.
          const capacitorLeadX = CAPACITOR_X + 8

          return <g key={injection.id}>
            {/* The unfused positive path is physically internal to the rendered block. */}
            <path data-wire={`${injection.id}-positive`} d={`M${positiveX} ${positiveY}V${fuseY}H${fuseX}`} className={styles.powerWire} opacity="0" />
            <g data-terminal={`${injection.id}-fuse`}>
              <circle cx={fuseX} cy={fuseY} r="6" fill="#d84938" stroke="#ffd1d7" strokeWidth="2" />
              <title>{fuseText} branch fuse · circuit {slot + 1}</title>
            </g>
            <circle
              data-terminal={`${injection.id}-ground-screw`}
              cx={groundX}
              cy={groundY}
              r="4"
              fill="#202425"
              stroke="#f2c766"
              strokeWidth="2"
            >
              <title>Ground return · negative bus screw {slot + 1}</title>
            </circle>
            <HoverWire
              tip={`Fused +5 V · ${fuseText} fuse, circuit ${slot + 1} · ${feedLabel}`}
              data-wire={`${injection.id}-fused-positive`}
              data-feed-column={isRightColumn ? 'right' : 'left'}
              data-feed-column-rank={columnRank}
              d={positivePath}
              className={styles.powerWire}
            />
            <HoverWire
              tip={`GND return · ground screw ${slot + 1} · ${destination}`}
              data-wire={`${injection.id}-ground`}
              data-ground-screw-slot={slot + 1}
              data-ground-screw-count={block.circuitCount}
              d={`M${groundX} ${groundY}V${groundCombY}H${groundLaneX}V${groundRowY}H${FEED_RUN_END}`}
              className={styles.groundWire}
            />
            {/* Both captions sit above the pair: the gap below it belongs to the
                next feed, and the capacitor owns the space beside the wires. */}
            <text
              data-power-feed-label={injection.id}
              x={FEED_LABEL_X}
              y={rowY - 36}
              textLength={fitFeedLabel ? FEED_LABEL_MAX_WIDTH : undefined}
              lengthAdjust={fitFeedLabel ? 'spacingAndGlyphs' : undefined}
              className={styles.physicalWireLabel}
            >
              {feedLabel}
            </text>
            <g data-terminal={`${injection.id}-capacitor`}>
              <image
                data-component-render="panasonic-eeufr0j102b-1000uf"
                href={capacitorRender}
                x={CAPACITOR_X}
                y={capacitorY}
                width={CAPACITOR_WIDTH}
                height={CAPACITOR_HEIGHT}
                preserveAspectRatio="xMidYMid meet"
                className={styles.physicalBoardRender}
              />
              <circle data-terminal={`${injection.id}-capacitor-positive`} cx={capacitorLeadX} cy={rowY} r="4" fill="#d84938" stroke="#ffd1d7" />
              <circle data-terminal={`${injection.id}-capacitor-negative`} cx={capacitorLeadX} cy={groundRowY} r="4" fill="#202425" stroke="#f2c766" />
              <title>Panasonic EEUFR0J102B · 1000 µF, 6.3 V · positive lead to fused +5 V, striped negative lead to common ground</title>
            </g>
            <text x={FEED_LABEL_X} y={rowY - 22} className={styles.physicalWireLabel}>1000 µF · 6.3 V · STRIPED LEAD TO GND</text>
            {/* Polarity is carried by the wire colours, the legend and the
                capacitor note, so the pair stays free of per-row pin text. */}
            <circle cx={LED_TERMINAL_X} cy={rowY} r="6" fill="#d84938" stroke="#f0a093" data-terminal={`${injection.id}-led-positive`}>
              <title>{injection.outputTitle} +5 V injection · {injection.role.toUpperCase()} @ {injection.positionMm} mm</title>
            </circle>
            <circle cx={LED_TERMINAL_X} cy={groundRowY} r="6" fill="#202425" stroke="#aeb6b7" data-terminal={`${injection.id}-led-ground`}>
              <title>{injection.outputTitle} ground return · {injection.role.toUpperCase()} @ {injection.positionMm} mm</title>
            </circle>
          </g>
        })}
      </g>
    })}
    {/* Zone negatives are one net: bond them along the shared ground riser. */}
    {sections.length > 1 && <HoverWire
      tip="Common ground · bonds every supply-zone negative"
      data-wire="multi-psu-common-ground"
      d={`M${PSU_GROUND_TRUNK_X} ${sections[0].sectionY + supplyTerminalPoints(sections[0].supply, sections[0].sectionLayout.psuY).outputGround.y}V${sections[sections.length - 1].sectionY + supplyTerminalPoints(sections[sections.length - 1].supply, sections[sections.length - 1].sectionLayout.psuY).outputGround.y}`}
      className={styles.groundWire}
    />}
  </g>
}

export function WireLabel({ x, y, children }: { x: number; y: number; children: string }) {
  return <text x={x} y={y} className={styles.physicalWireLabel}>{children}</text>
}

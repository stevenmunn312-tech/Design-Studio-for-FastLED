// Input modules and LED outputs as drawn on the physical assembly diagram.
import type { OutputElectricalPlan } from '../../build/electricalPlan'
import type { HardwareManifestItem } from '../../build/hardwareManifest'
import { partRenderSrc, sharedPadsAcrossBoards } from '../../state/partCatalogue'
import buttonModuleRender from '../../assets/components/button-module.webp'
import potentiometerModuleRender from '../../assets/components/potentiometer-module.webp'
import encoderModuleRender from '../../assets/components/encoder-module.webp'
import resistor1kRender from '../../assets/components/1kohm-blue-axial-resistor.webp'
import resistor2kRender from '../../assets/components/2kohm-blue-axial-resistor.webp'
import styles from './BuildDiagramWorkspace.module.css'
import { HoverWire } from './wireHover'
import {
  type ItemLayout,
  peripheralPadLabel,
  peripheralPowerPadIndex,
  peripheralGroundPadIndex,
  micChannelSelectPadIndex,
  transceiverEnableBridgePads,
  receiveDivider,
  peripheralSignalPadIndex,
  peripheralPowerNet,
  peripheralPadRadius,
  PERIPHERAL_RENDER_W,
  DIVIDER_RESISTOR_W,
  DIVIDER_RESISTOR_H,
  PERIPHERAL_RENDER_H,
  peripheralPadPoint,
  outputHasDataExtender,
  OUTPUT_STRIP_CARD_HEIGHT,
  OUTPUT_CARD_HEIGHT,
  DEFAULT_PAD_HOLE_RADIUS,
} from './physicalDiagramLayout'
import { LedPixels } from './ControllerGraphic'
import {
  type PhysicalDiagramConnection,
  signalPresentation,
  connectionPinLabel,
  formatAmps,
} from './signalPresentation'

/*
 * Modules that predate the catalogue and are still bundled imports rather than
 * `public/parts` assets. Everything else resolves from the part id the item
 * already carries, which is why this list is three entries rather than one per
 * kind — and why adding a part no longer means adding a picture here.
 */
const BUNDLED_RENDERS: Record<string, { href: string; id: string }> = {
  ButtonInput: { href: buttonModuleRender, id: 'button-module' },
  ButtonBank: { href: buttonModuleRender, id: 'button-module' },
  PotInput: { href: potentiometerModuleRender, id: 'potentiometer-module' },
  EncoderInput: { href: encoderModuleRender, id: 'encoder-module' },
}

/**
 * The picture for one manifest item.
 *
 * Derived from the exact module the item names, not from its kind. A kind is a
 * category — four different audio modules share `amplifier`, two OLEDs share
 * `info-display` — so a table keyed by kind can only ever draw one of them, and
 * a kind nobody added a row for draws nothing. Both happened.
 */
function peripheralRender(item: HardwareManifestItem): { href: string; id: string } | null {
  const partId = String(item.facts.partId ?? '')
  const catalogued = partId ? partRenderSrc(partId) : null
  if (catalogued) return { href: catalogued, id: partId }
  return BUNDLED_RENDERS[item.sourceNodeType ?? ''] ?? null
}

export function InputGraphic({ layout, connections, selected }: { layout: ItemLayout; connections: PhysicalDiagramConnection[]; selected: boolean }) {
  const { x, y, item } = layout
  const render = peripheralRender(item)
  const padLabel = (index: number) => peripheralPadLabel(item, index)
  const powerPadIndex = peripheralPowerPadIndex(item)
  const groundPadIndex = peripheralGroundPadIndex(item)
  const channelSelectPadIndex = micChannelSelectPadIndex(item)
  const enableBridge = transceiverEnableBridgePads(item)
  const divider = receiveDivider(layout)
  const enableConnection = enableBridge
    ? connections.find((_, index) => peripheralSignalPadIndex(item, index) === enableBridge[1])
    : undefined
  const powerNet = peripheralPowerNet(item)
  const sharedPads = sharedPadsAcrossBoards(String(item.facts.partId ?? ''))
  // The photographed modules already draw each plated ring; colour only the
  // drilled hole inside it, at this part's own measured hole size.
  const padRadius = peripheralPadRadius(item)
  return (
    <g className={selected ? styles.physicalSelected : undefined}>
      <text x={x + (PERIPHERAL_RENDER_W / 2)} y={y - 12} textAnchor="middle" className={styles.physicalComponentLabel}>{item.title}</text>
      {/* A DAC-fed power amplifier has no GPIO, so no wire says where its
          signal comes from. Its line in is the DAC's line out: say so, or the
          part reads as unconnected. */}
      {item.facts.stage === 'power' && item.facts.feed === 'dac' && (
        <text data-line-in-from={String(item.facts.fedBy)} x={x + (PERIPHERAL_RENDER_W / 2)} y={y - 30} textAnchor="middle" className={styles.physicalMetaLabel}>
          {`LINE IN ← ${String(item.facts.fedByModule ?? item.facts.fedBy)} LINE OUT`}
        </text>
      )}
      {/* Wires land on the left board; the right board shares them. The
          sheet draws one wire per board pin, so say which lines to bridge. */}
      {sharedPads.length > 0 && (
        <text data-shared-pads={sharedPads.join(',')} x={x + (PERIPHERAL_RENDER_W / 2)} y={y - 30} textAnchor="middle" className={styles.physicalMetaLabel}>
          {`RIGHT BOARD SHARES ${sharedPads.join(' · ')}`}
        </text>
      )}
      {/* The bus side goes to the DMX cable, not the controller, so no wire
          on this sheet shows it. Say where each XLR pin lands. */}
      {item.kind === 'dmx-input' && (
        <text data-dmx-cable="true" x={x + (PERIPHERAL_RENDER_W / 2)} y={y - 30} textAnchor="middle" className={styles.physicalMetaLabel}>
          XLR 1 → GND · 2 → B · 3 → A
        </text>
      )}
      {divider && ([
        ['1 kΩ', resistor1kRender, '1kohm-blue-axial-resistor', divider.seriesX],
        ['2 kΩ', resistor2kRender, '2kohm-blue-axial-resistor', divider.shuntX],
      ] as const).map(([value, href, id, left]) => (
        <g key={id} data-divider-resistor={value}>
          <text x={left + (DIVIDER_RESISTOR_W / 2)} y={divider.y - 9} textAnchor="middle" className={styles.physicalComponentLabel}>{value}</text>
          <image
            data-component-render={id}
            href={href}
            x={left}
            y={divider.y - (DIVIDER_RESISTOR_H / 2)}
            width={DIVIDER_RESISTOR_W}
            height={DIVIDER_RESISTOR_H}
            preserveAspectRatio="xMidYMid meet"
            className={styles.physicalBoardRender}
          />
        </g>
      ))}
      {render && (
        <image
          data-component-render={render.id}
          href={render.href}
          x={x}
          y={y}
          width={PERIPHERAL_RENDER_W}
          height={PERIPHERAL_RENDER_H}
          preserveAspectRatio="xMidYMid meet"
          className={styles.physicalBoardRender}
        />
      )}
      {/* The layout maps semantic power, signal, and ground roles onto the
          photographed pad order for each module variant. */}
      {powerPadIndex !== null && (
        <g data-terminal={`${item.id}-3v3`}>
          <circle cx={peripheralPadPoint(layout, powerPadIndex).x} cy={peripheralPadPoint(layout, powerPadIndex).y} r={padRadius} className={`${styles.peripheralPowerTerminal} ${styles.photoTerminalFill}`} />
          <title>{powerNet === 'v12' ? 'VCC · 12V, from a separate amplifier supply' : powerNet === 'v5' ? 'VCC · 5V' : 'VCC · 3V3'}</title>
        </g>
      )}
      {connections.map((connection, index) => {
        const padIndex = peripheralSignalPadIndex(item, index)
        const point = peripheralPadPoint(layout, padIndex)
        const presentation = signalPresentation(connection)
        return (
          <g key={connection.id} data-terminal={`${item.id}-${connection.id}`} data-signal-role={presentation.role}>
            <circle cx={point.x} cy={point.y} r={padRadius} className={`${styles.peripheralSignalTerminal} ${styles.photoTerminalFill}`} style={{ fill: presentation.color }} />
            <title>{padLabel(padIndex)} · {connectionPinLabel(connection)}</title>
          </g>
        )
      })}
      <g data-terminal={`${item.id}-gnd`}>
        <circle
          cx={peripheralPadPoint(layout, groundPadIndex).x}
          cy={peripheralPadPoint(layout, groundPadIndex).y}
          r={padRadius}
          className={`${styles.peripheralGroundTerminal} ${styles.photoTerminalFill}`}
        />
        <title>GND</title>
      </g>
      {/* A microphone's channel-select pad carries no GPIO, so it is not one of
          the item's connections and needs drawing beside them. */}
      {channelSelectPadIndex !== null && (
        <g data-terminal={`${item.id}-channel-select`} data-channel-select-pad={padLabel(channelSelectPadIndex)}>
          <circle
            cx={peripheralPadPoint(layout, channelSelectPadIndex).x}
            cy={peripheralPadPoint(layout, channelSelectPadIndex).y}
            r={padRadius}
            className={`${styles.peripheralGroundTerminal} ${styles.photoTerminalFill}`}
          />
          <title>{padLabel(channelSelectPadIndex)} · GND for left channel</title>
        </g>
      )}
      {/* RE has no GPIO of its own: a short jumper ties it to DE, so the one
          enable wire drives both. Drawn in the enable wire's colour, arching
          over the board side of the pads: the controller's wires arrive from
          below, and a bridge dipping under them read as a hook on DE. */}
      {enableBridge && (() => {
        const re = peripheralPadPoint(layout, enableBridge[0])
        const de = peripheralPadPoint(layout, enableBridge[1])
        const color = enableConnection ? signalPresentation(enableConnection).color : undefined
        const arch = Math.min(re.y, de.y) - (padRadius * 3)
        return (
          <g data-terminal={`${item.id}-enable-bridge`} data-enable-bridge={`${padLabel(enableBridge[0])}-${padLabel(enableBridge[1])}`}>
            <HoverWire
              tip={`${padLabel(enableBridge[0])} bridged to ${padLabel(enableBridge[1])} · one enable GPIO drives both`}
              data-wire={`${item.id}-enable-bridge`}
              d={`M ${re.x} ${re.y} C ${re.x} ${arch} ${de.x} ${arch} ${de.x} ${de.y}`}
              className={styles.signalWire}
              style={{ fill: 'none', ...(color ? { stroke: color } : {}) }}
            />
            <circle cx={re.x} cy={re.y} r={padRadius} className={`${styles.peripheralSignalTerminal} ${styles.photoTerminalFill}`} style={color ? { fill: color } : undefined} />
          </g>
        )
      })()}
    </g>
  )
}

/** Clears the TX DATA caption and the RX wire's turn on either side of the pair's render. */
const EXTENDER_RENDER_INSET = 40

export function OutputGraphic({ layout, connection, selected, plan, powerPlanBelow }: { layout: ItemLayout; connection?: PhysicalDiagramConnection; selected: boolean; plan?: OutputElectricalPlan; powerPlanBelow: boolean }) {
  const { x, y, width, height, item } = layout
  const presentation = connection ? signalPresentation(connection) : { role: 'data', color: '#24963e' }
  const singleRow = item.facts.form === 'strip'
  const dataOffset = singleRow ? 34 : 66
  const extender = outputHasDataExtender(item)
  const baseHeight = singleRow ? OUTPUT_STRIP_CARD_HEIGHT : OUTPUT_CARD_HEIGHT
  const extenderY = y + baseHeight + 8
  const extenderPartId = extender ? String(item.facts.dataLinkPartId) : ''
  const extenderRender = extenderPartId ? partRenderSrc(extenderPartId) : null
  const maxDistanceFeet = Math.round(Number(item.facts.dataLinkMaxDistanceMeters ?? 0) * 3.28084)
  return (
    <g data-output-card={item.id} className={selected ? styles.physicalSelected : undefined}>
      <text x={x + (width / 2)} y={y - 32} textAnchor="middle" className={styles.physicalComponentLabel}>{item.title}</text>
      <text x={x + (width / 2)} y={y - 14} textAnchor="middle" className={styles.physicalMetaLabel}>{item.subtitle}</text>
      <rect x={x} y={y} width={width} height={height} rx="8" fill="#202426" stroke={selected ? '#1fa5ad' : '#0f1213'} strokeWidth={selected ? 4 : 2} />
      <rect x={x + 18} y={y + (singleRow ? 10 : 12)} width={width - 30} height={singleRow ? 48 : 140} fill="#15191a" stroke="#515759" />
      {singleRow
        ? <LedPixels x={x + ((width - 128) / 2)} y={y + 18} width={128} height={32} singleRow />
        : <LedPixels x={x + ((width - 128) / 2)} y={y + 18} width={128} height={128} />}
      {[['DIN', dataOffset]].map(([label, offset]) => (
        <g key={label} data-terminal={`${item.id}-${String(label).toLowerCase()}`} data-signal-role={presentation.role}>
          <circle cx={x} cy={y + Number(offset)} r="6" fill="#d9a14a" />
          <circle cx={x} cy={y + Number(offset)} r={DEFAULT_PAD_HOLE_RADIUS} fill={presentation.color} />
          <text x={x + 14} y={y + Number(offset) + 4} className={styles.physicalPinLabel}>{label}</text>
        </g>
      ))}
      {plan?.operatingCurrentCapMa != null && (
        <text data-operating-current-cap={plan.operatingCurrentCapMa} x={x + (width / 2)} y={y + (singleRow ? 74 : 158)} textAnchor="middle" className={styles.physicalCurrentCapLabel}>CURRENT LIMIT {formatAmps(plan.operatingCurrentCapMa)}</text>
      )}
      {/* Only points down the sheet when the PSU zones are actually on it. */}
      {plan && <text x={x + (width / 2)} y={y + (singleRow ? 88 : plan.operatingCurrentCapMa != null ? 170 : 167)} textAnchor="middle" className={styles.physicalBoardSubSilk}>{plan.recommendedFeedCount} FUSED FEEDS · {powerPlanBelow ? 'PSU PLAN BELOW' : 'SEE POWER SECTION'}</text>}
      {extender && (
        <g data-pixel-data-extender={extenderPartId}>
          <rect x={x + 8} y={extenderY} width={width - 16} height={110} rx="6" fill="#171b1c" stroke="#515759" />
          <text x={x + (width * 0.36)} y={extenderY + 15} textAnchor="middle" className={styles.physicalPinLabel}>TX</text>
          <text x={x + (width * 0.64)} y={extenderY + 15} textAnchor="middle" className={styles.physicalPinLabel}>RX</text>
          {extenderRender && <image
            data-component-render={extenderPartId}
            href={extenderRender}
            x={x + EXTENDER_RENDER_INSET}
            y={extenderY + 20}
            width={width - (2 * EXTENDER_RENDER_INSET)}
            height={58}
            preserveAspectRatio="xMidYMid meet"
            className={styles.physicalBoardRender}
          />}
          <g data-terminal={`${item.id}-tx-data`} data-signal-role={presentation.role}>
            <circle cx={x} cy={extenderY + 51} r="6" fill="#d9a14a" />
            <circle cx={x} cy={extenderY + 51} r={DEFAULT_PAD_HOLE_RADIUS} fill={presentation.color} />
            <text x={x + 9} y={extenderY + 44} className={styles.physicalPinLabel}>TX DATA</text>
          </g>
          <HoverWire
            tip="Conditioned pixel data · into the NLED transmitter"
            data-wire={`${item.id}-extender-tx-data`}
            data-signal-role={presentation.role}
            d={`M${x} ${extenderY + 51}H${x + EXTENDER_RENDER_INSET}`}
            className={styles.signalWire}
            style={{ stroke: presentation.color }}
          />
          <HoverWire
            tip="NLED receiver data out · to LED DIN"
            data-wire={`${item.id}-extender-rx-data`}
            data-signal-role={presentation.role}
            d={`M${x + width - EXTENDER_RENDER_INSET} ${extenderY + 51}H${x + width - 8}V${y + 6}H${x}V${y + dataOffset}`}
            className={styles.signalWire}
            style={{ stroke: presentation.color }}
          />
          <text x={x + (width / 2)} y={extenderY + 91} textAnchor="middle" className={styles.physicalPinLabel}>
            A↔A · B↔B · GND↔GND · TWISTED
          </text>
          <text x={x + (width / 2)} y={extenderY + 105} textAnchor="middle" className={styles.physicalBoardSubSilk}>
            {`POWER BOTH ENDS · ${maxDistanceFeet || 1000} FT MAX`}
          </text>
        </g>
      )}
    </g>
  )
}

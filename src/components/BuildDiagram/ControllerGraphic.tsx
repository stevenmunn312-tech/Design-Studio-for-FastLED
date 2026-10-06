// The controller board as drawn on the physical assembly diagram.
import type { ControllerSupplyPlan } from '../../build/electricalPlan'
import type { PhysicalBoardProfile } from '../../build/boardProfiles'
import { partById, partRenderSrc } from '../../state/partCatalogue'
import { CustomBoardGraphicFragment } from '../Hardware/CustomBoardGraphic'
import styles from './BuildDiagramWorkspace.module.css'
import { NetStub } from './netStubs'
import {
  CONVERTER_PAD_MM,
  CONVERTER_SHEET_WIDTH,
  controllerRender,
  renderTerminalPoint,
  controllerPowerPoint,
  controllerTerminalRadius,
  controllerTerminalFillRadius,
  controllerConnectionPoint,
  controllerConnectionY,
  customControllerLayout,
  type ControllerTerminalPoint,
} from './controllerGeometry'
import {
  formatAmps,
  type PhysicalDiagramConnection,
  signalPresentation,
  shortBoardLabel,
  connectionPinLabel,
} from './signalPresentation'

/**
 * The buck converter that powers the controller, drawn under the board in the
 * USB block's place. It joins the board by symbol, not by a wire across it:
 * OUT+ and the board's 5 V input pin carry the same CTRL 5V label, the way
 * the shared rails already meet elsewhere on the sheet.
 */
export function ControllerConverterGraphic({ supply, boardProfile, x, y }: {
  supply: ControllerSupplyPlan
  boardProfile: PhysicalBoardProfile
  x: number
  y: number
}) {
  const entry = partById(supply.partId)
  const render = entry?.render
  const padsMm = CONVERTER_PAD_MM[supply.partId]
  if (!entry || !render?.pxPerMm || !padsMm) return null
  const pxPerMm = render.pxPerMm
  const scale = CONVERTER_SHEET_WIDTH / render.widthPx
  const height = render.heightPx * scale
  const marginPx = (render.widthPx - (entry.dimensionsMm.width * pxPerMm)) / 2
  const pad = (name: keyof typeof padsMm) => ({
    x: x + ((marginPx + (padsMm[name][0] * pxPerMm)) * scale),
    y: y + ((marginPx + (padsMm[name][1] * pxPerMm)) * scale),
  })
  const controllerPin = controllerRender(boardProfile) && supply.powerInAnchorId
    ? renderTerminalPoint(controllerRender(boardProfile)!, supply.powerInAnchorId)
    : undefined
  const fuse = supply.inputFuse.ratingMa ? formatAmps(supply.inputFuse.ratingMa) : 'RATED'
  return (
    <g data-controller-converter={supply.partId} data-source-voltage={supply.sourceVoltage}>
      <image
        data-component-render={supply.partId}
        href={partRenderSrc(supply.partId) ?? undefined}
        x={x}
        y={y}
        width={CONVERTER_SHEET_WIDTH}
        height={height}
        preserveAspectRatio="xMidYMid meet"
        className={styles.physicalBoardRender}
        filter="url(#component-shadow)"
      />
      <text x={x + (CONVERTER_SHEET_WIDTH / 2)} y={y + height + 44} textAnchor="middle" className={styles.physicalComponentLabel}>
        {`${supply.sourceVoltage} V → ${supply.outputVoltage} V BUCK`}
      </text>
      {supply.adjustable && (
        <text data-converter-set-output x={x + (CONVERTER_SHEET_WIDTH / 2)} y={y + height + 59} textAnchor="middle" className={styles.physicalMetaLabel}>
          {`SET ${supply.outputVoltage.toFixed(1)} V BEFORE CONNECTING`}
        </text>
      )}
      <text x={x + (CONVERTER_SHEET_WIDTH / 2)} y={y + height + 73} textAnchor="middle" className={styles.physicalMetaLabel}>
        {`${fuse} INPUT FUSE AT THE SOURCE`}
      </text>
      <NetStub x={pad('IN+').x} y={pad('IN+').y} kind="v12" direction="up" lead={14} wireId="controller-converter-input-positive" label={`+${supply.sourceVoltage}V SRC`} />
      <NetStub x={pad('IN-').x} y={pad('IN-').y} kind="gnd" direction="down" lead={12} wireId="controller-converter-input-ground" />
      <NetStub x={pad('OUT+').x} y={pad('OUT+').y} kind="v5" direction="up" lead={14} wireId="controller-converter-output" label="CTRL 5V" />
      <NetStub x={pad('OUT-').x} y={pad('OUT-').y} kind="gnd" direction="down" lead={12} wireId="controller-converter-output-ground" />
      {controllerPin && (
        <g data-terminal="controller-power-in">
          <circle cx={controllerPin.x} cy={controllerPin.y} r="5" fill="#d84938" stroke="#f0a093" strokeWidth="2" />
          <title>{`${supply.powerInPinLabel ?? '5 V input'} · fed by the ${supply.label}`}</title>
          <NetStub x={controllerPin.x} y={controllerPin.y} kind="v5" direction={controllerPin.side === 'left' ? 'left' : 'right'} lead={18} wireId="controller-power-in" label="CTRL 5V" />
        </g>
      )}
    </g>
  )
}

export function LedPixels({ x, y, width, height, singleRow = false }: { x: number; y: number; width: number; height: number; singleRow?: boolean }) {
  const columns = 4
  const rows = singleRow ? 1 : 4
  const gapX = width / columns
  const gapY = height / rows
  return (
    <g data-led-preview={singleRow ? 'single-row' : '4x4'}>
      {Array.from({ length: columns * rows }, (_, index) => {
        const column = index % columns
        const row = Math.floor(index / columns)
        return (
          <g key={index} transform={`translate(${x + (column * gapX) + 3} ${y + (row * gapY) + 3})`}>
            <rect width={Math.max(8, gapX - 7)} height={Math.max(8, gapY - 7)} rx="2" fill="#e9e9e3" stroke="#686d70" strokeWidth="1" />
            <circle cx={Math.max(8, gapX - 7) / 2} cy={Math.max(8, gapY - 7) / 2} r="2.5" fill={index % 4 === 0 ? '#70cf63' : index % 4 === 1 ? '#49b9d1' : '#f0b94a'} />
          </g>
        )
      })}
    </g>
  )
}

/**
 * Where a custom board's controller power stands when it is not USB: an
 * external supply is the user's own declaration, and an unchosen method is
 * shown as unresolved. Neither is drawn as a connector the board may not have.
 */
export function CustomControllerPowerNote({ boardProfile, x, y }: { boardProfile: PhysicalBoardProfile; x: number; y: number }) {
  const power = boardProfile.custom?.definition.controllerPower
  if (!power) return null
  const input = boardProfile.pins?.find((pin) => pin.role === 'power-in')
  const [title, detail] = power === 'external'
    ? ['External supply', input ? `into ${input.label} · user-declared` : 'no supply input pad defined']
    : ['Controller power', 'unresolved · choose in custom board setup']
  return (
    <g data-controller-power={power} transform={`translate(${x} ${y})`}>
      <rect width="184" height="62" rx="12" fill="#e9ecea" stroke={power === 'external' && input ? '#879092' : '#c9822b'} strokeWidth="2" strokeDasharray={power === 'external' && input ? undefined : '6 4'} />
      <text x="18" y="27" className={styles.physicalComponentLabel}>{title}</text>
      <text x="18" y="46" className={styles.physicalMetaLabel}>{detail}</text>
    </g>
  )
}

function PowerTerminal({ point, kind, radius, title }: { point: ControllerTerminalPoint | undefined; kind: '3v3' | 'gnd' | 'usb'; radius: number; title: string }) {
  if (!point) return null
  const className = kind === '3v3' ? styles.controllerPowerTerminal
    : kind === 'gnd' ? styles.controllerGroundTerminal
      : styles.controllerUsbTerminal
  return (
    <g data-terminal={`controller-${kind}`}>
      <circle cx={point.x} cy={point.y} r={radius} className={className} />
      <title>{title}</title>
    </g>
  )
}

function SignalTerminals({ boardProfile, connections, mappedRadius, unmappedRadius }: {
  boardProfile: PhysicalBoardProfile
  connections: PhysicalDiagramConnection[]
  mappedRadius: number
  unmappedRadius: number
}) {
  return connections.map((connection, index) => {
    const point = controllerConnectionPoint(connection, index, connections.length, boardProfile)
    const presentation = signalPresentation(connection)
    return (
      <g key={connection.id} data-terminal={`controller-${connection.id}`} data-board-anchor={connection.boardAnchorId} data-signal-role={presentation.role}>
        <circle
          cx={point.x}
          cy={point.y}
          r={point.mapped ? mappedRadius : unmappedRadius}
          className={point.mapped
            ? `${styles.controllerSignalTerminal} ${styles.photoTerminalFill}`
            : styles.controllerUnmappedTerminal}
          style={point.mapped ? { fill: presentation.color } : undefined}
        />
        {!point.mapped && (
          <text x={point.x + 11} y={point.y + 4} className={styles.controllerUnmappedLabel}>
            {connection.pinLabel} · NOT ON BOARD
          </text>
        )}
        <title>{connection.pinLabel} · {connection.useLabel}{point.mapped ? '' : ' · not exposed by this board'}</title>
      </g>
    )
  })
}

export function ControllerGraphic({ boardProfile, connections, selected }: { boardProfile: PhysicalBoardProfile; connections: PhysicalDiagramConnection[]; selected: boolean }) {
  const custom = customControllerLayout(boardProfile)
  if (custom && boardProfile.custom) {
    // The schematic's own pads are r=5; terminals fill them exactly.
    const padFillRadius = 5 * custom.scale
    const padRadius = Math.min(6, custom.geometry.rowPitch * custom.scale * 0.42)
    return (
      <g className={selected ? styles.physicalSelected : undefined} data-controller-render={boardProfile.id} data-board-provenance="user-defined-schematic">
        <g transform={`translate(${custom.x} ${custom.y}) scale(${custom.scale})`}>
          <CustomBoardGraphicFragment definition={boardProfile.custom.definition} defaultI2c={boardProfile.custom.defaultI2c} />
        </g>
        {/* One caption line, like a render's: the left-rail detour runs just
            below it, and the schematic already prints its own provenance. */}
        <text x={custom.x + (custom.width / 2)} y={custom.y + custom.height + 24} textAnchor="middle" className={styles.physicalComponentLabel}>{boardProfile.label}</text>
        <PowerTerminal point={controllerPowerPoint('3v3', boardProfile)} kind="3v3" radius={padFillRadius} title="3V3 output · user-declared" />
        <SignalTerminals boardProfile={boardProfile} connections={connections} mappedRadius={padFillRadius} unmappedRadius={padRadius} />
        <PowerTerminal point={controllerPowerPoint('ground', boardProfile)} kind="gnd" radius={padFillRadius} title="GND" />
        <PowerTerminal point={controllerPowerPoint('usb', boardProfile)} kind="usb" radius={padRadius} title="USB power · user-declared" />
      </g>
    )
  }
  const render = controllerRender(boardProfile)
  if (render) {
    // A measured render always carries its 3V3, GND and USB points.
    const power3v3 = controllerPowerPoint('3v3', boardProfile)!
    const ground = controllerPowerPoint('ground', boardProfile)!
    const usb = controllerPowerPoint('usb', boardProfile)!
    const padRadius = controllerTerminalRadius(render)
    const padFillRadius = controllerTerminalFillRadius(render)
    return (
      <g className={selected ? styles.physicalSelected : undefined} data-controller-render={boardProfile.id}>
        <image
          href={render.href}
          x={render.x}
          y={render.y}
          width={render.width}
          height={render.height}
          preserveAspectRatio="xMidYMid meet"
          className={styles.physicalBoardRender}
        />
        <text x={render.x + (render.width / 2)} y={render.y + render.height + 24} textAnchor="middle" className={styles.physicalComponentLabel}>{render.shortLabel}</text>
        <g data-terminal="controller-3v3">
          <circle cx={power3v3.x} cy={power3v3.y} r={padFillRadius} className={styles.controllerPowerTerminal} />
          <title>3V3</title>
        </g>
        <SignalTerminals boardProfile={boardProfile} connections={connections} mappedRadius={padFillRadius} unmappedRadius={padRadius} />
        <g data-terminal="controller-gnd">
          <circle cx={ground.x} cy={ground.y} r={padFillRadius} className={styles.controllerGroundTerminal} />
          <title>GND</title>
        </g>
        <g data-terminal="controller-usb">
          <circle cx={usb.x} cy={usb.y} r={padRadius} className={styles.controllerUsbTerminal} />
          <title>USB power</title>
        </g>
      </g>
    )
  }

  const boardLabel = boardProfile.label
  return (
    <g className={selected ? styles.physicalSelected : undefined}>
      <rect x="54" y="188" width="226" height="324" rx="16" fill="#202528" stroke={selected ? '#1fa5ad' : '#121517'} strokeWidth={selected ? 4 : 2} />
      <rect x="83" y="211" width="166" height="105" rx="7" fill="#d6d8d2" stroke="#6c7274" strokeWidth="2" />
      <path d="M99 228h134v67H99z" fill="#ecece7" stroke="#adb0aa" />
      <path d="M104 235h124v11H104zm0 18h124v8H104zm0 15h124v8H104z" fill="#c7cac4" opacity=".8" />
      <text x="166" y="281" textAnchor="middle" className={styles.physicalBoardSilk}>ESPRESSIF</text>
      <text x="166" y="296" textAnchor="middle" className={styles.physicalBoardSubSilk}>{boardProfile.moduleSilk ?? boardProfile.model}</text>
      <rect x="88" y="337" width="156" height="104" rx="6" fill="#171b1d" stroke="#484e51" />
      <rect x="105" y="352" width="48" height="45" rx="3" fill="#2f3437" />
      <rect x="164" y="352" width="52" height="22" rx="3" fill="#34393c" />
      <circle cx="170" cy="410" r="6" fill="#828789" />
      <circle cx="202" cy="410" r="6" fill="#828789" />
      <rect x="129" y="459" width="76" height="42" rx="8" fill="#c9d0d1" stroke="#72797b" strokeWidth="2" />
      <rect x="141" y="470" width="52" height="16" rx="4" fill="#727a7d" />
      <text x="166" y="538" textAnchor="middle" className={styles.physicalComponentLabel}>{shortBoardLabel(boardLabel)}</text>

      <g data-terminal="controller-3v3">
        <circle cx="280" cy="220" r="5" fill="#d9a638" stroke="#f5d16e" />
        <text x="268" y="224" textAnchor="end" className={styles.physicalPinLabel}>3V3</text>
      </g>
      {connections.map((connection, index) => (
        <g key={connection.id} data-terminal={`controller-${connection.id}`}>
          <circle
            cx="280"
            cy={controllerConnectionY(index, connections.length)}
            r="5"
            fill="#d9a638"
            stroke="#f5d16e"
          />
          <text x="268" y={controllerConnectionY(index, connections.length) + 4} textAnchor="end" className={styles.physicalPinLabel}>{connectionPinLabel(connection)}</text>
        </g>
      ))}
      <g data-terminal="controller-gnd">
        <circle cx="280" cy="476" r="5" fill="#1c2022" stroke="#f5d16e" />
        <text x="268" y="480" textAnchor="end" className={styles.physicalPinLabel}>GND</text>
      </g>
      <g data-terminal="controller-usb">
        <circle cx="166" cy="512" r="5" fill="#55bdc7" stroke="#d9f5f7" />
        <text x="166" y="503" textAnchor="middle" className={styles.physicalBoardSubSilk}>USB POWER</text>
      </g>
    </g>
  )
}

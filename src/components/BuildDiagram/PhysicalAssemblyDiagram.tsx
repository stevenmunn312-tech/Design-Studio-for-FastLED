import type { HardwareManifestItem } from '../../build/hardwareManifest'
import styles from './BuildDiagramWorkspace.module.css'

export interface PhysicalDiagramConnection {
  id: string
  itemId: string
  pinLabel: string
  useLabel: string
}

interface PhysicalAssemblyDiagramProps {
  boardLabel: string
  items: HardwareManifestItem[]
  connections: PhysicalDiagramConnection[]
  selectedItemId: string
  onSelectItem: (itemId: string) => void
  exportScope?: 'current-view' | 'complete-build'
}

type ItemLayout = {
  item: HardwareManifestItem
  x: number
  y: number
  width: number
  height: number
}

const CANVAS_WIDTH = 1120
const CANVAS_HEIGHT = 760

function shortBoardLabel(label: string) {
  if (label.includes('XIAO')) return 'XIAO ESP32S3'
  if (label.includes('DevKitC')) return 'ESP32-S3 DevKitC-1'
  return 'ESP32-S3 N16R8'
}

function itemLayouts(items: HardwareManifestItem[]): ItemLayout[] {
  const outputs = items.filter((item) => item.kind === 'matrix-output')
  const peripherals = items.filter((item) => item.kind !== 'matrix-output')
  const layouts: ItemLayout[] = outputs.map((item, index) => ({
    item,
    x: 770,
    y: 92 + (index * 238),
    width: 270,
    height: 178,
  }))
  peripherals.forEach((item, index) => {
    layouts.push({
      item,
      x: 118 + (index * 220),
      y: 575,
      width: 178,
      height: 118,
    })
  })
  return layouts
}

function LedPixels({ x, y, width, height, count = 24 }: { x: number; y: number; width: number; height: number; count?: number }) {
  const columns = Math.max(4, Math.ceil(Math.sqrt(count * (width / height))))
  const rows = Math.max(2, Math.ceil(count / columns))
  const gapX = width / columns
  const gapY = height / rows
  return (
    <g>
      {Array.from({ length: Math.min(count, columns * rows) }, (_, index) => {
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

function ControllerGraphic({ boardLabel, selected }: { boardLabel: string; selected: boolean }) {
  return (
    <g className={selected ? styles.physicalSelected : undefined}>
      <rect x="92" y="154" width="226" height="390" rx="16" fill="#202528" stroke={selected ? '#1fa5ad' : '#121517'} strokeWidth={selected ? 4 : 2} />
      <rect x="122" y="177" width="166" height="134" rx="7" fill="#d6d8d2" stroke="#6c7274" strokeWidth="2" />
      <path d="M138 195h132v92H138z" fill="#ecece7" stroke="#adb0aa" />
      <path d="M143 202h122v12H143zm0 20h122v9H143zm0 17h122v9H143z" fill="#c7cac4" opacity=".8" />
      <text x="204" y="268" textAnchor="middle" className={styles.physicalBoardSilk}>ESPRESSIF</text>
      <text x="204" y="284" textAnchor="middle" className={styles.physicalBoardSubSilk}>ESP32-S3-WROOM</text>
      <rect x="137" y="333" width="134" height="116" rx="5" fill="#171b1d" stroke="#484e51" />
      <rect x="156" y="350" width="42" height="52" rx="3" fill="#2f3437" />
      <rect x="207" y="350" width="44" height="24" rx="3" fill="#34393c" />
      <circle cx="214" cy="410" r="6" fill="#828789" />
      <circle cx="244" cy="410" r="6" fill="#828789" />
      <rect x="166" y="474" width="76" height="51" rx="8" fill="#c9d0d1" stroke="#72797b" strokeWidth="2" />
      <rect x="178" y="484" width="52" height="20" rx="4" fill="#727a7d" />
      {Array.from({ length: 16 }, (_, index) => (
        <g key={index}>
          <circle cx="106" cy={179 + (index * 22)} r="5" fill="#d9a638" stroke="#f5d16e" />
          <circle cx="304" cy={179 + (index * 22)} r="5" fill="#d9a638" stroke="#f5d16e" />
          <text x="117" y={182 + (index * 22)} className={styles.physicalPinLabel}>{index < 2 ? ['3V3', 'EN'][index] : `IO${index + 2}`}</text>
          <text x="291" y={182 + (index * 22)} textAnchor="end" className={styles.physicalPinLabel}>{index < 2 ? ['5V', 'GND'][index] : `IO${48 - index}`}</text>
        </g>
      ))}
      <text x="205" y="566" textAnchor="middle" className={styles.physicalComponentLabel}>{shortBoardLabel(boardLabel)}</text>
    </g>
  )
}

function MicrophoneGraphic({ layout, selected }: { layout: ItemLayout; selected: boolean }) {
  const { x, y, item } = layout
  return (
    <g className={selected ? styles.physicalSelected : undefined}>
      <rect x={x} y={y} width="164" height="108" rx="10" fill="#12659a" stroke={selected ? '#1fa5ad' : '#0b3f62'} strokeWidth={selected ? 4 : 2} />
      <circle cx={x + 42} cy={y + 42} r="25" fill="#1b2022" stroke="#d9d9ce" strokeWidth="3" />
      <circle cx={x + 42} cy={y + 42} r="14" fill="#282e30" />
      <text x={x + 78} y={y + 25} className={styles.physicalBoardSilk}>INMP441</text>
      {['VDD', 'BCLK', 'WS', 'DOUT', 'GND'].map((label, index) => (
        <g key={label}>
          <circle cx={x + 154} cy={y + 36 + (index * 14)} r="4" fill="#e8ad46" />
          <text x={x + 142} y={y + 39 + (index * 14)} textAnchor="end" className={styles.physicalPinLabel}>{label}</text>
        </g>
      ))}
      <text x={x + 82} y={y + 130} textAnchor="middle" className={styles.physicalComponentLabel}>{item.title}</text>
    </g>
  )
}

function InputGraphic({ layout, selected }: { layout: ItemLayout; selected: boolean }) {
  const { x, y, item } = layout
  return (
    <g className={selected ? styles.physicalSelected : undefined}>
      <rect x={x} y={y} width="164" height="104" rx="12" fill="#245f68" stroke={selected ? '#1fa5ad' : '#123b42'} strokeWidth={selected ? 4 : 2} />
      <circle cx={x + 52} cy={y + 48} r="28" fill="#171b1d" stroke="#d8ab4f" strokeWidth="4" />
      <circle cx={x + 52} cy={y + 48} r="9" fill="#5b6265" />
      <path d={`M${x + 52} ${y + 48}l13 -17`} stroke="#d7dad5" strokeWidth="3" strokeLinecap="round" />
      <text x={x + 92} y={y + 39} className={styles.physicalBoardSilk}>{item.kind === 'button-input' ? 'BUTTON' : item.kind === 'pot-input' ? 'POT' : 'ENCODER'}</text>
      <text x={x + 92} y={y + 58} className={styles.physicalPinLabel}>{item.pins.map((pin) => `GPIO ${pin.pin}`).join(' / ')}</text>
      <text x={x + 82} y={y + 126} textAnchor="middle" className={styles.physicalComponentLabel}>{item.title}</text>
    </g>
  )
}

function OutputGraphic({ layout, selected }: { layout: ItemLayout; selected: boolean }) {
  const { x, y, width, item } = layout
  const itemHeight = Number(item.facts.height ?? 0)
  const stripLike = itemHeight <= 1 || String(item.facts.layout ?? '') === 'strip'
  return (
    <g className={selected ? styles.physicalSelected : undefined}>
      <text x={x + (width / 2)} y={y - 30} textAnchor="middle" className={styles.physicalComponentLabel}>{item.title}</text>
      <text x={x + (width / 2)} y={y - 12} textAnchor="middle" className={styles.physicalMetaLabel}>{item.subtitle}</text>
      <rect x={x} y={y} width={width} height={stripLike ? 72 : 164} rx="8" fill="#202426" stroke={selected ? '#1fa5ad' : '#0f1213'} strokeWidth={selected ? 4 : 2} />
      <rect x={x + 18} y={y + 12} width={width - 30} height={stripLike ? 48 : 140} fill="#15191a" stroke="#515759" />
      <LedPixels x={x + 23} y={y + 17} width={width - 40} height={stripLike ? 38 : 130} count={stripLike ? 12 : 48} />
      {['+5V', 'DIN', 'GND'].map((label, index) => (
        <g key={label}>
          <circle cx={x + 4} cy={y + 24 + (index * 20)} r="5" fill={index === 0 ? '#d84836' : index === 1 ? '#3dab5b' : '#202425'} stroke="#d9a14a" strokeWidth="2" />
          <text x={x + 14} y={y + 28 + (index * 20)} className={styles.physicalPinLabel}>{label}</text>
        </g>
      ))}
    </g>
  )
}

export default function PhysicalAssemblyDiagram({ boardLabel, items, connections, selectedItemId, onSelectItem, exportScope = 'current-view' }: PhysicalAssemblyDiagramProps) {
  const layouts = itemLayouts(items)
  const outputLayouts = layouts.filter((layout) => layout.item.kind === 'matrix-output')
  const peripheralLayouts = layouts.filter((layout) => layout.item.kind !== 'matrix-output')
  const hasOutputs = outputLayouts.length > 0
  const outputConnectionCount = connections.filter((connection) => outputLayouts.some((layout) => layout.item.id === connection.itemId)).length

  return (
    <svg
      className={styles.physicalDiagram}
      viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
      role="img"
      data-build-export={exportScope}
      aria-labelledby="physical-diagram-title physical-diagram-desc"
    >
      <title id="physical-diagram-title">Physical LED controller assembly</title>
      <desc id="physical-diagram-desc">Controller, signal conditioning, LED outputs, peripherals, protection, and power supply wired as a physical build reference.</desc>
      <defs>
        <filter id="component-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#111" floodOpacity=".22" />
        </filter>
        <linearGradient id="supply-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#405248" />
          <stop offset="1" stopColor="#171d1a" />
        </linearGradient>
      </defs>

      <rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#f4f4f1" />
      <g opacity=".23">
        {Array.from({ length: 22 }, (_, index) => <line key={`v${index}`} x1={index * 52} y1="0" x2={index * 52} y2={CANVAS_HEIGHT} stroke="#afb4b4" strokeWidth=".7" />)}
        {Array.from({ length: 15 }, (_, index) => <line key={`h${index}`} x1="0" y1={index * 52} x2={CANVAS_WIDTH} y2={index * 52} stroke="#afb4b4" strokeWidth=".7" />)}
      </g>

      <g className={styles.physicalWires}>
        {hasOutputs && <path d="M304 325H386V350H430" className={styles.signalWire} />}
        {outputLayouts.map((layout, index) => (
          <path key={`signal-${layout.item.id}`} d={`M540 ${318 + (index * 34)}H650V${layout.y + 44}H${layout.x}`} className={selectedItemId === 'controller' || selectedItemId === layout.item.id ? styles.signalWire : styles.dimWire} />
        ))}
        {peripheralLayouts.map((layout, index) => (
          <path key={`peripheral-${layout.item.id}`} d={`M${layout.x + 164} ${layout.y + 50 + (index * 8)}H360V${432 + (index * 20)}H304`} className={selectedItemId === 'controller' || selectedItemId === layout.item.id ? styles.auxWire : styles.dimWire} />
        ))}
        {hasOutputs && <path d="M646 116H708V570H1052" className={styles.powerWire} />}
        {hasOutputs && <path d="M250 116H430" className={styles.powerWire} />}
        {hasOutputs && <path d="M708 116V690H910" className={styles.powerWire} />}
        {outputLayouts.map((layout) => <path key={`power-${layout.item.id}`} d={`M708 ${layout.y + 24}H${layout.x}`} className={styles.powerWire} />)}
        {hasOutputs && <path d="M322 528H665V714H1052" className={styles.groundWire} />}
        {outputLayouts.map((layout) => <path key={`ground-${layout.item.id}`} d={`M665 ${layout.y + 64}H${layout.x}`} className={styles.groundWire} />)}
        {peripheralLayouts.map((layout) => <path key={`pground-${layout.item.id}`} d={`M${layout.x + 164} ${layout.y + 92}H665`} className={styles.groundWire} />)}
      </g>

      <g filter="url(#component-shadow)">
        {hasOutputs && <g transform="translate(430 80)">
          <text x="62" y="-12" textAnchor="middle" className={styles.physicalComponentLabel}>5A branch fuse</text>
          <rect width="124" height="70" rx="11" fill="#262b2d" stroke="#111" strokeWidth="2" />
          <rect x="41" y="7" width="42" height="56" rx="6" fill="#3d4244" stroke="#111" />
          <rect x="0" y="27" width="42" height="16" fill="#aeb4b4" />
          <rect x="83" y="27" width="41" height="16" fill="#aeb4b4" />
          <text x="62" y="42" textAnchor="middle" className={styles.physicalFuseText}>5A</text>
        </g>}

        {hasOutputs && <g transform="translate(430 246)">
          <text x="55" y="-14" textAnchor="middle" className={styles.physicalComponentLabel}>74AHCT125</text>
          <rect width="110" height="174" rx="9" fill="#292d2f" stroke="#111" strokeWidth="2" />
          <circle cx="55" cy="16" r="5" fill="#d8d9d4" />
          {Array.from({ length: 5 }, (_, index) => (
            <g key={index}>
              <circle cx="7" cy={42 + (index * 26)} r="6" fill="#d2d5d1" stroke="#64696a" />
              <circle cx="103" cy={42 + (index * 26)} r="6" fill="#d2d5d1" stroke="#64696a" />
            </g>
          ))}
          <text x="55" y="50" textAnchor="middle" className={styles.physicalChipLabel}>VCC     OE</text>
          <text x="55" y="81" textAnchor="middle" className={styles.physicalChipLabel}>A1      Y1</text>
          <text x="55" y="112" textAnchor="middle" className={styles.physicalChipLabel}>A2      Y2</text>
          <text x="55" y="143" textAnchor="middle" className={styles.physicalChipLabel}>GND</text>
        </g>}

        {hasOutputs && <g transform="translate(560 610)">
          <text x="42" y="-14" textAnchor="middle" className={styles.physicalComponentLabel}>1000uF / 16V</text>
          <ellipse cx="42" cy="12" rx="22" ry="10" fill="#505659" stroke="#1b1e20" />
          <path d="M20 12v72c0 14 44 14 44 0V12" fill="#292e30" stroke="#111" strokeWidth="2" />
          <ellipse cx="42" cy="84" rx="22" ry="9" fill="#171a1b" />
          <line x1="31" y1="92" x2="31" y2="120" stroke="#686c6d" strokeWidth="3" />
          <line x1="53" y1="92" x2="53" y2="120" stroke="#686c6d" strokeWidth="3" />
          <text x="9" y="49" className={styles.physicalPolarity}>+</text>
        </g>}

        {hasOutputs && <g transform="translate(910 646)">
          <rect width="114" height="74" rx="8" fill="url(#supply-body)" stroke="#151917" strokeWidth="2" />
          <rect x="0" y="9" width="35" height="56" rx="5" fill="#2f6b49" stroke="#163822" />
          <circle cx="17" cy="25" r="8" fill="#c8cdca" stroke="#454b49" />
          <circle cx="17" cy="49" r="8" fill="#c8cdca" stroke="#454b49" />
          <path d="M114 18h44c25 0 25 38 0 38h-44z" fill="#1b1f1d" stroke="#0c0e0d" strokeWidth="2" />
          <text x="77" y="31" textAnchor="middle" className={styles.physicalSupplyText}>+5V</text>
          <text x="77" y="51" textAnchor="middle" className={styles.physicalSupplyText}>25A</text>
          <text x="57" y="96" textAnchor="middle" className={styles.physicalComponentLabel}>5V DC supply</text>
        </g>}
      </g>

      <g role="button" tabIndex={0} aria-label={`Select ${boardLabel}`} onClick={() => onSelectItem('controller')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectItem('controller') }} className={styles.physicalClickable}>
        <ControllerGraphic boardLabel={boardLabel} selected={selectedItemId === 'controller'} />
      </g>

      {outputLayouts.map((layout) => (
        <g key={layout.item.id} role="button" tabIndex={0} aria-label={`Select ${layout.item.title}`} onClick={() => onSelectItem(layout.item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectItem(layout.item.id) }} className={styles.physicalClickable}>
          <OutputGraphic layout={layout} selected={selectedItemId === layout.item.id} />
        </g>
      ))}
      {peripheralLayouts.map((layout) => (
        <g key={layout.item.id} role="button" tabIndex={0} aria-label={`Select ${layout.item.title}`} onClick={() => onSelectItem(layout.item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectItem(layout.item.id) }} className={styles.physicalClickable}>
          {layout.item.kind === 'mic-input'
            ? <MicrophoneGraphic layout={layout} selected={selectedItemId === layout.item.id} />
            : <InputGraphic layout={layout} selected={selectedItemId === layout.item.id} />}
        </g>
      ))}

      <g transform="translate(34 32)">
        <rect width="250" height="58" rx="8" fill="#ffffff" stroke="#d2d4d1" />
        <text x="16" y="24" className={styles.physicalLegendTitle}>ASSEMBLY REFERENCE</text>
        <text x="16" y="44" className={styles.physicalLegendMeta}>{items.length + 1} primary parts / {connections.length} GPIO routes / {outputConnectionCount} LED data route{outputConnectionCount === 1 ? '' : 's'}</text>
      </g>
      <g transform="translate(738 714)">
        <line x1="0" y1="0" x2="32" y2="0" className={styles.powerWire} /><text x="40" y="4" className={styles.physicalLegendMeta}>+5V</text>
        <line x1="86" y1="0" x2="118" y2="0" className={styles.groundWire} /><text x="126" y="4" className={styles.physicalLegendMeta}>GND</text>
        <line x1="184" y1="0" x2="216" y2="0" className={styles.signalWire} /><text x="224" y="4" className={styles.physicalLegendMeta}>DATA</text>
      </g>
    </svg>
  )
}

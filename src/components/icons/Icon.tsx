import type { ReactNode, SVGProps } from 'react'
import { PORT_SYMBOL_DETAIL, PORT_SYMBOL_FILLED, PORT_SYMBOL_PATH, portSymbol, type PortSymbol } from './portSymbols'

export type IconName =
  | 'pin' | 'eye' | 'flask' | 'compass' | 'bolt' | 'broadcast'
  | 'sparkle' | 'undo' | 'redo' | 'moon' | 'sun' | 'play'
  | 'music' | 'info' | 'edit' | 'star' | 'link'
  | 'power' | 'close' | 'external' | 'refresh' | 'download' | 'upload'
  | 'warning' | 'check' | 'grid' | 'ring' | 'strip' | 'bars'
  | 'arrow-up' | 'arrow-down' | 'swap' | 'chevron-up' | 'chevron-down' | 'wave'
  | 'frame' | 'field' | 'float' | 'bool' | 'audio' | 'palette' | 'color'

type Props = Omit<SVGProps<SVGSVGElement>, 'name'> & { name: IconName; size?: number }

function symbolShape(symbol: PortSymbol): ReactNode {
  const detail = PORT_SYMBOL_DETAIL[symbol]
  return (
    <>
      <path d={PORT_SYMBOL_PATH[symbol]} fill={PORT_SYMBOL_FILLED.has(symbol) ? 'currentColor' : 'none'} stroke={PORT_SYMBOL_FILLED.has(symbol) ? 'none' : undefined} />
      {detail && <path d={detail} />}
    </>
  )
}

export function Icon({ name, size = 16, ...props }: Props) {
  const paths: Record<IconName, ReactNode> = {
    pin: <><path d="m7 3 6 6M5 9l4-4 6 6-4 4-6-6Z" /><path d="m5 15-3 3" /></>,
    eye: <><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" /><circle cx="10" cy="10" r="2.5" /></>,
    flask: <><path d="M7 2h6M9 2v6l-5 8a2 2 0 0 0 2 3h8a2 2 0 0 0 2-3l-5-8V2" /><path d="M6 14h8" /></>,
    compass: <><circle cx="10" cy="10" r="8" /><path d="m12 8-2 5-2-1 2-5 2 1Z" /></>,
    bolt: <path d="m11 2-7 9h5l-1 7 8-10h-5V2Z" />,
    broadcast: <><circle cx="10" cy="15" r="1" /><path d="M6 11a6 6 0 0 1 8 0M3 8a10 10 0 0 1 14 0" /></>,
    sparkle: <path d="m10 2 1.6 6.4L18 10l-6.4 1.6L10 18l-1.6-6.4L2 10l6.4-1.6L10 2Z" />,
    undo: <><path d="M7 5 3 9l4 4" /><path d="M3 9h9a5 5 0 0 1 0 10" /></>,
    redo: <><path d="m13 5 4 4-4 4" /><path d="M17 9H8a5 5 0 0 0 0 10" /></>,
    moon: <path d="M16 14a7 7 0 0 1-10-10 7 7 0 1 0 10 10Z" />,
    sun: <><circle cx="10" cy="10" r="3" /><path d="M10 1v2m0 14v2M1 10h2m14 0h2M3.6 3.6 5 5m10 10 1.4 1.4M16.4 3.6 15 5M5 15l-1.4 1.4" /></>,
    play: <path d="m7 4 9 6-9 6V4Z" />,
    music: <><path d="M8 15V4l9-2v11" /><circle cx="5" cy="16" r="3" /><circle cx="14" cy="14" r="3" /></>,
    info: <><circle cx="10" cy="10" r="8" /><path d="M10 9v5m0-8h.01" /></>,
    edit: <><path d="m4 14 10-10 2 2L6 16l-3 1 1-3Z" /></>,
    star: <path d="m10 2 2.4 5 5.6.8-4 4 .9 5.7-4.9-2.6-4.9 2.6.9-5.7-4-4 5.6-.8L10 2Z" />,
    link: <><path d="M8 6h-2a4 4 0 0 0 0 8h2m4-8h2a4 4 0 0 1 0 8h-2M7 10h6" /></>,
    power: <><path d="M10 2v8" /><path d="M5.5 5.5a6.5 6.5 0 1 0 9 0" /></>,
    close: <path d="m5 5 10 10M15 5 5 15" />,
    external: <><path d="M11 3h6v6M17 3l-8 8" /><path d="M15 11v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>,
    refresh: <><path d="M16 10a6 6 0 1 1-1.8-4.3" /><path d="M16 3v4h-4" /></>,
    download: <><path d="M10 3v9m-4-4 4 4 4-4" /><path d="M3 15v2h14v-2" /></>,
    upload: <><path d="M10 12V3m-4 4 4-4 4 4" /><path d="M3 15v2h14v-2" /></>,
    warning: <><path d="M10 3 2 17h16L10 3Z" /><path d="M10 8v4m0 2.5h.01" /></>,
    check: <path d="m4 10 4 4 8-8" />,
    grid: <><rect x="3" y="3" width="14" height="14" rx="1" /><path d="M3 7.7h14M3 12.3h14M7.7 3v14M12.3 3v14" /></>,
    ring: <><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="3" /></>,
    strip: <><rect x="2" y="7" width="16" height="6" rx="1" /><path d="M6 10h.01M10 10h.01M14 10h.01" strokeWidth="2.2" /></>,
    bars: <path d="M4 17V9m4 8V5m4 12v-7m4 7V7" />,
    'arrow-up': <path d="M10 17V3m-5 5 5-5 5 5" />,
    'arrow-down': <path d="M10 3v14m-5-5 5 5 5-5" />,
    swap: <path d="M3 7h11l-3-3M17 13H6l3 3" />,
    'chevron-up': <path d="m5 12 5-5 5 5" />,
    'chevron-down': <path d="m5 8 5 5 5-5" />,
    frame: symbolShape('square'),
    field: symbolShape('diamond'),
    float: symbolShape('circle'),
    bool: symbolShape('smallSquare'),
    audio: symbolShape('hexagon'),
    palette: symbolShape('pill'),
    color: symbolShape('dot'),
    wave: <path d="M2 10h3l2-5 3 10 3-9 2 4h3" />,
  }
  return <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ verticalAlign: '-0.2em', flex: 'none' }} {...props}>{paths[name]}</svg>
}

/** A port's symbol (see `portSymbols.ts`), the same outline the handle is cut to. */
export function PortIcon({ dataType, size = 16 }: { dataType: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ verticalAlign: '-0.2em', flex: 'none' }}>{symbolShape(portSymbol(dataType))}</svg>
}

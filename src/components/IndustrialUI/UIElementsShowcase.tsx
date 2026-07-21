import { useState } from 'react'
import {
  BrandMark,
  HorizontalFader,
  JackSocket,
  LedMatrix,
  PatchCable,
  RackButton,
  RackPanel,
  RotaryKnob,
  SpectrumMeter,
  StatusLamp,
  ToggleSwitch,
  TransportControls,
} from './IndustrialUI'
import styles from './UIElementsShowcase.module.css'

export default function UIElementsShowcase() {
  const [activeMode, setActiveMode] = useState<'stage' | '3d' | 'standard'>('stage')
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(0.15)
  const [scale, setScale] = useState(0.4)
  const [strength, setStrength] = useState(1.5)
  const [palette, setPalette] = useState(3)
  const [brightness, setBrightness] = useState(0.8)
  const [volume, setVolume] = useState(0.72)
  const [position, setPosition] = useState(0.31)
  const [clamp, setClamp] = useState(true)
  const [overlay, setOverlay] = useState(true)
  const [connections, setConnections] = useState({ field: true, frame: true, control: false })

  const toggleConnection = (key: keyof typeof connections) => {
    setConnections((current) => ({ ...current, [key]: !current[key] }))
  }

  return (
    <main className={styles.showcase}>
      <header className={styles.topRail}>
        <div className={styles.brandCluster}>
          <BrandMark />
          <span className={styles.version}>UI / 01</span>
        </div>
        <nav className={styles.commandBar} aria-label="Studio commands">
          <RackButton compact>File</RackButton>
          <RackButton compact>View</RackButton>
          <RackButton compact>Undo</RackButton>
          <RackButton compact>Tidy</RackButton>
          <RackButton compact active={playing} onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Start'}</RackButton>
        </nav>
        <div className={styles.modeBar}>
          {(['stage', '3d', 'standard'] as const).map((mode) => (
            <RackButton key={mode} active={activeMode === mode} onClick={() => setActiveMode(mode)}>
              {mode}
            </RackButton>
          ))}
        </div>
      </header>

      <section className={styles.intro}>
        <div>
          <span className={styles.kicker}>Reference-matched component system</span>
          <h1>Industrial control surfaces</h1>
        </div>
        <p>
          Reusable React controls built from layered CSS—no baked screenshots. Every switch, knob,
          jack and transport key below is interactive and keyboard accessible.
        </p>
      </section>

      <div className={styles.componentGrid}>
        <RackPanel eyebrow="Input / numeric" title="Rotary controls" className={styles.knobPanel}>
          <div className={styles.controlStack}>
            <RotaryKnob label="Speed" value={speed} onChange={setSpeed} />
            <RotaryKnob label="Scale" value={scale} onChange={setScale} />
            <RotaryKnob label="Strength" value={strength} min={0} max={2} onChange={setStrength} />
          </div>
          <div className={styles.largeKnobRow}>
            <RotaryKnob label="Palette" value={palette} min={0} max={7} step={1} precision={0} size="large" accent="cyan" onChange={setPalette} />
            <RotaryKnob label="Brightness" value={brightness} size="large" accent="blue" onChange={setBrightness} />
          </div>
        </RackPanel>

        <RackPanel eyebrow="State / routing" title="Switches & status">
          <div className={styles.switchStack}>
            <ToggleSwitch label="Clamp inputs" checked={clamp} onChange={setClamp} />
            <ToggleSwitch label="Overlay" checked={overlay} accent="cyan" onChange={setOverlay} />
            <ToggleSwitch label="Soft signal" checked={playing} accent="violet" onChange={setPlaying} />
          </div>
          <div className={styles.lampShelf}>
            <StatusLamp label="Engine" accent="green" />
            <StatusLamp label="Field" active={connections.field} />
            <StatusLamp label="Control" active={connections.control} accent="violet" />
          </div>
          <div className={styles.buttonShelf}>
            <RackButton active={activeMode === 'stage'} onClick={() => setActiveMode('stage')}>Stage</RackButton>
            <RackButton active={playing} onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Start'}</RackButton>
          </div>
        </RackPanel>

        <RackPanel eyebrow="Patch / physical" title="Jack sockets" className={styles.patchPanel}>
          <div className={styles.jackRow}>
            <JackSocket label="Field in" connected={connections.field} onClick={() => toggleConnection('field')} />
            <JackSocket label="Frame out" connected={connections.frame} accent="blue" onClick={() => toggleConnection('frame')} />
            <JackSocket label="Control" connected={connections.control} accent="violet" onClick={() => toggleConnection('control')} />
          </div>
          <div className={styles.cableSample}><PatchCable accent="amber" /></div>
          <p className={styles.microcopy}>Select a socket to connect or release its plug.</p>
        </RackPanel>

        <RackPanel eyebrow="Visual / live" title="LED matrix" className={styles.matrixPanel}>
          <LedMatrix />
          <div className={styles.matrixMeta}>
            <StatusLamp label="16 × 16" accent="cyan" />
            <span>ESP32-S3</span>
            <span>WS2812B</span>
          </div>
        </RackPanel>

        <RackPanel eyebrow="Signal / playback" title="Meter & transport" className={styles.transportPanel}>
          <SpectrumMeter />
          <div className={styles.transportTimes}>
            <span>00:19.42</span>
            <span>01:00.00</span>
          </div>
          <TransportControls playing={playing} onPlayingChange={setPlaying} />
          <div className={styles.faderStack}>
            <HorizontalFader label="Position" value={position} onChange={setPosition} />
            <HorizontalFader label="Volume" value={volume} accent="cyan" onChange={setVolume} />
          </div>
        </RackPanel>
      </div>

      <footer className={styles.statusRail}>
        <StatusLamp label="Console: component library ready" />
        <div className={styles.statusChips}>
          <span>11 elements</span>
          <span>CSS modules</span>
          <span>React + TypeScript</span>
        </div>
        <a href="/" className={styles.backLink}>Return to studio</a>
      </footer>
    </main>
  )
}

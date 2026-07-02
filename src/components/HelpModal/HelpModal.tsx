import { useState, useEffect } from 'react'
import { useUiStore } from '../../state/uiStore'
import styles from './HelpModal.module.css'

type Tab = 'quickstart' | 'shortcuts' | 'nodes' | 'upload'

const TABS: { id: Tab; label: string }[] = [
  { id: 'quickstart', label: 'Quick Start' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'nodes', label: 'Node Reference' },
  { id: 'upload', label: 'Upload & Export' },
]

const CATEGORIES = [
  { color: '#00ffff', name: 'Audio',     nodes: 'Music Library, FFT Analyzer, Beat Detect, Percussion Detect, Audio Features, Audio Hue' },
  { color: '#ffa500', name: 'Hardware',  nodes: 'Microphone, Button, Potentiometer, Performance Generator, SD Card' },
  { color: '#a8ff00', name: 'Math',      nodes: 'Math, Clamp, MapRange, Sin, Cos, Wave, ComplexWave, Lerp, Time, Abs, Mod, Random, Counter, Gate, Not, Compare, BeatSin, XY Mapper' },
  { color: '#ff4d8d', name: 'Color',     nodes: 'HSV→RGB, CHSV, Temperature, Blend Colors, Gradient Sampler, Palette Sampler, Palette Selector, Custom Palette, Poline, Palette Blend' },
  { color: '#ff00ff', name: 'Pattern',   nodes: 'Solid Color, Span, Rect, Circle, Line, Text, Noise (5 variants), Fire, Fire 2012, Plasma, Spectrum Bars, Bass Pulse, Midrange Waves, Treble Sparks, Beat Flash, Noise 2D, Radial Burst, Spiral, Kaleidoscope, Particles (7 modes), Gradient Frame, Fractal Noise, Gabor Noise, Palette Gradient, Image, Blobs, Flow Field, Starfield, Audio Flow, Reaction Diffusion, Game of Life, Pattern Master, Custom Formula' },
  { color: '#00e0a4', name: 'Composite', nodes: 'Blend (6 modes), Brightness, Hue Shift, Transform, Invert, Blur 2D, Mask, Fade to Black, Transition (16 effects), Sequencer, Pattern Collection' },
  { color: '#00bfff', name: 'Output',    nodes: 'Matrix Output' },
]

function QuickStartTab() {
  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Core workflow</div>
        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNum}>1</div>
            <div className={styles.stepText}>
              <strong>Add a Matrix Output node.</strong> Set your LED grid width, height, chipset, and data pin in its properties. This is the terminal that drives codegen.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>2</div>
            <div className={styles.stepText}>
              <strong>Drag a pattern node</strong> from the sidebar (e.g. Fire 2012, Plasma, Noise) and wire its <code>frame</code> output to the Matrix Output <code>frame</code> input. The preview updates live.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>3</div>
            <div className={styles.stepText}>
              <strong>Layer composite effects</strong> between pattern and output — Blend, Blur 2D, Brightness, Hue Shift, Transition, and more. Each composite node takes one or two frames and outputs a modified frame.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>4</div>
            <div className={styles.stepText}>
              <strong>Add audio reactivity.</strong> Drop a Microphone node from Hardware, wire it through FFT Analyzer or the newer audio feature nodes, then connect those values to any audio-reactive node or math input.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>5</div>
            <div className={styles.stepText}>
              <strong>Flash to your board.</strong> Click <strong>⚙ Board</strong> in the Matrix Output node to pick your board and port, then hit <strong>Upload</strong>. Or click <strong>Export .ino</strong> to download the sketch and compile manually.
            </div>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Key concepts</div>
        <div className={styles.tipList}>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>⬡</div>
            <div className={styles.tipText}>
              <strong>Typed ports</strong> — each port has a data type (float, color, palette, frame, audio…). Connection handles are colour-coded by type; incompatible ports refuse to connect. Port colours match their node's category accent.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>⬡</div>
            <div className={styles.tipText}>
              <strong>Live preview</strong> — the LED matrix preview evaluates the full graph at ~60 fps using wall-clock time, so animation speed exactly matches what will run on the microcontroller.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>⬡</div>
            <div className={styles.tipText}>
              <strong>Pattern groups</strong> — select nodes and right-click → <strong>Make Group</strong> to encapsulate them into a reusable pattern. Double-click a group to enter it. Groups can be saved to the Pattern Library (sidebar) and dropped into a show via Pattern Collection + Pattern Master.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>⬡</div>
            <div className={styles.tipText}>
              <strong>Autosave</strong> — the workspace is saved to browser storage every 10 seconds and on page hide. Use <strong>↓ Save</strong> (Ctrl+S) to export a portable JSON file.
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function ShortcutsTab() {
  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Keyboard</div>
        <div className={styles.shortcutGrid}>
          <div className={styles.kbd}><span className={styles.key}>Ctrl</span><span className={styles.key}>Z</span></div>
          <div className={styles.shortcutDesc}>Undo</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl</span><span className={styles.key}>Y</span></div>
          <div className={styles.shortcutDesc}>Redo</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl</span><span className={styles.key}>Shift</span><span className={styles.key}>Z</span></div>
          <div className={styles.shortcutDesc}>Redo (alternative)</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl</span><span className={styles.key}>S</span></div>
          <div className={styles.shortcutDesc}>Save graph to browser storage</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl</span><span className={styles.key}>A</span></div>
          <div className={styles.shortcutDesc}>Select all nodes</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl</span><span className={styles.key}>C</span></div>
          <div className={styles.shortcutDesc}>Copy the selected node</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl</span><span className={styles.key}>V</span></div>
          <div className={styles.shortcutDesc}>Paste the copied node near the view centre</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl</span><span className={styles.key}>D</span></div>
          <div className={styles.shortcutDesc}>Duplicate the selected node</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl</span><span className={styles.key}>G</span></div>
          <div className={styles.shortcutDesc}>Group the selected nodes (opens the naming dialog)</div>
          <div className={styles.kbd}><span className={styles.key}>Del</span><span className={styles.key}>Backspace</span></div>
          <div className={styles.shortcutDesc}>Delete selected node(s)</div>
          <div className={styles.kbd}><span className={styles.key}>Esc</span></div>
          <div className={styles.shortcutDesc}>Close this dialog / menu, or deselect nodes on the canvas</div>
          <div className={styles.kbd}><span className={styles.key}>?</span></div>
          <div className={styles.shortcutDesc}>Open this Help dialog</div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Canvas — mouse &amp; trackpad</div>
        <div className={styles.shortcutGrid}>
          <div className={styles.kbd}><span className={styles.key}>Drag</span></div>
          <div className={styles.shortcutDesc}>Pan the canvas (background drag)</div>
          <div className={styles.kbd}><span className={styles.key}>Scroll</span></div>
          <div className={styles.shortcutDesc}>Zoom in / out</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl</span><span className={styles.key}>Scroll</span></div>
          <div className={styles.shortcutDesc}>Zoom (trackpad pinch alternative)</div>
          <div className={styles.kbd}><span className={styles.key}>Shift</span><span className={styles.key}>Click</span></div>
          <div className={styles.shortcutDesc}>Add node to selection</div>
          <div className={styles.kbd}><span className={styles.key}>Shift</span><span className={styles.key}>Drag</span></div>
          <div className={styles.shortcutDesc}>Marquee-select multiple nodes</div>
          <div className={styles.kbd}><span className={styles.key}>Right-click</span></div>
          <div className={styles.shortcutDesc}>Context menu (canvas or node)</div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Wiring</div>
        <div className={styles.shortcutGrid}>
          <div className={styles.kbd}><span className={styles.key}>Drag output</span></div>
          <div className={styles.shortcutDesc}>Draw a connection noodle</div>
          <div className={styles.kbd}><span className={styles.key}>Drag output → canvas</span></div>
          <div className={styles.shortcutDesc}>Open filtered node picker, auto-wire on pick</div>
          <div className={styles.kbd}><span className={styles.key}>Drag input port</span></div>
          <div className={styles.shortcutDesc}>Unplug the wire from an input; drag to re-route</div>
          <div className={styles.kbd}><span className={styles.key}>Drop sidebar → noodle</span></div>
          <div className={styles.shortcutDesc}>Splice a node into an existing connection</div>
        </div>
      </div>
    </>
  )
}

function NodesTab() {
  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Categories &amp; nodes</div>
        <div className={styles.text}>
          Nodes are grouped by their primary output type. Port and handle colours match the category accent. The sidebar lists them in authoring pipeline order.
        </div>
        <div className={styles.catGrid}>
          {CATEGORIES.map((c) => (
            <div key={c.name} className={styles.catRow}>
              <div className={styles.catDot} style={{ background: c.color }} />
              <div className={styles.catName}>{c.name}</div>
              <div className={styles.catNodes}>{c.nodes}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Bundled nodes</div>
        <div className={styles.tipList}>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>⬡</div>
            <div className={styles.tipText}>
              <strong>Noise</strong> — one node, five variants selected by the <code>noiseType</code> dropdown: Field, Simplex, Noise3D, Worley (Voronoi), Plasma Fractal.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>⬡</div>
            <div className={styles.tipText}>
              <strong>Math</strong> — six ops (add, subtract, multiply, divide, min, max) in one node. Mod and Compare stay separate.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>⬡</div>
            <div className={styles.tipText}>
              <strong>Blend</strong> — six composite modes (normal, multiply, screen, overlay, add, difference) with an <code>amount</code> (0–1) opacity slider.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>⬡</div>
            <div className={styles.tipText}>
              <strong>Transition</strong> — 16 A→B effects in one node: crossfade, wipe, dissolve, iris, clock wipe, push, checkerboard, diagonal, fade-to-black/white, blinds, ripple, spiral, curtain, scanlines, zoom.
            </div>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Generative show pipeline</div>
        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNum}>1</div>
            <div className={styles.stepText}>
              <strong>Build patterns as groups.</strong> Select nodes → right-click → Make Group. Save a group to the library via its context menu → Save to Library.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>2</div>
            <div className={styles.stepText}>
              <strong>Pattern Collection</strong> absorbs groups: wire a group's frame output into the Collection's <code>pattern</code> input to add it to the set (no visual noodle — the group disappears into the list).
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>3</div>
            <div className={styles.stepText}>
              <strong>Pattern Master</strong> drives the show: wire Collection → Master → Matrix Output. Set dwell time, transition pool, and optional beat input. The firmware mirrors the live preview exactly.
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function UploadTab() {
  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Prerequisites</div>
        <div className={styles.tipList}>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>1</div>
            <div className={styles.tipText}>
              <strong>arduino-cli</strong> must be installed and on your <code>PATH</code>, or discoverable via the Arduino IDE bundle. The helper can also download it for you (click <strong>⚙ Board</strong> → install prompt).
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>2</div>
            <div className={styles.tipText}>
              <strong>Board core</strong> must be installed — e.g. <code>esp32:esp32</code> for ESP32 boards. Click <strong>⚙ Board</strong> → Boards manager → Install core next to your board.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>3</div>
            <div className={styles.tipText}>
              <strong>FastLED library</strong> — install via Arduino IDE Library Manager, or run <code>arduino-cli lib install FastLED</code>.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>4</div>
            <div className={styles.tipText}>
              The upload <strong>helper service</strong> is auto-started by the dev server. If it's not running, execute <code>npm run helper</code> in a terminal and reload.
            </div>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Uploading</div>
        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNum}>1</div>
            <div className={styles.stepText}>
              Click <strong>⚙ Board</strong> in the Matrix Output node. Enable your board, install its core if needed, then select the board and USB port.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>2</div>
            <div className={styles.stepText}>
              Click <strong>Upload</strong>. The button shows live status — <em>Compiling…</em> → <em>Uploading NN%</em> → <em>✓ Done</em>. Click <strong>⌗ Output</strong> to see the full build log.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>3</div>
            <div className={styles.stepText}>
              For a <strong>music-sync show</strong>, wire an SD Card node to Matrix Output's <code>sdcard</code> input, then click <strong>♪ Upload show to SD</strong> to provision the card and flash the player.
            </div>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Export without uploading</div>
        <div className={styles.text}>
          Click <strong>Export .ino</strong> in the Matrix Output node to download the generated FastLED sketch. Open it in the Arduino IDE or compile with <code>arduino-cli compile --fqbn &lt;board&gt; sketch.ino</code>.
        </div>
        <div className={styles.text}>
          The generated sketch targets FastLED and is compatible with any board and chipset combination — it does not depend on the Studio app or helper at runtime.
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Supported boards (out of the box)</div>
        <div className={styles.text}>
          ESP32-S3 · ESP32 · Arduino Uno · Arduino Mega · Arduino Nano · Arduino Nano 33 IoT · Raspberry Pi Pico / Pico W. Additional boards can be added via the Boards manager as long as their core is installable via <code>arduino-cli</code>.
        </div>
      </div>
    </>
  )
}

export default function HelpModal() {
  const { closeHelp } = useUiStore()
  const [tab, setTab] = useState<Tab>('quickstart')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeHelp() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [closeHelp])

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeHelp() }}>
      <div className={styles.modal} role="dialog" aria-label="Help" aria-modal="true">
        <div className={styles.header}>
          <span className={styles.title}>FastLED Studio — Help</span>
          <button className={styles.closeBtn} onClick={closeHelp} title="Close (Esc)">×</button>
        </div>

        <div className={styles.tabs} role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={styles.body}>
          {tab === 'quickstart' && <QuickStartTab />}
          {tab === 'shortcuts' && <ShortcutsTab />}
          {tab === 'nodes' && <NodesTab />}
          {tab === 'upload' && <UploadTab />}
        </div>
      </div>
    </div>
  )
}

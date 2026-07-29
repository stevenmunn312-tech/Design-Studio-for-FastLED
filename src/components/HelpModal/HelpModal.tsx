import { useEffect } from 'react'
import { useUiStore } from '../../state/uiStore'
import styles from './HelpModal.module.css'
import NodeReference from './NodeReference'
import type { HelpTab } from '../../state/uiStore'

const TABS: { id: HelpTab; label: string }[] = [
  { id: 'quickstart', label: 'Quick Start' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'nodes', label: 'Node Reference' },
  { id: 'upload', label: 'Upload & Export' },
  { id: 'about', label: 'About' },
]

const REPO_URL = 'https://github.com/stevenmunn312-tech/Design-Studio-for-FastLED'

function AboutTab() {
  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Design Studio for FastLED</div>
        <div className={styles.text}>
          <strong>Version {__APP_VERSION__}</strong> · public beta
        </div>
        <div className={styles.text}>
          A node-graph authoring environment for FastLED LED strips, matrices, and tiled panels — design patterns visually, preview them live, then generate and flash real firmware.
        </div>
        <div className={styles.text}>
          Maintained by <strong>Steven Munn</strong>. The core is released under the{' '}
          <a className={styles.link} href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">MIT License</a>.
          Source, issues, and beta hardware reports live on{' '}
          <a className={styles.link} href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>.
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Credits</div>
        <div className={styles.tipList}>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>✦</div>
            <div className={styles.tipText}>
              <strong>Stefan Petrick</strong> — creator of{' '}
              <a className={styles.link} href="https://github.com/StefanPetrick/animartrix" target="_blank" rel="noopener noreferrer">AnimARTrix</a>.
              The <strong>AnimARTrix</strong> node is an adaptation of his work, kept in a separately licensed module under <strong>CC BY-NC-SA 4.0</strong>; the <strong>Color Trails</strong> node is adapted from his prototype work. Generated firmware for these nodes carries his credit.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>✦</div>
            <div className={styles.tipText}>
              <strong>FastLED</strong> — the{' '}
              <a className={styles.link} href="https://github.com/FastLED/FastLED" target="_blank" rel="noopener noreferrer">FastLED library</a>{' '}
              by Daniel Garcia, Mark Kriegsman, and the FastLED community powers all generated firmware. Fire 2012 implements Mark Kriegsman's classic algorithm; Pride 2015, Pacifica, and TwinkleFox are original homages named for his demos.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>✦</div>
            <div className={styles.tipText}>
              <strong>Essentia</strong> — offline music analysis uses{' '}
              <a className={styles.link} href="https://essentia.upf.edu" target="_blank" rel="noopener noreferrer">Essentia</a>{' '}
              (Music Technology Group, Universitat Pompeu Fabra), bundled as <code>essentia.js</code> under AGPL-3.0.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>✦</div>
            <div className={styles.tipText}>
              <strong>Open source</strong> — built with React, @xyflow/react, Zustand, zundo, Poline, gifuct-js, and lz-string. The Audiowide display font is by Astigmatic under the SIL Open Font License 1.1. Full details in the{' '}
              <a className={styles.link} href={`${REPO_URL}/blob/main/THIRD_PARTY_NOTICES.md`} target="_blank" rel="noopener noreferrer">third-party notices</a>.
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function QuickStartTab() {
  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Core workflow</div>
        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNum}>1</div>
            <div className={styles.stepText}>
              <strong>Start from the launcher.</strong> On an empty canvas, use <strong>Start with Rainbow</strong>, <strong>Audio-reactive demo</strong>, <strong>Browse starter patches</strong>, or <strong>Blank canvas</strong>. The top-bar <strong>✦ Start</strong> button reopens the full gallery any time.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>2</div>
            <div className={styles.stepText}>
              <strong>Build toward Matrix Output.</strong> Add a <strong>Matrix Output</strong> node or start from a template that already has one, then set grid width, height, chipset, and pins. This is the terminal that drives codegen, upload, live stream, and SD-show provisioning.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>3</div>
            <div className={styles.stepText}>
              <strong>Patch the animation path.</strong> Drag a pattern node (for example Rainbow, Fire 2012, Plasma, Noise, or Spectrum Bars) and wire its <code>frame</code> output to Matrix Output's <code>frame</code> input. The main LED preview and node previews update live from the same graph evaluation.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>4</div>
            <div className={styles.stepText}>
              <strong>Layer effects or audio.</strong> Composite nodes such as Blur 2D, Brightness, Hue Shift, Transition, and Trails sit between the generator and Matrix Output. For audio reactivity, drop <strong>Mic Input</strong> into FFT Analyzer or Beat Detect and wire those values into pattern or math inputs.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>5</div>
            <div className={styles.stepText}>
              <strong>Choose the output path.</strong> In <strong>Matrix Output</strong>, open <strong>Upload...</strong> for the full hardware toolbox: <strong>Upload</strong> for a normal sketch, <strong>Flash Wiring Test</strong> to verify color order/layout/brightness first, <strong>Flash Stream Receiver</strong> + <strong>Live Stream</strong> for rapid serial preview, <strong>Upload show to SD</strong> for music-sync playback, <strong>View Code</strong> / <strong>Export .ino</strong> when you want the sketch first, and <strong>Re-upload last sketch</strong> for a quick repeat flash of the current project's last successful upload.
            </div>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Dimension-aware numeric expressions</div>
        <div className={styles.text}>
          Free-entry numeric fields on creative nodes can contain a number or a safe expression. For example, set BeatSin <code>high</code> to <code>h - 2</code>, or Random <code>max</code> to <code>w / 2</code>. The preview and generated firmware resolve the expression against the active render grid, so the patch adapts when the Matrix Output size changes.
        </div>
        <div className={styles.text}>
          Available values: <code>w</code>, <code>h</code>, <code>num_leds</code>, <code>max_x</code>, <code>max_y</code>, <code>center_x</code>, <code>center_y</code>, <code>min_dim</code>, <code>max_dim</code>, <code>aspect</code>, <code>pi</code>, and <code>tau</code>. Use ordinary arithmetic, parentheses, and helpers such as <code>min()</code>, <code>max()</code>, <code>floor()</code>, <code>ceil()</code>, and <code>round()</code>. Invalid expressions are outlined and block export/upload validation until corrected.
        </div>
        <div className={styles.text}>
          <code>w</code> and <code>h</code> are pixel counts; the final valid coordinates are <code>max_x</code> (<code>w - 1</code>) and <code>max_y</code> (<code>h - 1</code>). Bounded sliders and hardware/setup fields remain literal values.
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
              <strong>Pattern groups</strong> — select nodes and right-click → <strong>Make Group</strong> to encapsulate them into a reusable pattern. Double-click a group to enter it. Groups can be saved to the Pattern Library (sidebar) and dropped into a show via Pattern Collection + Show Engine.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>⬡</div>
            <div className={styles.tipText}>
              <strong>Project vocabulary</strong> — a <strong>Project</strong> is your everyday autosaved workspace; <strong>Open Project File</strong> / <strong>Save Project File As</strong> moves that full workspace between machines; <strong>Import Graph JSON</strong> / <strong>Export Graph JSON</strong> is raw graph interchange; <strong>Copy Share Link</strong> makes a URL copy of the workspace; and <strong>Recover Snapshot</strong> restores one of the recent rolling recovery snapshots for this browser.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>⬡</div>
            <div className={styles.tipText}>
              <strong>Offline vs hardware</strong> — after the first successful load, Studio can be installed and reopened offline for authoring and preview. Upload, live stream, board discovery, and project-file dialogs still require the local helper running on this machine.
            </div>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Show starters</div>
        <div className={styles.tipList}>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>♫</div>
            <div className={styles.tipText}>
              <strong>Generative Show</strong> — use <strong>Add patterns…</strong> on a <strong>Pattern Collection</strong> (or drag saved patterns onto it), feed the collection into <strong>Show Engine</strong>, then wire that frame output to <strong>Matrix Output</strong> for a self-running live show.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>♪</div>
            <div className={styles.tipText}>
              <strong>Music-synced SD Show</strong> — analyse songs in <strong>Music Library</strong>, generate timed show files in <strong>Performance Generator</strong>, pass them through <strong>SD Card</strong>, then use <strong>Upload show to SD</strong> from <strong>Matrix Output</strong>.
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
          <div className={styles.shortcutDesc}>Save the current project (or open Projects if none is active)</div>
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
          <div className={styles.shortcutDesc}>Close this dialog / menu, exit Stage/Performance mode, or deselect nodes on the canvas — in that priority order</div>
          <div className={styles.kbd}><span className={styles.key}>?</span></div>
          <div className={styles.shortcutDesc}>Open this Help dialog (F1 also works)</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl</span><span className={styles.key}>K</span></div>
          <div className={styles.shortcutDesc}>Open the node search picker at the view centre</div>
          <div className={styles.kbd}><span className={styles.key}>F8</span></div>
          <div className={styles.shortcutDesc}>Toggle the Performance Deck (pinned knobs/faders, scenes, panic). MIDI and additional keyboard bindings are assigned from inside the deck panel itself, not listed here.</div>
          <div className={styles.kbd}><span className={styles.key}>F9</span></div>
          <div className={styles.shortcutDesc}>Toggle Performance mode (hushes chrome, emphasizes live signal flow)</div>
          <div className={styles.kbd}><span className={styles.key}>F10</span></div>
          <div className={styles.shortcutDesc}>Toggle Stage mode (preview-first, distraction-free display)</div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Canvas — mouse &amp; trackpad</div>
        <div className={styles.shortcutGrid}>
          <div className={styles.kbd}><span className={styles.key}>Drag</span></div>
          <div className={styles.shortcutDesc}>Pan the canvas (background drag)</div>
          <div className={styles.kbd}><span className={styles.key}>Double-click</span></div>
          <div className={styles.shortcutDesc}>Open the node search picker on empty canvas</div>
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

function UploadTab() {
  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Prerequisites</div>
        <div className={styles.tipList}>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>1</div>
            <div className={styles.tipText}>
              The local <strong>helper service</strong> must be running on this machine. The portable desktop beta starts it for you; source runs start it from the platform launch scripts, and you can also launch it manually with <code>npm run helper</code>.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>2</div>
            <div className={styles.tipText}>
              Studio prefers <strong>fbuild</strong> when it is available, including the portable desktop bundle. In that mode the board toolchain is fetched automatically on first compile and there is no separate Arduino core install step.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>3</div>
            <div className={styles.tipText}>
              If Studio falls back to <strong>arduino-cli</strong>, then you do need the board core installed for that board and the <strong>FastLED</strong> library available. The helper can also locate or download <code>arduino-cli</code> for you.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>4</div>
            <div className={styles.tipText}>
              USB upload or streaming still needs a compatible board, a detected port, and any operating-system permission prompts accepted. The <strong>Upload readiness</strong> checklist in <strong>Upload...</strong> shows what is missing and offers one-click fixes where possible.
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
              Use <strong>✦ Setup...</strong> on the Matrix Output node for the guided board, size, chipset, layout, and pin setup. Open <strong>↑ Upload...</strong> any time to review the current board and port.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>2</div>
            <div className={styles.stepText}>
              Watch the <strong>live controller-capacity</strong> line and open the <strong>Upload readiness</strong> checklist. They tell you whether the current design fits on the selected board and whether helper, engine, toolchain, and port are ready before you flash.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>3</div>
            <div className={styles.stepText}>
              Click <strong>Upload</strong> for a normal sketch. The button shows live status — <em>Compiling…</em> → <em>Uploading NN%</em> → <em>✓ Done</em>. Click <strong>⌗ Output / Serial</strong> to inspect the full log.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>4</div>
            <div className={styles.stepText}>
              If the hardware is new or freshly rewired, click <strong>🧪 Flash Wiring Test</strong> first. It cycles through RGB solids, brightness bars, orientation markers, panel labels, and logical/physical pixel chases using the current Matrix Output settings.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>5</div>
            <div className={styles.stepText}>
              For rapid hardware preview, flash <strong>⚡ Stream Receiver</strong> once, then use <strong>📡 Live Stream</strong> to push the current preview frames straight to the board without recompiling. For a <strong>music-sync show</strong>, wire an SD Card node to Matrix Output's <code>sdcard</code> input, then click <strong>♪ Upload show to SD</strong> to provision the card and flash the player.
            </div>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Export without uploading</div>
        <div className={styles.text}>
          Click <strong>View Code</strong> in the Matrix Output node to inspect the exact sketch that would be uploaded, or <strong>Export .ino</strong> to download it. Open it in the Arduino IDE or compile with <code>arduino-cli compile --fqbn &lt;board&gt; sketch.ino</code>.
        </div>
        <div className={styles.text}>
          The generated sketch targets FastLED and is compatible with any board and chipset combination — it does not depend on the Studio app or helper at runtime.
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>DMX / Art-Net hardware setup</div>
        <div className={styles.text}>
          A <strong>DMX / Art-Net</strong> node carries one universe into the graph; <strong>DMX Channel</strong> decodes a single slot. Both transports are <strong>experimental</strong> — no hardware validation pass has been recorded for either one yet.
        </div>
        <div className={styles.tipList}>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>◇</div>
            <div className={styles.tipText}>
              <strong>Art-Net</strong> needs a Wi-Fi-capable board (ESP32 or ESP8266). Enter the SSID and password on the node, choose DHCP or a static address, and match the universe and UDP port your controller sends on. Credentials stay in this browser and are never written into the project, share links, or synced project files — but they are embedded in plain text in the generated sketch, so treat an exported network-enabled <code>.ino</code> as a secret.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>◇</div>
            <div className={styles.tipText}>
              <strong>DMX512</strong> is ESP32-only and needs an RS-485 transceiver such as a MAX485 or SN75176 — a bare GPIO cannot read a DMX line. Wire the transceiver's TX, RX, and enable pins to the ones set on the node, connect DMX data +/− and ground to the XLR line, and terminate the run. With <strong>fbuild</strong> the <code>esp_dmx</code> library is vendored automatically on the first DMX512 build; with <strong>arduino-cli</strong>, install <code>esp_dmx</code> yourself first.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>◇</div>
            <div className={styles.tipText}>
              <strong>Preview receives Art-Net only</strong>, in both modes, through the local helper's UDP listener — so a DMX512 node previews blank unless an Art-Net source happens to be sending. Preview holds one live universe at a time. One sketch shares a single Wi-Fi connection across every Art-Net input and NTP clock, so configure them identically; Graph Health flags unsupported boards, pin conflicts, and missing or conflicting Wi-Fi settings before upload.
            </div>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>RTC clock and scheduling hardware setup</div>
        <div className={styles.text}>
          An <strong>RTC Clock</strong> node publishes calendar fields and a <code>valid</code>/<code>synced</code>/<code>stale</code> status; <strong>Schedule Trigger</strong> and <strong>Clock Display</strong> read it through ordinary ports. <strong>Experimental</strong> — no hardware pass has confirmed either the software clock's drift or a real NTP sync yet.
        </div>
        <div className={styles.tipList}>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>◇</div>
            <div className={styles.tipText}>
              Pick a <strong>time source</strong> on the RTC Clock node. <strong>Compile Time</strong> and <strong>Manual</strong> work on every board with no network — Manual seeds from a date/time you type in, and preview runs it forward in real time so you can rehearse a schedule without waiting for the actual hour. <strong>NTP</strong> needs a Wi-Fi-capable board (ESP32-family or ESP8266) plus an SSID, password, and NTP server.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>◇</div>
            <div className={styles.tipText}>
              With NTP selected, the sketch runs from its compile-time build stamp (<code>synced</code> false, <code>stale</code> true) until Wi-Fi connects and a sync actually completes — it never sits dark waiting on the network. Wire Schedule Trigger's <code>requireSync</code> input when a schedule must not fire on the unsynced fallback clock.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>◇</div>
            <div className={styles.tipText}>
              NTP credentials follow the same rules as Art-Net: stored only in this browser's local storage, never in the project, share links, or synced project files, but embedded in plain text in the generated sketch. One sketch shares a single Wi-Fi connection across every Art-Net input and NTP clock — Graph Health flags it when they disagree, and warns when a Clock Display has no time source wired at all (it will show <code>--:--</code> on real hardware).
            </div>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Board catalogue (out of the box)</div>
        <div className={styles.text}>
          Studio ships a starter board catalogue including ESP32-S3, ESP32, ESP8266, Arduino Uno, Arduino Nano, Arduino Mega, Teensy 4.1, RP2040 (Pico), and Arduino Nano 33 IoT, plus any custom boards you add yourself. As of July 26, 2026, the recorded public-beta support rows cover both <strong>ESP32-S3 + 16×16 WS2812B matrix</strong> and <strong>ESP8266 + 10×1 WS2812B strip</strong>, including normal Upload, Flash Wiring Test, and Flash Stream Receiver + Live Stream paths for those exact combos. Everything else should still be treated as experimental until it is added to the <a className={styles.link} href={`${REPO_URL}/blob/main/docs/release/beta-support-matrix.md`} target="_blank" rel="noopener noreferrer">beta support matrix</a>.
        </div>
      </div>
    </>
  )
}

export default function HelpModal() {
  const { closeHelp, helpTab, setHelpTab } = useUiStore()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeHelp() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [closeHelp])

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeHelp() }}>
      <div className={styles.modal} role="dialog" aria-label="Help" aria-modal="true">
        <div className={styles.header}>
          <span className={styles.title}>Design Studio for FastLED — Help</span>
          <button className={styles.closeBtn} onClick={closeHelp} title="Close (Esc)">×</button>
        </div>

        <div className={styles.tabs} role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={helpTab === t.id}
              className={`${styles.tab} ${helpTab === t.id ? styles.tabActive : ''}`}
              onClick={() => setHelpTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={`${styles.body} ${helpTab === 'nodes' ? styles.bodyNodeReference : ''}`}>
          {helpTab === 'quickstart' && <QuickStartTab />}
          {helpTab === 'shortcuts' && <ShortcutsTab />}
          {helpTab === 'nodes' && <NodeReference />}
          {helpTab === 'upload' && <UploadTab />}
          {helpTab === 'about' && <AboutTab />}
        </div>
      </div>
    </div>
  )
}

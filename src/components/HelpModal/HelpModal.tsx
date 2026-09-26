import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useUiStore } from '../../state/uiStore'
import styles from './HelpModal.module.css'
import NodeReference from './NodeReference'
import type { HelpTab } from '../../state/uiStore'

const FIRST_PATCH_IMAGE = '/node-cards/graphs/juggle.svg'

const TABS: { id: HelpTab; label: string }[] = [
  { id: 'quickstart', label: 'Quick Start' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'displays', label: 'Displays' },
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
          A node-graph authoring environment for FastLED LED strings, matrices, rings, corkscrew installations, and tiled panels — design patterns visually, preview them live, then generate and flash real firmware.
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
        <div className={styles.sectionTitle}>Your first working patch</div>
        <div className={styles.lede}>
          Every design follows the same path: make a frame, connect it to the <strong>LED output</strong>, check the preview, then choose whether to keep designing, export code, or run it on LEDs.
        </div>
        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNum}>1</div>
            <div className={styles.stepText}>
              <strong>Load a starter.</strong> Choose <strong>Start with Juggle</strong> on the welcome screen. If you are already editing, use <strong>✦ Start</strong> in the top bar to reopen the starter gallery.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>2</div>
            <div className={styles.stepText}>
              <strong>Check the frame path.</strong> The starter connects <code>Juggle.frame</code> to <code>LED Matrix.frame</code>. A frame connection is cyan; drag from the output handle on the right of Juggle to the matching input on the left of the LED output if it is missing.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>3</div>
            <div className={styles.stepText}>
              <strong>Make a visible change.</strong> Set Juggle's <strong>Count</strong> to 5, then raise <strong>Speed</strong>. The node preview and LED Preview update immediately; no compile or hardware is needed.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>4</div>
            <div className={styles.stepText}>
              <strong>Match your LEDs.</strong> In the lower <strong>Hardware</strong> workbench, click the LED matrix to configure its wiring. Use the LED output node above for size, layout, routing, and rendering. Together these settings control the preview and generated firmware.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>5</div>
            <div className={styles.stepText}>
              <strong>Save or continue.</strong> Projects autosave as you work. Use <strong>File</strong> when you want a named copy, a portable project file, graph JSON, a share link, or a recovery snapshot.
            </div>
          </div>
        </div>
        <figure className={styles.helpFigure}>
          <img
            className={styles.helpImage}
            src={FIRST_PATCH_IMAGE}
            alt="A Juggle node wired into the LED output, ending at an LED Matrix"
          />
          <figcaption>
            The Juggle reference graph: Juggle feeds the LED Matrix through a complete cyan frame path.
          </figcaption>
        </figure>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Grow the patch</div>
        <div className={styles.choiceGrid}>
          <div className={styles.choiceCard}>
            <strong>Add an effect</strong>
            <span>Drag Blur 2D, Brightness, Hue Shift, Trails, or another compatible effect onto the cyan noodle. Studio splices it into the frame path.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>Add audio response</strong>
            <span>Add a microphone in Hardware, select it in Audio, then connect Audio to FFT Analyzer or Beat Detect. Wire the resulting values into a pattern, math, or composite node and allow microphone access when prompted.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>Find the right node</strong>
            <span>Press <kbd className={styles.inlineKey}>Ctrl/Cmd K</kbd>, double-click empty canvas, or search the Node Library. The Node Reference tab explains every port and property.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>Fix an incomplete graph</strong>
            <span>Open Graph Health for node-specific repair steps. A design needs a complete frame path into the LED output before it can export or upload.</span>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Projects, files, and recovery</div>
        <div className={styles.definitionGrid}>
          <div><strong>Project</strong><span>Your named, autosaved workspace, including its graphs and groups.</span></div>
          <div><strong>Project file</strong><span>A full workspace copy for backup or moving to another machine.</span></div>
          <div><strong>Graph JSON</strong><span>Raw graph interchange for development and advanced workflows.</span></div>
          <div><strong>Share link</strong><span>A URL containing a copy of the workspace at the time you create it.</span></div>
          <div><strong>Share to Community</strong><span>Packages the current workspace as a pattern to publish, rather than as a private link.</span></div>
          <div><strong>Recovery snapshot</strong><span>One of the recent rolling browser snapshots; use it after an unwanted edit or failed load.</span></div>
          <div><strong>Pattern Library</strong><span>Reusable groups saved independently so they can be dropped into other projects and shows.</span></div>
        </div>
        <div className={styles.note}>
          <strong>Offline authoring:</strong> after the first successful load, Studio can be installed and reopened offline for editing and preview. Board discovery, upload, live stream, and helper-backed file operations still need the local helper.
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Opening a project from someone else</div>
        <div className={styles.text}>
          Everything that ships with Studio, and everything you make on this computer, is trusted. Only a share link, file or pattern made on another computer can hold something Studio hasn&apos;t run here before — Formula and Code nodes, or an Art-Net listener — and only those parts wait until you choose <strong>Trust it</strong> in the banner. Studio remembers what you trust, on this computer, for every project, so the same code is never asked about twice.
        </div>
        <div className={styles.definitionGrid}>
          <div><strong>Formula and Code nodes</strong><span>Render blank in the preview. Everything else — patterns, effects, fields, audio — runs normally, so most shared patches look completely finished.</span></div>
          <div><strong>DMX / Art-Net</strong><span>No network listener is opened, since the port to listen on is part of the shared file.</span></div>
          <div><strong>Export and upload</strong><span>Allowed, but Studio asks first. Generated firmware runs directly on your board with no sandbox around it.</span></div>
        </div>
        <div className={styles.note}>
          You will only be asked when the file actually contains one of those things; most shared patches are ordinary patterns and open without a word. Trusting is remembered per project. Before trusting something you did not write, it is worth reading its Formula and Code nodes — and <strong>‹/› View Code</strong> shows the exact sketch any upload would flash.
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Dimension-aware numeric expressions</div>
        <div className={styles.text}>
          A free-entry number field on a creative node can use a safe expression instead of a fixed number. For example, set BeatSin <code>high</code> to <code>h - 2</code> or Random <code>max</code> to <code>w / 2</code>. Preview and firmware both resolve the expression from the active LED output size.
        </div>
        <div className={styles.expressionBox}>
          <div>
            <strong>Geometry values</strong>
            <span><code>w</code>, <code>h</code>, <code>num_leds</code>, <code>max_x</code>, <code>max_y</code>, <code>center_x</code>, <code>center_y</code>, <code>min_dim</code>, <code>max_dim</code>, <code>aspect</code></span>
          </div>
          <div>
            <strong>Math values and helpers</strong>
            <span><code>pi</code>, <code>tau</code>, arithmetic, parentheses, <code>min()</code>, <code>max()</code>, <code>floor()</code>, <code>ceil()</code>, and <code>round()</code></span>
          </div>
        </div>
        <div className={styles.note}>
          <code>w</code> and <code>h</code> are pixel counts; the last valid coordinates are <code>max_x</code> (<code>w - 1</code>) and <code>max_y</code> (<code>h - 1</code>). Invalid expressions are outlined and block export or upload. Sliders and hardware setup fields remain literal values.
        </div>
        <div className={styles.note}>
          The <strong>Custom Formula</strong> and <strong>Field Formula</strong> nodes use a separate, larger per-pixel language with its own variables and FastLED helpers — see their Node Reference entries. Like the fields above, a formula that does not parse renders blank and blocks export or upload, in preview and in generated firmware alike.
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Beyond the canvas</div>
        <div className={styles.choiceGrid}>
          <div className={styles.choiceCard}>
            <strong>Plan the physical build</strong>
            <span>Open <strong>View → Build Diagram</strong> for a wiring workspace built from your graph: a scale controller with its real pin map, power distribution and fuses, a parts list and connection list you can export as CSV, the diagram itself as SVG, and paginated print sheets for the bench.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>Record the preview</strong>
            <span>Use <strong>⏺ Record</strong> in the LED Preview header to save a PNG still, or an animated GIF or WebM clip. Clips render offline from a clean start, so simulations can warm up first and loops can be made seamless. An audio-reactive graph can capture the live microphone while it records.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>Review saved patterns</strong>
            <span>The Pattern Library keeps your own 1–5 star ratings, and <strong>Scan patterns</strong> adds a Studio Score judged against the intent it infers — ambient, showpiece, accent, audio-reactive, or static utility — which you can also set yourself. Sort or filter a collection by either signal. A scan asks before running any pattern holding Formula or Code nodes, and remembers your answer.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>Drive several outputs</strong>
            <span>Use <strong>Add Hardware → LED outputs</strong> to add separate LED routes from one board. Each has its own pins, size, layout, and render options; master brightness and power remain controller-wide Board settings. Click an output in the workbench to choose which route the side preview shows.</span>
          </div>
        </div>
        <div className={styles.note}>
          <strong>Rearranging the workspace:</strong> <strong>View → Layout</strong> resizes the panels for what you are doing — <strong>Build</strong> gives the node library the most room, <strong>Tune</strong> narrows it in favour of the preview, and <strong>Preview</strong> hides the library altogether for the largest LED preview short of Stage View. The same menu holds the appearance toggles: theme, motion, contrast, UI effects, and signal dimming.
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Build a show</div>
        <div className={styles.choiceGrid}>
          <div className={styles.choiceCard}>
            <strong>Self-running generative show</strong>
            <span>Add saved patterns to Pattern Collection, connect it to Music Player, then connect the player&apos;s frame to the LED output. Add Control Map when buttons or knobs should operate playback, volume, LED power, or brightness; add Player Particles when the show needs a configurable beat overlay.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>Music-synced SD show</strong>
            <span>Drop tracks into Music Library — they analyse as they land — build the timeline in Performance Generator, add an <strong>SD Card</strong> part in the hardware view, then <strong>Upload</strong>. That writes the songs and shows to the card and flashes the player.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>Physical controls</strong>
            <span>Blackout, dimming and pattern intent are wires, not project settings. A knob or button goes into <strong>Control Map</strong>, which asks what that control should do and mints the port it names, and its <strong>Controls</strong> bundle then reaches an LED output&apos;s latch, a Pattern Slideshow&apos;s cursor, or Music Player&apos;s transport. The <strong>Dimmer and Blackout</strong> and <strong>Browse a Slideshow</strong> starters arrive with both ends already wired.</span>
          </div>
        </div>
      </div>
    </>
  )
}

function HardwareTab() {
  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>The hardware workbench</div>
        <div className={styles.lede}>
          The lower pane is the physical side of the project. It shows the selected board and the parts connected to it at a shared real-world scale; the graph above shows the signal path that makes those parts useful.
        </div>
        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNum}>1</div>
            <div className={styles.stepText}>
              <strong>Choose the board.</strong> Click the board, choose its family and exact profile, and use the eye button to inspect its reviewed pinout. The profile—not only the chip name—is what makes pin advice match the headers on the board in your hand.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>2</div>
            <div className={styles.stepText}>
              <strong>Add what is on the bench.</strong> Use <strong>Add Hardware</strong> for inputs and sensors, storage, amplifiers or DACs, and LED strings, matrices, rings, corkscrew installations, or HUB75 panels. Studio assigns suitable starting pins where the board profile knows them.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>3</div>
            <div className={styles.stepText}>
              <strong>Configure the wiring.</strong> Click a part to open its wiring inspector. Pin pickers prefer compatible, unoccupied GPIOs and label conflicts or caution pins; <strong>Other GPIO…</strong> remains available for deliberate hand wiring.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>4</div>
            <div className={styles.stepText}>
              <strong>Connect the signal.</strong> Inputs, sensors, clocks, and LED outputs also appear as nodes in the graph. Wire those nodes normally. Board, SD Card, and amplifier/DAC parts stay only in the workbench because they carry configuration rather than a graph signal.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>5</div>
            <div className={styles.stepText}>
              <strong>Deploy from the same pane.</strong> Select the <strong>Upload</strong> tab for readiness, capacity, firmware, diagnostics, live streaming, and the embedded Output/Serial console.
            </div>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>One component, two views</div>
        <div className={styles.definitionGrid}>
          <div><strong>Hardware view</strong><span>Owns which physical parts exist, their exact module variants, board attachment, and wiring assignments.</span></div>
          <div><strong>Graph view</strong><span>Owns signal flow. A microphone, sensor, RTC, or LED output appears here because it sends or receives data.</span></div>
          <div><strong>LED output node</strong><span>Owns composition-facing choices such as dimensions, frame route, physical layout, colour correction, dithering, and supersampling.</span></div>
          <div><strong>Board settings</strong><span>Apply once to every output: master brightness, clockless LED overclock, power cap, PSRAM policy, and—in supported ESP32 builds—serial routing.</span></div>
        </div>
        <div className={styles.note}>
          Delete or Backspace disconnects a hardware-managed node while leaving the physical part on the bench. To remove both views, use <strong>Delete</strong> in the node's right-click menu, or right-click the part in the hardware workbench and choose <strong>Remove</strong>.
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Changing boards and pins</div>
        <div className={styles.choiceGrid}>
          <div className={styles.choiceCard}>
            <strong>Automatic retargeting</strong>
            <span>When the board changes, Studio moves only assignments it originally chose. A GPIO you selected yourself is remembered for that part on that board.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>PSRAM Auto</strong>
            <span>Auto uses external render buffers only when the exact profile records a safe PSRAM interface. Use On or Off only when you need to override that evidence.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>Serial Auto</strong>
            <span>On native-USB ESP32 targets, Auto examines the selected port and chooses native USB or a UART bridge. Override it only when the device identity is ambiguous.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>True-scale view</strong>
            <span>Use −, +, and Fit to navigate the bench. Drag the horizontal divider to give the graph or hardware more room; the arrangement and zoom are preserved.</span>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Hardware view versus Build Diagram</div>
        <div className={styles.text}>
          The workbench answers <em>what is connected to this board?</em> Its links are automatic and are not a wiring plan. <strong>View → Build Diagram</strong> answers <em>how should I assemble it?</em> with pin-level connections, power distribution, fuses, parts and connection lists, SVG export, and printable sheets.
        </div>
        <div className={styles.note}>
          Profiled and catalogued hardware is still not a support promise. Graph Health reports compatibility issues, while the beta support matrix records the exact board, peripheral, LED, operating-system, browser, engine, and workflow combinations tested on real hardware.
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
          <div className={styles.kbd}><span className={styles.key}>Ctrl/Cmd</span><span className={styles.key}>Z</span></div>
          <div className={styles.shortcutDesc}>Undo</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl/Cmd</span><span className={styles.key}>Y</span></div>
          <div className={styles.shortcutDesc}>Redo</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl/Cmd</span><span className={styles.key}>Shift</span><span className={styles.key}>Z</span></div>
          <div className={styles.shortcutDesc}>Redo (alternative)</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl/Cmd</span><span className={styles.key}>S</span></div>
          <div className={styles.shortcutDesc}>Save the current project (or open Projects if none is active)</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl/Cmd</span><span className={styles.key}>A</span></div>
          <div className={styles.shortcutDesc}>Select all nodes</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl/Cmd</span><span className={styles.key}>C</span></div>
          <div className={styles.shortcutDesc}>Copy the selected node or multi-selection, including internal connections</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl/Cmd</span><span className={styles.key}>V</span></div>
          <div className={styles.shortcutDesc}>Paste the copied patch near the view centre</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl/Cmd</span><span className={styles.key}>D</span></div>
          <div className={styles.shortcutDesc}>Duplicate the focused node</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl/Cmd</span><span className={styles.key}>G</span></div>
          <div className={styles.shortcutDesc}>Group the selected nodes (opens the naming dialog)</div>
          <div className={styles.kbd}><span className={styles.key}>Del</span><span className={styles.key}>Backspace</span></div>
          <div className={styles.shortcutDesc}>Delete selected node(s)</div>
          <div className={styles.kbd}><span className={styles.key}>Esc</span></div>
          <div className={styles.shortcutDesc}>Closes one layer at a time, in this order: this dialog or an open menu, the Control Deck, Stage fullscreen, Stage View, the Build Diagram, Live Focus, and finally the canvas selection</div>
          <div className={styles.kbd}><span className={styles.key}>?</span></div>
          <div className={styles.shortcutDesc}>Open this Help dialog (F1 also works)</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl/Cmd</span><span className={styles.key}>K</span></div>
          <div className={styles.shortcutDesc}>Open the node search picker at the view centre</div>
          <div className={styles.kbd}><span className={styles.key}>F8</span></div>
          <div className={styles.shortcutDesc}>Toggle the Control Deck (pinned controls, scenes, MIDI/keyboard bindings, and panic).</div>
          <div className={styles.kbd}><span className={styles.key}>F9</span></div>
          <div className={styles.shortcutDesc}>Toggle Live Focus (hides editing chrome and emphasizes live signal flow)</div>
          <div className={styles.kbd}><span className={styles.key}>F10</span></div>
          <div className={styles.shortcutDesc}>Toggle Stage View (preview-first operator view; fullscreen is available inside Stage)</div>
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
          <div className={styles.kbd}><span className={styles.key}>Ctrl/Cmd</span><span className={styles.key}>Scroll</span></div>
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

/*
 * Displays.
 *
 * Written for what the app does today. Touch and control routing were left as
 * short "being rebuilt" notes while their model was changing, on the grounds
 * that a help page documenting the previous week is worse than one with a gap
 * in it; both are now written against the shipped model: two nodes for a touch
 * panel, direct wires to the owner, and Control Map as the optional compact bundle.
 *
 * What stays a note is the one thing still genuinely absent: serial output and
 * runtime debug readings on a panel.
 */
function DisplaysTab() {
  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>What a display can show</div>
        <div className={styles.lede}>
          Displays are output devices. They show what something else tells them to show, the same way an LED output renders the frame it is given.
        </div>
        <div className={styles.text}>
          <strong>Information displays</strong> are the small ones — 7-segment digits and the 128x64 OLED family. They take one Display wire from a source (RTC Clock, Music Player, Pattern Slideshow, or an LED output) and draw the reading that source publishes. A 4-digit module can show a clock, a number, or an LED output as whole percent of effective brightness; an OLED has room for a line of text beside it. What the module can physically do decides what it is offered, so you cannot ask a segment display for artwork.
        </div>
        <div className={styles.text}>
          <strong>Colour panels</strong> (ST7789 and friends) take the same single Display wire and draw a fuller version of the same reading — a clock face, a now-playing screen with artwork, a show status, or LED Status for a fixture. The presentation is a property on the panel; the content is whatever is wired in.
        </div>
        <div className={styles.note}>
          One wire, not fourteen. A Music Player publishes its whole reading — title, artist, elapsed, artwork, which pattern is playing — as a single Display signal. Wire that one cable and the panel has everything. Song Info unpacks individual fields onto their own wires when you genuinely need one on a cable.
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Creating a custom user interface</div>
        <div className={styles.text}>
          A colour panel can draw a screen you design instead of one of the fixed presentations. Set the panel's Layout to Custom design and choose Edit screen design (a fixed layout sets the design aside, and choosing Custom design brings it back): you get a canvas the exact size of the glass, a palette of widgets down the side, and a theme picker.
        </div>
        <div className={styles.text}>
          Place readouts for things the panel is being told — text, numbers, a timecode, a progress bar, a meter — and controls for things a finger can change. Design shows you the layout; Run leaves the designer and floats a live touch screen on the graph, so you can drive wired properties and watch the LED preview before any hardware exists.
        </div>
        <div className={styles.text}>
          Each readout has a <strong>Reads</strong> row in the inspector, listing what the panel&rsquo;s own source publishes — Title, Artist, Elapsed and so on for a Music Player; Time and Date for an RTC Clock. Pick one and the widget takes that reading straight off the wire already feeding the panel, with no cable of its own. Choose <strong>A wire from the graph</strong> instead and the widget mints a socket on the panel for you to connect anything else to.
        </div>
        <div className={styles.text}>
          The <strong>Templates</strong> shelf is ordered the same way: the layouts your panel&rsquo;s source can fill are listed first. Place <strong>Now Playing</strong> on a panel wired to a Music Player and it is already showing the track — the readings arrive connected. When the destination is unambiguous, <strong>Connect template controls</strong> draws the button and slider wires as ordinary graph edges (Volume straight to the player, Play/Pause through a Changed Trigger, Blackout through a Not) without overriding a connection you already made.
        </div>
        <div className={styles.note}>
          The design belongs to the panel it is drawn on, so its size, rotation and colour depth are settled facts rather than choices. A design made for a 240x320 panel cannot be silently half off the edge of a 240x240 one.
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Turning displays on and off</div>
        <div className={styles.text}>
          Every display has an <strong>Enabled</strong> input. Leave it unwired and the display is always on. Wire a button, a schedule or any on/off signal to it and you can darken the screen without removing it from the build: the panel goes dark, touch stops being read, and anything the screen publishes rests at zero.
        </div>
        <div className={styles.text}>
          It stays compiled either way, so a screen switched off at night comes back in the morning without reflashing. This is a runtime signal, not a build option.
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Using touch input</div>
        <div className={styles.lede}>
          A touch panel is two chips: the screen, and a digitiser sitting over the glass reading where your finger is. So it arrives as two nodes.
        </div>
        <div className={styles.text}>
          Add a touch-capable panel from <strong>Add Hardware → Displays</strong> and you get the <strong>Display Panel</strong> and a <strong>Touch</strong> node together, already linked. You never wire them to each other or type which panel the Touch node reads — they are one part, and taking it off the shelf was the one decision. The panel keeps all the pins, including the digitiser&rsquo;s five lines, because that is where the Build Diagram and the pin checker look for them.
        </div>
        <div className={styles.text}>
          The Touch node has a compact <strong>Controls</strong> output and, when the fixed presentation has controls, named outputs for the same jobs. A <strong>Fixed Transport</strong> screen gives you Previous, Play/Pause, Next and a volume strip; a <strong>Now Playing</strong> screen gives play/pause and volume. Wire a named action directly to the thing that owns it, or send the bundle through <strong>Control Map</strong> when you want one cable or continuous volume.
        </div>
        <div className={styles.text}>
          A panel showing a <strong>screen design</strong> is different: the design owns the touch. Its Buttons, Toggles, Sliders and Dials each publish on their own output on the companion Touch node. The controls a template placed — Previous, Play, Next, Volume, Brightness and Blackout — also travel on <strong>Controls</strong>, so a Now Playing screen drives Music Player through that one wire. A control whose own output you have wired keeps that job and leaves the bundle, so nothing fires twice.
        </div>
        <div className={styles.note}>
          Touch follows <strong>Enabled</strong>. A dark panel is not read, and the Controls output rests at zero rather than holding the last thing anybody pressed.
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Connecting controls to displays</div>
        <div className={styles.lede}>
          Controls do not belong to displays. A screen, a button on a bench and a knob on a panel all produce the same thing: a typed wire that can go straight to its owner, or through <strong>Control Map</strong> when you want a compact bundle. Right-click a runtime field and choose <strong>Expose input</strong> to draw that socket; dragging onto the property row exposes and connects it in one step.
        </div>
        <div className={styles.text}>
          Drop a Control Map and it starts almost empty: one <strong>Controls In</strong> input for chaining, and one trailing <strong>Connect control…</strong> socket. Drag any control into that socket and a picker asks what the control is for. Choose, and the node grows a port named for the job — Play / Pause, Volume, Brightness, Next Pattern — with a fresh empty socket beneath it. You end up with a node that lists exactly the jobs you have given it instead of fourteen sockets you have to read past.
        </div>
        <div className={styles.text}>
          The picker only offers what makes sense, which is narrower than what would merely connect:
        </div>
        <div className={styles.definitionGrid}>
          <div><strong>By what it is</strong><span>A button can be Play / Pause or Next; only a knob or a slider can be Volume. A button wired to Volume would set it to 0 or 1 and nothing between, so it is not offered.</span></div>
          <div><strong>By where the cable ends</strong><span>Play / Pause needs something holding a track. If the Control Map reaches only an LED output, you are offered its blackout and dimmer and no transport at all.</span></div>
          <div><strong>One job per control</strong><span>A press is one event. A button already doing Brightness Up is not offered Brightness Down, which would fire both in the same frame and cancel out.</span></div>
        </div>
        <div className={styles.text}>
          Then wire the Control Map&rsquo;s <strong>Controls</strong> output at whatever should obey it. A <strong>Music Player</strong> takes everything — transport, volume, its lamp, its collection. An <strong>LED output</strong> takes blackout and dimming and remembers its own level, so two fixtures on one Control Map both go dark on a press. A <strong>Pattern Slideshow</strong> takes pattern intent and has no transport, because it is a show rather than a player. <strong>Master Speed</strong> takes a speed.
        </div>
        <div className={styles.note}>
          Chain them with <strong>Controls In</strong> when controls live in different places — three buttons on the bench and a touch screen on the door. Presses combine rather than fight: either end pressing Play means play, and a knob wired nearer wins over one further away, because the nearer one is what somebody just touched.
        </div>
        <div className={styles.note}>
          Port colour is the data type, before and after a connection. Dragging highlights compatible targets and names conversions such as Map Range; it does not recolour the socket. A held button is a pulse; a Toggle stores on/off. Mixing the two for Play/Pause or Blackout is what the visible adapter nodes are for.
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Using displays for diagnostics</div>
        <div className={styles.text}>
          Every colour panel offers a <strong>Diagnostics</strong> presentation: colour bars to prove the panel is wired and oriented correctly, plus live touch state and the raw controller coordinates behind it. It is the fastest way to tell a dark panel from a mis-wired one.
        </div>
        <div className={styles.note}>
          <strong>More to come.</strong> Showing serial output and runtime debug readings on a panel — the way the microphone reports its own levels — is wanted but not built.
        </div>
      </div>
    </>
  )
}

function UploadTab() {
  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Choose the result you want</div>
        <div className={styles.choiceGrid}>
          <div className={styles.choiceCard}>
            <strong>Run this design on LEDs</strong>
            <span>Choose <strong>Upload</strong>. Studio generates, compiles, and flashes a standalone FastLED sketch.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>Check new wiring</strong>
            <span>Choose <strong>Flash Wiring Test</strong> before the real design. It verifies colour order, orientation, layout, and brightness.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>Iterate without recompiling</strong>
            <span>Flash <strong>Stream Receiver</strong> once, then use <strong>Live Stream</strong> to send preview frames over the serial connection.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>Compile elsewhere</strong>
            <span>Use <strong>View Code</strong> to inspect the sketch or <strong>Export .ino</strong> to download it for Arduino IDE or another toolchain.</span>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Before the first upload</div>
        <div className={styles.tipList}>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>1</div>
            <div className={styles.tipText}>
              <strong>Start the local helper.</strong> The portable desktop build starts it automatically. For a source checkout, use the platform launcher or run <code>npm run helper</code>.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>2</div>
            <div className={styles.tipText}>
              <strong>Connect the board by USB</strong> and accept any operating-system permission prompt. Choose the exact board in the <strong>Hardware</strong> tab, then select its detected port from the board control in the <strong>Upload</strong> tab.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>3</div>
            <div className={styles.tipText}>
              <strong>Let the build engine prepare.</strong> Studio recommends <strong>arduino-cli</strong> for ESP32 targets while fbuild's confirmed no-op delay remains unresolved.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>4</div>
            <div className={styles.tipText}>
              <strong>For arduino-cli,</strong> install the board core and FastLED library. The helper can locate or download <code>arduino-cli</code>, but its libraries and cores are managed separately. <strong>fbuild</strong> remains available in Board &amp; Port as an explicit experimental choice and manages its own toolchains.
            </div>
          </div>
        </div>
        <div className={styles.note}>
          Open the <strong>Upload</strong> tab. <strong>Getting to your board</strong> lists the steps from your patch to the board — Preview, Graph, Capacity and Connection — and each opens to say what comes next. Expand <strong>Build tools &amp; port</strong> for the helper, engine, toolchain and port, with a repair action where one is available.
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Upload a design</div>
        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNum}>1</div>
            <div className={styles.stepText}>
              In <strong>Hardware</strong>, confirm the exact board and click the LED output to inspect its pins. On the graph node, confirm LED dimensions, chipset, layout, routing, and render options.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>2</div>
            <div className={styles.stepText}>
              Select the workbench&apos;s <strong>Upload</strong> tab. Check <strong>Getting to your board</strong> and <strong>Build tools &amp; port</strong>, and run <strong>Check capacity</strong> for a measured flash/RAM result. Resolve blocking items before continuing.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>3</div>
            <div className={styles.stepText}>
              On new or changed hardware, run <strong>🧪 Flash Wiring Test</strong>. Confirm red, green, blue, brightness, orientation, panel labels, and the logical/physical pixel chases before flashing the design. For a folded HUB75 grid, use <strong>🧭 Flash HUB75 Topology</strong> and verify every panel’s X/Y label, four corner colours, rotation, chain number, and yellow direction arrow.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>4</div>
            <div className={styles.stepText}>
              Click <strong>Upload</strong>. Status moves from <em>Compiling…</em> to <em>Uploading NN%</em> to <em>✓ Done</em>. Read the embedded <strong>Output</strong> log below the actions, or switch it to <strong>Serial</strong>; use <strong>Re-upload last sketch</strong> to repeat the current project&apos;s last successful upload without regenerating it.
            </div>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>If an upload fails</div>
        <div className={styles.definitionGrid}>
          <div><strong>Compile failed</strong><span>No firmware reached the board. Read the Upload tab&apos;s Output console, fix the reported graph, dependency, or capacity error, then compile again.</span></div>
          <div><strong>Upload failed</strong><span>The sketch compiled, but flashing failed. Recheck the selected port, USB cable, driver, permissions, and any board-specific download-mode steps.</span></div>
          <div><strong>Wrong colours or order</strong><span>Run Wiring Test and correct colour order, serpentine direction, panel layout, or custom XY map in the LED output.</span></div>
          <div><strong>Preview works, LEDs do not</strong><span>Confirm data and clock pins, common ground, external power, chipset, brightness, and power-limit settings before changing the graph.</span></div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Export without uploading</div>
        <div className={styles.text}>
          Click <strong>View Code</strong> in the LED output node to inspect the exact sketch that would be uploaded, or <strong>Export .ino</strong> to download it. Open it in the Arduino IDE or compile with <code>arduino-cli compile --fqbn &lt;board&gt; sketch.ino</code>.
        </div>
        <div className={styles.text}>
          The generated sketch targets FastLED and does not need Studio or the helper at runtime. Compatibility still depends on the selected board, chipset, libraries, pins, memory, and any node-specific hardware support; check Graph Health and the beta support matrix rather than assuming every combination is validated.
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Music-synced SD show</div>
        <div className={styles.text}>
          Add an <strong>SD Card</strong> part in the hardware view, then build a timeline with Music Library and Performance Generator. Upload flashes a dedicated player sketch that reads the card, rather than the normal sketch — keep ordinary generative shows on the normal <strong>Upload</strong> path.
        </div>
        <div className={styles.text}>
          Songs reach the card one of two ways. By default they go over USB serial, which is reliable everywhere but takes minutes per track. Tick <strong>Card reader available</strong> and Studio pauses to ask you to move the card to a reader, writes the files directly, and asks for it back before flashing — seconds instead of minutes. Either way, a song already on the card at the same size is skipped, so re-uploading a changed show does not re-send the music.
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>If the SD card show does not play</div>
        <div className={styles.text}>
          The player prints a status line every two seconds. In the Upload tab&apos;s embedded console, select <strong>Serial</strong>, connect, and read the <code>sd=</code> field first — it separates a card problem from everything else, and you can attach the monitor at any time rather than having to catch the board booting.
        </div>
        <div className={styles.definitionGrid}>
          <div>
            <strong><code>sd=MISSING</code></strong>
            <span>The card never mounted. Check it is seated, formatted <strong>FAT32</strong> (not exFAT — a 64&nbsp;GB card is usually exFAT out of the box, so reformat it), that the module has 3.3&nbsp;V power and a common ground, and that the CS, SCK, MOSI, and MISO pins on the SD Card part match how it is wired. The board keeps retrying once a second, so reseating the card or fixing the wiring recovers it without a reset.</span>
          </div>
          <div>
            <strong><code>sd=ok</code>, <code>audioPos</code> stuck at 0</strong>
            <span>The card mounted but nothing is playing. Usually there is no matching pair on it: the player needs <code>/music/&lt;name&gt;.mp3</code> <em>and</em> <code>/shows/&lt;name&gt;.show</code> with the same name. A lone MP3 left from an earlier session is skipped on purpose, so the wrong song can never run against the wrong show.</span>
          </div>
          <div>
            <strong><code>audioPos</code> climbing, LEDs dark</strong>
            <span>Audio and show sync are fine, so this is an LED problem, not an SD one. Work through <em>Preview works, LEDs do not</em> above — data pin, common ground, external power, chipset, brightness.</span>
          </div>
          <div>
            <strong>Audio plays but LEDs lag or jump</strong>
            <span><code>event</code> should advance alongside <code>audioPos</code>. If it does not, the <code>.show</code> file on the card is older than the timeline you edited — re-upload. Editing events in the timeline marks that song so option changes stop regenerating it; use <strong>Revert</strong> to rebuild from the analysis.</span>
          </div>
          <div>
            <strong>Upload says the board never reported READY</strong>
            <span>Serial transfers need the player already flashed and running. If the board says <code>ERR sd-mount-failed</code>, fix the card first — there is nowhere to write the files. A serial monitor left open on the same port also blocks the transfer.</span>
          </div>
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
          <div className={styles.tip}>
            <div className={styles.tipIcon}>◇</div>
            <div className={styles.tipText}>
              <strong>In an untrusted project the listener stays closed.</strong> The port to listen on is stored in the node, so a shared graph could otherwise open a network socket on your machine before you had looked at it. The node says <em>listener held</em> until you choose <strong>Trust it</strong>.
            </div>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>RTC clock and scheduling hardware setup</div>
        <div className={styles.text}>
          An <strong>RTC Clock</strong> node publishes calendar fields and a <code>valid</code>/<code>synced</code>/<code>stale</code> status; <strong>Schedule Trigger</strong> and <strong>Clock Display</strong> read it through ordinary ports. <strong>Experimental</strong> — the software clock, NTP sync, and DS3231 path still need recorded hardware passes.
        </div>
        <div className={styles.tipList}>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>◇</div>
            <div className={styles.tipText}>
              Pick a <strong>time source</strong> on the RTC Clock node. <strong>Compile Time</strong> and <strong>Manual</strong> work on every board with no network, but are marked unsynced/stale because they cannot retain trustworthy time across power cycles. Manual remains useful for rehearsing schedules. <strong>NTP</strong> needs a Wi-Fi-capable board (ESP32-family or ESP8266) plus an SSID, password, and NTP server. <strong>DS3231</strong> reads a battery-backed module at I²C address <code>0x68</code> through the board&apos;s default SDA/SCL pins and needs no extra Arduino library.
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
              For a DS3231, connect <strong>3V3</strong>, <strong>GND</strong>, <strong>SDA</strong>, and <strong>SCL</strong> to the board&apos;s labelled default I²C pins; the RTC node and Build Diagram show the exact reviewed pads for the selected board. After uploading the current sketch, <strong>Set from computer</strong> writes the computer&apos;s local date and time through the selected USB port. Studio never changes it automatically. The browser simulates a healthy module; on firmware, <code>valid</code> confirms a readable calendar value, <code>synced</code> means the DS3231 oscillator-stop flag is clear, and <code>stale</code> warns that the module lost time or a previously working I²C read failed. Avoid assigning those SDA/SCL pins to a non-I²C peripheral.
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
          Studio ships dozens of exact board profiles and compile targets, plus any custom target you add. They cover the <strong>ESP32</strong> family (S3, S2, C3, C6, H2, classic, DevKit v1), <strong>ESP8266</strong>, <strong>Arduino</strong> AVR and SAMD boards, <strong>Teensy</strong>, <strong>RP2040/RP2350</strong>, <strong>Adafruit</strong> SAMD21/SAMD51 boards, <strong>STM32</strong>, and the <strong>nRF52840 DK</strong>. Choose the physical profile from the board in Hardware; use the Upload tab&apos;s board control for build engine, port, custom targets, and core updates.
        </div>
        <div className={styles.text}>
          A catalogue entry means Studio knows how to target the board; it does not mean every feature and LED configuration has been tested on it. Entries marked <em>experimental</em> in the list are the least proven.
        </div>
        <div className={styles.text}>
          Recorded public-beta validation includes <strong>ESP32-S3 + 16×16 WS2812B matrix</strong> across normal Upload, Wiring Test, Live Stream, generative show, and INMP441 audio; <strong>ESP8266 + 10×1 WS2812B strip</strong> across Upload, Wiring Test, and Live Stream; classic ESP32 matrix upload; and a classic ESP-32D DevKit v1 with DS3231 clock display. Treat every unrecorded combination as experimental and check the <a className={styles.link} href={`${REPO_URL}/blob/Hardware/docs/release/beta-support-matrix.md`} target="_blank" rel="noopener noreferrer">beta support matrix</a> for the exact scope.
        </div>
      </div>
    </>
  )
}

// Same list AppDialogHost traps against — Help is a modal dialog too, so it
// owes the keyboard the same containment the other dialogs already give it.
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('hidden'))
}

export default function HelpModal() {
  const { closeHelp, helpTab, setHelpTab } = useUiStore()
  const modalRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef(new Map<HelpTab, HTMLButtonElement>())
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const panelId = useId()
  const tabId = (id: HelpTab) => `${panelId}-tab-${id}`

  // Remember what opened Help (the ? button, a menu item, or whatever had
  // focus when F1 was pressed) and hand focus back on close, so dismissing
  // the dialog doesn't dump keyboard users at the top of the document.
  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const timer = window.setTimeout(() => tabRefs.current.get(helpTab)?.focus(), 0)
    return () => {
      window.clearTimeout(timer)
      const target = restoreFocusRef.current
      restoreFocusRef.current = null
      if (target?.isConnected) target.focus()
    }
    // Mount/unmount only: re-running on tab change would steal focus back to
    // the tab strip every time someone tabs into the panel and switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeHelp() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [closeHelp])

  // Roving focus across the tab strip, matching the MenuBar convention.
  function handleTabKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((t) => t.id === helpTab)
    let next = -1
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    else return
    e.preventDefault()
    const target = TABS[next].id
    setHelpTab(target)
    tabRefs.current.get(target)?.focus()
  }

  // Keep Tab inside the dialog. `aria-modal` already hides the workbench from
  // assistive tech, but without this the keyboard still walks out into the
  // canvas behind an apparently-modal dialog.
  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return
    const items = focusableElements(modalRef.current)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement as HTMLElement | null
    if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeHelp() }}>
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-labelledby={titleId}
        aria-modal="true"
        onKeyDown={handleKeyDown}
      >
        <div className={styles.header}>
          <span className={styles.title} id={titleId}>Design Studio for FastLED — Help</span>
          <button className={styles.closeBtn} onClick={closeHelp} title="Close (Esc)" aria-label="Close help">×</button>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Help sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => { if (el) tabRefs.current.set(t.id, el); else tabRefs.current.delete(t.id) }}
              role="tab"
              id={tabId(t.id)}
              aria-selected={helpTab === t.id}
              aria-controls={panelId}
              // Roving tabindex: one stop for the whole strip, arrows move
              // within it — otherwise Tab has to walk every section before
              // reaching the content.
              tabIndex={helpTab === t.id ? 0 : -1}
              className={`${styles.tab} ${helpTab === t.id ? styles.tabActive : ''}`}
              onClick={() => setHelpTab(t.id)}
              onKeyDown={handleTabKeyDown}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          className={`${styles.body} ${helpTab === 'nodes' ? styles.bodyNodeReference : ''}`}
          role="tabpanel"
          id={panelId}
          aria-labelledby={tabId(helpTab)}
          // The panel scrolls, so it needs to be reachable by keyboard even
          // when a section holds nothing focusable of its own.
          tabIndex={0}
        >
          {helpTab === 'quickstart' && <QuickStartTab />}
          {helpTab === 'hardware' && <HardwareTab />}
          {helpTab === 'displays' && <DisplaysTab />}
          {helpTab === 'shortcuts' && <ShortcutsTab />}
          {helpTab === 'nodes' && <NodeReference />}
          {helpTab === 'upload' && <UploadTab />}
          {helpTab === 'about' && <AboutTab />}
        </div>
      </div>
    </div>
  )
}

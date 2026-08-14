import { useEffect } from 'react'
import { useUiStore } from '../../state/uiStore'
import styles from './HelpModal.module.css'
import NodeReference from './NodeReference'
import type { HelpTab } from '../../state/uiStore'
import firstPatchScreenshot from '../../../docs/images/readme/design-studio-patch.png'

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
        <div className={styles.sectionTitle}>Your first working patch</div>
        <div className={styles.lede}>
          Every design follows the same path: make a frame, connect it to <strong>Matrix Output</strong>, check the preview, then choose whether to keep designing, export code, or run it on LEDs.
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
              <strong>Check the frame path.</strong> The starter connects <code>Juggle.frame</code> to <code>Matrix Output.frame</code>. A frame connection is cyan; drag from the output handle on the right of Juggle to the matching input on the left of Matrix Output if it is missing.
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
              <strong>Match your LEDs.</strong> Open <strong>✦ Setup…</strong> on Matrix Output and set the grid or strip size, chipset, layout, and pins. These settings control the preview dimensions and the generated firmware.
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
            src={firstPatchScreenshot}
            alt="Design Studio workspace showing the Node Library, a Rainbow node connected to Matrix Output, and the live LED Preview"
          />
          <figcaption>
            A complete two-node patch: choose nodes in the library on the left, connect them on the canvas, and confirm the result in LED Preview on the right.
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
            <span>Connect Microphone to FFT Analyzer or Beat Detect, then wire the resulting values into a pattern, math, or composite node. Allow microphone access when prompted.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>Find the right node</strong>
            <span>Press <kbd className={styles.inlineKey}>Ctrl/Cmd K</kbd>, double-click empty canvas, or search the Node Library. The Node Reference tab explains every port and property.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>Fix an incomplete graph</strong>
            <span>Open Graph Health for node-specific repair steps. A design needs a complete frame path into Matrix Output before it can export or upload.</span>
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
          A share link, an imported graph, a project file, or a pattern dropped from the library arrives <strong>untrusted</strong>, because it can contain code and network settings written by whoever made it. Your own saved projects are unaffected. Studio holds the risky parts back until you choose <strong>Trust and run</strong> in the banner.
        </div>
        <div className={styles.definitionGrid}>
          <div><strong>Formula and Code nodes</strong><span>Render blank in the preview. Everything else — patterns, effects, fields, audio — runs normally, so most shared patches look completely finished.</span></div>
          <div><strong>DMX / Art-Net</strong><span>No network listener is opened, since the port to listen on is part of the shared file.</span></div>
          <div><strong>Export and upload</strong><span>Allowed, but Studio asks first. Generated firmware runs directly on your board with no sandbox around it.</span></div>
        </div>
        <div className={styles.note}>
          Trusting is remembered per project. Before trusting something you did not write, it is worth reading its Formula and Code nodes — and <strong>‹/› View Code</strong> shows the exact sketch any upload would flash.
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Dimension-aware numeric expressions</div>
        <div className={styles.text}>
          A free-entry number field on a creative node can use a safe expression instead of a fixed number. For example, set BeatSin <code>high</code> to <code>h - 2</code> or Random <code>max</code> to <code>w / 2</code>. Preview and firmware both resolve the expression from the active Matrix Output size.
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
            <span>Open <strong>View → Build Diagram</strong> for a wiring workspace built from your graph: a scale controller with its real pin map, power distribution and fuses, a parts list and connection list you can export as CSV, and printable assembly sheets.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>Record the preview</strong>
            <span>Use <strong>⏺ Record</strong> in the LED Preview header to save a PNG still, or an animated GIF or WebM clip. Clips render offline from a clean start, so simulations can warm up first and loops can be made seamless.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>Review saved patterns</strong>
            <span>The Pattern Library keeps your own 1–5 star ratings, and <strong>Scan patterns</strong> adds a Studio Score judged against what each pattern is for. Sort or filter a collection by either.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>Drive several outputs</strong>
            <span>Add more than one Matrix Output to run separate LED routes from one board, each with its own pins, size, layout, and brightness. The preview header selects which route you are watching.</span>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Build a show</div>
        <div className={styles.choiceGrid}>
          <div className={styles.choiceCard}>
            <strong>Self-running generative show</strong>
            <span>Add saved patterns to Pattern Collection, connect it to Show Engine, then connect the engine's frame to Matrix Output. The engine chooses patterns and transitions while it runs.</span>
          </div>
          <div className={styles.choiceCard}>
            <strong>Music-synced SD show</strong>
            <span>Analyse tracks in Music Library, build the timeline in Performance Generator, connect it through SD Card to Matrix Output, then choose <strong>Upload show to SD</strong>.</span>
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
          <div className={styles.shortcutDesc}>Closes one layer at a time, in this order: this dialog or an open menu, the Performance Deck, Stage mode, the Build Diagram, Performance mode, and finally the canvas selection</div>
          <div className={styles.kbd}><span className={styles.key}>?</span></div>
          <div className={styles.shortcutDesc}>Open this Help dialog (F1 also works)</div>
          <div className={styles.kbd}><span className={styles.key}>Ctrl/Cmd</span><span className={styles.key}>K</span></div>
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
              <strong>Connect the board by USB</strong> and accept any operating-system permission prompt. Select the exact board and detected port in <strong>Matrix Output → Setup…</strong>.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>3</div>
            <div className={styles.tipText}>
              <strong>Let the build engine prepare.</strong> Studio prefers <strong>fbuild</strong>, which downloads its board toolchain on the first compile. This may take longer than later builds.
            </div>
          </div>
          <div className={styles.tip}>
            <div className={styles.tipIcon}>4</div>
            <div className={styles.tipText}>
              <strong>If Studio uses arduino-cli instead,</strong> install the board core and FastLED library. The helper can locate or download <code>arduino-cli</code>, but its libraries and cores are managed separately.
            </div>
          </div>
        </div>
        <div className={styles.note}>
          Open <strong>Upload… → Upload readiness</strong> for the current checklist. It identifies missing helper, engine, toolchain, board, port, graph, and capacity requirements and offers a repair action when one is available.
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Upload a design</div>
        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNum}>1</div>
            <div className={styles.stepText}>
              Use <strong>✦ Setup…</strong> on Matrix Output to confirm the board, port, LED dimensions, chipset, layout, and pins.
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>2</div>
            <div className={styles.stepText}>
              Open <strong>↑ Upload…</strong>. Check <strong>Upload readiness</strong> and the live flash/SRAM capacity reading. Resolve blocking items before continuing.
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
              Click <strong>Upload</strong>. Status moves from <em>Compiling…</em> to <em>Uploading NN%</em> to <em>✓ Done</em>. Open <strong>⌗ Output / Serial</strong> for the full log; use <strong>Re-upload last sketch</strong> to repeat the current project's last successful upload without regenerating it.
            </div>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>If an upload fails</div>
        <div className={styles.definitionGrid}>
          <div><strong>Compile failed</strong><span>No firmware reached the board. Open Output / Serial, fix the reported graph, dependency, or capacity error, then compile again.</span></div>
          <div><strong>Upload failed</strong><span>The sketch compiled, but flashing failed. Recheck the selected port, USB cable, driver, permissions, and any board-specific download-mode steps.</span></div>
          <div><strong>Wrong colours or order</strong><span>Run Wiring Test and correct colour order, serpentine direction, panel layout, or custom XY map in Matrix Output.</span></div>
          <div><strong>Preview works, LEDs do not</strong><span>Confirm data and clock pins, common ground, external power, chipset, brightness, and power-limit settings before changing the graph.</span></div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Export without uploading</div>
        <div className={styles.text}>
          Click <strong>View Code</strong> in the Matrix Output node to inspect the exact sketch that would be uploaded, or <strong>Export .ino</strong> to download it. Open it in the Arduino IDE or compile with <code>arduino-cli compile --fqbn &lt;board&gt; sketch.ino</code>.
        </div>
        <div className={styles.text}>
          The generated sketch targets FastLED and does not need Studio or the helper at runtime. Compatibility still depends on the selected board, chipset, libraries, pins, memory, and any node-specific hardware support; check Graph Health and the beta support matrix rather than assuming every combination is validated.
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Music-synced SD show</div>
        <div className={styles.text}>
          Connect an <strong>SD Card</strong> node to Matrix Output's <code>sdcard</code> input after building a timeline with Music Library and Performance Generator. Then choose <strong>♪ Upload show to SD</strong> to provision the card and flash the player. Keep ordinary generative shows on the normal <strong>Upload</strong> path.
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
              <strong>In an untrusted project the listener stays closed.</strong> The port to listen on is stored in the node, so a shared graph could otherwise open a network socket on your machine before you had looked at it. The node says <em>listener held</em> until you choose <strong>Trust and run</strong>.
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
              Pick a <strong>time source</strong> on the RTC Clock node. <strong>Compile Time</strong> and <strong>Manual</strong> work on every board with no network — Manual seeds from a date/time you type in, and preview runs it forward in real time so you can rehearse a schedule without waiting for the actual hour. <strong>NTP</strong> needs a Wi-Fi-capable board (ESP32-family or ESP8266) plus an SSID, password, and NTP server. <strong>DS3231</strong> reads a battery-backed module at I²C address <code>0x68</code> through the board&apos;s default SDA/SCL pins and needs no extra Arduino library.
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
              For a DS3231, connect <strong>VCC</strong>, <strong>GND</strong>, <strong>SDA</strong>, and <strong>SCL</strong> to the board&apos;s labelled I²C pins. Set a fresh module&apos;s clock once with its vendor/library setup example; generated Studio firmware reads but never overwrites the battery-backed calendar. The browser simulates a healthy module; on firmware, <code>valid</code> confirms a readable calendar value, <code>synced</code> means the DS3231 oscillator-stop flag is clear, and <code>stale</code> warns that the module lost time or a previously working I²C read failed. Avoid assigning those SDA/SCL pins to the LED output or another non-I²C peripheral.
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
          Studio ships around three dozen board targets, plus any custom board you add. They cover the <strong>ESP32</strong> family (S3, S2, C3, C6, H2, classic, DevKit v1), <strong>ESP8266</strong>, <strong>Arduino</strong> AVR and SAMD boards (Uno, Nano, Leonardo, Mega, Nano Every, Due, Zero, Nano 33 IoT, UNO R4 WiFi), <strong>Teensy</strong> LC through 4.1, <strong>RP2040/RP2350</strong> (Pico and Pico 2), five <strong>Adafruit</strong> SAMD21/SAMD51 boards, four <strong>STM32</strong> boards, and the <strong>nRF52840 DK</strong>. Use <strong>⚙ Board</strong> to choose which ones appear in your dropdown.
        </div>
        <div className={styles.text}>
          A catalogue entry means Studio knows how to target the board; it does not mean every feature and LED configuration has been tested on it. Entries marked <em>experimental</em> in the list are the least proven.
        </div>
        <div className={styles.text}>
          The recorded public-beta validation covers <strong>ESP32-S3 + 16×16 WS2812B matrix</strong> (normal Upload, Wiring Test, Stream Receiver + Live Stream, and a generative show — including one driven by an on-device INMP441 microphone) and <strong>ESP8266 + 10×1 WS2812B strip</strong> (normal Upload, Wiring Test, Stream Receiver + Live Stream). Treat other combinations as experimental until they appear in the <a className={styles.link} href={`${REPO_URL}/blob/main/docs/release/beta-support-matrix.md`} target="_blank" rel="noopener noreferrer">beta support matrix</a>.
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

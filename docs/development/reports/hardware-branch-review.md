# Hardware branch review — 2026-09-08

Reviewed local `Hardware` at `09bd307e`, starting from a clean working tree.
This review changes documentation only. It does not fix the implementation
findings below, certify hardware, or change `main`. The ordered implementation
backlog is now [root todo.md](../../../todo.md).

## Assessment

The branch has substantial working infrastructure: exact board and part selection,
root-owned hardware, bus-aware pin validation, native output rendering, explicit
Audio/Storage capabilities, three application generators, fixed displays, a
custom widget editor and LVGL emission. The recent panel/document split is the
right ownership model. It is not yet a complete end-to-end control workflow.

The highest risks are at the boundaries. A valid-looking wire can work in the
browser and be ignored by a template generator; a passing test can still use an
obsolete graph shape. Finish one reliable hardware/control/display journey
before expanding the hardware catalogue or widget palette.

## Findings, in repair order

P1 means broken generated firmware or a silently ineffective control; P2 means
incorrect readiness feedback or a material authoring limitation. Source links
refer to the reviewed revision. These are findings, not fixes.

### F1 · P1 · Slideshow pattern controls do not reach generated playback

Reproduction: Button → Player Controls Pattern Next → Pattern Slideshow
Controls, with Collection → Slideshow → LED output. The browser consumes the
slideshow's controls, but `showControlRouting` supplies only LED output IDs as
destinations. The generated show contains no `n_ctl_controls` for this chain
and reports no routing error. Sending the bundle to an LED output instead only
applies its LED latch; it does not select a pattern.

Evidence: [showControlRouting.ts](../../../src/codegen/showControlRouting.ts:6),
[templateControlRouting.ts](../../../src/codegen/templateControlRouting.ts:18),
[showGenerator.ts](../../../src/codegen/showGenerator.ts:898).
Sample intent once, update the engine cursor, commit selection to the renderer,
then publish the selection to screens. Test headless controls too. **HW-01**.

### F2 · P1 · TFT-only Show Status uses an undeclared cursor

Reproduction: Collection → Slideshow → LED output, plus Slideshow Display →
TFT Display, without an OLED. Generated code uses `_sel_show.highlight` and
`_selBrowsing(_sel_show)` but never declares `static PatternSel _sel_show`.
`usesSelection` is gated by OLED browsers or artwork, although Show Status
also reads the cursor. This generated C++ defect was established by source
inspection; a device flash was not attempted.

Evidence: [showGenerator.ts](../../../src/codegen/showGenerator.ts:410) and
[cursor consumers](../../../src/codegen/showGenerator.ts:500).
Derive cursor requirements from every consumer. Pattern names are also still
blank in this template and need a table independent of thumbnails. **HW-01**.

### F3 · P1 · Orientation still writes the document's old hardware property

Portrait/Landscape resizes the document but writes `tftRotation` onto `Display`.
After the split, `TransportDisplay` owns physical rotation. A landscape document
can therefore remain attached to a portrait panel. Show/player validation
reports the mismatch; normal custom emission has no equivalent geometry check.

Evidence: [DisplayEditor.tsx](../../../src/components/DisplayEditor/DisplayEditor.tsx:717),
[template validation](../../../src/codegen/customDisplayControlGraph.ts:47),
[normal emission](../../../src/codegen/cppGenerator.ts:5074).
Resolve connected panel geometry for editor actions and every build path;
define sizing before a document is mounted. **HW-02**.

### F4 · P1 · Disabled custom panels still run in normal firmware

Changing the physical panel's `enabled` property from true to false produces
byte-for-byte identical normal C++. The custom arm emits setup, touch sampling
and publication without consulting Enabled. The template path filters disabled
panels, so the generators disagree. Templates separately reject wired Enabled.

Evidence: [cppGenerator.ts](../../../src/codegen/cppGenerator.ts:5070),
[customDisplayShowCpp.ts](../../../src/codegen/customDisplayShowCpp.ts:24),
[templateControlRouting.ts](../../../src/codegen/templateControlRouting.ts:119).
Specify drawing, touch and output-rest semantics, including re-enable, once.
**HW-02**.

### F5 · P1 · Shared and unmounted documents have invalid firmware paths

One document feeding two panels was promised by the design. Normal generation
instead emits `_cdScreen_screen` and widget globals twice. Template planning
rejects the same graph as an identifier collision. Conversely, an unmounted
document whose widget output drives an LED output causes normal C++ to
reference that widget symbol without declaring it.

Evidence: [normal per-panel emission](../../../src/codegen/cppGenerator.ts:5077),
[template symbol check](../../../src/codegen/customDisplayControlGraph.ts:43),
[document no-op arm](../../../src/codegen/cppGenerator.ts:5254).
Enforce one document per panel initially, allow independent document copies,
and diagnose unmounted live control sources. Shared documents need per-panel
instances and an explicit simultaneous-touch policy. **HW-03**.

### F6 · P1 · Graph Health recommends removed fixed-screen controls

Graph Health tells a non-player TFT control chain to select Show Status for
blackout and brightness. That layout now has no touch regions. Setting the
property to Show Status passes this check even when the resolved layout is
Waiting and cannot emit actions.

Evidence: [validateGraph.ts](../../../src/utils/validateGraph.ts:1615),
`transportTouchRegions` in [transportDisplay.ts](../../../src/state/transportDisplay.ts).
Validate resolved content/actions and destination capabilities. Recommend
custom Toggle/Slider widget outputs for LED controls. **HW-04**.

### F7 · P2 · RAM and asset preparation still treat documents as hardware

An orphan document emits no LVGL firmware but adds over 65 KiB to estimated
display RAM. Rotating the panel from 0 to 90 changes its generated 20-row draw
buffer from 4,800 to 6,400 pixels while the estimate is unchanged. The estimator
reads rotation from `Display` and also prices the panel as a fixed TFT.
Asset preparation similarly walks every document, including unmounted ones,
so unused designs can trigger work or block upload (this asset effect was
inspected in code, not reproduced in a browser).

Evidence: [validateGraph.ts](../../../src/utils/validateGraph.ts:474),
[customDisplayRam.ts](../../../src/codegen/customDisplayRam.ts:12),
[useCustomDisplayAssets.ts](../../../src/hooks/useCustomDisplayAssets.ts:46).
Use one mounted-panel plan for RAM, assets, validation and emission. **HW-03**.

### F8 · P2 · Run does not yet monitor graph-fed screen values

Run redraws values on local interaction. `runValue` returns undefined for
passive readouts and does not consume published `roleValues`; their changes
have no renderer subscription. The panel node shows a custom-screen notice.
Thus Slider → Numeric Readout does not demonstrate live readback in Run even
though graph evaluation and firmware bindings exist.

Evidence: [DisplayEditor.tsx](../../../src/components/DisplayEditor/DisplayEditor.tsx:424),
[runValue](../../../src/components/DisplayEditor/DisplayEditor.tsx:725),
[TransportDisplayNodeBody.tsx](../../../src/components/Canvas/TransportDisplayNodeBody.tsx:71).
Finish the dirty-widget renderer and distinguish simulation from device
telemetry. Reuse the document renderer for the panel thumbnail. **HW-05**.

### F9 · P2 · Compile fixtures still use the removed graph shape

`generate-display-smoke.ts` places pins on `Display`, creates no custom-panel
edge, wires removed `fixed.title`, and reads removed song ports directly from
Music Player. Historical successful compiles remain evidence for the old
fixtures; the current script cannot establish coverage of the new model.
Some RAM tests also construct a hardware-bearing `Display`.

Evidence: [generate-display-smoke.ts](../../../scripts/generate-display-smoke.ts:35),
[customDisplayRam.test.ts](../../../src/codegen/__tests__/customDisplayRam.test.ts:22).
Repair fixtures and assert that intended LVGL objects/bindings exist before
compiling. Add isolated TFT-only, headless-control and disabled cases. **HW-06**.

## How the workflow should read

| User question | Owner | Connection |
| --- | --- | --- |
| What did I buy and which pins are used? | Hardware and physical panel | Board, part, bus, rotation |
| What is playing? | Music Player or Pattern Slideshow | Engine Display → panel Display |
| What should the screen look like? | Custom Display document | Document Custom Display → panel Custom Display |
| What does this button do? | Player Controls assignment | Hardware/widget output → named action → destination |
| Which value should the screen show? | Node owning that state | Song Info/data wire → widget input |
| What runs on this board? | Resolved build plan | Visible build mode and supported connections |

Panel content inputs are mutually exclusive. Fixed music touch uses Panel
Controls → Player Controls → Music Player. Custom screens use the **document's
individual widget outputs**, not the panel's fixed Controls bundle. Song Info
opens the player's Display envelope when individual fields are needed.

| Workflow | Build selection | Current limits |
| --- | --- | --- |
| Live graph | Normal sketch | General expressions; custom widgets can drive LED inputs; RTC fixed screens work; Music Player is not an operating device player here |
| Collection slideshow | Connected Slideshow/Collection | Bounded scalar control graph; pattern-command route is broken (F1); wired Master Speed refused |
| SD music/show player | Qualifying SD path, before slideshow | Player transport, scalar/widgets and Song Info; direct LED Enabled/Brightness/Controls wires rejected |
| Wiring Test / Stream Receiver | Explicit utility action | Separate diagnostic/stream firmware, not execution of the authored custom UI |

Generator selection is repeated across `showUpload.ts`, `isPatternShow`,
`selectedGenerator`, upload, capacity and asset preparation. Introduce a shared
pure build-plan resolver carrying generator, engine, outputs, mounted screens,
control destinations, assets, memory and diagnostics. Keep transport/rendering
adapters separate and reuse the existing scalar IR; an immediate merger of all
three generators would expand risk without resolving these ownership problems.

Offer the sequence **board and parts → live pattern/slideshow/music player →
built-in/custom screen → assign actions → simulate → wiring/capacity → upload**.

- Proposed labels: **Display Panel** for hardware, **Screen Design** for the
  document. Internal identifiers need not change. Explain content and commands
  in port hints; disable/hide fixed Controls when custom content owns touch.
- Add **Create screen design** on a panel: size it correctly and create an
  ordinary visible content edge in one undoable action. Link back to the panel.
- Keep the connection-time Player Controls picker; filter by destination as
  well as type. Explain edge-triggered actions versus persistent state and
  numeric units/ranges; offer Map Range when a normalized signal needs scaling.
- Provide connected dimming, slideshow and music-player starters. Layout
  templates can remain wire-free; **Connect to this player** should visibly
  create ordinary edges, including feedback through Song Info.
- Show build mode and why it was selected. Explain unsupported wires while
  connecting, with repairs that apply to this build, not after screen design.
- Keep blackout, brightness and transport state at the destination. Explicit
  feedback should make knobs and touch controls agree after release.

## Validation performed

- `npm test`: **256 files passed, 2 skipped; 4,461 tests passed, 13 skipped**.
  Optional compile/WASM coverage was not enabled.
- `npm run lint` and `npm run build`: passed; existing large-chunk warning remains.
- `python -m pytest backend/tests -q`: **194 passed** using host Python. The
  helper `.venv` lacks pytest and was not modified.
- Eight temporary Vitest probes confirmed duplicate emission/template rejection,
  ineffective Disabled, orphan RAM, rotation/RAM mismatch, missing Show Status
  cursor, ignored slideshow controls, accepted inert fixed controls, and an
  undeclared unmounted-widget symbol. They asserted the defects, not repairs,
  and were removed so the permanent suite does not enshrine broken behavior.
- Documentation verification: local Markdown targets/anchors and `git diff --check`
  checked after consolidation; no source or generator implementation changes.
- No new browser usability session, Arduino/fbuild compile, hardware run or
  remote branch comparison. Existing support rows remain the evidence authority.

## Documentation consolidation

Root todo is the only active checklist. Contracts retain design detail; reports
retain evidence; completed implementation narratives remain recoverable in Git.

| Former source | Disposition / surviving work |
| --- | --- |
| Root, display and hardware todos | Combined in root todo; duplicate trackers removed |
| Node todo and July node review | Retired historical audits; residual metadata/palette review is HW-10; shipped features are not reopened |
| `.docs/` original proposal/design/handoff | Removed explicitly obsolete specifications |
| Hardware renders | Reduced to import/verification contract; generated catalogues own inventories |
| VU meter plan | Completed plan replaced by preserved bench report; user guide/support row retained |
| Build Diagram handoff | Contract retained; electrical review is HW-14 |
| Audio expansion | Design retained; implementation phases are HW-19/20 |
| Display design and user guides | Updated panel/document ownership, envelopes, clock, drivers and actual limits |
| Other open design questions | HW-09/13 and deferred backlog, with resolved field features closed |
| Ignored private roadmap | Stale completed vision replaced by a pointer; confidential exploration stays local |

## Recommended next milestone

Make **one panel, one document, one engine and physical/touch controls**
predictable across the three builds. Complete HW-01–06, then connected starters
and the bench budget. Catalogue expansion follows. Choose exact v1 support from
recorded evidence and freeze the save format after control ownership stabilizes.

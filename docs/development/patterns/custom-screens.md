# Custom screens

Screen designs mounted on a colour panel: the widget runtime, LVGL generation
and its assets, themes, templates and how their controls are wired, and the
panel Enabled signal.

Moved out of the always-loaded `CLAUDE.md` so a session reads it only when
working in this area; record new patterns for this area here, not there. History
of the entries before the move: `git log -p -- CLAUDE.md`.

## Runtime and generation

- **Custom document runtime:** widget ports derive from stable widget id plus
  role (`widget:<id>:<role>`), parsed through `parseDisplayWidgetPortId`; labels
  and positions never identify wires. `displayRuntimeStore.ts` stores touch
  ownership, role values, dirty state and diagnostics by display/widget id.
  Frame-frequency writes mutate that store without React `set()`; only
  diagnostics bump `diagnosticsVersion`. `takeDirtyDisplayWidgets` is the
  renderer handoff, and `displayRevisions`/`displayRevision` is the monotonic
  per-display paint counter any number of renderers can poll —
  `DisplayRuntimeWidgets` is that one live widget renderer, shared by
  `DisplayRunSurface` (the floating live-touch overlay opened from Graph, not a
  mode inside the designer — see below) and the mounted-panel thumbnail
  (`TransportDisplayNodeBody`), so one consumer cannot clear another's update.
  The designer itself is one mode with no Run view of its own; it draws the
  static document only. The mounted document's upstream closure runs at preview
  cadence, and sampled controls are memoized once before feedback is published,
  which is what preserves a quick tap and releases cleanly to Set. A widget
  takes its reading either from a cable or from the one source wired into its
  panel, decided by its own `source` property: `state/displaySourceFields.ts`
  derives the field catalogue from the lists the fixed layouts already read (the
  player's from `SONG_INFO_PORTS`), a bound widget mints **no input port**
  (`displayWidgetIsBound`), and `syncDisplayNodesInContent` projects
  `widgetSources` onto the panel node because evaluation and all three
  generators work from the node and a bound widget has no port to carry the fact
  — one direction only, rewritten on every edit. Which fields a build can answer
  is a fact about the *generator*, so each table lives beside its routing walk
  (`PLAYER_SOURCE_EXPRESSIONS`, `SHOW_SOURCE_EXPRESSIONS`) rather than in its
  emitter: validation and the asset-bake hook resolve bindings through that same
  walk, and a table held by the generator alone had both reporting every bound
  field as unanswerable. A normal sketch answers for the clock through the same
  `_rtcClockText`/`_rtcDateText` helpers the fixed Clock layout uses, so a bound
  time widget and a Clock screen beside it cannot format the hour two ways; a
  bound pattern *name* is the one reading that costs flash and turns the name
  table and cursor on exactly as a Pattern Browser does
  (`DISPLAY_NAME_SOURCE_FIELDS`/`DISPLAY_SELECTION_SOURCE_FIELDS`,
  `patternNameStringCpp`). An unanswerable binding is a **warning** and the
  widget draws its own text — deliberately weaker than the refusal a *cable*
  into the same field earns, because a binding is usually a template's default;
  templates bind through `TEMPLATE_WIDGET_SOURCES`, keyed by label so a portrait
  composition cannot bind a field its landscape twin leaves on a wire.
  `normalizeDisplaySource` validates against every field any source offers
  rather than the wired one, so moving a design between panels keeps the binding
  it was drawn with. `displayTemplatesForSource` also *orders the template
  shelf* from those same bindings — a template is mapped to a source when every
  field it binds is one that source publishes — so adding a binding re-files its
  template and no per-template list of source kinds can drift; it promotes
  rather than filters, the stance pattern author tags take, so the templates
  that bind nothing stay reachable on any panel. Current portrait/landscape
  compositions are defined in `displayTemplates.ts`. A widget's on-glass label
  is drawn exactly once, never as both its own content and a caption:
  `displayWidgetShowsLabel`/`displayWidgetOnScreenCaption`/`displayWidgetBodyFallback`
  (`displayRegistry.ts`) are the two halves of that rule, gated on an opt-in
  `showLabel` property that defaults to off so every saved design and shipped
  template renders exactly as it was drawn. Off, the widget draws its own
  content as before; on, the label moves out to a caption and the body falls
  back to nothing, so a wired Text reads as the value it's being told rather
  than repeating its own name while it waits. The caption comes *out of* the
  widget's own authored box rather than floating over it — a name painted across
  a slider's track is unreadable, and the box is the only space the author gave
  it — so both renderers must agree on the exact strip:
  `displayWidgetCaptionLayout` resolves it once in pixels, the DOM preview lays
  the caption out in those same pixels instead of ems, and
  `customDisplayLvglCpp.ts`'s emitter offsets the LVGL object by the same
  amount. Everything that means "how big is the widget itself" — the emitted
  object's pos/size, a baked icon's height in `customDisplayResources.ts` —
  reads `displayWidgetContentBounds` rather than the authored bounds, or the
  caption's space is charged to nobody. The caption pins a font size of its own,
  smaller than the widget's (`customDisplayFontSizes`), so a screen of nothing
  but captioned sliders doesn't paint text in a face nothing enabled. A box too
  short to hold both drops the caption in either renderer, and
  `displayLayoutIssues` reports it — deliberately not also reporting the
  shrunken touch target underneath, since the emitter has never called
  `lv_obj_set_ext_click_area` at all, so the DOM preview's grown hit region is
  already fiction on device; restore the target in the emitter before reporting
  its loss. See [on-glass widget labels](../design/on-glass-widget-labels.md).
  Physical geometry and Enabled belong to the owning TransportDisplay, and both
  are resolved in one place: `src/state/mountedDisplays.ts` answers how large a
  mounted design is (the panel's rotated size), used by the editor's orientation
  control, deploy validation for every generator, and the template plan. Enabled
  is one runtime signal with one meaning in all three generators — dark, no
  touch read, widget outputs at rest — carried by a per-panel latch
  (`_tftOn_<id>`, `_cdPanelOn_<id>`) written where its expression is evaluable
  and read by the touch sampling and output snapshots that run before that
  point, so those see the previous pass's value on the single frame it changes;
  a constant folds into the latch's initialiser. A disabled panel is still
  built, so it can be turned back on, and a wire feeding Enabled is accepted
  everywhere rather than refused by the templates. A widget's `bounds` is
  optional (`src/state/displayDocument.ts`), so a wire-first control can exist —
  with a port and a real edge — before it is dragged onto a screen; this is
  deliberately not a `placed` flag, because optional bounds turn "ports or
  pixels?" into a compile error at each call site instead of a runtime guard to
  remember. Every walk over `document.widgets` means one of two things: **ports**
  — all widgets, since a connected one still has a port and an edge — or **pixels**
  — `placedWidgets(document)`/`isPlacedWidget`/`PlacedDisplayWidget`, placed
  only, since nothing else draws, costs flash, or takes touch.
  `displayEditor.ts` narrows once at its boundary (`overPlacedWidgets`) rather
  than guarding internally; `displayRegistry.ts` must not narrow at all, since
  it mints the port every widget has regardless of placement. Three sites pair a
  widget to something else *by index*, where a `?.` guard compiles cleanly and
  is silently wrong unless both sides count the placed list:
  `resizeDisplayDocument`'s pairing against `canonicalDisplayTemplateBounds`,
  `firstAvailableBounds`'s collision test, and — worst, because it crosses
  modules — `customDisplayResources.ts` registering a baked asset under a
  `widgetIndex` that `customDisplayLvglCpp.ts` looks up by its own emit index;
  disagreeing here draws one widget's icon on another with no build error.
  Malformed bounds normalize to unplaced rather than dropping the widget, and
  `DISPLAY_DOCUMENT_SCHEMA_VERSION` stays unbumped since
  `normalizeDisplayDocument` would otherwise drop every saved screen design for
  no format change. See
  [wire-first touch controls](../design/wire-first-touch-controls.md). Creating
  a control by dropping a wire (rather than placing a widget first) goes through
  one derivation, `src/state/wireFirstControls.ts`'s
  `touchControlPlan(nodeType, portId, properties, driven)`: it reads
  `exposableInputsFor` — covering property *and* action inputs — and returns a
  spec (Slider/Toggle/momentary Button, ranged via `propertyMeta`) or a refusal
  (`not-a-property-input`, `unsupported-type`, `disabled`, `already-driven`).
  Its `adoptedControlRange` is shared with `withAdoptedDisplayControlRange` in
  `graphStore.ts` so the widget-first and wire-first paths cannot disagree on
  label/min/max/step. `connectTouchControl` mints the widget and its edge in one
  `set`, so one undo removes both; a Ctrl/Cmd-held drop also *places* it, doubly
  gated — the modifier is consent at the moment of the gesture, and
  `visibleLiveTouchScreen` must name that same panel, so "which screen?" is
  answered by what is on screen rather than guessed and the resulting layout is
  in front of the author beside an Edit design button. It places through
  `placeTouchControlIn` like every other placement (adoption is a no-op there,
  since a wire-first control is born carrying the property's range), and
  `ConnectionDragHint.canPlaceOnVisibleScreen`, resolved once at drag start, is
  what lets the row hint offer the shortcut only where the gate would grant it.
  The Touch node's trailing `add-control` output socket carries a `dataType`
  (`'newcontrol'`) that `portsCompatible` deliberately matches against nothing,
  so the ordinary connect path can never use it — which means
  `connectionTargetHint` (`StudioNode.tsx`) and `onConnectEnd`
  (`NodeGraphCanvas`) must branch on that handle and run `touchControlPlan`
  instead of comparing port types, or a valid drag onto any property row reads
  as blocked ("newcontrol cannot connect to float"). A control minted this way
  still has no `bounds`, so the designer's **Connected group** is exactly
  `document.widgets` with no bounds — a derived view, not a second registry,
  since placing one out of the group is the only thing that removes it from that
  filter. `placeDisplayWidget` (`displayEditor.ts`) deliberately reuses
  `firstAvailableBounds`, the same rectangle the palette's own entries land in,
  so a widget added from the palette and one placed out of the group land by one
  rule (the palette is click-to-add, and inventing a drag for this group alone
  was rejected); `unplaceDisplayWidgets` removes the `bounds` field by
  rebuilding the widget rather than setting it `undefined`, because
  `'bounds' in widget` is what a normalize pass and a JSON round trip both test.
  Deleting a placed, wired control from the canvas unplaces it back into the
  Connected group rather than destroying it — only deleting the group entry is
  the real removal, and that still confirms; Cut stays destructive because it
  puts a copy on the clipboard. Whether a widget's wire still exists is read
  from the live store at the moment of the decision, not from the render's
  snapshot, because that answer decides whether the widget is destroyed or just
  unplaced. `displayControlEdges` in `wireFirstControls.ts` is the one
  panel→Touch→edge walk behind the group's "what does this drive" captions,
  shared with `displayWidgetTargetRangeRepair` so the two cannot disagree about
  which wire a widget is on; a widget whose `out` port drives two edges is
  dropped from the map rather than picking one, since there is no single answer
  to caption. `controlDestination`/`controlDestinationLabel` read the
  destination node's title through `nodeDisplayLabel`, never `node.data.label` —
  nothing persists a node label, so the range repair was naming an LED String
  "LED Matrix" on every reload before this was fixed; this is now the third
  reader of that rule, alongside the two status-title readers noted in
  [controls and LED output runtime](player-shows-and-controls.md#controls-and-led-output-runtime).
- Custom-display firmware assets cross an asynchronous boundary before code
  generation: `customDisplayResources.ts` derives and validates the exact
  id/size/tint variants a document uses, `bakeCustomDisplayAssets.ts` is the
  only browser SVG-to-pixel step, and `customDisplayAssetsCpp.ts` accepts only
  finished A8/RGB565/RGB565A8 bytes. Do not fetch, decode or scale inside a
  generator. Equal variants share one indexed table, while authored ids, labels
  and paths never become C++ identifiers. The `// FLS-LVGL-FONTS:` marker is an
  allow-listed build-helper contract: `backend/app.py` specializes `lv_conf.h`
  so only the nearest pinned Montserrat sizes selected by
  `customDisplayFontSizes` compile into flash; keep the marker, emitter and
  helper tests in step.
- **Custom-screen generation:** a `TransportDisplay` panel owns its own screen
  design (named by its `displayId` property) and its widget port identity —
  there is no separate document node, so a design shared by two panels or
  mounted on none is unsayable rather than refused. `customDisplayMountPlan` in
  `mountedDisplays.ts` is now just that list — the fields that reported a shared
  or unmounted design went with the states they reported — and is the one walk
  read by the RAM estimate, asset baking, deploy validation, the template
  planner and the normal generator, so they cannot disagree about which screens
  a build contains. Sanitize widget source port ids (`widget:id:role`) through
  `safeId` before forming C++ symbols. Sample touch/output values before graph
  evaluation, publish widget bindings after LED output, and emit `lv_init` once
  before any LVGL setup. Every symbol a screen emits is keyed by the panel's
  `displayId`, so duplicating a panel — which mints a fresh `displayId` — gives
  the copy's design a fresh, non-colliding symbol set for free. Rotation and the
  module are the panel's, so price the buffer from the panel, and do not also
  charge a custom panel the fixed-layout field caches it never emits. Geometry,
  Enabled, live readback and the shared build-mode resolver are all settled (see
  the mounted-geometry/latch rules above; `resolveBuildMode` is the one source
  of build mode, selected engine, reached output and fixed-template display
  sources, and the selected engine id scopes asset preparation so a disconnected
  first engine cannot leak into another valid path). Keep existing
  forward-declaration/include/symbol guards and trust-aware asynchronous asset
  baking. The generated `lv_conf.h` sets `LV_USE_THEME_DEFAULT 0` to keep LVGL's
  theme styles out of flash, but the theme is also what normally makes an
  object's background opaque — LVGL's own class default for `bg_opa` is
  transparent — so in `customDisplayLvglCpp.ts` every
  `lv_obj_set_style_bg_color` must be paired with
  `lv_obj_set_style_bg_opa(..., LV_OPA_COVER, ...)` on the same object/part, or
  the colour paints at zero alpha and the panel's white background shows
  through; on a dark screen design that reads as an inverted panel (white behind
  near-white text, only widget borders visible) rather than a styling fault,
  since the fixed OLED/TFT layouts beside it never touch LVGL and render
  correctly. State-qualified selectors are exempt: LVGL cascades, so an opacity
  set on a part's base selector already covers that part in every state, and
  restating it only spends flash.
  `src/codegen/__tests__/customDisplayLvglBackgrounds.test.ts` holds the pairing
  over the *emitted* sketches in `artifacts/display-compile/`, not the emitter's
  source, so any path that paints a `bg_color` without going through
  `styleLines` is still caught. LVGL 9.5 deprecates the bitwise-or between
  `lv_part_t` and `lv_state_t` (their union is the `lv_style_selector_t` a
  selector actually is), so the emitter never writes `LV_PART_x | LV_STATE_y`
  directly — it emits a single `_cdSel(part, state)` helper that widens each
  operand before oring them; casting the combined result,
  `(lv_style_selector_t)(A | B)`, does not fix it, since the deprecated
  enum-to-enum op already happened inside the parentheses. This hid for a full
  compile matrix because fbuild surfaced the resulting warnings (66 per
  custom-screen sketch) while Arduino CLI compiles that path with `-w` and
  reported none — the same test file also asserts no bare
  `LV_PART_* | LV_STATE_*` reaches an emitted sketch, so it can't regress
  silently on whichever engine happens to run.
- A `TransportDisplay` panel whose Enabled input is driven by nothing but its
  own paired `TouchInput` node has no way back on — off means dark, no touch
  read, outputs at rest, so the very control that switched it off can never
  switch it back on except by a board reset — and
  `findPanelEnableRecoveryIssues` in `validateGraph.ts` reports this as a Graph
  Health **warning**, not an error, because the graph builds and does exactly
  what it says. The rule traces the full upstream closure of Enabled and warns
  only when the panel's own Touch node is its *sole* origin — a node with
  nothing feeding it — so any amount of latching or logic in between is seen
  through, but a graph that also mixes in a second, independent source is
  deliberately not flagged, since a warning that fires on a correct graph
  teaches people to stop reading the drawer. Not auto-repaired: waking the panel
  on the next press, or turning the toggle momentary, would each make Enabled
  mean something different on this panel than on every other one.

## Assets and themes

- The asset registry an Image/Icon widget (and a themed background) validates
  against is imported, not hand-declared, the same boundary-script pattern as
  physical-part visuals but for the design pack instead of Blender assets:
  `scripts/import-display-assets.py` is the only thing that ever sees the pack's
  own working-folder paths. It reads the pack's manifests
  (`Custom UI Kit/asset-manifest.json`, `player-controls-reference.json`, and
  the pack root's `manifest.json` for the themed player-control sets), refuses a
  manifest path that escapes the pack root or names a missing file, derives each
  glyph's dimensions from its SVG viewBox rather than a restated number, and
  copies only vector masters and theme JSON — never the pack's PNG rasters,
  which are regenerable and would commit sizes/tints a screen may never bake —
  under `public/display-assets/`, emitting a generated
  `src/build/generated/displayAssetCatalogueData.ts` that
  `src/state/displayAssets.ts` wraps with the runtime contract (id, category,
  slot kinds, dimensions, tintability, format, site-relative `file`, display
  classes). `normalizeDisplayAssetId` is the one place an untrusted document's
  asset id may be kept: widget property normalization and the theme background
  both resolve through it, so a foreign path, a retired id, or a non-string is
  dropped at the import boundary rather than persisted as a dangling reference,
  and a widget naming a missing asset reports which id is missing instead of
  drawing a blank square. `displayAssetFlashCost` prices a bake by the size a
  widget actually draws at, not the asset's native size — an 8-bit alpha mask
  for a tintable glyph, RGB565 for a background, zero for anything never baked
  (theme tokens, template previews) — mirroring how pattern thumbnails and
  transport artwork price themselves elsewhere. Like node cards and board
  renders, the pack is excluded from the PWA precache and runtime-cached on
  first use. Button and Toggle are not Image/Icon but still draw from this
  registry, gated by a `presentation` property (`text` | `icon` | `text+icon`)
  rather than a dedicated widget type: `DisplayWidgetPreview.tsx`'s
  `controlIcon` resolves art only when `presentation` isn't `text`, and falls
  back to the label whenever the resolved `assetId` is empty or names a retired
  asset: an icon-only control drawing nothing would be indistinguishable from a
  broken one, so it keeps its text instead.
- A theme preset (`src/state/displayThemePresets.ts`) is applied, not
  referenced: `applyDisplayThemePreset` copies the pack theme's concrete colours
  into the document's own `DisplayTheme` at pick time rather than storing a live
  pointer to the pack, the same reasoning that keeps an asset *id* in a document
  and resolves its file through the registry — so a workspace stays readable
  pack-uninstalled and a retired pack theme can't leave a saved document
  unrenderable. It deliberately keeps the document's own `font`/`fontSize`
  across the swap, since those are a screen's legibility choice, not the theme's
  identity. The pack expresses `inactive`/`disabled` as opacities, not colours
  the studio's five-state model needs; `displayThemeFromPackTokens` derives both
  once by blending `textMuted` toward `surface` through `mixDisplayColors` (the
  same blend `displayTheme.ts` resolution and the LVGL emitter already use), not
  restated as literals per theme.
- A muted widget state (`inactive`/`disabled`) is set back by its text colour
  and its `opacity` alone — both the DOM preview and the LVGL emitter apply
  `opacity` — never by additionally washing the state's surface toward its own
  text colour, which double-applies the fade and can crush contrast to
  near-nothing. `resolveDisplayThemeTokens` in `displayTheme.ts` shares one
  `MUTED_SURFACE_WASH = 0.14` constant between the `inactive` and `disabled`
  surface blends for this reason; `disabled` previously used 0.72 on its own and
  produced 1.14-1.39 text/surface contrast in every launch theme.

## Templates

- **Wiring a template's controls to the graph is a plan-then-apply pair**
  (`state/templateControlPlan.ts` decides what should be wired; the similarly
  named `codegen/templateControlRouting.ts` is unrelated — it resolves the
  controls a template *sketch* already has), split so the plan stays pure and
  testable apart from its side effects. `src/state/templateControlPlan.ts`'s
  `templateControlPlan(panel, document, nodes, edges)` decides, for one panel's
  screen design, which widgets carrying a stamped `controlRole`
  (`TEMPLATE_CONTROL_ROLES`, written by `applyDisplayTemplate` at placement time
  and read back by `widgetControlRole` — keyed by label only at that one
  placement moment, never again, so renaming "Next" to "Skip" cannot un-wire it)
  have exactly one unambiguous destination; it returns `{ wires, unrouted }`,
  and every refusal carries a human reason rather than silently doing nothing.
  The destination comes only from the edge wired into the panel's own Display
  input (resolved to a `DisplaySignalKind` through `DISPLAY_SOURCE_NODE_TYPES`)
  — never from canvas proximity — so an unwired panel is left alone with a
  reason instead of a guess. `ROLE_TARGETS` maps each role x source kind to a
  target port plus an optional `adapter`: `outputBlackout` needs `invert`,
  because a Blackout toggle is true-means-dark and an LED output's `enabled` is
  true-means-lit, and the fix is a placed `Not` node the user can see, select
  and delete — never a silent flip inside the wire. `transportVolume` lands on
  `PatternMaster`'s own continuous `volume` property input, so a single absolute
  volume slider needs no Control Map — the bundle is still the route for chained
  physical controls and volume-step buttons. Where the source has a free
  Controls input (Music Player, Pattern Slideshow, an LED output) the plan
  returns `controlsWire` and the applier draws that one Touch Controls wire
  instead of per-control cables, since `designControlBundle.ts` already carries
  every role-stamped control on it; the cables (and Blackout's `Not`) are the
  fallback when Controls is taken. A Toggle needs no adapter: every
  press-reading input counts a screen Toggle's taps via `toggleWidgetSource`
  rather than edge-detecting its value, because a template binds Play's Set to
  `playing` and reading the value echoed every transport change back as a press
  (in-app Play started the track and the panel paused it). The plan is
  idempotent by declining any destination port that already has something wired
  to it, including its own wire from a prior run, and by checking the control's
  own source output too — so re-pointing a panel from a player to a slideshow
  leaves the old wires untouched rather than retargeting or doubling them.
  `connectTemplateControls(panelId)` in `graphStore.ts` is the apply half: it
  draws the edges, exposes each target's property-input socket through
  `exposableInputsFor`/`normalizeExposedInputs` (an action/property input is a
  field until something is wired to it), places the `Not` adapter beside the
  panel — offset per adapter so two on one screen stay separately clickable,
  never stacked on the origin — and folds the whole thing into one undo step.
  `src/state/__tests__/templateControlPlan.test.ts` covers the plan;
  `src/state/__tests__/connectTemplateControls.test.ts` covers the store
  action's side effects (sockets drawn, single undo, idempotent rerun, a manual
  rewire respected). A template should just work, so three things follow from
  the one Controls wire. A `useGraphStore.subscribe` in `graphStore.ts` runs the
  plan again whenever a panel's Display input is *newly* wired (edge id new,
  both endpoints already on the canvas, so a load or undo never re-adds a
  Controls wire someone removed) and draws only the single Controls wire
  uninvited — the cable fallback stays behind Graph Health's button.
  `displayDocumentTouchOutputPorts` marks a role-stamped control's port
  `carriedByControls`, and `StudioNode` hides such a port unless something is
  wired to it, so a template's Play/Next/Volume do not appear as outputs to
  connect one by one. And `inertControlIssues` treats those controls as live
  once the Touch node's `controls` output is wired; while it is not, they are
  reported once per panel (`template-controls-waiting-<panelId>`) with a
  `connect-template-controls` repair, or with the plan's own refusal reason when
  there is nothing to connect to. See
  [direct controls and LED output status](../design/direct-controls-and-output-status.md#8-auto-wire-templates-and-fixed-layouts),
  which records why Blackout and Play/Pause arrive through visible adapter nodes
  rather than direct edges. A `level` control in the bundle (Volume, Brightness)
  reports nothing until a finger has actually moved its widget:
  `graphEvaluator.ts`'s bundle loop gates a level field on
  `runtime.readDisplayWidget(designId, control.widgetId)?.touchCount > 0`, not
  just presence in the document, because inserting a template (LED Performance's
  Brightness, Now Playing's Volume) used to publish the slider's resting
  position immediately — blacking out the LEDs or muting the player the instant
  the screen was wired, before anyone had touched anything. Firmware holds the
  same line: `designControlBundleEmit` gates `hasBrightness`/`hasVolume` on the
  widget's LVGL `taps` count (which `_cdEvent` now bumps for a slider or dial as
  well as a Toggle, and never for a Set write), and a Slider/Dial's **Starts
  at** (`initial`, resolved once by `displayControlStartValue` in
  `displayRegistry.ts`) is where the preview rests it, the renderer draws it and
  the LVGL emitter seeds it.
- A display template's composition choice (which widget set a size resolves to)
  is decided in exactly one place,
  `templateComposition(template, width, height)` in `displayTemplates.ts`,
  called by both `applyDisplayTemplate` (placing it) and
  `canonicalDisplayTemplateBounds` (sizing it) — the two disagreeing would mean
  a screen reflowing into a layout it can never be placed in. `DisplayTemplate`
  carries an optional `squareWidgets`; a square panel falls back to
  `portraitWidgets`, not `widgets`, because portrait is already authored 240
  wide (nothing to clamp horizontally), while landscape is 320 wide and clamping
  it slides every right-hand widget onto its neighbour. Only the five of eight
  templates whose portrait layout overruns 240 rows declare `squareWidgets`; the
  other three deliberately don't, and `displayTemplateGolden.test.ts` asserts
  that correspondence so the absence stays a decision.

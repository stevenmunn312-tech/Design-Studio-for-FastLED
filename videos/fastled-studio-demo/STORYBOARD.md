---
format: 1920x1080
duration: 60s
message: "Design Studio for FastLED lets makers build, preview, and deploy expressive LED effects visually"
arc: "Demo Loop — spectacle → product → signal path → live response → preview → trust → hardware-ready close"
audience: "LED makers, creative coders, and FastLED users"
mode: autonomous
music: "newly generated crisp electronic pulse, dark maker-lab energy, restrained beneath narration"
captions: true
---

## Video direction

- Palette system: use only the captured-brand tokens in `frame.md` — charcoal `cream` ground, electric blue `green`/`yellow`, cyan `pink`/`orange`, and light-grey `ink`; type by the display/body/mono roles defined there. No invented hues.
- Motion grammar: one smooth `power3`-class long-tail language across the film. Reveal each item when the narration names it, especially through the back half of every frame; never dump the complete composition at the opening beat. Holds are still, with at most a finite low-amplitude jitter on one focal element.
- Rhythm: Frames 1 and 5 carry the broad cinematic reveals; Frames 3, 4, and 6 are precise interaction beats; Frame 2 is the explanatory breath; Frame 7 resolves into the longest dead-static read. Camera movement stops before each payoff and never wanders during a hold.
- Shared composition: the real app capture is always the largest object (at least 55% of frame), supported by one oversized editorial claim and restrained mono labels. Keep all load-bearing content inside the top 83%; reserve the bottom caption band.
- Negative list: no gradients, blur, bloom, soft shadow, rounded SaaS cards, fabricated UI, stock footage, reused tutorial media, browser chrome, real pointer, infinite loops, random motion, bouncy easing, slideshow front-load-then-freeze, or screensaver-style independent floating.

## Frame 1 — Not just the light

- scene: Extreme close-up of the live LED matrix pulls back to reveal the full workspace that made it.
- voiceover: "This isn't a finished light show. It's a patch you can shape, test, and change while it runs."
- duration: 5.547s
- transition_in: cut
- status: animated
- src: compositions/frames/01-not-just-the-light.html
- type: hook
- persuasion: Visual spectacle reframed as creative control
- beat: intrigue → possibility
- blueprint: zoom-out-workspace-reveal
- asset_candidates: assets/fresh-03-stage.png — newly captured full Stage view; assets/fresh-01-juggle.png — newly captured graph and live preview
- focal: assets/fresh-03-stage.png
- roles: assets/fresh-03-stage.png = cutout · assets/fresh-01-juggle.png = supporting

Adapt: keep the single outward reveal and locked-wide payoff; the macro detail is a sharp crop from the newly captured Stage preview, and the containing whole resolves to the newly captured graph workspace.
Scene 1 (0.0–1.6s): extreme crop of `fresh-03-stage` fills the frame with the moving-light result while the mono fragment “NOT A FINISHED SHOW” lands upper-left; full-bleed layered-depth composition, one cyan rule sweeps on. Camera begins the only continuous zoom-out (`viewport-change`).
Scene 2 (1.6–3.7s): the same outward move passes through a framed Stage surface, then reveals `fresh-01-juggle` as the containing workspace when the narration says “patch”; centered-to-wide nesting, screenshot remains the dominant 70% surface, velocity matched at the handoff.
Scene 3 (3.7–5.547s): camera locks completely; three compact labels — SHAPE · TEST · CHANGE — reveal one at a time along the visible signal wire as each verb is spoken (`dynamic-content-sequencing`), then hold still on the full workspace.

narrativeRole: Open on the outcome makers want, then reveal that the app makes the result editable rather than mysterious.
keyMessage: The animation is not a black box; it is a live patch.

## Frame 2 — Meet the studio

- scene: The empty signal lab becomes the newly created Juggle patch inside the real app.
- voiceover: "Meet Design Studio for FastLED, a visual workspace that turns lighting ideas into connected, understandable signal paths."
- duration: 9.323s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/02-meet-the-studio.html
- type: product_intro
- persuasion: Friction reduction through a visual mental model
- beat: clarity + invitation
- blueprint: device-surface-showcase
- asset_candidates: assets/fresh-00-start.png — newly captured start screen; assets/fresh-01-juggle.png — newly captured first patch
- focal: assets/fresh-01-juggle.png
- roles: assets/fresh-00-start.png = supporting · assets/fresh-01-juggle.png = cutout

Adapt: keep the persistent product surface and discrete screen advance; use a cursorless start-to-patch state change and a static camera so the product itself performs the introduction.
Scene 1 (0.0–2.4s): `fresh-00-start` establishes as a large square-cornered app surface on the charcoal ground; the product name assembles above it word-group by word-group as “Meet Design Studio for FastLED” is spoken (`waterfall-entry`). Centered, sparse, 3 depth layers.
Scene 2 (2.4–6.5s): on “visual workspace,” the surface swaps in place to `fresh-01-juggle` through a masked scale-swap (`scale-swap-transition`); a cyan bracket frames the canvas, and a mono label “VISUAL WORKSPACE” lands at upper right. Camera remains locked.
Scene 3 (6.5–9.323s): three thin square-cornered callouts reveal sequentially over the real graph — IDEA, SIGNAL, OUTPUT — connected by a newly drawn cyan line (`svg-path-draw`) as the narration names connected signal paths; final surface holds still for the read.

narrativeRole: Name the product and immediately define it in the viewer's terms: a visual workspace for light.
keyMessage: Lighting ideas become readable signal paths.

## Frame 3 — Follow the signal

- scene: A custom cursor traces Juggle through the glowing frame wire into Matrix Output while three labels land in sequence.
- voiceover: "Start with a pattern, wire its frame into Matrix Output, and keep every relationship visible on the canvas."
- duration: 7.232s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/03-follow-the-signal.html
- type: feature_showcase
- persuasion: Show-don't-tell proof
- beat: understanding + control
- blueprint: cursor-ui-demo
- asset_candidates: assets/fresh-01-juggle.png — newly captured connected Juggle graph
- focal: assets/fresh-01-juggle.png
- roles: assets/fresh-01-juggle.png = cutout

Adapt: keep the cursor-as-actor and live state emphasis; use the locked-stage variant so the real graph remains readable while one designed cursor traces the existing connection.
Scene 1 (0.0–1.8s): `fresh-01-juggle` fills a 70/30 editorial layout; a custom cyan cursor enters from the left and settles over the Juggle node while the mono label PATTERN reveals above it (`cursor-click-ripple`, movement only—no fake click).
Scene 2 (1.8–4.8s): the cursor travels along the visible glowing wire in one continuous path; the camera performs a short target pan that keeps both nodes visible (`viewport-change`), while FRAME reveals at the wire midpoint and a cyan trace draws directly over the existing connection (`svg-path-draw`).
Scene 3 (4.8–7.232s): cursor lands on Matrix Output as OUTPUT arrives; three labels form a clear left-to-right signal legend in the top 75%, camera locks, and the connected graph holds still with a single short accent tick on the output port.

narrativeRole: Demonstrate the core node-graph model and make the connection itself the editing motif.
keyMessage: Pattern, frame, and output remain visibly connected.

## Frame 4 — Tune at the speed of thought

- scene: The Juggle controls and LED Preview share the frame; a cursor sweeps controls and the preview punches forward in response.
- voiceover: "Adjust speed, count, palette, or effects. The LED preview answers immediately, so exploration stays playful instead of becoming another compile-and-flash loop."
- duration: 11.627s
- transition_in: crossfade
- status: animated
- src: compositions/frames/04-live-response.html
- type: feature_showcase
- persuasion: Feature-to-benefit translation
- beat: delight + momentum
- blueprint: panel-edit-live-sync
- asset_candidates: assets/fresh-02-tuned.png — newly captured control-and-preview working state
- focal: assets/fresh-02-tuned.png
- roles: assets/fresh-02-tuned.png = cutout

Adapt: keep the live-sync couple signature; the same newly captured app state supplies both the Juggle controls and LED Preview, with designed overlays clarifying the causal relationship without inventing numeric values.
Scene 1 (0.0–2.6s): a wide crop of `fresh-02-tuned` establishes the panel-and-preview couple; cyan selection brackets draw around the Juggle controls and the LED Preview in sequence (`svg-path-draw`). Asymmetric 60/40, screenshot fills most of the stage.
Scene 2 (2.6–6.9s): a custom cursor scrubs across the visible control region; four mono tokens — SPEED · COUNT · PALETTE · EFFECTS — replace one another at the same anchored position while a matched cyan scan line crosses the preview on each beat (`control-target-sync`, `discrete-text-sequence`). No exact value is claimed.
Scene 3 (6.9–9.8s): on “answers immediately,” the preview crop scales forward while the controls remain co-visible; a hard-shadow marker block reading LIVE ANSWER arrives on the narration cue, then settles (`control-target-sync`).
Scene 4 (9.8–11.627s): the words NO COMPILE / NO FLASH reveal as a two-step mono footer above the caption band; all movement stops and the real paired surface holds for comprehension.

narrativeRole: Translate live controls into the practical benefit of faster, more playful iteration.
keyMessage: Every adjustment has an immediate visual answer.

## Frame 5 — See the whole performance

- scene: The newly captured Stage view fills the frame, then hands off to the 3D preview state with a mechanical mode flip.
- voiceover: "Move into Stage for a focused live view, then switch on 3D to judge depth, motion, and composition at full scale."
- duration: 8.149s
- transition_in: squeeze
- status: animated
- src: compositions/frames/05-stage-and-3d.html
- type: benefit_highlight
- persuasion: Future pacing through a focused result view
- beat: immersion + confidence
- blueprint: device-surface-showcase
- asset_candidates: assets/fresh-03-stage.png — newly captured full Stage view; assets/fresh-04-stage-3d.png — newly captured Stage view with 3D enabled
- focal: assets/fresh-04-stage-3d.png
- roles: assets/fresh-03-stage.png = supporting · assets/fresh-04-stage-3d.png = cutout

Adapt: keep the held product surface and discrete screen cycle; one framed Stage surface changes from flat to 3D while the camera stays static and the result receives the full canvas.
Scene 1 (0.0–2.5s): `fresh-03-stage` arrives oversized as the lone surface; STAGE builds in display type behind its top-left edge while the capture stays readable, centered layered-depth composition.
Scene 2 (2.5–5.2s): on “switch on 3D,” a compact custom toggle flips in the upper-right annotation rail and the surface cross-swaps in place to `fresh-04-stage-3d` (`discrete-text-sequence`, `scale-swap-transition`); no camera move.
Scene 3 (5.2–8.149s): DEPTH · MOTION · COMPOSITION reveal one by one around the 3D preview, top and side only, when each word is spoken; the 3D surface grows to roughly 75% of canvas, then holds dead still at full scale.

narrativeRole: Give the result room to breathe and show that the same patch can be judged in different preview modes.
keyMessage: The workbench can become a full performance view in one step.

## Frame 6 — Catch problems before hardware

- scene: Graph Health expands beneath the real patch and isolates its concrete power-safety guidance.
- voiceover: "Graph Health checks wiring, power, memory, and board compatibility while you work, with concrete guidance before anything reaches hardware."
- duration: 8.939s
- transition_in: push-slide UP
- status: animated
- src: compositions/frames/06-graph-health.html
- type: feature_showcase
- persuasion: Risk reversal through visible diagnostics
- beat: trust + readiness
- blueprint: cursor-ui-demo
- asset_candidates: assets/fresh-05-health.png — newly captured Graph Health diagnostic under the live graph
- focal: assets/fresh-05-health.png
- roles: assets/fresh-05-health.png = cutout

Adapt: keep the cursor-driven state-tour shape; open tight on the live graph, then use one downward focus move to reveal the already expanded diagnostic and isolate its concrete guidance.
Scene 1 (0.0–2.0s): the upper graph region of `fresh-05-health` fills the surface; a custom cursor moves toward Graph Health as WIRING and POWER reveal in a restrained mono stack. Camera starts locked.
Scene 2 (2.0–5.9s): one short pan-down exposes the expanded Graph Health area (`viewport-change`); MEMORY and BOARD COMPATIBILITY add to the stack on their spoken cues while a cyan inspection rule draws around the real warning row (`svg-path-draw`).
Scene 3 (5.9–8.939s): the real “high-current output has no power cap” guidance receives a square cyan focus bracket; BEFORE HARDWARE lands as the dominant editorial claim at upper left, cursor comes to rest, and the diagnostic holds still.

narrativeRole: Build trust by showing that visual creation is paired with practical deployment checks.
keyMessage: The studio helps catch real hardware problems while the patch is still editable.

## Frame 7 — From canvas to controller

- scene: The graph collapses into a bold three-beat value stack, then the freshly captured brand mark locks up beside the final line.
- voiceover: "When the patch is ready, generate FastLED code or upload to your controller. Design visually. Preview live. Build the lights you imagined."
- duration: 9.984s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/07-canvas-to-controller.html
- type: cta
- persuasion: Future pacing plus action clarity
- beat: triumph + motivation
- blueprint: logo-assemble-lockup
- asset_candidates: assets/fresh-01-juggle.png — newly captured complete graph; assets/fastled-studio-mark.svg — new pixel mark drawn for this video
- focal: assets/fastled-studio-mark.svg
- roles: assets/fresh-01-juggle.png = background (dim 40%) · assets/fastled-studio-mark.svg = cutout

Adapt: keep the CTA lockup build and long final hold; the complete graph clears into three value beats, then the newly drawn pixel mark and wordmark assemble without a push-through or any additional media.
Scene 1 (0.0–2.7s): `fresh-01-juggle` appears full-width and deliberately dimmed while GENERATE CODE and UPLOAD TO CONTROLLER reveal as two square-cornered action strips over the visible top-bar context; no cursor click or hardware action is fabricated.
Scene 2 (2.7–6.8s): the graph compresses toward center into three flat editorial blocks that arrive one per spoken phrase — DESIGN VISUALLY · PREVIEW LIVE · BUILD THE LIGHTS — using a left-to-right waterfall with smooth settles (`waterfall-entry`).
Scene 3 (6.8–9.984s): the three blocks interlock into the captured logo mark (`center-outward-expansion` run inward); DESIGN STUDIO FOR FASTLED reveals beside it, then “BUILD THE LIGHTS YOU IMAGINED” wipes in beneath. The centered lockup holds dead static for the final read; only the final frame may fade at its absolute end.

narrativeRole: Close the loop from visual design to hardware-ready output and leave the viewer with the product promise.
keyMessage: Build the lights you imagined.

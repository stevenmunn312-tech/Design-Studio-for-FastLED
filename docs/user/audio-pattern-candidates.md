# Audio pattern release candidates

The Audio Reactive shelf contains 100 bundled candidates for audition. The final release selection remains 50 app patterns and 50 community patterns; that split has not been made yet. The Standard shelf is unchanged.

The existing 72 bundled audio pattern ids are unchanged. Fourteen saved library patterns follow them, then fourteen new musical scenes. Exact copies of the promoted saved patterns are deduplicated when the library loads; their original disk files are retained.

## Energy response

Every candidate except the fourteen promoted saved patterns ends with a shared energy stage. While the music is quiet the pattern rests subdued; as the energy rises it gains colour, then a light sparkle, then full brightness, and the response follows a smoothed energy level rather than individual beats. Patterns that already dim themselves in quiet passages rest brighter in that stage so the two do not multiply into black. The stage is ordinary editable nodes (`dynEnergy`, `dynColor`, `dynGlitter`, `dynBrightness`) at the right of each graph when it is instantiated as a copy.

## Promoted saved patterns

These patterns retain their original names, ports, graphs and settings, including the working names “My Pattern” and “New Group temp”. Promotion does not retrofit the newer audio rig into these user-authored graphs.

- **Aurora Voice** — `bundled-audio-73`
- **Cascade Surge** — `bundled-audio-74`
- **Cinder Storm** — `bundled-audio-75`
- **Event Horizon** — `bundled-audio-76`
- **Fractal Voyage** — `bundled-audio-77`
- **Monsoon Echo** — `bundled-audio-78`
- **My Pattern** — `bundled-audio-79`
- **Neon Prism EQ** — `bundled-audio-80`
- **New Group temp** — `bundled-audio-81`
- **Peacock Mosaic Drift** — `bundled-audio-82`
- **Polar Bloom** — `bundled-audio-83`
- **Prism Fracture** — `bundled-audio-84`
- **Psydance** — `bundled-audio-85`
- **Ultraviolet Kaleido Pulse** — `bundled-audio-86`

## New musical scenes

Each new scene has a smoothed energy response, a scene-specific buildup gesture, a visible drop gesture with a decaying envelope, and a short fade into silence. The shared brightness stage leaves headroom for accents. The shared energy stage adds only its colour and sparkle to these scenes, because their own exposure already rests low. Graphs remain ordinary editable nodes when instantiated as copies.

### Noctilucent Origami

Id: `bundled-audio-87`. Best displayed on: matrix, ring.

Teal and coral recursive paper fans breathe with bass. A build folds the fans into their alternate pattern; drops open their seams into luminous facets.

### Copper Circuit Tide

Id: `bundled-audio-88`. Best displayed on: matrix.

Copper and jade hexagonal circuits drift across the panel. Treble adds fine detail, builds bend the circuits, and drops reconnect the maze with a fading echo.

### Chromafluid Cathedral

Id: `bundled-audio-89`. Best displayed on: matrix.

Violet smoke rises through hexagonal stained glass. Stereo balance steers the dye, relative bass feeds it, builds tighten its symmetry, and drops release a spreading puff.

### Mycelium Crescendo

Id: `bundled-audio-90`. Best displayed on: matrix.

Moss and amber Turing labyrinths grow slowly in quiet passages. Builds accelerate their fine structure; drops seed a new organism and briefly reveal its bright veins.

### Harmonic Lantern Loom

Id: `bundled-audio-91`. Best displayed on: matrix, ring.

A lavender Fourier ribbon draws an infinity knot. Pitch colours the pen, vocals widen its path, builds add harmonics, and drops unfurl the full outline.

### Abyssal Julia Bloom

Id: `bundled-audio-92`. Best displayed on: matrix.

An indigo and seafoam Julia reef slowly turns with the music. Vocals reshape its islands, builds dive inward, and drops pull the camera back into a broad coral bloom.

### Opal Resonance Basin

Id: `bundled-audio-93`. Best displayed on: matrix.

Opal waves ripple on each beat. Energy changes their travel speed, builds extend their resonance, and drops send a stronger ripple through a rotating mirrored basin.

### Resonant Velvet

Id: `bundled-audio-94`. Best displayed on: matrix.

Pitch selects a stable Chladni mode. Energy rotates the standing waves; a buildup adds modal complexity, and a drop turns the plate through 45 degrees. A presence band controls the contour contrast.

### Silk Attractor

Id: `bundled-audio-95`. Best displayed on: matrix.

A de Jong attractor draws turquoise and gold filaments. Energy adds threads, relative mids thicken them, and buildups extend their persistence. Drops open the woven form; stereo balance tilts it.

### Moonflower Release

Id: `bundled-audio-96`. Best displayed on: matrix, ring.

A lavender superformula flower breathes with bass over a bar-synchronised radial texture. Buildups open its petals, then drops expand the entire bloom.

### Interference Loom

Id: `bundled-audio-97`. Best displayed on: matrix.

A held, confident pitch selects low integer Lissajous ratios. Energy animates the weave, buildups thicken its strands, and drops turn the loom. Relative treble controls the trailing silk.

### String Meteor Pact

Id: `bundled-audio-98`. Best displayed on: string.

A quiet blue dust bed supports meteors with counter-moving debris. Bass spikes and drops launch heads, a presence band adds dust, buildups lengthen tails, and drops scatter a cool sparkle cloud.

### String Stereo Lanterns

Id: `bundled-audio-99`. Best displayed on: string.

Warm and cool scanners respond independently to left and right channel levels. Stereo balance mixes the lanterns, buildups widen them, and drops launch a separate turquoise meteor shower.

### String Harmonic Tide

Id: `bundled-audio-100`. Best displayed on: string.

Confident musical key colours a restrained moving tide. Bar phase scrolls its palette, energy adds folds, and a presence band adds foam. Buildups widen its colour harmony; drops add cold spray.

## Audio behavior and fallbacks

- Audio Features supplies absolute energy and vocals. Smooth nodes prevent instant changes in music energy from jerking continuous motion.
- Song Structure supplies buildup progress, downbeats, mood and drop events where used. Drop events drive an attack-and-decay envelope, so one-frame detections produce readable gestures. The detected drop impact is held for the gesture: stronger drops produce a stronger response.
- Vibe supplies relative band levels and spikes in selected scenes. Relative levels are explicitly clamped and mapped; they are not assumed to fit 0–1.
- Pitch and key controls use confidence checks and musical defaults or held notes. Unpitched percussion does not force arbitrary pitch changes.
- Frequency Band isolates detail from a chosen frequency range. Stereo scenes use channel levels and balance; mono sources use the normal channel fallback.
- Beat Phase provides beat and bar timing for selected scenes. The scene also has an energy-driven motion floor between detected beats.
- Older audio recordings without structure, pitch or Vibe payloads retain the node defaults for those signals. Energy-driven output remains available, but build and drop gestures require the corresponding detector payload.

## Auditioning the final fifty

Use the same LED dimensions, master brightness and music source for comparisons. Audition matrix-tagged patterns on a matrix and string-tagged patterns on a string; a one-row render is not a fair test of a two-dimensional scene.

Use a relaxing track, a vocal track, percussion-heavy music, and a track with a clear buildup and drop. Let the simulations and drawing effects run for at least 20 seconds before judging their character. Listen through a complete musical phrase rather than choosing from a still thumbnail.

Judge visual identity, energy contrast, musical timing, palette, readability at the target resolution, and how well each scene sits beside the other selected scenes. Include quieter breathing space as well as high-energy accents. Confirm the shortlisted set on the intended hardware; a successful firmware build does not measure frame rate on every board.

The deterministic regression fixtures test quiet, energetic, buildup, drop and silence sections. They compare image content before the shared brightness stage as well as final pixels, so a brightness-only drop cannot pass as a scene gesture. These fixtures test the response to detector outputs, not the quality of live music detection or the final artistic ranking.

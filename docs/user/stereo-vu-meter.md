# Stereo VU Meter

The Stereo VU Meter is a paired addressable-LED fixture for the left and right
sides of a matrix or HUB75 frame. One explicit Audio cable drives both rails;
the main LED output remains an independent frame output.

## Add and connect it

1. Open **Hardware**, choose **LED outputs**, and add **Stereo VU Meter**.
2. If the project has exactly one Audio node, Studio connects it automatically.
   Otherwise, connect the Audio node's output to the meter's **Audio** input on
   the graph.
3. Choose the LED Matrix or HUB75 Panel that the rails should flank. Choose
   **Standalone** if there is no main frame.
4. Set the LED count, data pins, chipset, colour order, and the data-in end for
   each rail.

No Audio cable means no inferred or ambient input: the rails remain black and
Graph Health explains what is missing. An inactive provider also fades to
black instead of holding a stale level.

## Stereo and mono sources

- **PCM1802 Line Input** and stereo browser input retain independent left and
  right short-window levels. Feed a PCM1802 from a line-level or headphone-level
  signal, never directly from a bridge-tied speaker output.
- **Audio Decoder** measures decoded left/right PCM before the existing mono
  FFT mix. If decoding is starting or fails, a versioned baked envelope keeps
  the rails moving in song time.
- **INMP441**, mono browser input, and mono music files intentionally mirror one
  measured channel onto both rails. Identical motion is expected, not a wiring
  fault.
- Shows exported before the stereo trailer existed remain compatible. Their
  three baked bands resolve to one mono level and are mirrored.

Channel swap changes which signal drives each physical rail; it does not swap
their positions in the preview. The labels identify the source channel after a
swap.

## Visualizations

All modes use the same gain, gate, response, attack, release, peak, and silence
conditioning, so changing the presentation does not recalibrate the source.

| Mode | Presentation | Good for |
|---|---|---|
| Classic Ladder | Green lower range, yellow upper range, red at the top | Familiar level monitoring |
| Palette Fill | Base-to-tip fill sampled from the selected palette | Matching a show palette |
| Solid Channel | One configurable colour per side, brightness follows level | Clear channel identity |
| Segmented Blocks | Lit blocks separated by dark gaps | Rack-meter styling |
| Peak Cap | Filled bar with a contrasting held peak | Seeing transients and sustained level |
| Falling Comet | Bright falling head with a fading trail | Percussive music |
| Center Burst | Grows from the midpoint toward both ends | Symmetric installations |
| Frame-Inward | Grows from the outside toward the main frame | Framing the matrix |
| Dot Runner | A level marker with short persistence rather than a fill | Minimal displays |
| History Trail | Recent samples scroll along each rail | Waveform-like motion |
| Stereo Balance | Colour and motion emphasize left/right difference | Stereo imaging |
| Beat Spark | Level bars gain a brief beat-driven tip accent | Beat-forward shows |

**Manual** holds one mode. **Timed cycle** advances at the chosen interval.
**Beat cycle** advances on rate-limited beats. **Shuffle** uses a deterministic
seeded order, so replay and generated firmware do not choose unrelated modes.

## Physical direction and wiring

Each side has its own **Data-in position**. Set it to the end where the first
LED's DIN pad is physically mounted. This changes physical indexing, while the
combined preview stays logically bottom-to-top. Use **Wiring Test** before a
show: its conservative pattern identifies Left and Right independently and
makes direction mistakes visible.

Use one controller data pin per rail, a common ground, and a suitable external
5 V LED supply. Ground must be shared by the controller, audio ADC, LED supply,
and both strings. Do not power either string from the controller's USB or 3.3 V
pin. Put a data resistor near each controller output and use a logic-level
shifter when the LED voltage and cable length require it. Follow Build Diagram
power-injection guidance for the combined LED count and physical run.

The configured brightness and pair current cap cover both strings together.
Treat the worst case as every LED on both rails displaying white; decorative
animations are not a power budget.

## Baked-envelope compatibility

New show files append a tagged `AENV` version-2 trailer. Each frame contains the
existing bass, mids, and treble bytes followed by left and right level bytes and
an explicit mono/stereo channel count. The main mono analyzer contract is
unchanged. Legacy untagged trailers keep their original three-byte frame layout,
and current players detect and mirror them rather than interpreting them as
stereo.

When the live decoder tap resumes, the same per-fixture attack/release state
continues; track changes clear capture values but do not reset VU peaks, trails,
or mode-cycle state.

## Bench acceptance record

Hardware support is promoted only from measured evidence. Record the board,
audio module/source, string chipset and colour order, LEDs per side, data pins,
data-in ends, supply rating, browser, and firmware toolchain. Then verify:

- silence reaches fully black with no stale peak;
- left-only, right-only, equal stereo, and mono mirroring;
- channel swap and both Top/Bottom direction settings;
- all twelve modes and all four selection policies;
- decoder start, failure fallback, resume, unplug/replug, clipping, and rapid
  transients;
- the main output and rails together without flicker, underruns, or timing
  drift; and
- maximum intended LED count while measuring supply voltage and temperature.

Until that completed record exists for a hardware combination, its status is
experimental even when generation and compile tests pass.

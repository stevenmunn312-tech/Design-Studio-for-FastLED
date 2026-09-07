# Audio Part Expansion — Microphones and Amplifiers

Active execution and acceptance are tracked in [root todo, HW-19/HW-20](../../../todo.md).
This document retains the feature contract, not a second checklist.


## Goal

Widen the audio hardware the app can honestly claim to support: three
microphone modules beyond the INMP441, and three amplifier shapes beyond the
MAX98357A / PCM5102A / UDA1334A / PAM8403 lineup. Every candidate must be
orderable from AliExpress, because that is where the bench parts come from.

Status: **not started.** This is a proposal and a work ledger, not a record of
shipped work. Nothing here is supported until its bench row exists in
[`beta-support-matrix.md`](../../release/beta-support-matrix.md).

The governing rule for this whole document is the one already written at the
top of [`partOptions.ts`](../../../src/state/partOptions.ts): a dropdown only
where a choice genuinely exists, and never a list of plausible part numbers the
app treats identically. Every entry below has to earn its row by being
different in a way the firmware or the wiring can see.

## Non-goals

- No new capture backend. The analog-electret mics are excluded for exactly
  this reason (see [Deliberately excluded](#deliberately-excluded)).
- No change to the mono audio contract, the stereo VU path, or the decoder tap.
- No Blender asset work is planned here. Each part still needs a verified
  render before it can ship; see [`hardware-renders.md`](hardware-renders.md).

## The forcing question: analog power amplifiers

A DX-0809 is on hand (TDA8944/TDA8946J, 12 V at 2 A, marketed 2x40 W — the
TDA8946J datasheet says 2x15 W into 8 ohms at a fixed 32 dB gain, so the
listing number is peak marketing). It has volume and tone pots, mic jacks, and
a line-level analog input. No I2S receiver.

Added as an ordinary `Amplifier` option with `input: 'analog'`, it inherits the
PAM8403 footnote exactly: `audioOutputMode` in
[`audioOutput.ts`](../../../src/state/audioOutput.ts) maps any analog amplifier
to `internalDac`, so the part works on a classic ESP32 and is silent on the
S3, S2, C3, C6 and H2. That is a correct answer for a 5 V board-mounted
PAM8403. It is the wrong answer for a 12 V chassis amplifier, which nobody
buys in order to drive it from a classic ESP32's 8-bit DAC.

The wiring people actually use is PCM5102A or UDA1334A line out into the
amplifier's AUX in. The current model cannot express it, because the DAC is
*itself* an `Amplifier` option and `amplifierNode()` resolves the bench with a
single `nodes.find(...)`. Two `Amplifier` nodes on one bench means
`audioOutputMode` returns whichever the array happens to hold first.

Pick one before adding any large analog amplifier:

**Option A — accept the footnote.** DX-0809 and PAM8610 become classic-ESP32
parts, noted as such in the Add Hardware summary the way PAM8403 already is.
Cost: one `partOptions` row and one asset each. Cost of being wrong: the app
tells an S3 user their 12 V amplifier cannot make a sound, which is true of the
wiring the app modelled and false of the wiring they will actually build.

**Option B — model the chain.** Add a downstream power-amplifier part fed from
a DAC's line output, so a bench can hold "PCM5102A -> DX-0809 -> speakers" and
`audioOutputMode` stays `i2s` because the thing on the board's pins is a DAC.

**Recommendation: Option B.** The part already on the bench is the case that
proves Option A insufficient, and once the chain exists every future analog
amplifier — TPA3116D2, PAM8610, whatever is cheap next year — is a catalogue
row rather than a repeat of this argument.

Option B is not free, and the cost is worth stating plainly:

- `audioOutputMode` and `audioOutputMissing` must resolve a *role*, not the
  first `Amplifier` node. A DAC plus a power amplifier is one output stage.
- `hardwareManifest.ts`'s `case 'Amplifier'` claims GPIO25/26 for an analog
  part. A power amplifier downstream of a DAC claims **no GPIO at all** — it
  is the first bench part with no board connection. `collectPinUses` pushes
  nothing for it, `PART_PIN_PLANS` needs no retarget entry, and
  `findPinCollisions` never sees it. Confirm the Build Diagram and the
  hardware pane both survive a part with an empty pin list.
- `validateGraph.ts` currently says "add an Amplifier" in two places
  (around lines 968 and 2121). A DAC alone would satisfy that check while
  producing line level nothing amplifies. The message and the check both need
  the chain.

## Microphones

Current lineup is INMP441 and nothing else, and the reason recorded in
`partOptions.ts` was that `Config::CreateInmp441` and `MicProfile::INMP441` are
hard-bound. That reason has expired. The vendored FastLED at
`fl/audio/input.h` now ships `CreateIcs43434`, `CreateGenericMEMS`,
`CreateSpm1423Pdm` and `CreatePdm`, and `fl/audio/mic_profiles.h` carries the
matching response-correction profiles.

| Module | Why it earns a row | Firmware cost |
| --- | --- | --- |
| **ICS-43434** (TDK InvenSense) | Same three-wire I2S wiring as the INMP441, better noise floor, sold on the same listings. Roughly USD 1–3 | **None.** `Config::CreateIcs43434` and `MicProfile::ICS43434` already exist |
| **Generic I2S MEMS** (MSM261S4030H0 class) | The sub-USD-1.50 boards that flood AliExpress, frequently sold *as* INMP441. One honest generic entry is truthful where naming each clone would not be | **None.** `Config::CreateGenericMEMS` and `MicProfile::GenericMEMS` already exist |
| **SPH0645LM4H** (Knowles) | The other MEMS mic people already own, roughly USD 4 | **Real.** No dedicated factory or profile, and the well-known left-justified/bit-shift alignment quirk. Bench-verify before it reaches the menu |

Three notes that keep these honest:

**The generic entry is a claim about characterisation, not about quality.**
`MicProfile::GenericMEMS` applies an average MEMS correction. Its `note` should
say that, so someone choosing it knows they are getting a reasonable default
rather than their specific module's measured response.

**Only the ESP32 path reads the profile.** Teensy goes through
`CreateTeensyI2S` with an explicit profile argument; Pico, SAMD51 and STM32 go
through the hand-written `StudioInmp441Input` wrapper in
[`cppGenerator.ts`](../../../src/codegen/cppGenerator.ts), which is plain I2S
and mic-agnostic and applies no profile at all. On those boards a mic swap is
a naming change. The generated class name and the emitted "FastLED INMP441
audio reactivity" banner both hardcode INMP441 today and would start lying.

**Preview parity is unaffected, and there is a stated reason.**
`src/audio/fastledReactive.ts` already records that the C++ side's mic response
correction and pink-noise compensation "largely cancel in the detector's
per-bin adaptive normalization", which is why the browser models neither. The
same argument covers a profile *swap*: it is a firmware-side refinement the
preview deliberately does not reproduce. Do not add a second EQ table to the
browser to chase it.

### Implementation shape

`MicInput` is an existing node type, so none of the pin registries move: the
three I2S pin properties, the `BUS_ASSIGNMENTS` row, the `PART_PIN_PLANS`
entry and the `MIC_PIN_DEFAULTS_BY_FQBN` table are all per-node and already
correct. The work is:

- A `partOptions.ts` row per module, with a `summary` and an honest `note`.
- A catalogue entry per module (verified Blender asset and dimensions).
- `audioEngineForGraph` in `cppGenerator.ts` reads the mic node's `partId`
      and threads it to `audioEngineCpp`, which picks the factory. One call
      site, and both the normal sketch and the show generator inherit it
      because they share this one resolver.
- The emitted banner and the `StudioInmp441Input` class name stop naming
      INMP441.
- Update the `partOptions.ts` header comment and
      `src/state/__tests__/partOptions.test.ts`, both of which currently assert
      the one-microphone rule and its reason.

## Amplifiers

| Module | Why it earns a row | Cost |
| --- | --- | --- |
| **DX-0809** (TDA8944/8946, 12 V, 2x40 W claimed) | Already on the bench, and the forcing case for the chain model above | Option B, then one row plus an asset |
| **PAM8610** (12 V, 2x15 W stereo class-D) | The missing rung between PAM8403 (5 V, 2x3 W) and a chassis amplifier. Roughly USD 2, ubiquitous | One row plus an asset, once the chain exists |
| **MAX98357A stereo pair** | Not new hardware. The app owns the part but cannot express two of them with the SD pin selecting left and right, which is how anyone gets stereo I2S today | Model change only, no asset |

If Option B lands, **TPA3116D2** (2x50 W, 12–24 V) becomes a one-row addition
and is the analog amplifier most people already have in a drawer. It is listed
here as the test of whether Option B paid for itself, not as scope.

The MAX98357A pair is the one item here worth doing regardless of the
Option A/B decision, and it is a different kind of work: the question is
whether two `Amplifier` nodes are allowed on a bench and how the generator
assigns left and right. It overlaps the `nodes.find(...)` problem above, so
sequence it after that resolution is chosen.

## Deliberately excluded

**MAX9814 and MAX4466 analog electret modules.** These are the cheapest and
most-searched microphone modules on AliExpress and they should still not be
listed. `fl::audio::Config` is a variant of `ConfigI2S | ConfigPdm` only —
there is no ADC capture path in FastLED or in this app. Supporting them is a
capture-backend project with its own sample-rate, DMA and noise-floor
questions, not a catalogue row. Listing them before that work exists is exactly
the misrepresentation `partOptions.ts` was written to prevent.

**Standalone PDM microphones.** `CreateSpm1423Pdm` and `CreatePdm` exist, so
the firmware side is cheap, but standalone PDM breakouts are rare on AliExpress
compared with the I2S boards, and PDM pin availability is board-specific in a
way the `MIC_PIN_DEFAULTS_BY_FQBN` table does not yet describe. Revisit if a
board with an on-module PDM mic enters the supported set.

## Phases

Ordered so that the cheapest honest win ships first and the design argument
does not block it.

- **Phase 1 — ICS-43434 and Generic I2S MEMS.** No firmware invention;
      both factories exist. Ends with a compile proof and an ESP32-S3 bench row.
- **Phase 2 — the Option A/B decision**, recorded here with its reasoning
      before any amplifier row is added.
- **Phase 3 — the chosen amplifier model**, then DX-0809 and PAM8610.
- **Phase 4 — SPH0645LM4H**, only if the bit-alignment quirk is verified on
      hardware rather than reasoned about.
- **Phase 5 — MAX98357A stereo pair**, after Phase 2 settles how a bench
      holds more than one amplifier.

## Bench evidence

Compile success and browser tests do not make any of these supported. Each part
needs its own row in [`beta-support-matrix.md`](../../release/beta-support-matrix.md)
recording the board, the FQBN, the pins used, the toolchain version, and what
was actually heard or measured. The stereo VU work found two level-scale
defects that only the bench could see; assume the same here.

Minimum per microphone: live FFT and beat response driving an LED output,
compared against the INMP441 on the same fixture and the same source, so a
quieter or hotter module is visible as a difference rather than discovered
later as "the new mic feels wrong".

Minimum per amplifier: audible output at a stated supply voltage and current,
plus confirmation that the DAC-to-amplifier chain does not inject LED switching
noise into the audio ground.

## Sourcing

Prices are indicative single-unit AliExpress listings as of 2026-09-07.

- ICS-43434 I2S MEMS microphone breakout — approx. USD 1–3
- MSM261S4030H0 I2S MEMS microphone module — approx. USD 1.50
- SPH0645LM4H (GY-SPH0645) breakout — approx. USD 4
- PAM8610 2x15 W class-D board — approx. USD 2
- DX-0809 TDA8944/8946 board — on hand

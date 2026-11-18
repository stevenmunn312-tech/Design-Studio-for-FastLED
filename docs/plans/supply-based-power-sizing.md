# Plan — size power to the supply the user has

Status: Phases 1 to 5 done 2026-11-18; Phase 6 (remaining tests) next.

## Why

Today every power recommendation (supply, main fuse, trunk, branch feeds) is
sized for the uncapped full-white load, and the app tells the user which
supply to buy. In practice people build with the supply they already own. A
5 A supply on a load that wants 10 A at full white does not quietly settle at
5 A: it trips into hiccup mode, sags (colour shift, ESP32 brownout resets), or
on a cheap unit overheats. It shortens the supply's life at best.

So the user's supply becomes the basis:

- The firmware power cap is what makes a small supply work, and it is set from
  that supply.
- The wiring is sized to the most current that can actually flow, which is the
  supply's own limit, not the LEDs' full-white demand. The wiring stays safe
  even if the cap is cleared or never flashed, so the old rule (never shrink
  hardware because of a firmware cap) still holds.

## Decisions already made

| Source | Hard current ceiling | Hardware sized to |
| --- | --- | --- |
| Mains PSU the user enters | Its rated output | The rating |
| Battery through a converter with a stated output current limit (CC/CV) | The converter's current setting | The setting on the output side; converter input current at minimum battery voltage on the battery side |
| Battery direct, or a converter with no output current limit (plain boost such as MT3608 or XL6009, which limit only their switch and cannot stop an output short) | None | Full white, as today |
| No supply entered | None known | Full white, as today (the recommendation stays a recommendation) |

- Firmware cap defaults to **85% of the ceiling, minus the controller's own
  draw**.
- Fuses keep the existing 75% continuous-loading rule (`recommendFuse`,
  rating >= ceiling / 0.75). That puts a 5 A supply on about a 7.5 A fuse,
  which also covers the 110-150% a supply delivers before its own protection
  acts.
- A fuse sits at the battery positive in every battery case.
- **Several supplies on separate segments:** each supply should cover its own
  segment at full white, and the app advises when one does not (advice only,
  exports not held). FastLED's cap is global per board, so it cannot keep one
  supply inside its rating when the bright pixels land on its segment.
- The Build Diagram says which supply the wiring was sized for ("wired for a
  5 V 5 A supply"), so a later, bigger supply is not silently trusted.

## What exists today

Mapped 2026-11-18. Line numbers drift; the names are the anchors.

- **Two load calculators that disagree.** `estimatePowerLoad`
  (`src/utils/validateGraph.ts`) is chipset-aware (12 V parts, HUB75).
  `calculateElectricalPlan` (`src/build/power/electricalPlan.ts`) uses a flat
  60 mA per pixel at 5 V for everything. `todo.md` already lists the HUB75 and
  12 V WS2811 errors.
- **No supply the user owns.** Supply zones are derived (`groupSupplies`),
  packed up to 100 A or a converter's derated rating, with 20% headroom and
  the rounding in `src/build/power/powerSupplySizing.ts` (whose round-down is
  a known bug in `todo.md`).
- **Dead owned-supply data.** `BuildProfile.ownedParts.supplies`,
  `supplyAssignments`, `converterAssignments` and `branchChecks`
  (`src/build/buildProfile.ts`) still load and save, but nothing reads them.
  The UI went in the Build Diagram rebuild.
- **Converters and batteries** are config-only bench nodes (`PowerConverter`,
  `BatteryPack`, `BatteryModule`) whose ratings come from the part catalogue
  (`PartPowerConverterSpec`). No part says whether it limits output current,
  and no node carries a current setting.
- **Sizing call sites**, all on full-white `designCurrentMa`:
  `recommendedSupplyCurrentMa`, `planTrunk`, `zoneAccepts`/`groupSupplies`,
  `calculateInjections` (branch feeds), `inputProtection`, and
  `batteryPlan.ts` (battery main fuse from converter input current at full
  white).
- **Firmware cap:** Board `powerLimit` / `milliamps`. Ticking it, and the
  starter templates, set it to the full-white draw. No controller-draw term.
  Emitted in five generators (`cppGenerator`, `showGenerator`,
  `playerSketchGenerator`, `streamReceiverGenerator`,
  `wiringDiagnosticGenerator`).
- **Copy that will be wrong:** Board body "Required power supply", Readiness
  power chip tooltip, Build Diagram Power summary ("hardware is still sized
  for full white", "Supply budget"), plan recommendations and assumptions,
  Checks "Set a power cap for this many LEDs", Help (`reference/output.ts`),
  LED output setup wizard, `docs/architecture/build-diagram.md` "Generated
  Electrical Defaults", `hardware-model.md` battery sizing, and the
  hardware-and-build-diagram pattern note.

## Plan

### Phase 1 — one load figure (done 2026-11-18)

Done: `ledFullWhiteDraw` (`src/build/power/ledDraw.ts`) is the one per-LED
figure; `estimatePowerLoad` and `calculateElectricalPlan` both read it, and
`recommendedSupplyCurrentMa` now always rounds up.

Make `calculateElectricalPlan` take its per-output full-white current from the
same chipset-aware source as `estimatePowerLoad`, so the Board, Checks and the
Build Diagram agree. This fixes the HUB75 and 12 V `todo.md` items and is a
prerequisite: segment sizing and the cap are only as good as this number.

Also fix the supply round-down bug in `powerSupplySizing.ts` here, since the
"suggested supply" path keeps using it.

### Phase 2 — say what supply you have (done 2026-11-18)

Done as written, with these choices:

- Zones follow supplies already: `groupSupplies` never puts outputs on two
  supplies into one zone, and each zone carries `ownedSupply`. While a rail
  converter makes the LED rail, outputs are not put on a supply; Phase 3
  decides how a supply upstream of a converter is drawn.
- `outputCurrentLimit` is `fixed` for the Mean Well SD-100A-5/B-5 (hiccup
  overload protection) and the LM2596 (switch current limit), `none` for
  the TPS61023 boost and the seller-rated DGXBY, RCNUN and 300 W modules,
  whose limits are unverified, and `none` for integrated pack outputs. No
  catalogue part is `adjustable` yet, so `currentSettingA` waits for the
  first CC/CV module rather than shipping a field nothing shows.

- New config-only bench node **Power Supply** (`PowerSupply`, hardware
  category), in the same style as `PowerConverter` (decided 2026-11-18). One
  node per physical supply. Drawn in the Build Diagram where the derived PSU
  zone is drawn today.
- Its rating is **custom**: the user types the figures off their supply's
  label, `voltage` (V) and `ratedCurrentA` (A), with the wattage shown beside
  them. No part catalogue to pick from, so any supply on hand can be entered.
  Inputs use `ClampedNumberInput` with sane bounds (for example 3-48 V,
  0.5-200 A).
- A supply whose voltage does not match the LED rail it powers (a 5 V supply
  on a 12 V WS2811 strip) is a Build Diagram blocker.
- Visual: the existing generic `src/assets/components/5v-psu.webp` render, on
  the bench and in the diagram. A custom rating has no specific part, so no
  new Blender asset is needed.
- Each LED output gets a **Powered by** choice when the board has more than one
  supply (default: the only supply). With one supply there is nothing to
  choose.
- `PartPowerConverterSpec` gains `outputCurrentLimit: 'adjustable' | 'fixed' |
  'none'`. `PowerConverter` gains `currentSettingA` when the part's limit is
  adjustable. Catalogue entries get the field from their datasheets (plain
  boost parts are `'none'`).
- Remove the dead `ownedParts` / `supplyAssignments` / `converterAssignments` /
  `branchChecks` data cleanly (pre-1.0 rule: no compatibility shim unless
  asked).
- Node definition, description, Help entry with live example, and README
  module count, per the new-node checklist in `CLAUDE.md`.

### Phase 3 — ceiling and sizing (done 2026-11-18)

Done (`src/build/power/supplyCeiling.ts`, ruleset v10), with these choices:

- Hardware is sized to `sizingCurrentMa = min(fullWhite, ceiling)`, not to the
  ceiling alone, so a 30 A supply on a 15 A load is still wired for 15 A. No
  more than full white can flow, so this is never less safe.
- A supply the user entered is one zone whatever it carries; packing to about
  100 A applies only to a recommended supply.
- With a rail converter, the converter is the zone's ceiling (`fixed` parts at
  their rating; `none` and `adjustable`, which has no setting yet, give none).
  The supply the outputs name is drawn as the converters' shared source
  (`totals.source.ownedSupply`): a voltage that is not the converter's source
  voltage blocks, and a rating below the converters' combined draw is advice.
- The undersized-segment advice appears only with two or more supplies. One
  undersized supply is the power cap's job (Phase 4 and the Checks fix in
  Phase 5).
- Feed count and per-feed limits still follow full white: they bound the
  strip's own copper, not the supply.

- One pure helper, `supplyCeilingMa(zone)`, returns the hard ceiling for a zone
  from the table above, or `null` when nothing limits current. Every sizing
  call site reads it: `sizingCurrent = ceiling ?? fullWhite`.
- Main fuse and trunk: from `sizingCurrent` through the existing
  `recommendFuse` / `planTrunk`.
- Branch feeds: `min(feed full white, sizingCurrent)` so a feed is never
  wired heavier than its supply can drive.
- Battery input side: converter input current at `sizingCurrent` and the
  pack's minimum voltage (`inputCurrentForOutputMa`, `packWindow`).
- Several supplies: each zone's own full white is compared with its supply.
  A supply below its segment's full white is advice, not a blocker (decided
  2026-11-18): exports are not held in draft, because the wiring is still
  sized to that supply and stays safe. The advice says that supply can be
  overdrawn when its segment is bright, and names the supply its segment
  needs.
- Bump `ELECTRICAL_RULESET_VERSION` again (Phase 1 moved it to v9).

### Phase 4 — the cap follows the supply (done 2026-11-18)

Done (`src/build/power/powerCap.ts`, `CONTROLLER_DRAW_MA` in
`src/build/buildProfile.ts`), with these choices:

- The default is `min(full-white figure, 0.85 x supplies - controllerDraw)`:
  a supply larger than the load does not raise the cap past the point where
  it would never dim. It is held inside the Board field (100-100000 mA).
- Only supplies at the LEDs' voltage that feed an LED load count. A supply
  upstream of a rail converter is at the converter's input voltage, so the cap
  stays at full white there until a converter current setting exists.
- Controller draws are peak 802.11b transmit currents from the ESP datasheets
  (ESP32 240 mA, S2 310, S3 340, C3 335, C6 354, ESP8266 170) rounded up with
  board overhead; the non-ESP figures are conservative estimates. The plan's
  assumptions name the figure for the selected family.
- Starters now keep the bench's Power Supplies, like the Board, so the cap a
  starter sets can follow them.

- Default cap = `0.85 × ceiling − controllerDraw`, rounded down to 50 mA.
  `controllerDraw` is one constant per board family (decided 2026-11-18),
  kept in one table beside the board families: the conservative draw with
  the radio running where the family has one, taken from the chip
  datasheets when the table is written, and named as an assumption in the
  plan output. Peripherals on the same rail (displays, amplifiers) are
  separate loads and are not part of this figure.
- Ticking the cap on the Board, and the starter templates, use that default
  when a supply exists, and today's full-white figure when none does.
- With several supplies the cap stays one global figure (FastLED's model):
  85% of the supplies' combined rating, minus the controller. It cannot protect
  any one supply, which is why each supply should cover its own segment at
  full white, and the advice in Phase 3 says so when one does not.
- The generators already emit whatever the Board holds, so firmware changes
  only through the Board value; add a codegen test that the emitted value
  matches.

### Phase 5 — say it plainly (done 2026-11-18)

Done, with these choices:

- One wording for every surface: `supplyCoverage` and
  `supplyCoverageSentences` (`src/build/power/powerCap.ts`) say what full
  white needs, what the supplies allow (85% less the controller, in 5% steps)
  and what the wiring was sized for. The Board, Readiness, Build Diagram and
  the wizard read them; `estimatePowerLoad` carries the coverage and the
  default cap.
- The "which supply" prompt shows only from 5 A of full white (the old cap
  card's threshold), so a USB-sized fixture is not asked, and not when any
  power-path part (supply, converter, PD trigger, battery) is on the bench.
  Not now is `BuildProfile.supplyPromptDismissed`.
- The battery advice fires when a pack is on the bench and its LED rail has
  no `fixed` output limit, since the protection board is then the only thing
  that stops a short. Missing protection stays the Build Diagram's blocker.
- All the cards are warnings with fixes; none holds an upload.

- **Build Diagram Power summary:** "Full white needs 10 A. Your 5 A supply
  allows about 45% brightness. Wired for a 5 V 5 A supply." With no supply:
  today's suggested-supply text.
- **Board body and Readiness chip:** same figures, shorter.
- **Checks:** replace "Set a power cap for this many LEDs" with
  supply-aware rules, advice colour unless it is a real blocker:
  - supply below full white and no cap: offer the 85% cap (fix button);
  - cap above 85% of the supply: offer to lower it;
  - several supplies and one is below its segment's full white: advice in
    Checks and in the Build Diagram, exports not held;
  - battery direct or a converter with no output limit: advise a BMS or
    low-voltage cutoff;
  - LED outputs but no supply entered: one advice entry, "Tell the app which
    supply you have", with an **Add Power Supply** fix and a **Not now** that
    hides it for that project for good (decided 2026-11-18). Checks has no
    dismiss mechanism today, so this adds one flag saved with the project,
    scoped to this entry only. Until a supply is entered, sizing stays on
    today's full-white recommendation.
- Help, wizard and the three architecture docs rewritten to the new rule;
  `beta-support-matrix.md` keeps converters and batteries experimental until a
  bench row passes.

### Phase 6 — tests

- `electricalPlan.test.ts`: the "cap leaves the recommendation unchanged"
  tests become "the cap never changes sizing; the supply does".
- New cases: 5 A PSU on a 10 A load (fuse, trunk, cap), CC/CV buck on a 1S
  pack (input side at minimum voltage), plain boost (full white), two
  supplies with one undersized (advice, exports not held), no supply
  (unchanged output).
- Build Diagram, Readiness, Checks and codegen tests for the new copy and cap.

## Decisions on the open questions (2026-11-18)

1. The supply is a bench node with a custom rating, not Board fields.
2. Controller draw is one constant per board family.
3. With no supply entered, Checks prompts once, dismissible per project.
4. An undersized supply on one of several segments is advice only; exports
   are not held in draft.

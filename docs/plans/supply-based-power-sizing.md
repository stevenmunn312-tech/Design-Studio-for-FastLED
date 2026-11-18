# Plan — size power to the supply the user has

Status: proposed 2026-11-18, not started.

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

### Phase 1 — one load figure

Make `calculateElectricalPlan` take its per-output full-white current from the
same chipset-aware source as `estimatePowerLoad`, so the Board, Checks and the
Build Diagram agree. This fixes the HUB75 and 12 V `todo.md` items and is a
prerequisite: segment sizing and the cap are only as good as this number.

Also fix the supply round-down bug in `powerSupplySizing.ts` here, since the
"suggested supply" path keeps using it.

### Phase 2 — say what supply you have

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

### Phase 3 — ceiling and sizing

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
- Bump `ELECTRICAL_RULESET_VERSION`.

### Phase 4 — the cap follows the supply

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

### Phase 5 — say it plainly

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

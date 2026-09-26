# Power conversion and supply protection

Roadmap step 8 ([hardware expansion roadmap](hardware-expansion-roadmap.md)):
make a 12/24 V source and its conversion to 5 V explicit in the Build Diagram
power model, and protect each supply at its source. It ships in three slices,
in this order, each marked experimental in the
[support matrix](../../release/beta-support-matrix.md) until a bench row
exists. The independent electrical review (HW-14) checks the result; it does
not gate it.

## Parts

| Slice | Part | Why this one |
| --- | --- | --- |
| A. Controller buck | LM2596 adjustable buck module (the common 43 x 21 mm board, IN+/IN-/OUT+/OUT-, trimpot) | The most common hobby buck; TI datasheet for the regulator, many matching module listings for the board. |
| B. Rail converter | Mean Well SD-100A-5 (9.5-18 V in, 5 V 18 A) and SD-100B-5 (19-36 V in, 5 V 20 A) | Enclosed, isolated, datasheet-backed (case 902, 199 x 98 x 38 mm, 7-way terminal block). One body, two input ranges. |
| C. Main supply protection | No new module: a bolt-down main fuse and a sized trunk per supply | Done; see below. |

Sources, datasheets and CAD for each converter live in the asset workspace under
`Parts/<part>/reference/`, recorded in each part's `Sources.md`. Nothing from
there enters the repo except through the importers.

## Shared model: the source

Today every supply is a 5 V PSU and the controller is always on USB-C
(`calculateElectricalPlan` returns `controllerPowerPath: 'USB-C power
(controller only)'`). Both converter slices need one new fact: the build has a
DC **source** at some voltage that is not 5 V. It belongs to the converter,
not to a separate node, because a source with nothing converting it does not
change anything the diagram draws.

- New hardware-only node `PowerConverter` (hidden on the graph canvas like
  `Board`, created from the Hardware shelf, root graph only). Properties:
  `partId` and `sourceVoltage` (volts). It carries no signal, so it has no
  evaluator or codegen case; it is registered where a hardware-only node must
  be and nowhere else.
- The part decides the converter's **role**, read from a `powerConverter`
  block in `part.json` (the same importer-block pattern as
  `pixelDataExtender`): `role: 'controller' | 'led-rail'`, input range,
  output voltage, continuous output current, typical efficiency, isolation.
  No role or rating is restated in TypeScript.
- Validation (`findDeployBlockingErrors` is not involved; this is Build
  Diagram guidance) goes through the electrical plan's own issues: a source
  voltage outside the part's input range is a **blocking** plan issue; more
  than one controller converter is blocking; more than one rail converter
  part type is blocking (mixing 18 A and 20 A converters in one plan is not
  supported).

## Slice A: controller buck (LM2596), done

In software and experimental; see
[hardware nodes](../design/hardware-nodes.md#powering-the-controller-from-12-v-or-24-v).
Two departures from the plan below: the controller load is not estimated,
because the input fuse and wire are sized for the module's full rated output
instead; and a `pinout-verified` board is blocked outright.


- `controllerPowerPath` becomes "LM2596 buck, <source> V to 5 V, into the
  board's 5V/VIN pad" when one exists.
- The board profile must name a 5 V input pad; a board without one is a
  blocking plan issue. A `pinout-verified` board (onboard power path not
  verified) turns today's "keep external power off the board" warning into a
  blocking issue for this path, since the path *is* external power.
- Load: the controller plus 5 V peripherals, estimated from the manifest
  (board figure plus per-kind allowances). Over the module's continuous rating
  (2 A, derated from the regulator's 3 A for an unheatsinked board) is
  blocking.
- Diagram: the module beside the controller, source into IN+/IN-, OUT+ to the
  5V/VIN pad, OUT- to the common ground. The note that the trimpot must be set
  to 5.0 V with a meter *before* the board is connected is a plan
  recommendation and a Build Diagram callout, because every one of these
  modules ships at an arbitrary output voltage.
- Connection list and BOM rows follow the diagram.

## Slice B: rail converter (SD-100A/B-5)

- When a rail converter is present, `groupSupplies` packs LED feeds into
  converters instead of generic 5 V PSUs: the group ceiling is the converter's
  continuous rating after headroom instead of `MAX_RECOMMENDED_SUPPLY_CURRENT_MA`,
  and each group is one converter. Separate converter outputs are never
  paralleled, the same rule separate PSUs already follow.
- Input side: each converter's input current is `P_out / efficiency /
  sourceVoltage`, sized with the same headroom rule, and it gets its own
  input fuse and conductor, planned the same way as a supply's main fuse and
  trunk (slice C) but at the source voltage. The
  source recommendation (volts and amps) replaces the 5 V PSU recommendation.
- Terminal use follows the datasheet: 1 V+ in, 2 V- in, 3 FG (to protective
  earth or the enclosure), 4-5 -V out, 6-7 +V out. The converter is isolated
  (1500 VAC I/O), so -V out is bonded to the common ground at the
  distribution point; the diagram draws that bond explicitly rather than
  implying it.
- A controller buck and a rail converter together share the one source; the
  controller buck is drawn from the source side, not from the LED rail.

## Slice C: main supply protection (done)

The roadmap asked for a protected high-side switch, and an eFuse module was
the first candidate (MikroE eFuse 4 Click, TI TPS25940). It was dropped: the
largest eFuse boards limit at about 5 A and cost around $25 each, while an
LED installation's supply can carry 65 A or more. Such an installation is
protected the conventional way: a heavy trunk from the supply, a main DC fuse
at the supply positive, then branch fuses in the fuse block. The branch half
already existed; the main fuse and trunk did not.

Now each supply zone has a main fuse and trunk, sized and drawn (see
[the Build Diagram rules](../../architecture/build-diagram.md)). Sourcing
the trunk sizes exposed that the wire table's ampacities were far above any
90 C conductor table we could find, so the table was replaced with NEC
310.16 at 90 C, and fuse and wire are now coordinated so a standard fuse
always fits the wire it protects. The per-supply cap rose from 60 A to 100 A
for the larger supplies in common use.

The eFuse research (schematic, STEP, datasheets) is kept in the asset
workspace in case a small protected load, such as a controller rail, wants
one later.

## Order of work

1. Blender models and `part.json` for the LM2596 module and the SD-100 case; import.
2. `PowerConverter` node, the `powerConverter` catalogue block, shelf entry.
3. Slice A: done (LM2596 model, `PowerConverter`, plan, diagram, exports).
4. Slice B; tests.
5. Slice C: done (main fuse, trunk, wire table, 100 A cap).
6. Docs: hardware nodes design note, support matrix rows, todo.

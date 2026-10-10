# Battery power

Status: **implemented, experimental pending bench evidence and HW-14 review** ·
Owner: app · Updated: 2026-10-10

D-05 item 2 in the [root todo](../../todo.md): a lithium pack as the DC source
for an LED build, with the boards that protect, balance and charge it and the
converters that make 5 V from it. It extends the power model the way
[power conversion and supply protection](power-conversion-and-protection.md)
did. Everything here is Build Diagram guidance: it ships experimental in the
[support matrix](../release/beta-support-matrix.md), and the independent
electrical review (HW-14) checks it afterwards rather than gating it. It adds
no graph signal and no firmware, so no compile is owed.

Mains SSRs and contactors for switching supply banks are a later D-05 item.
Large motor drivers were dropped on 2026-10-09: LED installations do not need
them.

## Reference builds

These are Steve's own builds, and each becomes a bench row in the root todo.

| Build | Pack | Boards |
| --- | --- | --- |
| About ten LEDs | 1S Li-ion (3.7 V nominal, 4.2 V full) | [Boost, charge and protection module](https://www.aliexpress.com/item/1005012069464300.html) |
| 16×16 matrix | 4S Li-ion | [BMS with balancing](https://www.aliexpress.com/item/1005010035028251.html), [buck converter to 5 V](https://www.aliexpress.com/item/33044155995.html), [IP2368 bidirectional 100 W charger](https://www.aliexpress.com/item/1005009107167897.html) |
| 32×32 matrix, 30 A software limit | 4S Li-ion | [60 A BMS with active balancing](https://www.aliexpress.com/item/1005010418508436.html) (BM3451; 4.25 V over-charge, 2.8 V over-discharge), [60 A buck converter](https://www.aliexpress.com/item/4000302403286.html), and the IP2368 charger |

Alternatives Steve also uses, modelled alongside:

| Build | Pack | Boards |
| --- | --- | --- |
| About ten LEDs, separate boards | 1S Li-ion | [Boost to 5 V](https://www.aliexpress.com/item/1005008387293839.html), [charge and protection](https://www.aliexpress.com/item/1005007089641829.html) |
| 16×16 matrix | 4S Li-ion | [20 A buck](https://www.aliexpress.com/item/1005003512778149.html), [BMS with balancing](https://www.aliexpress.com/item/1005004317506330.html), [4S charger](https://www.aliexpress.com/i/1005005354324584.html) |

A standalone 4S balancer Steve uses,
[this one](https://www.aliexpress.com/item/1005005050176741.html), is
modelled too, so the `balance` function gets a board of its own.

Every build keeps the usual LED front end: a 74AHCT125 level shifter, a
330 Ω data resistor and a 1000 µF capacitor per feed. The 1S boost build needs
the level shifter because its pixels run at 5 V.

The LED load runs from the pack terminals through a battery main fuse to the
converter. In the 1S build the module's own 5 V output feeds the LEDs and the
controller. The IP2368 board only charges the pack; its USB-C port can also
discharge it, which the plan never uses for the LED load.

## Model

### Parts and nodes

- `BatteryPack` is the source: a hardware-only, portless node whose part is
  the exact **cell**, with `series` and `parallel` settings. Its voltage
  window, nominal voltage, capacity, energy and continuous current are derived
  from the cell.
- `BatteryModule`, shown as **Pack Electronics**, is one physical board. A
  board declares what it does in its `batteryModule` catalogue block, because
  real boards combine functions: the 1S module protects, charges and boosts;
  both 4S BMS boards protect and balance; the IP2368 charges. The functions
  are `protection`, `balance`, `charger` and `output` (a 5 V rail made on the
  same board).
- The bucks are `PowerConverter` parts with the `led-rail` role. They are not
  isolated, so the rail path reads each converter's printed terminals and its
  isolation from the catalogue: an isolated converter keeps FG and the −V
  bond, and a common-negative one draws IN− and OUT− as one net.
- A board's `output` function is planned as a rail converter, so LED feeds
  are packed into it the same way they are packed into a buck.

### The source window

A pack on the bench is the one shared source for every converter.

- `minV` = S × the protection board's over-discharge voltage. This is the
  lowest voltage the converters see, so input current, fuses and wire are
  sized here.
- `fullV` = S × the charger's voltage per cell, or the cell's charge voltage
  when no charger is on the bench. It is shown as "full".
- `ceilingV` = S × the larger of the charger's voltage per cell and the
  protection board's over-charge threshold. The over-voltage check uses it.

A fixed source stays one voltage, so builds without a pack plan exactly as
before. A converter fed by a pack hides its own source-voltage setting.

### Ground

The protection board's P− is the system's one 0 V net. Converter input
negatives and the charger join it, and isolated converter outputs still bond
to it at their distribution point. Only the protection board's B− and the B0
sense lead touch the cells' B−: anything else on B− bypasses the protection.
A battery build has no protective earth, so a converter's FG terminal bonds
to a metal enclosure if there is one.

### Fuses

The battery main fuse sits on B+, as close to the cells as its holder allows.
It follows the same 75% loading rule as every other fuse, and the protection
board's continuous rating and the parallel cells' continuous rating cap it
the way a connector caps a branch fuse. Every fuse on the battery side must
also interrupt the pack's prospective short-circuit current at the pack's
maximum voltage. That current is estimated as P × cell charge voltage ÷ cell
internal resistance, which ignores board, strip and wire resistance and so
errs high. A cited table of fuse classes (blade, MIDI, ANL, MRBF, Class T)
gives each class's DC voltage and interrupting rating.

### Hardware sizing and software limits

The 2026-09-27 rule stands: hardware is sized for full white, and a FastLED
current limit is a running limit only. The 32×32 build draws about 61 A at
5 V at full white, so with 20% headroom the plan calls for two 60 A bucks and
sizes the protection board, main fuse and trunk for full white. Its 30 A
limit is shown with the runtime it gives.

### Runtime

Runtime is the pack's rated energy over the LED full-white power through the
converter efficiency, worded "at most about". The runtime at a configured
running limit is shown as information. Adafruit's NeoPixel Überguide warns
that emptying a battery in about an hour can be dangerous and advises one that
lasts at least a couple of hours, so a pack that full white empties in under
two hours gets a warning.

## Rules

| Id | Severity | Condition |
| --- | --- | --- |
| `battery-pack-count` | blocking | More than one pack |
| `battery-function-count` | blocking | Two boards provide the same function |
| `battery-module-orphan` | warning | A board with no pack |
| `battery-no-protection` | blocking | No board protects the pack |
| `battery-protection-unsupported` | blocking | Separate-port or positive-switched protection |
| `battery-no-balance` | warning | More than one cell in series and no board balances |
| `battery-<board>-series` | blocking | A board's series count differs from the pack's |
| `battery-<board>-chemistry` | blocking | A board does not take the cell's chemistry |
| `battery-pack-voltage` | blocking | `ceilingV` above 32 V, until the fuse-class step lands |
| `<converter>:source-window-high` | blocking | `ceilingV` above the converter's rated input |
| `<converter>:source-window-never` | blocking | `fullV` below the converter's minimum input |
| `<converter>:source-window-low` | warning | `minV`, less trunk and input drop, below the converter's minimum: it stops before the pack is empty |
| `battery-cutoff-below-cell` | warning | Over-discharge below the cell's rated cut-off |
| `battery-main-fuse` | blocking | No standard fuse between the design current ÷ 0.75 and the protection or cell limit |
| `battery-charger-voltage` | blocking | Charger voltage per cell above the cell's charge voltage |
| `battery-charge-current` | blocking | Charge current above the protection board's charge rating or the cells' |
| `battery-charge-temperature` | warning | The protection board has no temperature sensor |
| `battery-discharge-rate` | warning | Full white empties the pack in under two hours |
| `battery-led-without-rail` | blocking | A pack and LED outputs, but no rail converter or board output |
| `battery-controller-usb` | warning | A pack, but the controller is on USB from no battery source |
| `battery-no-load` | warning | A pack that nothing draws from |
| `pd-trigger-battery` | warning | A PD trigger and a pack together; the pack is the source |
| `battery-fuse-interrupt` | blocking | No fuse class covers `ceilingV` and the prospective current |

Recommendations: the main fuse position; every negative to P−; balance leads
connected in the board's own order from B0, checked with a meter and plugged
in last; a USB-C PD charger of at least the board's input wattage, with a 5 A
e-marked cable for 100 W; the IP2368's USB-C can also discharge the pack; the
balancer's standby drain; FG to a metal enclosure; runtime. Above 30 A of pack
current, the Überguide's advice applies: builds of this size are hazardous,
and a professional with high-power, low-voltage experience should check them.

## Order of work

0. Fix three plan defects the battery rules depend on: plan blockers are
   listed under **Fix before building** and named in Readiness; an
   unsupported part gives its own reason instead of LED chipset advice; and
   power-path parts get no controller ground row.
1. Scope documents (this plan, the root todo and the roadmap).
2. Blender models and catalogue blocks for the cell, the 1S module, both BMS
   boards, both bucks and the IP2368 board, from their listings.
3. The pack as the DC source: nodes, Hardware shelf and bench, manifest,
   source window, rules, exports and the Build Diagram sidebar.
4. Fuse classes and interrupting rating.
5. The battery section on the Build Diagram and its printed page.
6. Record: architecture and user docs, support-matrix rows, bench rows,
   changelog.

## Deferred

- A state-of-charge signal in the graph, from a Power Monitor on the pack or
  a BMS with a serial port.
- Separate-port and positive-switched protection boards.
- Commercial packs with a built-in BMS, modelled as one part.
- Mains SSRs and contactors (D-05 item 3).

## Sources

- Adafruit, [NeoPixel Überguide](https://learn.adafruit.com/adafruit-neopixel-uberguide):
  powering NeoPixels (60 mA per pixel at full white, battery runtime of at
  least a couple of hours, an electrician for large builds) and best practices
  (500–1000 µF across the supply, 300–500 Ω on data, ground first).
- Each part's datasheet or listing, recorded in its `Sources.md` in the asset
  workspace.

# Downloadable parts

Status: **proposal** · Owner: app ·
Updated: 2026-11-18

There is far more hardware than the app can sensibly bundle. This plan lets a
new part arrive from the website after release, in any app version that already
knows how to drive that kind of part, without an app update and without a
compatibility break. A part is **data only**. It is written against a **part
type** that ships as code in the app. The [hardware expansion
roadmap](hardware-expansion-roadmap.md) decides which hardware is worth adding;
this plan decides how a part is described, carried in a save and delivered.

The one piece that cannot wait is how a saved project refers to its parts. The
save format closes at v1.0.0 ([root todo](../../todo.md), step 1 and HW-18), so
phase A below has to be decided before then. Everything else can follow v1.

## Goal and non-goals

Goal: a part published on the website works in app 1.0.0 and in app 2.2.6 alike,
provided the app knows the part's type. An app that does not know the type says
so plainly instead of guessing.

Not goals:

- Parts that carry code. No C++ snippets, no expressions, no arbitrary Arduino
  library names in a part file.
- User-defined part types. A new type is app code and arrives in an app update.
- A marketplace. Official parts come from one place, the project website.

## What exists today

The model is already most of the way there. It is just compiled in.

- **The node type is already the part type.** A node's `partId` property picks a
  catalogue entry, and that entry's typed block (`relay`, `mosfet`,
  `powerMonitor`, `distanceSensor`, `display` and so on) parameterises shared
  code. `partDerivedInputs` in `src/build/parts/partPorts.ts` derives relay,
  MOSFET and buzzer ports from the chosen part; `relayChannelCountForPart`
  (`src/state/peripherals/relayModule.ts`) and the MOSFET channel rules
  (`src/state/peripherals/powerSwitch.ts`) read the block, not a list of part
  ids. `DistanceInput` switches between pulse and I2C wiring on the block's
  `interface` ([hardware model](../architecture/hardware-model.md)).
- **One level below the node type sits the chip.** Codegen picks register-level
  helpers by the block's `device` string: INA219 or INA226 in
  `src/codegen/peripherals/powerMonitorCpp.ts`, VL53L0X or VL53L1X in
  `src/codegen/peripherals/distanceSensorCpp.ts`.
- **The catalogue is a static import.** `scripts/assets/import-part-assets.py`
  turns each verified `part.json` into `src/build/generated/partCatalogueData.ts`
  and a WebP in `public/parts/`. `partById` in `src/build/parts/partCatalogue.ts`
  is the only reader of that data, and nothing loads parts at run time
  ([asset import contract](../development/hardware-asset-import.md)).
- **Some per-part data is still hand-written in TypeScript**, outside the
  manifest:
  - option rows in `PART_OPTIONS` (`src/build/parts/partOptions.ts`);
  - shelf entries in `INPUT_PARTS` and `FIXTURE_PARTS`
    (`src/components/Hardware/hardwarePartCatalog.ts`), with fallback
    footprints;
  - pad pixel geometry in `MODULE_PAD_GEOMETRY` and the supply rail rules
    (`src/components/BuildDiagram/physicalDiagramLayout.ts`);
  - preview notes and help copy that name chips (`studioNodeChrome.ts`, the
    help reference).
- **Parts do not declare libraries.** Codegen emits the include for a device
  (`distanceSensorLibraryInclude`), and the helper pins and installs the
  version (`_VL53L0X_VERSION` in `backend/toolchain.py`), mirrored by hand and
  guarded by a test.
- **Saves hold only the `partId` string** in node properties. The file carries
  `formatVersion` (`SAVE_FORMAT_VERSION = 1` in `src/state/saveFormat.ts`);
  there is no migration framework yet.
- **An unknown `partId` falls back silently.** `distanceSensorSpec` returns an
  HC-SR04 spec for any id it cannot find, so an unknown laser sensor would be
  generated as an ultrasonic pulse sensor. `relayChannelCountForPart` returns 1,
  so a relay board's extra ports are dropped by `normalizeLoadedGraph`. Only
  the power manifest items report "not in the catalogue". For downloaded parts
  this has to become an explicit error.

## Model

**Part type** — code that ships in the app:

- a node type plus, where the type has more than one chip family, a `device`;
- owns codegen, preview, ports, property schema, validation;
- owns the Arduino libraries: name, pinned version, include order (the
  `Audio.h` before `FastLED.h` trap stays a code fact);
- owns chip constants that are not per-board facts, such as the VL53 assigned
  address range.

**Part manifest** — data, bundled or downloaded:

- `manifestVersion`, `partId`, `revision`;
- `partType` and `device`, both names the app registry must recognise;
- physical facts: dimensions, render, pads, pin labels left to right, indicator
  positions;
- electrical facts: logic voltage, supply rail, current draw or supply;
- the part type's spec block (today's `relay`, `mosfet`, `display` blocks);
- shelf and option copy: label, summary, wiring note, hint;
- `sources` and `verification` (see [Authoring](#authoring-with-an-agent)).

Rules:

1. A manifest names only part types and devices the app's registry lists. If any
   is unknown, the app shows "this part needs a newer version of Design Studio"
   and does not load the part. It never falls back to a different part.
2. Bundled parts load through exactly the same manifest path as downloaded
   ones. They are a pre-installed pack. There is one catalogue code path.
3. The node type and device strings are permanent once released. A rename
   needs an alias in the registry, never a broken part.

## Schema vocabulary

The words a manifest uses are the compatibility contract. Part types can be
added in any later app version, but the vocabulary has to be right at v1.0.0.
After that it grows only by addition, and an app ignores optional fields it
does not know.

- **Interfaces:** I2C, SPI, UART, I2S, CAN (TWAI), RS-485, 1-Wire, parallel
  (8080), GPIO, PWM, analog, and the LED data protocols (clockless, clocked,
  HUB75).
- **Pin roles:** named, not just numbered: SDA, SCL, MOSI, MISO, SCK, CS, INT,
  RST, EN, TX, RX, DE/RE, CANH/CANL, DATA, CLK, and per-channel control pins.
- **Voltage domains:** logic voltage, tolerated logic levels, supply rail,
  whether a level shifter is needed.
- **Power:** draw per rail, typical and peak; supplied current for sources.
  This feeds the existing power plan.
- **Board requirements:** what the controller must offer, for example a native
  TWAI peripheral, a free SPI bus, an I2S port, PSRAM. Checked against the
  board profile.

Keep the part type separate from how the part connects. CAN shows why: an
MCP2515 module is a CAN controller on SPI; an SN65HVD230 is a transceiver on the
ESP32's own TWAI controller. Both are one CAN part type with two transports, as
`DistanceInput` already has two. If a type is welded to a bus, every new
breakout needs a new type, and the website catalogue cannot grow without app
releases.

## Saves

- A project carries a `parts` map from `partId@revision` to the manifest it was
  built with. Renders are referenced by content hash with a cached copy, so a
  project opens offline, on another machine, and unchanged after the website
  edits that part.
- On load the embedded manifest wins. A newer website revision is offered to
  the user, never applied silently.
- A node whose part type the app does not know is kept, not dropped or
  remapped. It is marked on the canvas and Upload is blocked with a plain
  reason, following `waitingForTrust` in `src/utils/uploadBlockReason.ts`.
- This lands with the v1.0.0 save format, so there is no migration to write
  afterwards. Before v1, `partId`-only saves are replaced cleanly, as
  CLAUDE.md allows for pre-1.0 shapes.

## Trust and safety

- **No code in manifests.** Text reaches C++ only through `cppLiterals.ts`
  (`cppStringLiteral`, `cppComment`, `safeId`); pins only through
  `sanitizePin`; each numeric field is range-checked by its part type.
- **Libraries come only from the part type.** The helper installs nothing a
  manifest names directly.
- **Official manifests are signed.** The app verifies the signature before
  loading a downloaded part.
- **Side-loaded manifests** (a file a user opens, not from the website) go
  behind the existing workspace trust (`workspaceNeedsTrust` in
  `src/state/patterns/patternTrust.ts`), the same as formula nodes.
- **Renders** are size- and format-checked on load: WebP only, bounded pixel
  size and bytes.

## Publishing

`import-part-assets.py` keeps its role as the verification gate: dimensions and
pin order verified against source evidence, renders from verified Blender
assets. Instead of TypeScript, it emits a manifest package (JSON plus WebP). The
same package is bundled into the app or uploaded to the website index.

The [support matrix](../release/beta-support-matrix.md) still owns what is
supported versus experimental. A downloaded part inherits its part type's
support status unless its own bench row says more.

## Authoring with an agent

A part-authoring skill for Claude Code (`.claude/skills/`) can draft parts:
research the datasheet, write `part.json`, build the model through
`Scripts/board_rebuild/`, run the importer with `--only <part-id>`, and
validate the manifest. That is worth doing once the schema exists. It shapes the
schema now in three ways:

- **The manifest is machine-checkable.** One JSON Schema plus validator, used by
  the importer, the app loader and the agent.
- **Every measured fact has a source.** `sources` records the datasheet or
  fabrication print behind each dimension and the pinout.
- **Verification is a field with three levels.** `verification` is `drafted`,
  `reviewed` or `bench`.
  - The agent can only set `drafted`.
  - A human review sets `reviewed`.
  - A recorded bench run sets `bench`.

  Only `reviewed` and above are published.

The agent targets existing part types only. A part that needs a new type comes
back as a part-type request, not as a manifest.

## Part type registry

New types arrive in app updates. That is an addition, not a break: older apps
report "needs a newer version" for parts of a type they lack.

| Part type | Status |
| --- | --- |
| LED outputs (strip, matrix, ring, HUB75) | in |
| Displays (info, segment, TFT and touch) | in |
| Microphones and I2S audio, amplifiers, DFPlayer | in |
| SD storage | in |
| DMX / RS-485 transceiver | in |
| Ethernet (W5500) | in |
| Power monitor, battery, power conversion and switching | in |
| Distance, IMU, environment, light, temperature (1-Wire) | in |
| Clock (`RTCInput`) with DS3231 | in |
| Relay and SSR (`RelayOutput`) | in |
| MOSFET power switch (`PowerSwitchOutput`) | in |
| Darlington driver (`DarlingtonDriverOutput`) | in |
| Input controls (buttons, encoders, keypad, IR) | in |
| CAN (MCP2515 on SPI, transceiver on TWAI) | planned |
| UART serial device | planned |
| GPIO expander | planned |
| PWM driver (PCA9685) | planned |
| Radio (LoRa, nRF24) | planned |

`NODE_LIBRARY` is authoritative for what is in; this table only shows the
shape of the registry.

## Phases

**A. Before v1.0.0**

1. Write manifest schema v1 and its vocabulary, with the validator.
2. Build the part-type and device registry from the existing node types and
   `device` strings.
3. Move hand-written per-part data into manifests: option rows, shelf entries,
   pad geometry, supply rail.
4. Load the bundled catalogue through the manifest path at run time.
5. Embed manifests in saves.
6. Replace silent fallbacks for unknown parts and types with explicit errors.

**B. After v1.0.0**

1. Website index and signed packages.
2. Download, cache and revision-update UI in the hardware shelf.
3. The part-authoring skill.

**C. As hardware needs them**

New part types, CAN first.

## Open questions

- Where the website index lives, and who holds the signing key.
- Whether users may side-load their own manifests in v1.0.0, or only official
  parts.
- Whether renders are embedded in the save or fetched and cached by hash.
- How help entries and live examples are shown for a downloaded part.

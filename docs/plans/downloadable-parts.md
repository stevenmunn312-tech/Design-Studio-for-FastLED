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

v1.0.0 is meant to be a long-lived release: a new publisher earns trust by not
shipping a new binary every few weeks. So v1.0.0 has to contain **the whole
client side**: schema, part-type registry, runtime catalogue, generated help,
signature checks, index download and search, and saves that embed their parts.
If any of that waits, every new part needs an app release again. What can
follow v1 is all on the project's side: hosting the index, the part-authoring
agent, requests, and the parts themselves. The save format also closes at
v1.0.0 ([root todo](../../todo.md), step 1 and HW-18), which fixes the same
deadline for how saves carry parts.

## Goal and non-goals

Goal: a part published on the website works in app 1.0.0 and in app 2.2.6 alike,
provided the app knows the part's type. An app that does not know the type says
so plainly instead of guessing.

Not goals:

- Parts that carry code. No C++ snippets, no expressions, no arbitrary Arduino
  library names in a part file.
- User-defined part types. A new type is app code and arrives in an app update.
- User-made parts. Users request a part; only the project's own pipeline makes
  it, and only parts the project publishes are in the database. The app loads
  no part file from anywhere else.
- A marketplace. Official parts come from one place, the project's parts
  database.

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
- **Only signed manifests load.** The app verifies the project's signature on
  every manifest, downloaded or embedded in a save. There is no side-loading,
  so there is no trust prompt to design for parts.
- **Keys can rotate without a release.** v1.0.0 ships with a list of trusted
  public keys, not one key, and the signed index can announce a successor key
  signed by a current one. A lost or retired key then costs no app update.
  Part signing is separate from code-signing the installer; it needs no
  certificate authority and can start before the installer is signed.
- **A save from someone else** carries signed manifests too. A manifest whose
  signature fails is treated like an unknown part: the node is kept, marked,
  and Upload is blocked.
- **Renders** are size- and format-checked on load: WebP only, bounded pixel
  size and bytes.

## Publishing

`import-part-assets.py` keeps its role as the verification gate: dimensions and
pin order verified against source evidence, renders from verified Blender
assets. Instead of TypeScript, it emits a manifest package (JSON plus WebP). The
same package is bundled into the app or published.

**Hosting is static.** There is no database server to run. The "database" is
one signed index file (every published part's id, revision, part type, chip,
interface, labels, verification and package hash) plus one package per part,
on static hosting such as GitHub Pages or release assets. Publishing a part is:
add its package, regenerate and sign the index, upload. The app checks the
index on start-up and when the shelf search opens, caches it, and works offline
from the cache and the bundled parts.

The [support matrix](../release/beta-support-matrix.md) still owns what is
supported versus experimental. A downloaded part inherits its part type's
support status unless its own bench row says more.

## Shelf categories

Browsing categories are data, not code, and they are separate from part types.
A part type says how the app drives a part. A category says where a person
looks for it. One part type can span several categories: `DistanceInput`
covers both ultrasonic and laser sensors, and they belong on different shelves.

Today the groups are a hand-written table, `SHELF_SUBCATEGORIES` in
`src/components/Hardware/hardwareShelfModel.ts`. It groups by node type, so
ultrasonic and time-of-flight sensors share "Motion & distance", and a new
group needs an app release.

- **The tree lives in the signed index.** Each category has an id, a label, an
  order and a parent, and the tree can be as deep as the hardware needs. For
  example: Sensors › Distance › Ultrasonic, and Sensors › Distance ›
  Time-of-flight (laser).
- **Each manifest names its category ids**, usually one and occasionally more.
  A part is placed by its own manifest, not by its node type.
- **The shelf renders whatever tree the index carries.** Adding, splitting or
  renaming a category is an index update, not a release. Category ids are
  permanent; a split keeps the old id as an alias so cached indexes still
  resolve.
- **Search matches category labels as well as part names,** so "laser" finds
  every time-of-flight sensor.
- **Bundled parts carry their categories too,** and the app ships a copy of the
  tree for offline use.

Categories only affect browsing. They never decide behaviour; that is the part
type and device. The laser sensor that turned into an ultrasonic one (see [What
exists today](#what-exists-today)) is a fallback bug, fixed by the
unknown-part error, not by categories.

## Requests and search

- **Search.** The Hardware shelf searches the cached index locally, together
  with the bundled parts: by name, manufacturer, part type, interface and chip.
  No search service is needed. Results
  show whether the part is installed, its verification level and its support
  status. Adding a part to the bench downloads and caches its package.
- **Requests.** A user who cannot find a part files a part request: product
  link, datasheet link, what they want it to do. A GitHub issue template beside
  `feature-request.yml` is enough to start; an in-app form can follow.
- **Triage.** Each request is answered one of three ways:
  - **fits an existing part type:** the agent drafts it, a human reviews it,
    then it is published;
  - **needs a new part type:** it joins the [hardware expansion
    roadmap](hardware-expansion-roadmap.md) and waits for an app release;
  - **not possible:** for example no datasheet, or the board cannot drive it.
    The reason goes back to the user.

## Help

Help splits along the same line as code and data.

- **Part type help stays in the app.** The overview, steps, port reference and
  live example for a node type (`HelpModal/reference/<category>.ts`) describe
  behaviour, which is code. They change only with an app release.
- **Part help comes from the manifest.** Today the type help names each
  catalogued board by hand. For example, the `PowerSwitchOutput` overview lists
  the LR7843, Mosfetti and YYNMOS-4 with their voltages and channel counts.
  That paragraph becomes a generated "Boards for this node" list. Each entry is
  built from a manifest's label, summary, wiring note, limits and pin labels.
  A new part then shows in help the day it is published, with no app release.
- **Generated, not written per part.** The agent writes the manifest's copy
  fields to a fixed style, and the reviewer checks them with the rest of the
  part. The app renders them. No free-form help text is downloaded, and the
  copy fields are plain text, never markup.
- **The live example stays per type.** A type's example uses its default part.
  A downloaded part does not bring its own example graph.

## Authoring with an agent

A part-authoring skill for Claude Code (`.claude/skills/`) makes parts:
research the datasheet, write `part.json`, build the model through
`Scripts/board_rebuild/`, run the importer with `--only <part-id>`, write the
copy fields, and validate the manifest. It is the only way a part enters the
database. The schema has to support it from the start in three ways:

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

### The bundled library goes through the same pipeline

The parts that ship with the app are made by exactly the pipeline that makes
downloaded parts, and still ship in the app. This is worth doing for three
reasons:

- **One path.** Bundled and downloaded parts differ only in where the package
  comes from. A bug in loading, embedding or help generation shows up on
  bundled parts first, before v1.
- **Ground truth for the agent.** Every bundled part was verified by hand
  against its datasheet and modelled from verified Blender assets. Have the
  agent re-draft a sample of them from the datasheet alone, then diff the
  draft against the verified manifest: dimensions, pin order, address, rail,
  limits, copy. The diff measures the agent before it makes a part nobody has
  checked. Re-run it when the skill or schema changes.
- **The conversion is phase A anyway.** Moving option rows, shelf entries, pad
  geometry and help paragraphs out of TypeScript into manifests is the same
  work as building the publishing format.

Existing parts start at `reviewed`, or at `bench` where a bench row records a
run. Their `sources` are filled from the asset workspace's per-part source
notes.

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
| PWM driver, PCA9685 (`PwmDriverOutput`) | in |
| Input controls (buttons, encoders, keypad, IR) | in |
| CAN (MCP2515 on SPI, transceiver on TWAI) | planned |
| UART serial device | planned |
| GPIO expander | planned |
| Radio (LoRa, nRF24) | planned |

`NODE_LIBRARY` is authoritative for what is in; this table only shows the
shape of the registry.

**Decide the v1.0.0 types before the freeze.** Only part types in v1.0.0 can
gain downloaded parts while v1.0.0 is current. A type that is likely to be
wanted soon and is cheap to add belongs in v1.0.0 even with one bundled part,
so that later parts of that type need no release. Candidates to weigh: CAN,
GPIO expander, UART serial device, radio. Each new type follows the usual rules: built
from documentation, marked experimental, promoted by bench rows.

## Phases

**A. In v1.0.0 — the whole client side**

1. Write manifest schema v1 and its vocabulary, with the validator.
2. Build the part-type and device registry from the existing node types and
   `device` strings.
3. Move hand-written per-part data into manifests: option rows, shelf entries,
   pad geometry, supply rail, and the per-part paragraphs in type help.
4. Convert the bundled library through the importer into signed packages, and
   load it through the manifest path at run time.
5. Generate the per-part help from manifests, and drive the shelf from the
   category tree in place of `SHELF_SUBCATEGORIES`.
6. Verify signatures against a list of trusted keys, with successor-key
   announcements in the index.
7. Fetch and cache the signed index; search it in the shelf; download, cache
   and offer revision updates for packages.
8. Embed manifests in saves.
9. Replace silent fallbacks for unknown parts and types with explicit errors.
10. Decide the v1.0.0 part types, and add the chosen new ones.

Steps 1 to 5, 8 and 9 change nothing a user sees when they are done well, so
they are proved by the existing suites plus a full compile matrix, the same as
any refactor. Steps 6 and 7 are proved against a test index on a local server.
All of it rides the one pre-release matrix run in [root todo](../../todo.md)
step 5; it does not need a run of its own.

**B. After v1.0.0 — the project's side**

1. Static hosting for the index and packages, and the signing key in safe
   custody.
2. The part-authoring skill, measured against the bundled library first.
3. The part request template and triage.
4. Publishing parts.

**C. In later app releases**

New part types that missed v1.0.0.

## Open questions

- Which static host serves the index, and where the signing key is kept.
- Whether renders are embedded in the save or fetched and cached by hash.
- Which new part types join v1.0.0.
- How a part that is later found wrong is withdrawn: a new revision, a warning
  on saves that embed the old one, or both.
- What accuracy the agent must reach against the bundled library before its
  drafts go to review.

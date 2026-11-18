# Part type download audit

Date: 2026-11-19. Read-only audit; no code was changed.

## What was audited

All 39 part types in `src/build/parts/partTypes.ts` (every one `downloadable: false`), against the bar in `docs/plans/downloadable-parts.md` ("Model", "What exists today", "Phases" step 3): a new part of the type, described only by its manifest (catalogue entry plus type block), must work end to end with no code that branches on, looks up or lists a bundled part id, and no per-part fact hard-coded in TypeScript or Python.

## Method

- Listed the 93 bundled part ids and the block each one carries from `src/build/generated/partCatalogueData.ts`.
- Grepped `src/` and `backend/` (excluding `__tests__`, `tests`, `generated`, `partResolution.ts`, `partReferences.ts`) for every id as a string literal, for every `*_PART_ID` constant and its uses, for `partId ===`-style comparisons, for `FALLBACK_SPEC` constants, and for chip names (`INA226`, `VL53L1X`, `MAX7219`, `W5500`, ...).
- Read the per-type state files (`src/state/peripherals/*`, `src/state/displays/*`), the codegen readers (`src/codegen/peripherals/*`, `src/nodes/*/codegen.ts`), `hardwareManifest.ts`, `physicalDiagramLayout.ts`, `hardwarePartCatalog.ts`, `partOptions.ts`, `partRenders.ts`, `studioNodeChrome.ts`, the help reference, and `backend/toolchain.py` / `backend/firmware.py` for library pins.
- Findings are tagged `data` (a per-part fact or copy in code), `id-branch` (code selects, looks up or defaults by a bundled part id), `chip-level, ok` (behaviour chosen by a chip string that is in the type's `devices` list, or the single chip the type is written for) or `library` (Arduino library name, pin, include).
- Not run: tests, compiles, the app. Line numbers are as of this checkout.

## Verdict meanings

- `ready`: nothing type-specific to move. The type still needs the cross-cutting moves below (pads, options, shelf entry, help) like every other type.
- `data move`: the code already reads the block; per-part literals keyed by part id, or copy, must move into the manifest or overlay. Some also depend on cross-cutting code change X7.
- `code change`: the type has no block, or its per-part facts live in a code list or a hard-wired single part, so a block or reader has to be added or reshaped before a second part can exist.

Ordered closest-to-ready to furthest. Cross-cutting items X1 to X9 are defined once at the end; each section lists the per-part lines they cover.

---

## 1. DigitalSensorInput

**Verdict:** `ready`

**Findings:**
- `src/build/parts/partOptions.ts:367-377` — option rows derived from `digitalSensorEntries(PART_CATALOGUE)` with summary from the block — none (already generic).
- `src/components/Hardware/hardwarePartCatalog.ts:529-570` — shelf entries derived from the catalogue (footprint, pin label, pull-up request from the block) — none (already generic).
- `src/components/BuildDiagram/physicalDiagramLayout.ts:1001-1003` — supply rail read from `facts.supplyVoltage` (the block's `supplyVolts`) — none.
- `src/components/BuildDiagram/physicalDiagramLayout.ts:908-910` — signal pad names are a generic silkscreen word list, tried after the part's own catalogue pin labels — none.
- `src/codegen/peripherals/digitalSensorCpp.ts:9-27`, `src/state/peripherals/digitalSensor.ts` — no id, unknown part emits a "not in the catalogue" comment — none.
- No bundled part exists yet (plan Phase A step 10), so X1 pads are the only thing a first part must supply.

**Overlay/manifest fields needed:** X1 `pads`, X2 `padHoleRadiusPx`; block `digitalSensor` already carries `activeLevel`, `pullUp`, `debounceMs`, `supplyVolts`, `activeLabel`, `idleLabel`.

## 2. AnalogSensorInput

**Verdict:** `ready`

**Findings:**
- `src/build/parts/partOptions.ts:378-388` — rows derived from `analogSensorEntries` — none.
- `src/components/Hardware/hardwarePartCatalog.ts:557-570` — shelf entries derived from the catalogue — none.
- `src/components/BuildDiagram/physicalDiagramLayout.ts:1001-1003` — rail from `supplyVoltage` — none.
- `src/nodes/shared/signalRange.ts:76`, `src/codegen/peripherals/analogSensorCpp.ts:27-29` — read `analogSensorSpec(partId)`, unknown part is an explicit null — none.
- No id literal, no chip string, no library.

**Overlay/manifest fields needed:** X1 `pads`, X2 `padHoleRadiusPx`; block `analogSensor` already complete.

## 3. BatteryPack

**Verdict:** `ready`

**Findings:**
- `src/build/parts/partOptions.ts:131-142` — rows derived from `batteryCellPartIds()` and the block — none.
- `src/state/peripherals/battery.ts:11` — `DEFAULT_BATTERY_CELL_PART_ID` used for new-node default (`src/nodes/hardware/definitions.ts:142`) and shelf entry (`hardwarePartCatalog.ts:181-182`) — default only, ok.
- `src/state/peripherals/battery.ts:29-122` — all cell figures from `batteryCell` (`packFacts`, `packWindow`, `prospectiveShortCircuitA`) — none.
- `src/state/nodeLibrary.ts:1432-1433` — series 1-8, parallel 1-20 slider bounds are type-level limits — chip-level, ok.
- `src/components/HelpModal/reference/hardware.ts:182,188,209` — examples and explanation name `samsung-inr18650-35e` and "18650" — data (help copy, X9).
- Not in `MODULE_PAD_GEOMETRY`; drawn by `BatteryAssembly.tsx` from the catalogue.

**Overlay/manifest fields needed:** `copy.summary` is already computed from the block; X9 help paragraph from manifest `copy`.

## 4. BatteryModule

**Verdict:** `ready`

**Findings:**
- `src/build/parts/partOptions.ts:143-150` — rows from `batteryModulePartIds()` and `batteryModuleSummary` — none.
- `src/state/peripherals/battery.ts:31-85` — protection, balance, charger, output functions all read from `batteryModule` — none.
- `src/build/power/electricalPlan.ts:540-548` — plan reads `batteryModuleSpec(partId)?.output` — none; the blocker copy at 548 says "Use one SD-100 model" — data (copy naming a PowerConverter part, see type 16).
- `src/nodes/hardware/definitions.ts:155` and `src/components/Hardware/hardwarePartCatalog.ts:186-195` — `hx-4s-f30a-bms-balance` as new-node default and shelf fallback footprint — default only, ok (X4).
- `src/components/HelpModal/reference/hardware.ts:183-184,210,213` — example ids and "IP5305T" prose — data (X9).

**Overlay/manifest fields needed:** X9 help from `copy`; block `batteryModule` complete.

## 5. CoolingFanOutput

**Verdict:** `data move`

**Findings:**
- `src/components/BuildDiagram/physicalDiagramLayout.ts:1146` — `MODULE_PAD_HOLE_RADIUS['noctua-nf-a4x10-5v-pwm']` — data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:503` — pads for the Noctua — data
- `src/state/peripherals/coolingFan.ts:8-19` — `FALLBACK_SPEC` is the Noctua's numbers, applied to any unknown id — id-branch (X8)
- `src/state/peripherals/coolingFan.ts:3` — `COOLING_FAN_PART_ID` default; also `src/nodes/output/definitions.ts:439`, `hardwarePartCatalog.ts:257-262` — default only, ok
- `src/state/peripherals/coolingFan.ts:4-6` — fallback pins 25/26 and default speed — chip-level, ok (type default)
- `src/codegen/peripherals/` and `src/nodes/output/codegen.ts:131,243` — read `fan` block (pwmHz, tach pulses); 25 kHz ESP32-only gate at `hardwareManifest.ts:1318` — chip-level, ok
- `src/build/parts/partOptions.ts:111-121` — single hand-written row with a note naming the pulses and 25 kHz — data (X3)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:925` — `cooling-fan-output` pad names PWM / RPM-TACH — data (generic list, ok; catalogue labels win)

**Overlay/manifest fields needed:** `copy.summary`, `copy.wiringNote`, `pads`, `padHoleRadiusPx`; `supplyRail` (fan is 5 V by `fan.supplyVoltageV`, not a branch).

## 6. TemperatureInput

**Verdict:** `data move`

**Findings:**
- `src/state/peripherals/temperatureSensor.ts:3-15` — `DS18B20_PART_ID` default, `FALLBACK_SPEC` of the DS18B20 — id-branch (X8)
- `src/state/peripherals/temperatureSensor.ts:4` — `DS18B20_PULL_UP_OHMS = 4700` — chip-level, ok (also in block `pullUpOhms`)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:469,1102` — pads and hole radius for the probe — data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:992` — `temperature-input` always on the 3.3 V rail (comment about the 4.7 kohm pull-up) — data (supply rail, X5)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:1241` — kind-based rule for the pull-up resistor drawing — chip-level, ok
- `src/components/BuildDiagram/physicalDiagramLayout.ts:930` — `temperature-input` pad name DATA — data
- `src/components/Hardware/hardwarePartCatalog.ts:890-900` — hand-written input entry (label, hint, footprint fallback `28x72`, pin label) — data (X4)
- `src/build/parts/partOptions.ts:429-439` — hand-written row — data (X3)
- `src/components/Canvas/studioNodeChrome.ts:108` — note names "firmware reads the DS18B20" — chip-level, ok
- `src/components/HelpModal/reference/input.ts:481` — paragraph names DS18B20 — data (X9)

**Overlay/manifest fields needed:** `copy.summary`, `copy.wiringNote`, `pads`, `padHoleRadiusPx`, `supplyRail`, `footprintFallback` (or none once X4 is derived).

## 7. TouchButtonInput

**Verdict:** `data move`

**Findings:**
- `src/state/peripherals/touchButton.ts:3,5-18` — `DEFAULT_TOUCH_BUTTON_PART_ID`, `FALLBACK_SPEC` (TTP223-BA6) for any unknown id — id-branch (X8)
- `src/build/hardwareManifest.ts:978` — `supplyVoltage: 3.3` hard-coded for every touch button — data (should read `touchSensor.supplyMinV/MaxV` or `supplyRail`)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:1026` — `touch-button-input` always 3.3 V — data (X5)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:489,1137` — pads and hole radius — data
- `src/build/parts/partRenders.ts:50-53` — `TouchButtonInput` render map entry labelled "Seeed Studio Grove Touch Sensor" — data (X6)
- `src/components/Hardware/hardwarePartCatalog.ts:685-695` — input entry names the Grove, `properties: { partId: 'seeed-grove-touch-sensor' }`, footprint fallback — id-branch (X4)
- `src/build/parts/partOptions.ts:276-286` — hand-written row — data (X3)
- `src/components/HelpModal/reference/input.ts:115` — paragraph "the Seeed Grove Touch Sensor" — data (X9)

**Overlay/manifest fields needed:** `supplyRail`, `copy.summary`, `copy.wiringNote`, `pads`, `padHoleRadiusPx`.

## 8. JoystickInput

**Verdict:** `data move`

**Findings:**
- `src/state/peripherals/joystick.ts:3,6-14` — `KY023_PART_ID` default and `FALLBACK_SPEC` — id-branch (X8)
- `src/build/hardwareManifest.ts:1566-1569` — fallback label `'KY-023 joystick'` and `facts.supply: '3.3 V'`, `axes: '2 analog + switch'` hard-coded — data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:1006` — `joystick-input` always 3.3 V — data (X5)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:522,1106` — pads and hole radius — data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:932` — pad names VRX / VRY / SW — chip-level, ok (type pin names)
- `src/build/parts/partRenders.ts:92-95`, `hardwarePartCatalog.ts:826-845` — render map and shelf entry for KY-023 — id-branch (X6, X4)
- `src/build/parts/partOptions.ts:352-366` — hand-written row — data (X3)
- `src/components/HelpModal/reference/input.ts:621` — "such as the KY-023" — data (X9)

**Overlay/manifest fields needed:** `supplyRail`, `copy.*`, `pads`, `padHoleRadiusPx`.

## 9. PresenceInput

**Verdict:** `data move`

**Findings:**
- `src/state/peripherals/presenceSensor.ts:11,28-36` — `DEFAULT_PRESENCE_PART_ID`, `FALLBACK_SPEC` (LD2410C numbers) and a second id fallback `partById(DEFAULT_PRESENCE_PART_ID)` — id-branch (X8)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:1023` — `presence-input` always 5 V (comment: radar needs 5 V and over 200 mA) — data (X5)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:533,1114` — pads and hole radius — data
- `src/state/peripherals/presenceSensor.ts:19-26,56-58` — `PRESENCE_UART_PORT = 1`, ESP-only gate — chip-level, ok (device list `HLK-LD2410C`)
- `src/build/hardwareManifest.ts:1162` — manifest reads `partById(... ?? DEFAULT_PRESENCE_PART_ID)` — default only, ok
- `src/components/Hardware/hardwarePartCatalog.ts:902-913`, `partRenders.ts:68-71` — shelf and render entries for the LD2410C — id-branch (X4, X6)
- `src/build/parts/partOptions.ts:265-275` — hand-written row — data (X3)
- `src/components/HelpModal/reference/input.ts:326` — paragraph "reads an HLK-LD2410C" — data (X9)

**Overlay/manifest fields needed:** `supplyRail`, `copy.*`, `pads`, `padHoleRadiusPx`.

## 10. PowerMonitorInput

**Verdict:** `data move`

**Findings:**
- `src/state/peripherals/powerMonitor.ts:11-12,18-27` — `DEFAULT_POWER_MONITOR_PART_ID`, `INA226_PART_ID`, `FALLBACK_SPEC` of the INA219, plus second fallback `?? partById(DEFAULT...)` — id-branch (X8)
- `src/state/nodeLibrary.ts:1407` — static `i2cAddress` options built from the default part; the override at `nodeLibrary.ts:1903-1906` exists only for this type — id-branch (X7; this type is the pattern to copy)
- `src/build/hardwareManifest.ts:1450` — `senseTerminals: spec.device === 'INA226' ? 'IN+ ...' : 'Vin+ ...'` — chip-level, ok but terminal names are per-part data; the block should carry them
- `src/codegen/peripherals/powerMonitorCpp.ts:97,169` — INA226 versus INA219 register paths chosen by `device` — chip-level, ok (`devices: ['INA219B','INA226']`)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:989` — `power-monitor-input` always 3.3 V (VIN is the pull-up tie) — data (X5)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:439,461,1092-1093` — pads and hole radius, both parts — data
- `src/components/Hardware/hardwarePartCatalog.ts:732-762` — two shelf entries (INA219, INA226), labels and fallback footprints — id-branch (X4)
- `src/build/parts/partRenders.ts:72-75` — render map for the INA219 — data (X6)
- `src/components/Canvas/studioNodeChrome.ts:76` — "firmware reads the INA219 or INA226" — chip-level, ok
- `src/build/parts/partOptions.ts:287-303` — two hand-written rows — data (X3)
- `src/components/HelpModal/reference/input.ts:788,794,816` — prose and a worked example naming INA219/INA226 and "0-3.2 A" — data (X9)

**Overlay/manifest fields needed:** `supplyRail`, `copy.*`, `pads`, `padHoleRadiusPx`, block field `senseTerminalLabels`.

## 11. PwmDriverOutput

**Verdict:** `data move`

**Findings:**
- `src/state/peripherals/pwmDriver.ts:12,17-24` — `PCA9685_PART_ID`, `FALLBACK_SPEC` — id-branch (X8)
- `src/state/nodeLibrary.ts:1401-1402` — `i2cAddress` options and `pwmHz` slider min/max built from the PCA9685 spec — id-branch (X7)
- `src/nodes/output/definitions.ts:389-396` — new-node defaults from the PCA9685 spec — default only, ok
- `src/components/BuildDiagram/physicalDiagramLayout.ts:1013` — `pwm-driver-output` always 3.3 V — data (X5)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:453,1096` — pads and hole radius — data
- `src/components/Hardware/hardwarePartCatalog.ts:234-246` — shelf entry (`PCA9685_PART_ID` footprint fallback `25.4 x 62.5`, hint "Sixteen PWM levels") — id-branch (X4)
- `src/build/hardwareManifest.ts:1258-1269` — default `PCA9685_PART_ID`, fallback label `'PCA9685 PWM driver'`, error text "this PCA9685" — default only, ok
- `src/utils/validateGraph.ts:3338` — "offered only on 0x40 to 0x6F" — chip-level, ok
- `src/build/parts/partOptions.ts:485-495` — hand-written row — data (X3)
- `src/components/HelpModal/reference/output.ts:163-168,181` — paragraphs naming PCA9685 — data (X9)

**Overlay/manifest fields needed:** `supplyRail`, `copy.*`, `pads`, `padHoleRadiusPx`.

## 12. EnvironmentInput

**Verdict:** `data move`

**Findings:**
- `src/state/peripherals/environmentSensor.ts:3-5,7-21` — `BME280_PART_ID`, address constants, `FALLBACK_SPEC` — id-branch (X8)
- `src/state/nodeLibrary.ts:1362` — static `i2cAddress` options from `BME280_PART_ID` — id-branch (X7)
- `src/nodes/input/definitions.ts:289` — new-node default — default only, ok
- `src/components/BuildDiagram/physicalDiagramLayout.ts:990` — `environment-input` always 3.3 V — data (X5)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:467,1101` — pads and hole radius — data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:929` — `environment-input` pad names SDI / SCK (the BME280 breakout's silkscreen) — data
- `src/components/Hardware/hardwarePartCatalog.ts:763-777` — shelf entry with `SDA (SDI)` / `SCL (SCK)` labels and footprint fallback — id-branch (X4)
- `src/build/parts/partRenders.ts:84-87` — render map — data (X6)
- `src/utils/validateGraph.ts:3314` — "this BME280 answers only on" — chip-level, ok
- `src/components/Canvas/studioNodeChrome.ts:112-113` — chip note — chip-level, ok
- `src/build/parts/partOptions.ts:440-450` — hand-written row — data (X3)
- `src/components/HelpModal/reference/input.ts:449-455` — paragraphs naming BME280 and 0x77 — data (X9)

**Overlay/manifest fields needed:** `supplyRail`, `copy.*`, `pads`, `padHoleRadiusPx`, `signalPadNames` (or rely on catalogue pin labels).

## 13. MotionVectorInput

**Verdict:** `data move`

**Findings:**
- `src/state/peripherals/motionVector.ts:3,5-15` — `MPU6050_PART_ID`, `FALLBACK_SPEC` — id-branch (X8)
- `src/state/nodeLibrary.ts:1333` — static `i2cAddress` options from `MPU6050_PART_ID` — id-branch (X7)
- `src/state/nodeLibrary.ts:2241` — property help names the MPU-6050 address and the DS3231 clash — chip-level, ok
- `src/nodes/input/definitions.ts:331-334` — new-node defaults from the part — default only, ok
- `src/components/BuildDiagram/physicalDiagramLayout.ts:1009` — `motion-vector-input` always 3.3 V — data (X5)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:513,1109` — pads and hole radius — data
- `src/components/Hardware/hardwarePartCatalog.ts:778-792` — shelf entry — id-branch (X4)
- `src/build/parts/partRenders.ts:76-79` — render map — data (X6)
- `src/utils/validateGraph.ts:3326` — "this MPU-6050 answers only on" — chip-level, ok
- `src/components/Canvas/studioNodeChrome.ts:80-81` — chip note — chip-level, ok
- `src/build/parts/partOptions.ts:304-314` — hand-written row — data (X3)
- `src/components/HelpModal/reference/input.ts:512-534` — paragraphs naming MPU-6050 and DS3231 — data (X9)

**Overlay/manifest fields needed:** `supplyRail`, `copy.*`, `pads`, `padHoleRadiusPx`.

## 14. TouchPadInput

**Verdict:** `data move`

**Findings:**
- `src/state/peripherals/touchPad.ts:3,5-16` — `MPR121_PART_ID`, `FALLBACK_SPEC` — id-branch (X8)
- `src/state/peripherals/touchPad.ts:55` — `TOUCH_PAD_PAD_COUNT = 12` fixed number of per-pad output ports regardless of the block's `electrodes` — chip-level, ok (`devices: ['MPR121']`) but a part with fewer electrodes still gets twelve ports
- `src/state/nodeLibrary.ts:1338` — static `i2cAddress` options from `MPR121_PART_ID` — id-branch (X7)
- `src/nodes/input/definitions.ts:357-362` — new-node defaults from the part — default only, ok
- `src/components/BuildDiagram/physicalDiagramLayout.ts:1011` — `touch-pad-input` always 3.3 V — data (X5)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:512,1110` — pads and hole radius — data
- `src/components/Hardware/hardwarePartCatalog.ts:793-807` — shelf entry — id-branch (X4)
- `src/build/parts/partRenders.ts:80-83` — render map — data (X6)
- `src/utils/validateGraph.ts:3350` — "this MPR121 answers only on" — chip-level, ok
- `src/components/Canvas/studioNodeChrome.ts:84-85` — chip note — chip-level, ok
- `src/build/parts/partOptions.ts:315-325` — hand-written row — data (X3)
- `src/components/HelpModal/reference/input.ts:552,559` — paragraphs naming MPR121 — data (X9)

**Overlay/manifest fields needed:** `supplyRail`, `copy.*`, `pads`, `padHoleRadiusPx`.

## 15. DarlingtonDriverOutput

**Verdict:** `data move`

**Findings:**
- `src/state/peripherals/darlingtonDriver.ts:11,18-24` — `DARLINGTON_PART_ID`, `FALLBACK_SPEC` of the ULN2803A — id-branch (X8)
- `src/state/peripherals/darlingtonDriver.ts:13-16` — `DARLINGTON_CHANNELS = 8` and `DARLINGTON_PIN_FALLBACKS` ignore the block's `channels` — chip-level, ok (type is written for eight-channel low-side arrays; the type has no `devices` list, so a four-channel chip would be accepted and mis-ported)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:787` — `darlington-driver-output` has no supply pad (comment: COM is the clamp return) — data (`supplyRail: none`)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:927` — pad names `1B`..`8B` — data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:449,1097` — pads and hole radius — data
- `src/components/Hardware/hardwarePartCatalog.ts:224-233` — shelf entry (`DARLINGTON_PART_ID`, footprint fallback `8.9 x 22.86`, pin `1B`) — id-branch (X4)
- `src/build/hardwareManifest.ts:1236-1241` — default id, fallback label `'ULN2803A driver'` — default only, ok
- `src/state/nodeLibrary.ts:2207` — property help "input 1B of the ULN2803A" — chip-level, ok
- `src/build/parts/partOptions.ts:474-484` — hand-written row — data (X3)
- `src/components/HelpModal/reference/output.ts:188-193` — paragraphs naming the ULN2803A — data (X9)

**Overlay/manifest fields needed:** `supplyRail: none`, `copy.*`, `pads`, `padHoleRadiusPx`; add `deviceField: 'device'` with `devices: ['ULN2803A']` to `partTypes.ts`.

## 16. PowerConverter

**Verdict:** `data move`

**Findings:**
- `src/components/BuildDiagram/controllerGeometry.ts:383-385` — `CONVERTER_PAD_MM` keyed on `'lm2596-buck-module'`, consumed at `ControllerGraphic.tsx:54` — data (the catalogue already has `powerConverter.terminalPositions`, read as the fallback at `ControllerGraphic.tsx:55-69`)
- `src/state/peripherals/powerConverter.ts:15-20` — `LEGACY_POWER_CONVERTER_ORDER` lists three bundled ids to fix shelf order — id-branch
- `src/state/peripherals/powerConverter.ts:11` — `DEFAULT_POWER_CONVERTER_PART_ID` for new nodes (`nodes/hardware/definitions.ts:129`) and shelf fallback (`hardwarePartCatalog.ts:196-205`, `{43.18, 21.08}`) — default only, ok (X4)
- `src/build/power/electricalPlan.ts:548` — blocker text "Use one SD-100 model" — data (copy naming a bundled family)
- `src/build/parts/partOptions.ts:122-130` — options already derived from `powerConverterModules()`; summary built from the block — none
- `src/components/HelpModal/reference/hardware.ts:143,158,161,185,233` — paragraphs and example ids naming LM2596, Mean Well SD-100, DGXBY — data (X9)
- No chip string, no library; the plan reads roles, ratings and derating from the block.

**Overlay/manifest fields needed:** `powerConverter.terminalPositions` (exists) replacing `CONVERTER_PAD_MM`; `shelfOrder` or alphabetical sort; `copy.railModelGroup` (a family id the plan can name instead of "SD-100"); X9 help.

## 17. PdTriggerSource

**Verdict:** `data move`

**Findings:**
- `src/state/nodeLibrary.ts:1436` — `requestedVoltage` options `pdTriggerSpec(PD_TRIGGER_PART_ID).selectableVoltagesV` — id-branch (X7; there is no per-node override in `propertyOptions`)
- `src/build/parts/partFields.ts:94` — same list from `PD_TRIGGER_PART_ID` for the bench panel — id-branch (X7)
- `src/state/peripherals/pdTrigger.ts:12,14-20` — `PD_TRIGGER_PART_ID`, `FALLBACK_SPEC` (`[5,9,12,15,20]`, default 12) — id-branch (X8)
- `src/nodes/hardware/definitions.ts:168-169` — new-node default from the part — default only, ok
- `src/build/hardwareManifest.ts:1123-1125` — default id — default only, ok
- `src/components/Hardware/hardwarePartCatalog.ts:206-213` — shelf entry (`{15, 31}` fallback) — id-branch (X4)
- `src/build/parts/partOptions.ts:151-161` — hand-written row — data (X3)
- `src/components/HelpModal/reference/hardware.ts:232,236` — example and "the 12 V the ZY12PDN asks" — data (X9)
- Not in `MODULE_PAD_GEOMETRY`; no chip string, no library.

**Overlay/manifest fields needed:** `copy.*`; the voltage list is already `pdTrigger.selectableVoltagesV`, so the fix is code reading it per node (X7).

## 18. PowerSwitchOutput

**Verdict:** `data move`

**Findings:**
- `src/state/peripherals/powerSwitch.ts:13,27` — `DEFAULT_POWER_SWITCH_PART_ID` default; `powerSwitchSpec` returns undefined for an unknown id (no silent fallback) — default only, ok
- `src/state/peripherals/powerSwitch.ts:21` — `MAX_POWER_SWITCH_CHANNELS = 8`, `POWER_SWITCH_PIN_FALLBACKS` — chip-level, ok (type limit; the plan says the type owns it)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:782` — `power-switch-output` has no supply pad, for every part — data (`supplyRail: none`)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:413,419,423,1086-1089` — pads and hole radius for LR7843, Mosfetti and YYNMOS-4 — data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:923` — `power-switch-output` pad list `PWM / IN / SIG`; catalogue `channelInputLabels` win first — data (generic, ok)
- `src/components/Hardware/hardwarePartCatalog.ts:292-301` — shelf entry keyed on `DEFAULT_POWER_SWITCH_PART_ID` with `{16, 35}` fallback and pin label `PWM` — id-branch (X4)
- `src/components/Hardware/hardwareShelfModel.ts:89-96` — shelf logic reads the block — none
- `src/build/parts/partOptions.ts:451-473` — three hand-written rows (note text repeats block facts: voltage window, current, flyback) — data (X3)
- `src/components/HelpModal/reference/output.ts:130-131,150,156` — paragraphs naming LR7843, Mosfetti, YYNMOS-4 — data (X9)

**Overlay/manifest fields needed:** `supplyRail: none`, `copy.summary`, `copy.wiringNote`, `pads`, `padHoleRadiusPx`.

## 19. BuzzerOutput

**Verdict:** `data move`

**Findings:**
- `src/state/peripherals/buzzer.ts:13-14,30-37` — `BUZZER_PART_ID`, `PASSIVE_BUZZER_PART_ID`, `FALLBACK_SPEC`, and a second fallback `?? partById(BUZZER_PART_ID)` so any unknown id becomes the KY-012 — id-branch (X8)
- `src/state/peripherals/buzzer.ts:27` — `BUZZER_PITCH_DEFAULT_HZ = 2000` documented as "the KY-006's loudest pitch" — data (block has `resonanceKHz`)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:785` — `buzzer-output` has no supply pad for every part (comment names KY-012 and KY-006) — data (`supplyRail: none`)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:455,458,1094-1095` — pads and hole radius — data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:924` — pad names `SIG / S / SIGNAL` — data (generic, ok)
- `src/components/Hardware/hardwarePartCatalog.ts:247-256` — shelf entry (`BUZZER_PART_ID`, `{15.5, 19}` fallback, pin `SIG`) — id-branch (X4)
- `src/build/hardwareManifest.ts:570,1284` — defaults to `BUZZER_PART_ID` — default only, ok
- `src/state/nodeLibrary.ts:2216-2217` — property help names KY-012, KY-006 and "loudest near 2000 Hz" — data
- `src/utils/validateGraph.ts:2473,2483` — fix text "such as the KY-012" — data (copy)
- `src/build/parts/partOptions.ts:496-512` — two hand-written rows with notes — data (X3)
- `src/components/HelpModal/reference/output.ts:214` — paragraph naming both modules — data (X9)

**Overlay/manifest fields needed:** `supplyRail: none`, `copy.*`, `pads`, `padHoleRadiusPx`; default pitch read from `buzzer.resonanceKHz`.

## 20. EthernetModule

**Verdict:** `data move`

**Findings:**
- `src/state/peripherals/ethernetModule.ts:16,23-35` — `ETHERNET_MODULES` is a code list with label, summary and note for the single WIZ850io; `PART_OPTIONS` derives from it — data (X3)
- `src/state/peripherals/ethernetModule.ts:37-45` — `FALLBACK_SPEC` for any unknown id — id-branch (X8)
- `src/build/hardwareManifest.ts:1155` — `supplyVoltage: 3.3` hard-coded — data (catalogue `logicVoltage` / `supplyRail`)
- `src/codegen/peripherals/ethernetCpp.ts:79` — `ETH.begin(ETH_PHY_W5500, ...)` — chip-level, ok (`devices: ['W5500']`), library is the ESP32 core's `ETH.h`
- `src/codegen/peripherals/networkCpp.ts:235` — fallback label `'W5500 Ethernet'` — default only, ok
- `src/components/BuildDiagram/physicalDiagramLayout.ts:528,1113` — pads and hole radius — data
- `src/components/Hardware/hardwarePartCatalog.ts:413-436` — shelf entry (`wiz850io-ethernet-module` literal at 238-239, footprint fallback `27.95 x 23`) — id-branch (X4)
- `src/utils/validateGraph.ts:2349` — "ESP32 core's W5500 support" — chip-level, ok
- `src/components/HelpModal/reference/hardware.ts:90,110` — paragraphs naming W5500 and the WIZ850io — data (X9)

**Overlay/manifest fields needed:** `supplyRail` / `logicVoltage`, `copy.*`, `pads`, `padHoleRadiusPx`.

## 21. EncoderInput

**Verdict:** `data move`

**Findings:**
- `src/components/BuildDiagram/physicalDiagramLayout.ts:1313` — `REAR_ROW_PARTS = new Set(['jaycar-sr1230-rotary-encoder'])` read by `peripheralRearRoute` at `:1326` — id-branch (needs manifest `rearRowLegs: true`)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:661-666` — `UNCATALOGUED_PADS['encoder-input'] = VCC, A, B, SW, GND` for the module with no `part.json` — data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:791-795` — "a part without a supply pad is unpowered" rule keyed on pad labels — data (generic, ok)
- `src/build/parts/partOptions.ts:337-351` — `uncataloguedDefault: true` (the bundled encoder module has no catalogue entry) and one hand-written row naming `SR1230_ENCODER_PART_ID` — id-branch / data (X3)
- `src/components/Hardware/hardwarePartCatalog.ts:914-957` — two shelf entries; the bare one stamps `properties: { partId: SR1230_ENCODER_PART_ID, pullup: true }` — id-branch (X4)
- `src/state/peripherals/encoder.ts:14-60` — behaviour from the `encoder` block (`onboardPullUps`, pulses, detents) — none
- `src/build/parts/partRenders.ts:44` — `EncoderInput` render map falls back to the bundled module picture — data (X6)
- `src/build/hardware.ts:157` — `ENCODER_MODULE_FOOTPRINT_MM` for the uncatalogued module — data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:474,1104` — pads and hole radius for the SR1230 — data
- `src/components/HelpModal/reference/input.ts:716,718` — paragraphs naming the SR1230 — data (X9)

**Overlay/manifest fields needed:** `rearRowLegs` (bool), `copy.*`, `pads`, `padHoleRadiusPx`; give the bundled module a `part.json` so there is no `uncataloguedDefault`.

## 22. DistanceInput

**Verdict:** `data move`

**Findings:**
- `src/state/peripherals/distanceSensor.ts:4-6,11-22` — `HCSR04_PART_ID`, `VL53L0X_PART_ID`, `VL53L1X_PART_ID`, `FALLBACK_SPEC` of the HC-SR04 for any unknown id (the plan's own example of a silent fallback) — id-branch (X8)
- `src/state/nodeLibrary.ts:1359` — static `i2cAddress` options from `VL53L0X_PART_ID` — id-branch (X7)
- `src/nodes/input/definitions.ts:417-422` — new-node defaults `HCSR04_PART_ID` and `VL53L0X` address — default only, ok
- `src/codegen/peripherals/distanceSensorCpp.ts:73,112-118` — VL53L1X versus VL53L0X by `distanceSensorDevice(partId)`; `#include <VL53L1X.h>` / `<VL53L0X.h>` — library, chip-level, ok (`devices` lists both chips)
- `backend/toolchain.py:337-342,1562-1650` and `backend/firmware.py:101-105,300-305,797-799` — Pololu VL53L0X and VL53L1X pinned at 1.3.1, keyed on the include string, tied to the chip not a part — library, chip-level, ok (stays with the type)
- `src/codegen/cppGenerator.ts:1254` — emits the include per node — library
- `src/components/BuildDiagram/physicalDiagramLayout.ts:996` — rail by `facts.transport` (pulse 5 V, i2c 3.3 V) — data (X5; fine as transport rule, but a 5 V I2C laser module cannot be expressed)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:961-966` — `SHDN / XSHUT` pad aliases — chip-level, ok
- `src/components/BuildDiagram/physicalDiagramLayout.ts:443,446,523,1098-1099,1105` — pads and hole radius for the three parts — data
- `src/state/peripherals/distanceSensor.ts:8` — `ECHO_DIVIDER_OHMS` (1 k / 2 k) — chip-level, ok
- `src/components/Hardware/hardwarePartCatalog.ts:846-889` — three shelf entries with fallback footprints — id-branch (X4)
- `src/build/parts/partRenders.ts:88-91` — render map (HC-SR04) — data (X6)
- `src/components/Canvas/studioNodeChrome.ts:96` — note names the three chips — chip-level, ok
- `src/build/parts/partOptions.ts:406-428` — three hand-written rows — data (X3)
- `src/components/HelpModal/reference/input.ts:652,660,664` — paragraphs naming HC-SR04, VL53 — data (X9)

**Overlay/manifest fields needed:** `supplyRail`, `copy.*`, `pads`, `padHoleRadiusPx`; a new laser chip stays a code change (new library, new device) by design.

## 23. InfoDisplay

**Verdict:** `data move`

**Findings:**
- `src/state/displays/oledSurface.ts:41-44` — `OLED_CONTROLLERS` hard-codes panel 128x64 and `columnOffset` (2 for SH1106, 0 for SSD1306) per chip; the block's `resolutionPx` is not read for OLEDs (the TFT path merges it) — data (panel size per part); column offset is chip-level, ok (`devices: ['SSD1306','SH1106G']`)
- `src/state/nodeLibrary.ts:5127-5129` — `oledControllerForProps` resolves by `display.controller` only — chip-level, ok
- `src/state/displays/oledSurface.ts:101-127` — transport from the block `interface`; address options `OLED_I2C_ADDRESS_OPTIONS` (0x3C/0x3D) fixed for the type — chip-level, ok
- `src/build/hardwareManifest.ts:1681,1693` and `src/codegen/player/playerDisplays.ts:433` — default `'sh1106-oled-128x64'` and fallback controller `'SH1106'` — default only, ok
- `src/nodes/output/definitions.ts:489` — new-node default — default only, ok
- `src/state/patterns/starterTemplates.ts:611,665` — starter templates name `ssd1306-oled-096-128x64-i2c` — default only, ok
- `src/components/BuildDiagram/physicalDiagramLayout.ts:570-577,1119-1123` — pads and hole radius for five OLED parts — data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:954-958,968-971` — pad names by transport (`OLED_PAD_NAMES`) — chip-level, ok
- `src/components/Hardware/hardwarePartCatalog.ts:343-365` — shelf entry (`sh1106-oled-128x64` literal and `{35.5, 33.7}` fallback) — id-branch (X4)
- `src/components/Hardware/hardwarePartCatalog.ts:141-152` — `modulePinKeys` reads the block — none
- `src/build/parts/partOptions.ts:601-635` — five hand-written rows whose notes carry per-part pin and address facts — data (X3)
- `src/components/HelpModal/reference/output.ts:308` — paragraph "Choose the exact SH1106 or SSD1306 module" — data (X9)

**Overlay/manifest fields needed:** `copy.*`, `pads`, `padHoleRadiusPx`; code change small: read `display.resolutionPx` for OLEDs as `nodeLibrary.ts:5158-5163` does for TFTs.

## 24. TransportDisplay

**Verdict:** `data move`

**Findings:**
- `src/state/displays/tftSurface.ts:108-132` — `TFT_CONTROLLERS` keyed by chip holds per-module bench values (`invert`, `colorOrder`, `mirroredColumns`, offsets); an `ST7789` key (240x240, `invert: true`) exists, but every catalogue display says `ST7789V` (both `st7789-*` parts), so only the `ST7789V` row is reachable — data (per-part `invert` / offsets belong in the block) and chip-level for the ILI9341/ST7789V silicon
- `src/state/nodeLibrary.ts:5139-5164` — panel size merged from the block's `resolutionPx` — none
- `src/state/displays/tftSurface.ts:150-155` — transport from the block `interface` (matches "parallel") — chip-level, ok
- `src/state/displays/tftSurface.ts:180-200` — `PARALLEL_TOUCH_*` electrode map for the resistive shield — chip-level, ok
- `src/build/boards/integratedBoardHardware.ts:39,109` — `CYD_TOUCH_DISPLAY` names `st7789v-xpt2046-touch-240x320` and compares `properties.partId` to it — id-branch (board-integrated panel, bound to one part by design)
- `src/build/hardwareManifest.ts:444,1714` and `src/codegen/player/playerDisplays.ts:493` — default `'st7789-tft-240x240'` — default only, ok
- `src/nodes/output/definitions.ts:533` — new-node default — default only, ok
- `src/components/Canvas/bodies/TransportDisplayNodeBody.tsx:87` — falls back to `TFT_CONTROLLERS.ST7789` when unresolved — id-branch
- `src/components/BuildDiagram/physicalDiagramLayout.ts:581-614,1126-1129` — pads and hole radius for four parts — data
- `src/components/Hardware/hardwarePartCatalog.ts:320-342` — shelf entry (`st7789-tft-240x240` literals at 145-146) — id-branch (X4)
- `src/build/parts/partOptions.ts:636-667` — four rows with long per-part notes (pin counts, touch wiring) — data (X3)
- `src/components/HelpModal/HelpModal.tsx:477` and `reference/output.ts:339` — "ST7789 and friends", per-module paragraph — data (X9)

**Overlay/manifest fields needed:** `copy.*`, `pads`, `padHoleRadiusPx`, block fields `invert`, `colorOrder`, `mirroredColumns`, `columnOffset`, `rowOffset` (so two parts on one chip can differ).

## 25. SegmentDisplay

**Verdict:** `data move`

**Findings:**
- `src/state/displays/segmentDisplay.ts:35-43` — `SEGMENT_CONTROLLERS`: digits, colon, brightness max and pins per chip (TM1637, MAX7219); unknown controller falls to the TM1637 default — chip-level, ok (`devices: ['TM1637','MAX7219']`); digits per module (a 6-digit TM1637) cannot differ
- `src/codegen/peripherals/` — `playerDisplays.ts:96,575-587`, `segmentDisplayCpp.ts:396-447`, `nodes/output/codegen.ts:808-812`, `hardwareManifest.ts:457` — controller compared as `'MAX7219'` / `'TM1637'` — chip-level, ok
- `src/components/Hardware/fixtureLink.ts:40` — `id === 'MAX7219' ? 'SPI' : 'two-wire serial'` — chip-level, ok
- `src/build/hardwareManifest.ts:1667` and `src/codegen/player/playerDisplays.ts:575` — default `'tm1637-4digit-display'` — default only, ok
- `src/nodes/output/definitions.ts:617` — new-node default — default only, ok
- `src/components/BuildDiagram/physicalDiagramLayout.ts:579-580,1124-1125` — pads (the MAX7219 is a vertical header) and hole radius — data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:904` — `segment-display` pad names CLK / DIO / CS — chip-level, ok
- `src/components/Hardware/hardwarePartCatalog.ts:366-378` — shelf entry (`tm1637-4digit-display` literals at 191-192) — id-branch (X4)
- `src/build/parts/partOptions.ts:668-684` — two hand-written rows — data (X3)
- `src/components/HelpModal/reference/output.ts:390-401` — paragraphs naming TM1637 and MAX7219, and "0-7 / 0-15" — data (X9)

**Overlay/manifest fields needed:** `copy.*`, `pads`, `padHoleRadiusPx`; block `display.digits` if a module with a different count is wanted.

## 26. LightInput

**Verdict:** `data move`

**Findings:**
- `src/state/peripherals/lightSensor.ts:11-31` — `LIGHT_SENSOR_MODULES` code list (partId, label, summary, note, transport) for the LDR and BH1750; `PART_OPTIONS` and the shelf derive from it — data (X3, X4) and id-branch (transport is decided by the list, not by the block)
- `src/state/peripherals/lightSensor.ts:35-39` — unknown id resolves to `LIGHT_SENSOR_MODULES[0]` — id-branch (X8)
- `src/state/peripherals/lightSensor.ts:3-6,53-67` — `BH1750_ADDRESSES` fallback and `BH1750_DEFAULT_ADDRESS` — chip-level, ok (`devices: ['BH1750FVI']`, `blockOptional`)
- `src/state/nodeLibrary.ts:1326` — static `i2cAddress` options from the literal `'adafruit-bh1750-light-sensor'` — id-branch (X7)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:1016` — `light-input` i2c always 3.3 V — data (X5); analog LDR falls to the pad-label rule
- `src/components/BuildDiagram/physicalDiagramLayout.ts:465,487,1100,1136` — pads and hole radius for both — data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:960` — i2c light pad names SDA / SCL — chip-level, ok
- `src/components/Hardware/hardwarePartCatalog.ts:509-527` — shelf entries with fallback footprints `25.4 x 17.78` and `32 x 23.8` by transport — data (X4)
- `src/build/parts/partRenders.ts:56-59` — render map (LDR) — data (X6)
- `src/codegen/controlInputCpp.ts:160,248`, `src/codegen/peripherals/lightSensorCpp.ts:35-44` — i2c path is the BH1750 driver — chip-level, ok
- `src/utils/validateGraph.ts:3302` — "this BH1750 answers only on" — chip-level, ok
- `src/components/HelpModal/reference/input.ts:419-432` — paragraphs naming LDR and BH1750 — data (X9)

**Overlay/manifest fields needed:** `copy.*`, `pads`, `padHoleRadiusPx`, `supplyRail`; transport read from the block (`lightSensor` present = i2c, absent = analog) in place of `LIGHT_SENSOR_MODULES`.

## 27. RelayOutput

**Verdict:** `code change` (small)

**Findings:**
- `src/state/nodeLibrary.ts:1367` and `:4768` — `relayPinKeys('relay-module-8ch-5v')` used as the type's superset of channel pins for the property schema and the pin-property set — id-branch
- `src/build/pins/pinRetarget.ts:230,232` — same literal for the retarget plan's `keys` and `requests` — id-branch
- `src/state/peripherals/relayModule.ts:4-5` — `DEFAULT_RELAY_PART_ID`, `MAX_RELAY_CHANNELS = 8` — default only / chip-level, ok (type limit)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:919` — `relay-output` pad names `IN1`..`IN8` built for eight — chip-level, ok
- `src/components/BuildDiagram/physicalDiagramLayout.ts:985` — all `relay-output` items on 5 V — data (X5; the Grove SSR happens to agree)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:492-497,1139-1143` — pads and hole radius for five parts — data
- `src/components/Hardware/hardwarePartCatalog.ts:214-223` — shelf entry (`DEFAULT_RELAY_PART_ID`, `{50, 26}` fallback, pin `IN1`) — id-branch (X4)
- `src/build/hardwareManifest.ts:1210,1216` — default `'relay-module-1ch-5v'` and label `'5 V relay module'` — default only, ok
- `src/build/parts/partOptions.ts:513-531` — five rows; the four mechanical rows are bare summaries restating block facts ("active-low 5 V SPDT") — data (X3)
- `src/state/peripherals/relayModule.ts:7-58` — channels, trigger, load kind from the block — none

**Overlay/manifest fields needed:** `copy.*`, `pads`, `padHoleRadiusPx`, `supplyRail`; code: a `relayPinKeysMax()` helper replacing the three literals.

## 28. MotionInput

**Verdict:** `code change`

**Findings:**
- `src/build/parts/partTypes.ts:73` — the type has no `block` and no `devices`, so nothing in a manifest can describe a part's facts — id-branch (type needs a block, or its parts should become `DigitalSensorInput` parts)
- `src/build/parts/partOptions.ts:389-405` — two hand-written rows (`hc-sr501-pir-sensor`, `rcwl-0516-microwave-motion-module`) with notes holding supply and trimmer facts — data (X3)
- `src/components/Hardware/hardwarePartCatalog.ts:708-731` — two shelf entries with literal ids in `properties` and fallbacks `32x24`, `36x17` — id-branch (X4)
- `src/build/hardwareManifest.ts:990-993` — default `'hc-sr501-pir-sensor'`, label `'HC-SR501 PIR motion sensor'` — default only, ok
- `src/nodes/input/definitions.ts:206` — new-node default — default only, ok
- `src/components/BuildDiagram/physicalDiagramLayout.ts:797-800` — supply pad must be `VIN` because "the RCWL-0516 prints 3V3 as well" — id-branch (a per-part pad rule keyed on the kind)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:485,517,1108,1135` — pads and hole radius — data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:906` — pad names OUT / SIG — data
- `src/build/parts/partRenders.ts:60-63` — render map (HC-SR501) — data (X6)
- `src/components/HelpModal/reference/input.ts:297-298` — paragraphs naming both and the trimmer — data (X9)

**Overlay/manifest fields needed:** a `motionSensor` block (`activeLevel`, `holdSeconds`, `supplyRail`, `powerPadLabel`) or migrate both parts to `digitalSensor` blocks (activeLevel high, `supplyVolts` 5) and delete the type; plus `copy.*`, `pads`, `padHoleRadiusPx`.

## 29. KeypadInput

**Verdict:** `code change`

**Findings:**
- `src/build/parts/partTypes.ts:81` — no block, no devices — id-branch
- `src/state/peripherals/keypad.ts:1-18` — `KEYPAD_PART_ID`, 4 rows x 4 columns, pin keys and the 16 legends are constants; a 3x4 or 4x4-with-other-legends part cannot exist — data
- `src/state/nodeLibrary.ts:4766` and `hardwareManifest.ts:1549` — `KEYPAD_ROW_KEYS` / `KEYPAD_COL_KEYS` as the type's pin set and default `KEYPAD_PART_ID` — id-branch (default) / data
- `src/components/Canvas/studioNodeChrome.ts:88-89` — note spells "sixteen buttons", "1 2 3 A, 4 5 6 B..." — data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:521,1107` — pads and hole radius — data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:777,782,933` — keypad has no supply or ground, pad names R1-R4, C1-C4 — data
- `src/components/Hardware/hardwarePartCatalog.ts:808-825` — shelf entry (`matrix-keypad-4x4` literal, `{69, 80.5}`) — id-branch (X4)
- `src/build/parts/partRenders.ts:64-67` — render map — data (X6)
- `src/build/parts/partOptions.ts:326-336` — hand-written row — data (X3)

**Overlay/manifest fields needed:** a `keypad` block (`rows`, `columns`, `legends`, `rowLabels`, `columnLabels`) with the type deriving ports and pin keys from it; `copy.*`, `pads`, `padHoleRadiusPx`.

## 30. IRRemoteInput

**Verdict:** `code change`

**Findings:**
- `src/state/peripherals/irModules.ts:28-55` — `IR_RECEIVER_MODULES` code list: partId, label, summary, note, `supplyVoltage` per module; `PART_OPTIONS` and the shelf derive from it — data and id-branch
- `src/state/peripherals/irModules.ts:60-70` — unknown id resolves to the first module (KY-022) — id-branch (X8)
- `src/build/pins/receiveDivider.ts:12` — `irReceiverModuleFor(partId).supplyVoltage !== 5` decides the signal divider — data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:1027` — `irReceiverModuleFor(...).supplyVoltage === 5` picks the 5 V rail — data (X5)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:415,481,483,1077,1133,1134` — pads and hole radius (KS0026, TSOP38238, KY-022) — data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:661-666,913` — `UNCATALOGUED_PADS['ir-input'] = OUT, GND, VCC` and pad names `S / OUT / SIG / DAT` — data
- `src/components/Hardware/hardwarePartCatalog.ts:490-507` — shelf rows from the code list; fallback footprint `22.06 x 17.13` — data (X4)
- `src/build/parts/partRenders.ts:64-67` — render map (KY-022) — data (X6)
- `src/state/peripherals/irRemote.ts:8`, `src/codegen/peripherals/irRemoteCpp.ts:44-46,120-122` — protocol names (Samsung, NEC) — chip-level, ok (protocol list, not a part)
- `backend/toolchain.py:332-333,1437-1507` — IRremote 4.7.1 pin, `#include <IRremote.hpp>` — library, ok (type-owned)

**Overlay/manifest fields needed:** an `irReceiver` block (`supplyVolts`, `carrierKHz`, `pinOrder` or rely on `pinLabelsLeftToRight`) replacing `IR_RECEIVER_MODULES`; `copy.*`, `pads`, `padHoleRadiusPx`, `supplyRail`.

## 31. MicInput

**Verdict:** `code change`

**Findings:**
- `src/state/peripherals/micModules.ts:41-85` — `MIC_MODULES` code list; each entry carries FastLED `factory` (`CreateInmp441`, `CreateIcs43434`, `CreateGenericMEMS`), `profile`, and for the SPH0645 `capture: 'sph0645-classic-esp32'` — data (per-part facts, a FastLED API tied to the part's silicon, not library-owned)
- `src/state/peripherals/micModules.ts:88-100` — unknown id resolves to the INMP441 default — id-branch (X8)
- `src/codegen/audio/audioEngineCpp.ts:454-520` — SPH0645 adapter (`SPH0645_SLOT`, `I2S_...` timing fix) selected by `micModule.capture` — chip-level, ok only if the block names the chip; no `devices` list exists (type has no block)
- `src/codegen/audio/audioEngineCpp.ts:862,869` and `src/build/pins/micPinDefaults.ts:137-138` — `micModuleFor(partId)` drives support gating — id-branch
- `src/build/boards/boardProfiles.ts:1759-1761` — board `peripheralPins.inmp441` field names — chip-level (board data, not part)
- `src/components/Hardware/hardwarePartCatalog.ts:461-477` — shelf rows from the code list; `MIC_FALLBACK_PIN_LABELS` (`WS`, `SCK`, `SD`) and `MIC_FALLBACK_FOOTPRINT_MM` (`hardware.ts:91`) — data (X4)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:386-389,1078-1081` — pads and hole radius (the pad order differs on all four) — data
- `src/build/parts/partRenders.ts:35-38` — render map (INMP441) — data (X6)
- `src/state/audio/audioCapabilities.ts:40` — fallback label `'INMP441'` — data
- `src/state/patterns/starterTemplates.ts:78` — "An I2S microphone (INMP441)" — data
- `src/components/HelpModal/reference/input.ts:60` — "INMP441, ICS-43434 or a generic board" — data (X9)

**Overlay/manifest fields needed:** a `microphone` block (`device`, `fastledFactory`, `fastledProfile`, `captureAdapter?`, `boardsNote?`) with `devices` registered in `partTypes.ts`; `copy.*`, `pads`, `padHoleRadiusPx`. A new capture adapter stays code.

## 32. LineInput

**Verdict:** `code change`

**Findings:**
- `src/build/hardwareManifest.ts:957-967` — title `'PCM1802 stereo line-level ADC'` and `facts: { partId: 'pcm1802-line-in-adc' }` hard-coded, node `partId` ignored — id-branch
- `src/nodes/input/definitions.ts:70` — default `partId: 'pcm1802-line-in-adc'` — default only, ok
- `src/components/Hardware/hardwarePartCatalog.ts:577-599` — shelf entry labelled "PCM1802 line-in ADC", `properties: { partId: 'pcm1802-line-in-adc' }`, footprint fallback `52 x 38` — id-branch (X4)
- `src/build/parts/partOptions.ts:198-208` — one hand-written row — data (X3)
- `src/codegen/audio/audioEngineCpp.ts:295,601,878` — PCM1802 receive path and error text — chip-level (no `devices` list; type has no block)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:848-854,499,1144` — pad names `SCK/MCLK`, `BCK/BCLK`, `LRCK/LRCLK`, `DOUT` for the line-in kind; pads and hole radius — data
- `src/state/audio/audioCapabilities.ts:54,190`, `src/utils/validateGraph.ts:1705,4971`, `src/components/MenuBar/MenuBar.tsx:199`, `src/utils/hardwareValidation.ts:125,320,465,507` — copy and ESP32-S3 gating naming PCM1802 — data (copy) / chip-level
- `src/components/HelpModal/reference/input.ts:87-99` — paragraphs naming PCM1802 — data (X9)

**Overlay/manifest fields needed:** a `lineInput` block (`device`, `needsMclk`, `channels`) and `devices: ['PCM1802']`; `copy.*`, `pads`, `padHoleRadiusPx`; the manifest item must read the node's `partId`.

## 33. Amplifier

**Verdict:** `code change`

**Findings:**
- `src/build/parts/partTypes.ts:90` — `property: 'model'`, no block, no devices; the default `model: 'MAX98357A'` is also an alias in `partOptions.ts:536` — id-branch
- `src/build/parts/partOptions.ts:532-566` — four hand-written rows carrying `output: 'speaker' | 'line'`, which the audio chain resolves from (`state/audio/audioOutput.ts:93`) — data (X3; `output` needs a manifest field)
- `src/build/hardwareManifest.ts:1753-1757` — default `'max98357a-i2s-amplifier'` — default only, ok
- `src/build/hardware.ts:168` — `MAX98357A_FOOTPRINT_MM` fallback, used at `hardwarePartCatalog.ts:400` — data (X4)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:855-868,973-985` — pad names for I2S / power / player stages; `+12V` pad forces the 12 V net; amplifier kind otherwise 5 V — data (X5)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:393,397,547,564,1082-1083,1115,1118` — pads and hole radius for four parts — data
- `src/components/Hardware/hardwarePartCatalog.ts:396-412` — shelf entry (`max98357a-i2s-amplifier` literal) — id-branch (X4)
- `src/utils/validateGraph.ts:1540,2612,2842,2896,5103`, `src/components/GraphHealth/GraphHealthDrawer.tsx:337` — repair and error text naming MAX98357A, PCM5102A, UDA1334A — data (copy)
- `src/nodes/output/definitions.ts:640-653` — default `model` and comment "(The MAX98357A's own gain is a resistor.)"; `codegen/playerSketchGenerator.ts:160` comment "0-21 for MAX98357A" — data (copy)
- `backend/toolchain.py:288-289,1197-1214` — ESP32-audioI2S 3.0.12 vendored; `Audio.h` before `FastLED.h` trap — library, ok (type-owned)
- `src/components/HelpModal/reference/output.ts:420,460-463` — paragraphs naming MAX98357A, PCM5102A — data (X9)

**Overlay/manifest fields needed:** an `i2sAudio` block (`output: 'speaker'|'line'`, `stereoPair?`, `device`) and registering `devices`; `copy.*`, `pads`, `padHoleRadiusPx`, `supplyRail`.

## 34. PowerAmplifier

**Verdict:** `code change`

**Findings:**
- `src/build/parts/partTypes.ts:91` — no block — id-branch
- `src/nodes/output/definitions.ts:672` — default `partId: 'pam8403-3w-stereo-amplifier'` — default only, ok
- `src/build/hardwareManifest.ts:1771` — default `'pam8403-3w-stereo-amplifier'`; analogue-input pad names `LIN / INL / AUX-L` in `physicalDiagramLayout.ts:859-861` — default only / data
- `src/components/Hardware/hardwarePartCatalog.ts:437-450` — shelf entry (`pam8403-3w-stereo-amplifier` literal, fallback `{23, 16}`) — id-branch (X4)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:407,552,557,1085,1116,1117` — pads and hole radius (PAM8403, DX-0809, PAM8610) — data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:979-985` — a `+12V` supply pad selects `v12`; otherwise 5 V — data (X5)
- `src/build/parts/partOptions.ts:567-600` — three hand-written rows with supply and feed notes — data (X3)
- `src/utils/validateGraph.ts:2576,2611-2612,2842,2896` — text naming PCM5102A / UDA1334A / DFPlayer — data (copy)
- `src/components/HelpModal/reference/output.ts:445,461,463` — paragraphs and example naming PCM5102A and DX-0809 — data (X9)

**Overlay/manifest fields needed:** a `powerAmp` block (`supplyV`, `inputKind: 'line'`, `channels`, `supplyRail`) with a `device`; `copy.*`, `pads`, `padHoleRadiusPx`.

## 35. SDCard

**Verdict:** `code change`

**Findings:**
- `src/build/hardwareManifest.ts:1739-1747` — `partId === 'microsd-breakout-3v3'` picks the title, and `supplyVoltage: partId === 'microsd-breakout-3v3' ? 3.3 : 5`; default `'microsd-module-5v'` — id-branch
- `src/components/BuildDiagram/physicalDiagramLayout.ts:630-632,1034` — `isThreeVoltSd` compares `facts.partId === 'microsd-breakout-3v3'` to choose 3.3 V versus 5 V — id-branch (the pad-label rule at `:1030-1033` would already do it)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:433-434,903,1130-1131` — pads, pad names (`SD DO/DI` aliases), hole radius — data
- `src/build/parts/partTypes.ts:97` — no block, no devices; SPI pins and `SD.h` are type-owned — chip-level / library, ok
- `src/components/Hardware/hardwarePartCatalog.ts:379-395` — shelf entry (`microsd-module-5v` literal at 206-207, `{24, 42}`) — id-branch (X4)
- `src/build/parts/partOptions.ts:248-264` — two hand-written rows whose notes carry the 5 V versus 3.3 V safety caveat — data (X3)
- `src/state/patterns/starterTemplates.ts:520` — copy "swap the MAX98357A" (neighbour) — data

**Overlay/manifest fields needed:** an `sdCard` block (`supplyVolts`, `levelShifted: bool`) so the manifest item and the rail come from it; `supplyRail`, `copy.wiringNote` (safety caveat), `pads`, `padHoleRadiusPx`.

## 36. RtcModule

**Verdict:** `code change`

**Findings:**
- `src/build/parts/partTypes.ts:98` — no block, no devices — id-branch
- `src/build/hardwareManifest.ts:1654-1660` — title `'DS3231 battery-backed I²C clock'` hard-coded for every part and default `'ds3231-rtc-module'` — id-branch
- `src/state/peripherals/rtc.ts:116,133,191` and `src/codegen/peripherals/rtcCpp.ts:166-181`, `rtcInputCpp.ts:71,267` — time source is the string `'DS3231'`; driver reads register block at `0x68` — chip-level (single chip; no `devices` list, so a PCF8523 part would load and be driven as a DS3231)
- `backend/firmware.py:1448-1500` — `/api/rtc/set` writes "a DS3231" — chip-level
- `src/state/graphStore.ts:5151` and `src/components/Hardware/hardwarePartActions.ts:142,173` — `ensureRootClockNode('DS3231')`, status name `'DS3231'` — chip-level
- `src/components/Hardware/hardwarePartCatalog.ts:600-635` — two shelf entries (`ds3231-rtc-module`, `jaycar-xc9044-rtc-module` in `properties`) with fallbacks `38x22` and `14x14` — id-branch (X4)
- `src/build/parts/partOptions.ts:209-225` — two hand-written rows — data (X3)
- `src/build/parts/partRenders.ts:39-42` — render map (DS3231) — data (X6)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:428,435,905,1090-1091` — pads, pad names SDA / SCL, hole radius — data
- `src/state/nodeLibrary.ts:3369` — "Which DS3231 breakout this is. Both answer at I2C address 0x68." — data (copy); `0x68` is a per-chip constant
- `src/utils/validateGraph.ts:2403-2415`, `src/components/GraphHealth/GraphHealthDrawer.tsx:86`, `src/components/Canvas/bodies/RtcInputBody.tsx:29,126-156` — repair and UI text naming DS3231 — data (copy)
- `src/components/HelpModal/reference/hardware.ts:9-29` and `HelpModal.tsx:781-799` — paragraphs naming DS3231 — data (X9)

**Overlay/manifest fields needed:** an `rtc` block (`device`, `i2cAddress`) with `devices: ['DS3231']` registered; `copy.*`, `pads`, `padHoleRadiusPx`; label read from the part, not the type.

## 37. DFPlayerOutput

**Verdict:** `code change`

**Findings:**
- `src/build/parts/partTypes.ts:92` — no block, no devices — id-branch
- `src/state/peripherals/dfPlayer.ts:3-17` — `DFPLAYER_PART_ID`, supply label `'3.2–5 V'`, current label, `DFPLAYER_COMMAND_GAP_MS`, boot delay — data (per-part electrical facts and protocol timing in code)
- `src/build/hardwareManifest.ts:1337-1348` — default `DFPLAYER_PART_ID`, fallback label `'DFPlayer Mini'` — default only, ok
- `src/build/hardwareManifest.ts:1345`, `src/utils/validateGraph.ts:1711,4991,2642`, `src/components/Hardware/hardwareShelfModel.ts:106-107` — gating and copy name the DFPlayer Mini — data (copy) / chip-level
- `src/codegen/peripherals/dfPlayerCpp.ts:18` — "native 10-byte UART protocol, no external library" — chip-level (single chip; no `devices` list)
- `src/build/pins/uartAssignment.ts:31` — `dfplayer: 'the DFPlayer Mini'` — data (copy)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:403,1084,855-868` — pads (stage `player`: TX / RX / BUSY) and hole radius — data
- `src/components/Hardware/hardwarePartCatalog.ts:273-291` — shelf entry (label "DFPlayer Mini", `DFPLAYER_PART_ID`, `{20, 20}`) — id-branch (X4)
- `src/build/parts/partOptions.ts:102-110` — one hand-written row with a long note — data (X3)
- `src/nodes/output/definitions.ts:449-461,709` — label and description — data (copy)
- `src/components/HelpModal/reference/output.ts:271-299` — paragraphs naming the DFPlayer — data (X9)

**Overlay/manifest fields needed:** a `uartPlayer` block (`device`, `supplyVolts`, `maxCurrentMa`, `baud`, `commandGapMs`, `bootMs`) and `devices: ['DFPlayer']`; `copy.*`, `pads`, `padHoleRadiusPx`. A different player protocol stays code.

## 38. DmxTransceiver

**Verdict:** `code change`

**Findings:**
- `src/state/peripherals/dmxTransceiver.ts:19` — `DMX_TRANSCEIVER_PART_ID`; file header says "One module today" — id-branch
- `src/build/hardwareManifest.ts:1616,1624` — `partById(DMX_TRANSCEIVER_PART_ID)` and `facts.partId: DMX_TRANSCEIVER_PART_ID`, ignoring the node's own `partId`; `supply: '5 V'`, `rxLevel: 'RO to RX through 1 kΩ ...'`, `termination: '120 Ω fitted (R7)'`, XLR wiring text hard-coded — id-branch and data
- `src/components/BuildDiagram/physicalDiagramLayout.ts:1020,1194-1197,1568` — `dmx-input` always 5 V, receive divider always drawn — data (X5); `:536,1111` pads and hole radius
- `src/components/BuildDiagram/physicalDiagramLayout.ts:940` — pad names `DI / RO / DE` — chip-level, ok (generic RS-485 names)
- `src/components/Hardware/hardwarePartCatalog.ts:636-658` — shelf entry (`DMX_TRANSCEIVER_PART_ID` footprint `15x45` and `properties`) — id-branch (X4)
- `src/build/parts/partOptions.ts:226-236` — one hand-written row — data (X3)
- `src/build/parts/partRenders.ts:43-46` — render map — data (X6)
- `src/nodes/hardware/definitions.ts:49,176` — default and description "MAX485 RS-485 transceiver" — data (copy)
- `src/utils/validateGraph.ts:2709` — `partName: 'MAX485 DMX transceiver'` — data (copy)
- `src/components/HelpModal/reference/hardware.ts:36-41` and `HelpModal.tsx:758` — paragraphs naming MAX485 / SN75176 — data (X9)

**Overlay/manifest fields needed:** an `rs485` block (`supplyVolts`, `rxLogicVolts`, `enableMode`, `terminationFitted`) and `devices`; `copy.*`, `pads`, `padHoleRadiusPx`; manifest code must read the node's `partId`.

## 39. MidiInterface

**Verdict:** `code change`

**Findings:**
- `src/state/peripherals/midiSource.ts:32` — `MIDI_DIN_PART_ID` and a header written for "Adafruit's MIDI FeatherWing (product 4740)" — id-branch
- `src/build/hardwareManifest.ts:1641,1648` — `partById(MIDI_DIN_PART_ID)` and `facts.partId: MIDI_DIN_PART_ID`, ignoring the node's `partId`; `midiCable: 'MIDI IN is the left DIN socket'` hard-coded — id-branch and data
- `src/state/peripherals/midiSource.ts:47` — `MIDI_BAUD = 31250` — chip-level, ok (protocol constant)
- `src/components/BuildDiagram/physicalDiagramLayout.ts:543,1112` — pads and hole radius; `:942` pad name `MIDI_RX` — data
- `src/components/Hardware/hardwarePartCatalog.ts:659-674` — shelf entry (`MIDI_DIN_PART_ID`, `{50.8, 22.86}`, `properties`) — id-branch (X4)
- `src/build/parts/partOptions.ts:237-247` — one hand-written row — data (X3)
- `src/build/parts/partRenders.ts:47-50` — render map — data (X6)
- `src/state/nodeLibrary.ts:2666` — property help "MIDI FeatherWing MIDI_RX pad" — data (copy)
- `src/utils/validateGraph.ts:2714` — `partName: 'MIDI FeatherWing'` — data (copy)
- `src/components/HelpModal/reference/hardware.ts:64-69` — paragraphs naming the FeatherWing — data (X9)

**Overlay/manifest fields needed:** a `midiDin` block (`supplyVolts`, `isolated`, `rxLogic`) and `devices`; `copy.*`, `pads`, `padHoleRadiusPx`; manifest code reading the node's `partId`.

---

## Summary table

| # | Type | Verdict | Findings |
|---|---|---|---|
| 1 | DigitalSensorInput | ready | 5 |
| 2 | AnalogSensorInput | ready | 4 |
| 3 | BatteryPack | ready | 5 |
| 4 | BatteryModule | ready | 5 |
| 5 | CoolingFanOutput | data move | 8 |
| 6 | TemperatureInput | data move | 10 |
| 7 | TouchButtonInput | data move | 8 |
| 8 | JoystickInput | data move | 8 |
| 9 | PresenceInput | data move | 8 |
| 10 | PowerMonitorInput | data move | 11 |
| 11 | PwmDriverOutput | data move | 10 |
| 12 | EnvironmentInput | data move | 12 |
| 13 | MotionVectorInput | data move | 12 |
| 14 | TouchPadInput | data move | 12 |
| 15 | DarlingtonDriverOutput | data move | 10 |
| 16 | PowerConverter | data move | 6 |
| 17 | PdTriggerSource | data move | 8 |
| 18 | PowerSwitchOutput | data move | 9 |
| 19 | BuzzerOutput | data move | 11 |
| 20 | EthernetModule | data move | 9 |
| 21 | EncoderInput | data move | 10 |
| 22 | DistanceInput | data move | 15 |
| 23 | InfoDisplay | data move | 12 |
| 24 | TransportDisplay | data move | 12 |
| 25 | SegmentDisplay | data move | 10 |
| 26 | LightInput | data move | 12 |
| 27 | RelayOutput | code change (small) | 10 |
| 28 | MotionInput | code change | 10 |
| 29 | KeypadInput | code change | 9 |
| 30 | IRRemoteInput | code change | 10 |
| 31 | MicInput | code change | 11 |
| 32 | LineInput | code change | 8 |
| 33 | Amplifier | code change | 11 |
| 34 | PowerAmplifier | code change | 9 |
| 35 | SDCard | code change | 7 |
| 36 | RtcModule | code change | 12 |
| 37 | DFPlayerOutput | code change | 11 |
| 38 | DmxTransceiver | code change | 10 |
| 39 | MidiInterface | code change | 10 |

Totals: ready: 4, data move: 22, code change: 13. Findings listed: 370 (each includes ok/chip-level items; see tags).

## Cross-cutting moves

These apply to most or all types and should be done once.

- **X1. `MODULE_PAD_GEOMETRY` to manifest `pads`.** `src/components/BuildDiagram/physicalDiagramLayout.ts:379-614` holds measured pad pixels for 60-odd bundled parts, consumed at `:814` and `:1343`. A part with no entry is drawn with the bundled artwork's centred header (`:1355-1365`), so every downloaded part needs `pads: [{ label, xPx, yPx }]` against its own `render.widthPx/heightPx`. `pinLabelsLeftToRight` already supplies the labels; the manifest only adds the points.
- **X2. `MODULE_PAD_HOLE_RADIUS` to `padHoleRadiusPx`.** `physicalDiagramLayout.ts:1076-1146`, read at `:1155`. One number per part, in render pixels; default 4 when absent.
- **X3. `PART_OPTIONS` rows to catalogue copy.** `src/build/parts/partOptions.ts:93-684`. Hand-written for 30 of the 39 types; derived from the catalogue for PowerConverter, BatteryPack, BatteryModule, DigitalSensorInput, AnalogSensorInput; derived from code lists for LightInput (`lightSensor.ts:16`), MicInput (`micModules.ts:41`), IRRemoteInput (`irModules.ts:28`), EthernetModule (`ethernetModule.ts:23`). Needs `copy.label`, `copy.summary`, `copy.wiringNote`, optional `aliases`, and for audio parts `audioOutput`. `partOptionsFor` must read the loaded catalogue (the generic types use a getter at `:367`, `:378` as the model).
- **X4. Shelf and bench entries.** `src/components/Hardware/hardwarePartCatalog.ts:164-957` (`FIXTURE_PARTS`, `INPUT_PARTS`) names one part per entry with `partDimensionsMm(<id>, fallback)`, `properties: { partId }`, pin labels and hint. `src/components/Hardware/useBenchParts.ts:48-57` matches a node to an entry by `properties.partId` and, when none matches, takes the first entry of that node type (only `CATALOGUE_SENSOR_NODE_TYPES` skip this, `hardwarePartCatalog.ts:529`); a downloaded part would therefore draw as the first bundled part of its type. Derive entries from the catalogue the way `:529-570` does for the generic sensors; drop the literal fallbacks (`dimensionsMm` is already required) and keep `hint` as `copy.summary`.
- **X5. Supply-rail rules by kind.** `physicalDiagramLayout.ts:973-1034` (`peripheralPowerNet`) and `:781-801` (`peripheralPowerPadIndex`): fixed per kind for power monitor, environment, temperature, joystick, motion vector, touch pad, PWM driver, light (i2c), presence, touch button, DMX, amplifier, relay; per id for the SD card (`:630-632`) and per receiver module for IR (`:1027`). Move to manifest `supplyRail: 'v3v3' | 'v5' | 'v12' | 'none'` and `powerPadLabel?` (the RCWL-0516 `VIN` rule at `:797-800`), with `supplyVolts` as the fallback and the existing pad-label rule (`:1030-1033`) as the last resort.
- **X6. `PART_RENDER_BY_NODE_TYPE`.** `src/build/parts/partRenders.ts:34-100` is a per-type default picture naming one bundled part (reached only when the catalogue identity does not resolve, `:112-122`). Delete once unknown parts are explicit errors.
- **X7. Static property schema built from one bundled part.** `src/state/nodeLibrary.ts:1326,1333,1338,1359,1362,1401,1402,1407,1436` and `src/build/parts/partFields.ts:94` take I2C address options, PWM range and PD voltages from a hard-wired id. Only PowerMonitorInput has a per-node override (`nodeLibrary.ts:1903-1906`). Extend `propertyOptions` (and the slider bounds) to resolve from the node's own `partId` for LightInput, MotionVectorInput, TouchPadInput, DistanceInput, EnvironmentInput, PwmDriverOutput, PowerMonitorInput and PdTriggerSource. Also `nodeLibrary.ts:1367,4768` and `pinRetarget.ts:230-232` use `relay-module-8ch-5v` as the relay superset.
- **X8. Silent fallbacks.** `FALLBACK_SPEC` constants carrying one bundled part's numbers at `src/state/peripherals/` — `coolingFan.ts:8`, `darlingtonDriver.ts:18`, `buzzer.ts:30`, `touchPad.ts:5`, `touchButton.ts:5`, `temperatureSensor.ts:6`, `pwmDriver.ts:17`, `presenceSensor.ts:28`, `powerMonitor.ts:18`, `pdTrigger.ts:14`, `motionVector.ts:5`, `joystick.ts:6`, `ethernetModule.ts:37`, `environmentSensor.ts:7`, `distanceSensor.ts:11` — and first-module fallbacks (`lightSensor.ts:37`, `micModules.ts:99`, `irModules.ts:66`, `powerConverter.ts:46`) plus the second id fallbacks at `buzzer.ts:36`, `powerMonitor.ts:25`, `presenceSensor.ts:34`. Plan Phase A step 9 already covers unknown parts; delete the constants when it lands so nothing returns another part's facts.
- **X9. Help copy.** Per-part paragraphs and examples in `src/components/HelpModal/reference/{input,output,hardware}.ts` and `HelpModal.tsx:477,758,781-799` name bundled parts (about 120 lines). Generate from manifest `copy` (Phase A step 5). The same applies to node descriptions and property help in `nodeLibrary.ts` (2207-2241, 2666, 3369), `nodes/*/definitions.ts`, `validateGraph.ts` repair text, and `studioNodeChrome.ts:75-113`; the last is chip-level and can stay while the chip is in the type's `devices` list.
- **Missing `devices` lists.** `partTypes.ts` has no `deviceField` for DarlingtonDriverOutput (ULN2803A), RtcModule (DS3231), LineInput (PCM1802), DFPlayerOutput, DmxTransceiver, MidiInterface, MicInput, Amplifier and PowerAmplifier. Code there is written for one chip, so a manifest naming a different chip would load and be driven as the bundled one. Add `deviceField`/`devices` (and the blocks) before flipping `downloadable`.
- **Libraries.** Only two per-chip libraries are keyed on a part's chip: Pololu VL53L0X and VL53L1X (`backend/toolchain.py:337-342`, mirrored in `src/codegen/peripherals/distanceSensorCpp.ts:112-118`), both within DistanceInput's `devices`, so they stay with the type. Others are type-owned: IRremote 4.7.1 (`toolchain.py:332-333`), ESP32-audioI2S 3.0.12 and the `Audio.h`-before-`FastLED.h` trap (`toolchain.py:288-289`), LVGL, ZeroI2S, HUB75. No library is tied to a single part id. Register-level drivers (INA2xx, BME280, MPU-6050, MPR121, PCA9685, BH1750, DS3231, DFPlayer, TM1637, MAX7219, OLED, TFT) have no library.

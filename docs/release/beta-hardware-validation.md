# Beta Hardware Validation

FastLED Studio's public beta can use opt-in community reports to expand the
hardware support matrix without treating an unverified configuration as
supported. The Matrix Output **Upload...** panel identifies the missing evidence
for the current board, engine, LED target, layout, and graph features.

## Tester flow

1. Configure Matrix Output and run the relevant hardware action.
2. After a successful action, Studio offers the validation report when the
   configuration still has a known coverage gap. **Review tests...** keeps the
   report available manually at any time.
3. Enter the exact host OS/build and browser version. Browser user-agent data
   cannot reliably expose a Windows edition/build or Linux distribution.
4. Mark each physical observation **Pass**, **Fail**, or **Not tested**. Compile
   success is not a substitute for seeing the LEDs and peripherals work.
5. Expand **Review the exact report text** and inspect the complete payload.
6. Copy the Markdown report, download the structured JSON, or open the
   pre-filled GitHub issue. The tester performs the final submission; Studio
   never sends a report automatically.

## Included and excluded data

The report includes the Studio version, timestamp, board/FQBN, build engine and
version, LED chipset and color order, matrix/layout settings, safe GPIO wiring,
power/output settings, a hash/count for a custom XY map, PSRAM mode, relevant
show/audio features, measured capacity when it belongs to the selected target,
the tester's answers, and freeform notes.

It deliberately excludes serial-port names, project names/content, generated
code, media, Wi-Fi details, filesystem paths, and device identifiers. A tester
must be able to see the exact Markdown report before the GitHub action becomes
available. At least one physical result plus exact OS/browser fields are
required; partial and failed results are welcome and must not be promoted to a
supported row.

## Maintainer triage

For each received report:

1. Confirm that the configuration key and human-readable fields agree.
2. Separate toolchain-only results from real physical observations.
3. Ask for clarification when power supply, wiring, layout, or failure symptoms
   are ambiguous. Never infer a pass from a blank or **Not tested** answer.
4. Record useful partial evidence under "Recorded validations that are not yet
   full support rows" in `beta-support-matrix.md`.
5. Promote a Supported row only when the exact host/browser, controller,
   chipset, dimensions/layout, build engine, upload method, and physical scope
   have a dated passing record. Repeated independent reports raise confidence
   but do not silently broaden the row beyond what was tested.

## SD-show validation run

The first planned pre-beta SD-show test should use the **Music-synced SD Show**
starter and record the following as separate observations:

- Provisioner sketch compiles and flashes.
- Music and `.show` files transfer to the SD card without truncation or path
  errors.
- Final player sketch compiles and flashes.
- The player mounts the SD card after reboot and starts the intended track.
- I2S audio is clean at a conservative volume and uses the reported BCLK/LRC/
  DOUT pins.
- LEDs render the intended pattern set and baked energy/beat changes.
- Audio/visual synchronization remains acceptable at the beginning, middle,
  and end of at least one full song.
- Reboot, USB reconnect, and a second complete upload all work.
- Any collection-driven group-input modulation is tested separately and called
  out explicitly; do not bundle an untested modulation claim into the basic SD
  row.
- Firmware flash/RAM readings, host/browser versions, board/module, SD-card
  capacity/filesystem, LED power supply, and observed result are retained in
  the report notes.

Use a short test track first, keep LED brightness conservative, and confirm the
SD and LED power/wiring before starting a long run. A successful SD-show report
should move that exact combination out of the experimental list; it does not
validate every SD card, amplifier/DAC, song format, board, or layout.

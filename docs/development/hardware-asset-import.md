# Hardware asset import contract

Baseline board and part renders are imported. Generated catalogues in
`src/build/generated/boardCapabilityData.ts` and `partCatalogueData.ts`, plus
`src/build/boards/boardProfiles.ts` and `src/build/parts/partOptions.ts`, own the live inventory.
Do not maintain a second list of completed boards or guessed dimensions here.
New product work is [HW-12, HW-19 and HW-20](../../todo.md).

The verified source workspace is `C:\Users\User\Desktop\Blender Assets\`.
Its board modelling checklist and per-part manifests own source-art progress.
New physical visuals must come from verified Blender assets, not placeholders.
Each part needs a `.blend`, raw PNG and `part.json`; boards use `board.json`.
Dimensions and pin order must be verified against source evidence. Import the
manifest rather than repeating measurements in application code or this file.

Render orthographically at 800 px width, transparent, tightly cropped, using
raw Cycles PNG. Check silkscreen contrast, pin order and readability at bench
size. The importers create WebP and generated TypeScript catalogue data:

```powershell
python scripts/assets/import-part-assets.py "C:/Users/User/Desktop/Blender Assets/Parts"
python scripts/assets/import-board-assets.py
```

Pass `--only <part-id>[,...]` to the part importer to re-encode just those parts.

Every controller board, and every part module with its own circuit board, is a
full 3D rebuild made by `Scripts/board_rebuild/` in the asset workspace (see its
README): components sit on solder at the PCB surface, so the models also hold
up at an angle. A part module keeps its approved finishes (ink, mask, plated
rings and square pads, including the LM2596 pads `CONVERTER_PAD_MM` reads) and
gains plated barrels. Parts without a board (the probe, speaker, keypad, IR
receiver and ULN2803A), sealed supplies, the NLED STEP models and the HUB75 face
keep their original models and renders. The SN74AHCT125N keeps its model but
gains the lead drops its generator left out. A rebuild keeps the camera,
plated-hole centres, hole radius and pin labels pixel-identical, and
`qa_finals.py` checks that against the previous render. It accepts only these
deviations: mounting holes the rebuild drilled where the generator had painted
a dark disc, the holes in its `REOPENED` list, which a misplaced passive had
half covered, and image-edge contact that the model already had when the
rebuild left its footprint unchanged. It can move a USB-C receptacle that overhung the edge, so update
`usbPoint` in `src/components/BuildDiagram/controllerGeometry.ts` from the
rebuild report.

The board importer uses the configured Blender source workspace; inspect its
source configuration before targeting another asset folder. Review catalogue,
render and pin-map changes together. A profile/render is not a hardware pass:
unknown capabilities must remain explicit, and the
[support matrix](../release/beta-support-matrix.md) owns support claims.

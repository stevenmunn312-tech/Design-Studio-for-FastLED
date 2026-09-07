# Hardware asset import contract

Baseline board and part renders are imported. Generated catalogues in
`src/build/generated/boardCapabilityData.ts` and `partCatalogueData.ts`, plus
`src/build/boardProfiles.ts` and `src/state/partOptions.ts`, own the live inventory.
Do not maintain a second list of completed boards or guessed dimensions here.
New product work is [HW-12, HW-19 and HW-20](../../../todo.md).

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
python scripts/import-part-assets.py "C:/Users/User/Desktop/Blender Assets/Parts"
python scripts/import-board-assets.py
```

The board importer uses the configured Blender source workspace; inspect its
source configuration before targeting another asset folder. Review catalogue,
render and pin-map changes together. A profile/render is not a hardware pass:
unknown capabilities must remain explicit, and the
[support matrix](../../release/beta-support-matrix.md) owns support claims.

/**
 * Graph-allocation ceilings per chip family, and the measurements behind them.
 *
 * `findFirmwareRamBudgetIssue` compares a board's budget against
 * `estimateFirmwareRam().internalBytes` — what the *graph* allocates, not the
 * sketch's total static RAM — and refuses the build before a toolchain runs.
 * So the number has to admit every graph someone can reasonably build while
 * still failing one that would not fit.
 */

/**
 * Classic ESP32 (320 KiB DRAM).
 *
 * Raised from 48 KiB on 2026-09-22, from bench measurement rather than
 * argument. The old value refused a custom screen outright: a 14-widget design
 * estimates 77,556 bytes of graph allocations, so every custom-screen build on
 * every classic ESP32 was rejected before compiling. HW-25 existed to explain
 * that as a hardware limit. It is not one — on the ESP32-2432S028R rig that
 * design links at 32% of RAM and runs at 238,564 bytes of free heap, flat over
 * the capture, with the show controller adding only 948 bytes on top.
 *
 * Why 96 KiB and not higher: free heap falls almost exactly one-for-one with
 * graph allocations (77,480 measured against 77,556 estimated), so a 96 KiB
 * graph leaves roughly 219 KiB free — still clear of the 192 KiB floor the
 * bench sets, while extrapolating only ~27% beyond the heaviest build actually
 * measured. It can be raised again, but on evidence, not on the fact that it
 * cleared one more case.
 *
 * **What the measurements did not include: WiFi.** The 48 KiB value was
 * calibrated to leave room for an unmodelled network baseline, and every run
 * behind this number ran without it (the rig's clock is `Manual`, so no NTP).
 * A graph that both fills this budget and brings up WiFi is outside what has
 * been measured here.
 */
export const CLASSIC_ESP32_RAM_BUDGET_BYTES = 96 * 1024

/**
 * ESP32-S3 (512 KiB SRAM). Unchanged and unmeasured by the 2026-09-22 bench,
 * which had no S3 rig — left exactly as it was rather than scaled from a
 * classic-ESP32 result it shares no memory map with.
 */
export const ESP32_S3_RAM_BUDGET_BYTES = 192 * 1024

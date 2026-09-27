# Testing

Traps in the Vitest suite itself: how a test's time budget is spent, and how
one failure can be the echo of another. Read this before changing a test's
setup or chasing a failure that only shows up in a full run; record new test
patterns here, not in `CLAUDE.md`.

## Timeouts and cold imports

- **The first test in a file can pay for the whole app's transform.** Vitest
  gives each test 5 seconds. A file that calls `vi.resetModules()` and then
  `await import(...)`s its stores inside each test pays the cold transform of
  everything those stores reach, and it pays it in the first test only. Later
  tests only re-evaluate modules already transformed, in a fraction of the
  time. `uploadStore.test.ts` reaches most of the app: its first test took
  4,994 ms of its 5,000, so any growth elsewhere in `src/` pushed it over.
  That happened on 2026-09-27, when Power Switch dimming added a few modules
  and a test nobody had touched began to fail.
- **Pay the cold import once, in `beforeAll`, with its own budget.** Import
  the same modules there before any test runs:

  ```ts
  beforeAll(async () => {
    await import('../projectStore')
    await import('../uploadStore')
  }, 60_000)
  ```

  Each test's `vi.resetModules()` still gives it a fresh store instance; only
  the transform is shared. `uploadStore.test.ts`'s first test dropped from
  about 5,000 ms to about 200 ms. The timeout then measures the test rather
  than the size of the app.
- **A timed-out test keeps running, and its result lands in the next test.**
  Vitest does not cancel the timed-out test's pending work. Its awaited call
  (in the case above, a mocked upload) resolves later and records into the
  shared mocks the following test reads, so that test fails an assertion with
  another test's data (a board target without its PSRAM option). Fix the
  timeout; the second failure has no cause of its own.
- **Recognise it by where it fails.** The first test of a file fails near
  5,000 ms in a full run, or on a slower or busier machine. It may pass alone
  or on rerun, and the next test in the file fails oddly. Check the margin
  with `npx vitest run <file> --reporter=verbose`, which prints each test's
  duration. On 2026-09-27 the other files that reset and re-import stores
  (`capacityStore`, `masterBrightnessScale`, `projectStore`, `streamStore`,
  `uiStore`) peaked at 1.6 s (`masterBrightnessScale`) or much less.

## Full-suite runs under load

- The full suite takes about two minutes on an otherwise idle machine. Firmware
  builds running at the same time, or a laptop throttling on a failing
  battery, stretch it several times over: one such run reported single tests
  at 396 seconds and failures in files that pass on a quiet rerun. A failure
  from a loaded run proves nothing until the file is rerun alone, and then
  the suite is rerun on a quiet machine.

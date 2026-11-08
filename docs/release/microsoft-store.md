# Microsoft Store

The Windows desktop bundle ships to the Microsoft Store as an MSIX package of
the PyInstaller bundle described in [desktop distribution](desktop-distribution.md).
The Store signs every package it accepts, so a Store build needs no code-signing
certificate of our own. The portable ZIP on GitHub stays unsigned.

## What makes the bundle Store-ready

- **Native window, no console.** The launcher is windowed and shows the Studio
  in WebView2; helper subprocesses pass `NO_CONSOLE_WINDOW`.
- **User work outside the package.** MSIX redirects AppData writes into the
  package's own folder, which uninstall deletes. (A folder that already exists
  in the real AppData, such as one left by the portable build, is written in
  place instead and survives.) Projects and My Patterns live in
  `Documents\Design Studio for FastLED`, so neither case can lose them; only
  rebuildable data (toolchains, caches, the WebView2 profile, `desktop.log`)
  is in AppData. A packaged app still reads the real AppData, so the
  first-start migration finds content the portable build left there.
- **No self-update.** Store apps update only through new Store submissions.
- **Manifest:** `desktop/assets/AppxManifest.xml`. A full-trust desktop app
  (`runFullTrust`) with the `microphone` device capability. Minimum Windows is
  10 1809 (17763), the oldest release WebView2 supports.
- **Logos:** `desktop/assets/msix/`, rendered from `public/icon-512.png` by
  `scripts/assets/make-desktop-icons.py` (which also writes the launcher's
  `app.ico`). Re-run it when the icon changes and commit the output.

## Build

On Windows with the Windows SDK installed (it provides `makeappx.exe`), in the
packaging environment from [desktop distribution](desktop-distribution.md#build):

```bash
npm run package:desktop -- --msix --msix-identity-name <Package/Identity/Name> --msix-publisher "<Package/Identity/Publisher>" --msix-publisher-display-name "<Publisher display name>"
```

Partner Center lists the three identity values under the reserved app's
**Product identity** page. Without them the build uses local test values,
which install locally but are rejected by a Store upload. The package is
written to `release/desktop/DesignStudioForFastLED-<version>-windows-x86_64.msix`
and its unpacked layout to `.desktop-build/msix-layout/`. The version is
`package.json`'s `x.y.z` plus `.0`, because the Store reserves the fourth part.
Each submission needs a higher version than the last.

## Test locally

The `.msix` is unsigned, so Windows will not install it directly. With Developer
Mode on, register the layout folder instead; it runs packaged, with the same
identity, AppData redirection and capabilities:

```powershell
Add-AppxPackage -Register .desktop-build\msix-layout\AppxManifest.xml
```

Start it from the Start menu, then remove it with
`Get-AppxPackage *DesignStudioForFastLED* | Remove-AppxPackage`. Removing the
package deletes its redirected AppData, which is the reason projects live in
Documents; check that they survive.

A packaged launch does not inherit the shell's environment, so a test on a
machine already running a helper on 8008 stops with the port-in-use message.
To test beside one, run a `.cmd` inside the package that sets
`FLS_DESKTOP_PORT`, `FLS_CONTENT_DIR` (so startup does not move real
projects) and `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` (to block the page's
calls to 8008), then starts the executable:
`Invoke-CommandInDesktopPackage -PackageFamilyName <family> -AppId DesignStudio -Command cmd.exe -Args '/c "<launch.cmd>"' -PreventBreakaway`.

Before each submission, run the Windows App Certification Kit on the `.msix`
(from an elevated prompt):

```powershell
& "C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe" test -appxpackagepath <package.msix> -reportoutputpath wack-report.xml
```

## Submit

1. Register a Partner Center developer account (free for individuals; needs
   identity verification) and reserve the name **Design Studio for FastLED**.
2. Build with the reserved identity values and run WACK.
3. Create a submission and upload the `.msix`.
4. **Restricted capability:** explain `runFullTrust`. Suggested text: "Design
   Studio is a desktop development tool. It runs a local helper that compiles
   firmware with the Arduino toolchain, flashes microcontrollers over USB
   serial ports, and opens native file dialogs, which needs a full-trust
   desktop process."
5. **Listing:** description, at least one screenshot (1366x768 or larger),
   category Developer tools, the age-rating questionnaire, a privacy policy
   URL and a support contact. Say in the description that the app downloads
   compilers and board support packages (Arduino CLI, ESP32 and RP2040 cores,
   FastLED) on first use, and that it needs a USB connection to a
   microcontroller board to upload.
6. **Pricing:** free. The AnimARTrix module is licensed non-commercially
   (see `THIRD_PARTY_NOTICES.md`).

Certification usually takes a few days. Updates are new submissions with a
higher version.

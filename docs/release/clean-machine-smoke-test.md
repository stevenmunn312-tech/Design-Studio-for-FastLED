# Clean-machine smoke test

A release candidate's desktop package, run the way a new user meets it: a
Windows account (or Mac, or Linux machine) that has never had Design Studio, a
developer toolchain, or this repository on it. It is the HW-17 evidence for
launch and install, helper discovery, permissions, offline use and recovery
([desktop distribution](desktop-distribution.md#signing-and-publishing)).
The packaging workflow's own launch smoke runs on CI runners and does not
replace it: a developer machine or runner has git, uv and Python on PATH, and
the first run on a clean account showed the helper had quietly relied on two
of them. To approximate a clean machine locally, run the helper with `PATH`
cut down to `C:\Windows\System32` and fresh `FLS_DATA_DIR` and
`FLS_CONTENT_DIR` folders.

Record the results in [Results](#results) with the package's run number and
commit.

## Windows

About an hour, most of it the first build's toolchain download.

### Before you start (in your own account)

1. Download the `design-studio-for-fastled-windows-x86_64` artifact from the
   **Desktop Packages** run for the candidate commit. Artifacts need a GitHub
   sign-in, so do this in your own account.
2. Copy the ZIP to `C:\Users\Public\Downloads`, where the test account can
   read it.
3. Have one of the supported hardware rows ready
   ([support matrix](beta-support-matrix.md#supported-end-to-end-combo)),
   for example an ESP32-S3 with WS2812B LEDs on its own power supply, and a
   data-capable USB cable.

### Create the test account

1. Settings > Accounts > Other users > **Add account**.
2. Choose **I don't have this person's sign-in information**, then **Add a
   user without a Microsoft account**.
3. Name it (for example `fls-test`) and give it a password. Leave it a
   **standard** account, not an administrator: a new user usually is one, and
   the app must not need elevation.
4. Sign out of your account (or Switch user) and sign in as the test account.
   Let Windows finish setting it up.

### Run it

Note the time and outcome of each step.

1. **Unpack.** Copy the ZIP from `C:\Users\Public\Downloads` to the test
   account's Downloads, right-click > **Extract All**.
2. **First launch.** Open the extracted folder and run
   `Design Studio for FastLED.exe`. The archive is unsigned, so expect
   SmartScreen's "Windows protected your PC": choose **More info > Run
   anyway**. Record that it appeared and what it named as the publisher.
   - Pass: a Design Studio window opens (not a browser tab, no console
     window) within about 30 seconds.
   - If a message says WebView2 is missing, record it: it opens the browser
     instead, which is the designed fallback.
3. **First project.** The Start Gallery opens. Choose **Juggle**. The LED
   preview animates.
4. **Microphone permission.** Open the Start Gallery again and pick **Audio
   Spectrum**. Windows or the app asks for the microphone: allow it, and
   check the audio levels move when you speak. Then reopen Juggle.
5. **Board and port.** Plug the board in by USB. On the **Upload** tab the
   port appears within a few seconds. If it does not, record the board and its
   USB chip; Windows may need a CP210x or CH340 driver, which is the user's
   step, not the app's.
6. **First upload.** Choose the board's exact profile on the Hardware tab if
   it is not already, then **Upload**. The first build downloads the
   compiler, board core and libraries (ESP32 can take 15 minutes or more).
   - Pass: progress is shown throughout, the upload completes, and the LEDs
     run Juggle.
   - Record the total time and any message that confused you.
7. **Save.** Ctrl+S. Check that
   `Documents\Design Studio for FastLED\Projects` now holds the project file.
8. **Second launch.** With the app open, run the .exe again: the existing
   window comes to the front instead of a second copy opening.
9. **Recovery.** Change a property (Juggle's speed), wait five seconds, then
   end the app from Task Manager (Ctrl+Shift+Esc > Design Studio for FastLED >
   **End task**). Launch it again: the project reopens with the change, or
   File > **Recover Snapshot…** offers it.
10. **Offline.** Turn off Wi-Fi (or unplug the network). Launch the app, open
    the project, change the speed and **Upload** again.
    - Pass: it builds and uploads from the cached toolchain with no network.
11. **Close.** Close the window. Check in Task Manager that no Design Studio,
    arduino-cli, fbuild or esptool process is left running.

### Collect and clean up

1. Copy `%LOCALAPPDATA%\Design Studio for FastLED\desktop.log` to
   `C:\Users\Public\Downloads`, so you can send it from your own account.
2. Sign out, sign back in to your own account, and send the notes and the log.
3. Remove the test account: Settings > Accounts > Other users > the account >
   **Remove**, then **Delete account and data**. This deletes that account's
   files, including its copy of the toolchain and the test project; nothing
   in your own account is touched.

## macOS and Linux

The same steps apply, with these differences:

- **macOS:** create the user in System Settings > Users & Groups. The app is
  `Design Studio for FastLED.app` inside the ZIP. Until it is signed and
  notarized, Gatekeeper blocks the first open: record the exact message and
  what it took to open it (System Settings > Privacy & Security > **Open
  Anyway**). Run once on Apple Silicon and once on Intel.
- **Linux:** a fresh user (`sudo adduser fls-test`). Serial access needs the
  user in the `dialout` group (or `uucp` on Arch); record whether the app
  explained that when the port was missing.
- The data root and log location differ per platform; see
  [runtime layout](desktop-distribution.md#runtime-layout).

## Results

| Date | Platform | Package (run, commit) | Tester | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-11-22 | Windows 11, standard account | 44913821613, `a4b9cbfc` | Steve | **Fail** at step 6 | The first build stopped before compiling: the helper cloned FastLED with `git`, and fbuild installed its own esptool with `uv`, and a clean account has neither. Fixed: pinned libraries download as GitHub tag archives, and fbuild is pointed at the bundled esptool through `FBUILD_ESPTOOL_PATH`. Steps 7 to 11 not reached. |
| 2026-11-22 | Windows 11, fresh standard account | 44966086525, `deb9fd65` | Steve | **Fail** at step 2 | Upload, save, recovery (after closing the browser), offline upload and a clean exit passed; SmartScreen named the publisher "Unknown"; the microphone and COM port worked with no driver. But the app opened in the browser, not its window, so a second launch opened another tab. Cause: Windows marks files extracted from a downloaded ZIP, and .NET Framework refused the marked `Python.Runtime.dll`. Fixed with a `loadFromRemoteSources` launcher config, confirmed on the same marked copy. |
| 2026-11-22 | Windows 11, same fresh account | 44968147471, `35d4d8af` | Steve | **Pass** | Rerun of the steps the browser fallback affected: the app opened in its own window, a second launch raised it, recovery after ending it in Task Manager kept the change, and nothing was left running. With the previous run, every step has passed on this package's code. |

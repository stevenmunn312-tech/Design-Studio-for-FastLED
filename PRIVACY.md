# Privacy policy

Design Studio for FastLED

Effective 20 November 2026

Design Studio for FastLED is a free desktop application for designing LED
effects and uploading them to microcontroller boards. It runs on your own
computer. This policy describes what the application stores, what it sends
over the network, and why.

## Summary

- The application does not collect personal information and sends nothing to
  the developer. It has no accounts, analytics, advertising, tracking, crash
  reporting or update checks.
- Your projects, patterns and settings stay on your computer.
- The application downloads build tools and libraries from their publishers
  the first time you need them. Those servers see your IP address.
- Microphone audio is analysed as it arrives and is never recorded, stored or
  transmitted.

## What stays on your computer

- **Projects and patterns** are saved in your Documents folder, under
  `Design Studio for FastLED`.
- **Tools and caches** (compilers, board support packages, libraries, build
  output), the embedded browser's profile and a diagnostic log
  (`desktop.log`) are kept in the application's data folder. The log records
  the application's own operation and is never sent anywhere.
- **Network settings** you enter for your devices, such as Wi-Fi network
  names and passwords and Art-Net and NTP settings, are kept in the
  application's local storage. They are not saved in project files or share
  links.

Uninstalling the Microsoft Store version removes its data folder; for the
portable version, delete the folder yourself. Either way, your projects in
Documents remain until you delete them.

## Microphone

Audio-reactive effects can listen to your microphone. The application asks
for permission first, and you can refuse; live audio effects then stay
inactive. Audio is turned into levels such as bass, mids, treble and beat as
it arrives, and the audio itself is not kept. A preview recording stores only
those levels, in a file saved on your computer.

## Network connections

The application connects to other computers only in these cases.

**Downloading build tools.** To compile firmware for a board, the application
downloads the compiler, board support package and libraries that board needs,
once, from their publishers: Arduino (`downloads.arduino.cc`), GitHub
(including Espressif, Earle Philhower's RP2040 core, FastLED and the
libraries named in `THIRD_PARTY_NOTICES.md`), Adafruit, PJRC,
STMicroelectronics and the ESP8266 community (`arduino.esp8266.com`). These
requests carry no information about you or your projects, but the servers
receive your IP address and handle it under their own privacy policies.

**The local helper.** The application's helper service, which handles USB
upload and file access, listens only on your own computer (`127.0.0.1`) and
cannot be reached from the network.

**Lighting input on your local network.** If a project you trust uses an
Art-Net, sACN or DDP input, the application listens for that lighting data on
your local network while the input is active. It sends nothing back.

**Links you open.** Help pages, datasheets and product links open in your web
browser. The application sends nothing to those sites itself.

## Firmware you build

Firmware is generated on your computer and uploaded to your board over USB.
If your project uses Wi-Fi, the Wi-Fi name and password are compiled into the
firmware in plain text, because the board needs them to connect. Treat
exported sketches and firmware files accordingly. A board configured to set
its clock over the internet contacts the NTP server named in the project
(`pool.ntp.org` by default).

## Sharing

- **Share links** carry the project inside the part of the link after `#`.
  Browsers do not send that part to any server, so the project is shared only
  with the people you give the link to.
- **Hardware test reports** are sent only if you choose to. The application
  shows the report for you to review, then opens a pre-filled issue on this
  project's public GitHub repository, where you decide whether to post it. It
  includes the board, build engine, LED and layout settings, firmware size,
  your test answers and your notes. It leaves out serial port names, project
  contents, generated code, Wi-Fi details and device identifiers. Anything
  you post on GitHub is public and covered by GitHub's privacy policy.

## Microsoft Store

If you install the application from the Microsoft Store, Microsoft may
collect installation, usage and diagnostic data under the Microsoft Privacy
Statement. The application adds nothing to it.

## Children

The application collects no personal information from anyone, including
children.

## Changes

Changes to this policy are published in this file, with a new effective date.
Its history is in the project's Git repository.

## Contact

Questions about this policy can be raised as an issue on the project's
[GitHub repository](https://github.com/stevenmunn312-tech/Design-Studio-for-FastLED/issues).
Security concerns should follow [SECURITY.md](SECURITY.md).

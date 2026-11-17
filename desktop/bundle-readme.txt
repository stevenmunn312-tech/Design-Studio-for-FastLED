Design Studio for FastLED portable desktop bundle
==================================================

On Windows, launch "Design Studio for FastLED.exe". The Studio opens in its
own window; close that window to stop it. The window is drawn by the Microsoft
Edge WebView2 Runtime that ships with Windows. If WebView2 is missing, the
Studio opens in your web browser instead and shows a message you keep open
while you work.

On macOS, open "Design Studio for FastLED.app" (drag it to Applications
first if you like). The Studio opens in your normal web browser, and a small
window shows that it is running. Closing that window keeps the Studio running;
choose Quit (or press Cmd+Q) to stop it. Clicking the app in the Dock opens
the Studio again.

On Linux, launch "Design Studio for FastLED". Your normal web browser opens
automatically. Keep the launcher window open while using the Studio; press
Ctrl+C in it to stop the local application.

Node.js and Python are included and do not need to be installed separately.
The first firmware compile may still download board toolchains and can take
several minutes. Project files and saved patterns are stored in
Documents\Design Studio for FastLED (Documents/Design Studio for FastLED on
macOS and Linux). Helper configuration, downloaded toolchains and build caches
are stored in your user application-data folder (~/Library/Application
Support/Design Studio for FastLED on macOS). Nothing is kept beside the
executable.

Custom Display firmware downloads the pinned LVGL 9.5.0 runtime on its first
build. LVGL is MIT-licensed; a cached checkout keeps its upstream license file.

This is a portable beta bundle, not a signed installer. Your operating system
may show an unknown-publisher warning until release signing is configured.
On macOS, if the app will not open because Apple cannot check it, open System
Settings > Privacy & Security and choose Open Anyway.

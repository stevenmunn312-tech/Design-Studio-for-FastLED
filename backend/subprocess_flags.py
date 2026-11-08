"""Process-creation flags shared by every helper subprocess.

The packaged Windows desktop app is a windowed (GUI) process with no console.
Each console tool it starts — arduino-cli, fbuild, esptool, taskkill,
PowerShell — would otherwise open a console window of its own for as long as
it runs. ``CREATE_NO_WINDOW`` gives the child a console without a window, and
the child's own children inherit that console, so compiler fan-out stays
hidden too. Outside Windows the flag is 0, which ``subprocess`` accepts.
"""
from __future__ import annotations

import subprocess

NO_CONSOLE_WINDOW: int = getattr(subprocess, "CREATE_NO_WINDOW", 0)

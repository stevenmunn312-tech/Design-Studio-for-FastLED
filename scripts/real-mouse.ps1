# Persistent Win32 mouse driver for the demo recorder (scripts/record-demo.mjs).
# Moves the REAL Windows cursor via SetCursorPos/mouse_event so OBS captures
# genuine cursor motion — Playwright's synthetic mouse never moves the OS
# cursor, which is why screen recordings of the old script showed a dead
# pointer.
#
# Protocol (one command per stdin line):
#   move <x> <y>   absolute physical screen pixels
#   down / up      left button press / release at the current position
#   wheel <delta>  vertical scroll (+120 per notch toward the user)
#   pos            replies "POS <x> <y>" on stdout
#   fg <title>     bring the window whose title starts with <title> to the
#                  foreground; replies "FG 1" or "FG 0"
#   quit           exit
# Prints "READY" once initialised.

$src = @"
using System;
using System.Runtime.InteropServices;
public static class DemoMouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public struct POINT { public int X; public int Y; }
}
"@
Add-Type -TypeDefinition $src
[void][DemoMouse]::SetProcessDPIAware()
# Node writes UTF-8; without this, non-ASCII bytes in commands get mangled.
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::Out.WriteLine('READY')

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $p = $line.Trim() -split ' '
  switch ($p[0]) {
    'move'  { [void][DemoMouse]::SetCursorPos([int]$p[1], [int]$p[2]) }
    'down'  { [DemoMouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero) }
    'up'    { [DemoMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero) }
    'wheel' {
      $d = [int]$p[1]
      $u = if ($d -lt 0) { [uint32](4294967296 + $d) } else { [uint32]$d }
      [DemoMouse]::mouse_event(0x0800, 0, 0, $u, [UIntPtr]::Zero)
    }
    'pos'   {
      $pt = New-Object DemoMouse+POINT
      [void][DemoMouse]::GetCursorPos([ref]$pt)
      [Console]::Out.WriteLine("POS $($pt.X) $($pt.Y)")
    }
    'fg'    {
      $title = ($p | Select-Object -Skip 1) -join ' '
      $ok = 0
      try {
        # Tap ALT first: Windows refuses foreground changes from background
        # processes unless a key/input event is in flight (the classic trick).
        [DemoMouse]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
        [DemoMouse]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
        $shell = New-Object -ComObject WScript.Shell
        if ($shell.AppActivate($title)) { $ok = 1 }
      } catch {}
      [Console]::Out.WriteLine("FG $ok")
    }
    'quit'  { exit 0 }
  }
}

#Requires AutoHotkey v2.0
#SingleInstance Force
#Warn

; Reliable Tutorial 1 capture workflow
; ------------------------------------
; 1. Run this script before entering fullscreen.
; 2. Reset Chrome and enter F11 fullscreen.
; 3. Physically press Shift+R to start OBS.
; 4. Press Ctrl+Shift+F12 to start the replay.
; 5. When the completion message appears, physically press Shift+R to stop OBS.

if A_Args.Length && A_Args[1] = "--check"
    ExitApp(0)

global ReplayInProgress := false
global ReplayScript := A_ScriptDir "\replay-mouse-recording.ahk"
global ActionSchedule := A_ScriptDir
    . "\..\outputs\mouse-recordings\tutorial-01-narration-timed.jsonl"

ToolTip(
    "Tutorial 1 replay armed`n"
    . "Start OBS with Shift+R, then press Ctrl+Shift+F12",
    20,
    20
)
SetTimer(HideReplayStatus, -4500)

^+F12::StartCleanReplay()

StartCleanReplay()
{
    global ReplayInProgress
    global ReplayScript
    global ActionSchedule

    if ReplayInProgress
        return

    if !FileExist(ReplayScript) || !FileExist(ActionSchedule)
    {
        MsgBox("The replay script or Tutorial 1 action schedule is missing.")
        return
    }

    targetChrome := WinExist("Design Studio for FastLED ahk_exe chrome.exe")
    if !targetChrome
    {
        MsgBox("The FastLED Design Studio Chrome window was not found.")
        return
    }

    ReplayInProgress := true
    ToolTip()

    WinActivate("ahk_id " targetChrome)
    if !WinWaitActive("ahk_id " targetChrome, , 3)
    {
        ReplayInProgress := false
        MsgBox("Chrome could not be activated.")
        return
    }

    WinGetPos(&windowX, &windowY, &windowWidth, &windowHeight, "ahk_id " targetChrome)
    if windowHeight < A_ScreenHeight - 5
    {
        SendEvent("{F11}")
        Sleep(1500)
    }

    command := '"' A_AhkPath '" "' ReplayScript '" "'
        . ActionSchedule '" --no-countdown --quiet'
    Run(command, A_ScriptDir, "Hide")

    ; Allow activation, initial cursor positioning, the 31-second schedule,
    ; and a clean final hold before prompting the user to stop OBS.
    Sleep(33800)

    ReplayInProgress := false
    ToolTip(
        "Replay complete - press Shift+R to stop OBS",
        Round((A_ScreenWidth - 520) / 2),
        10
    )
    SoundBeep(900, 100)
    Sleep(120)
    SoundBeep(1100, 100)
    SetTimer(HideReplayStatus, -5000)
}

HideReplayStatus()
{
    ToolTip()
}

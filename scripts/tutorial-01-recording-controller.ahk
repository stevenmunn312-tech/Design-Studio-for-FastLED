#Requires AutoHotkey v2.0
#SingleInstance Force
#Warn

; Tutorial 1 final-recording controller
; -------------------------------------
; 1. Run this script.
; 2. Put Chrome on the empty welcome canvas in F11 fullscreen.
; 3. Press Ctrl+Shift+F12.
;
; The controller waits five seconds, toggles OBS recording with Shift+R,
; performs the clean narration-timed replay, then toggles OBS off.

if A_Args.Length && A_Args[1] = "--check"
{
    ExitApp(0)
}

global CaptureInProgress := false
global ObsRecordingStarted := false
global CancelRequested := false
global ReplayScript := A_ScriptDir "\replay-mouse-recording.ahk"
global ActionSchedule := A_ScriptDir
    . "\..\outputs\mouse-recordings\tutorial-01-narration-timed.jsonl"
global ObsOutputDirectory := EnvGet("USERPROFILE") "\Videos"
global RunOnceMode := HasControllerArgument("--run-now")

ShowArmedStatus()

^+F12::StartTutorialCapture()

if RunOnceMode
    SetTimer(StartTutorialCapture, -200)

#HotIf CaptureInProgress
$Esc::
{
    global CancelRequested
    CancelRequested := true
}
#HotIf

StartTutorialCapture()
{
    global CaptureInProgress
    global ObsRecordingStarted
    global CancelRequested
    global ReplayScript
    global ActionSchedule
    global RunOnceMode

    if CaptureInProgress
        return

    if !ProcessExist("obs64.exe")
    {
        MsgBox("OBS Studio is not running.")
        return
    }

    if !FileExist(ActionSchedule) || !FileExist(ReplayScript)
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

    CaptureInProgress := true
    CancelRequested := false
    replayExitCode := -1
    captureFailure := ""
    previousObsRecording := FindLatestObsRecording()
    ToolTip()

    try
    {
        WinActivate("ahk_id " targetChrome)
        if !WinWaitActive("ahk_id " targetChrome, , 3)
            throw Error("Chrome could not be activated.")

        ; If Chrome is maximized but not fullscreen, switch it to F11 mode.
        WinGetPos(&windowX, &windowY, &windowWidth, &windowHeight, "ahk_id " targetChrome)
        if windowHeight < A_ScreenHeight - 5
        {
            SendEvent("{F11}")
            Sleep(1500)
        }

        ; Five clean seconds for the fullscreen notification to disappear.
        if !WaitCancelable(5000)
            throw Error("Capture cancelled.")

        ; OBS global hotkey configured by the user.
        SendEvent("+r")
        ObsRecordingStarted := true
        if !WaitCancelable(900)
            throw Error("Capture cancelled.")

        command := '"' A_AhkPath '" "' ReplayScript '" "'
            . ActionSchedule '" --no-countdown --quiet'
        Run(command, A_ScriptDir, "Hide")

        ; The replay timeline is 31 seconds, plus activation and initial cursor
        ; positioning. AutoHotkey's launcher can return before the replaying
        ; script exits, so keep OBS running for the deterministic full window.
        if !WaitCancelable(33000)
            throw Error("Capture cancelled.")

        ; Leave a short clean hold on the LED Preview.
        if !WaitCancelable(800)
            throw Error("Capture cancelled.")

        replayExitCode := 0
    }
    catch as captureError
    {
        captureFailure := captureError.Message
    }
    finally
    {
        if ObsRecordingStarted
        {
            SendEvent("+r")
            ObsRecordingStarted := false
            Sleep(500)
        }

        CaptureInProgress := false
    }

    newestObsRecording := FindLatestObsRecording()
    if !captureFailure
        && (!newestObsRecording || newestObsRecording = previousObsRecording)
        captureFailure := "OBS did not create a new recording file."

    if captureFailure
        ToolTip("Tutorial recording stopped:`n" captureFailure, 20, 20)
    else if replayExitCode = 0
        ShowFinishedStatus(newestObsRecording)
    else
        ToolTip("Replay was interrupted; OBS has been stopped.", 20, 20)

    if RunOnceMode
    {
        Sleep(2800)
        ExitApp(captureFailure ? 1 : 0)
    }
}

WaitCancelable(durationMs)
{
    global CancelRequested
    waitStartedTick := A_TickCount

    while A_TickCount - waitStartedTick < durationMs
    {
        if CancelRequested
            return false
        Sleep(20)
    }

    return true
}

ShowArmedStatus()
{
    ToolTip(
        "Tutorial 1 controller armed`n"
        . "Press Ctrl+Shift+F12 when Chrome is ready",
        20,
        20
    )
    SetTimer(HideControllerStatus, -3500)
}

ShowFinishedStatus(recordingPath)
{
    ToolTip(
        "Tutorial 1 OBS capture complete`n"
        . recordingPath,
        20,
        20
    )
    SetTimer(HideControllerStatus, -2500)
}

HideControllerStatus()
{
    ToolTip()
}

FindLatestObsRecording()
{
    global ObsOutputDirectory
    latestPath := ""
    latestModified := ""

    Loop Files, ObsOutputDirectory "\*.mp4", "F"
    {
        if !latestPath || A_LoopFileTimeModified > latestModified
        {
            latestPath := A_LoopFileFullPath
            latestModified := A_LoopFileTimeModified
        }
    }

    return latestPath
}

HasControllerArgument(argument)
{
    for suppliedArgument in A_Args
    {
        if suppliedArgument = argument
            return true
    }
    return false
}

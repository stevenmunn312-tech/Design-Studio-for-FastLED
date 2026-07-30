#Requires AutoHotkey v2.0
#SingleInstance Force
#Warn

; Mouse Action Recorder
; ---------------------
; Run this script with AutoHotkey v2, then press ~ (Shift + the ` key)
; to start or stop recording. Each recording is saved as a JSONL file.
;
; Optional command-line argument:
;   mouse-action-recorder.ahk "C:\path\to\output-folder"

if A_Args.Length && A_Args[1] = "--check"
{
    ExitApp(0)
}

global Recording := false
global OutputFile := ""
global RecordingStartedTick := 0
global OutputDirectory := A_Args.Length
    ? A_Args[1]
    : A_ScriptDir "\..\outputs\mouse-recordings"
global ButtonsDown := Map()
global LastClicks := Map()
global GuideActions := BuildTutorialOneGuide()
global GuideIndex := 1
global GuideTextBuffer := ""
global GuideOverlay := BuildGuideOverlay()
global KeyboardCapture := InputHook("V")

CoordMode("Mouse", "Screen")
OnExit(HandleExit)
KeyboardCapture.KeyOpt("{All}", "N")
KeyboardCapture.OnKeyDown := RecordKeyPress
KeyboardCapture.Start()
ShowStatus("Ready - press ~ to start recording", 1800)

; SC029 is the physical ` / ~ key. Requiring Shift makes this the ~ hotkey.
+SC029::
{
    KeyWait("SC029")
    ToggleRecording()
}

; The ~ and * modifiers allow the original mouse input through and catch it
; regardless of which keyboard modifiers are currently held.
~*LButton::RecordButtonDown("left")
~*LButton Up::RecordButtonUp("left")
~*RButton::RecordButtonDown("right")
~*RButton Up::RecordButtonUp("right")
~*MButton::RecordButtonDown("middle")
~*MButton Up::RecordButtonUp("middle")
~*XButton1::RecordButtonDown("x1")
~*XButton1 Up::RecordButtonUp("x1")
~*XButton2::RecordButtonDown("x2")
~*XButton2 Up::RecordButtonUp("x2")

~*WheelUp::RecordWheel("up", 120)
~*WheelDown::RecordWheel("down", -120)
~*WheelLeft::RecordWheel("left", -120)
~*WheelRight::RecordWheel("right", 120)

ToggleRecording()
{
    global Recording
    global OutputFile
    global RecordingStartedTick
    global ButtonsDown
    global LastClicks
    global GuideIndex
    global GuideTextBuffer

    if Recording
    {
        StopRecording("hotkey")
        return
    }

    OutputFile := CreateOutputFile()
    RecordingStartedTick := A_TickCount
    ButtonsDown.Clear()
    LastClicks.Clear()
    GuideIndex := 1
    GuideTextBuffer := ""
    Recording := true

    MouseGetPos(&x, &y)
    startedLocal := FormatTime(, "yyyy-MM-dd HH:mm:ss")
    line := "{`"t_ms`":0"
        . ",`"event`":`"recording_start`""
        . ",`"guide`":`"tutorial-01-juggle`""
        . ",`"started_local`":`"" JsonEscape(startedLocal) "`""
        . ",`"screen_width`":" A_ScreenWidth
        . ",`"screen_height`":" A_ScreenHeight
        . ",`"x`":" x
        . ",`"y`":" y
        . "}"
    AppendLine(line)

    SoundBeep(950, 80)
    ShowCurrentGuide()
}

StopRecording(reason)
{
    global Recording
    global OutputFile
    global ButtonsDown
    global LastClicks

    if !Recording
        return

    MouseGetPos(&x, &y)
    line := "{`"t_ms`":" CurrentTimeMs()
        . ",`"event`":`"recording_stop`""
        . ",`"reason`":`"" JsonEscape(reason) "`""
        . ",`"x`":" x
        . ",`"y`":" y
        . "}"
    AppendLine(line)

    Recording := false
    ButtonsDown.Clear()
    LastClicks.Clear()
    HideGuide()
    SoundBeep(650, 110)
    ShowStatus("Saved:`n" OutputFile, 2600)
}

RecordButtonDown(button)
{
    global Recording
    global ButtonsDown

    if !Recording
        return

    MouseGetPos(&x, &y)
    timeMs := CurrentTimeMs()
    ButtonsDown[button] := {timeMs: timeMs, x: x, y: y}

    line := "{`"t_ms`":" timeMs
        . ",`"event`":`"button_down`""
        . ",`"button`":`"" button "`""
        . ",`"x`":" x
        . ",`"y`":" y
        . "}"
    AppendLine(line)
}

RecordButtonUp(button)
{
    global Recording
    global ButtonsDown

    if !Recording
        return

    MouseGetPos(&x, &y)
    timeMs := CurrentTimeMs()

    line := "{`"t_ms`":" timeMs
        . ",`"event`":`"button_up`""
        . ",`"button`":`"" button "`""
        . ",`"x`":" x
        . ",`"y`":" y
        . "}"
    AppendLine(line)

    if !ButtonsDown.Has(button)
    {
        DetectDoubleClick(button, timeMs, x, y, false)
        return
    }

    down := ButtonsDown[button]
    ButtonsDown.Delete(button)
    dragDetected := IsDrag(down.x, down.y, x, y)

    if dragDetected
    {
        durationMs := timeMs - down.timeMs
        dragLine := "{`"t_ms`":" timeMs
            . ",`"event`":`"drag`""
            . ",`"button`":`"" button "`""
            . ",`"start`":{`"t_ms`":" down.timeMs
            . ",`"x`":" down.x
            . ",`"y`":" down.y
            . "}"
            . ",`"end`":{`"t_ms`":" timeMs
            . ",`"x`":" x
            . ",`"y`":" y
            . "}"
            . ",`"duration_ms`":" durationMs
            . "}"
        AppendLine(dragLine)
        HandleGuideEvent("drag")
    }
    else
        HandleGuideEvent("click")

    DetectDoubleClick(button, timeMs, x, y, dragDetected)
}

DetectDoubleClick(button, timeMs, x, y, wasDrag)
{
    global LastClicks

    if wasDrag
    {
        if LastClicks.Has(button)
            LastClicks.Delete(button)
        return
    }

    if LastClicks.Has(button)
    {
        previous := LastClicks[button]
        intervalMs := timeMs - previous.timeMs
        maxInterval := DllCall("GetDoubleClickTime", "UInt")
        maxDistanceX := Max(1, SysGet(36)) ; SM_CXDOUBLECLK
        maxDistanceY := Max(1, SysGet(37)) ; SM_CYDOUBLECLK

        if intervalMs <= maxInterval
            && Abs(x - previous.x) <= maxDistanceX
            && Abs(y - previous.y) <= maxDistanceY
        {
            line := "{`"t_ms`":" timeMs
                . ",`"event`":`"double_click`""
                . ",`"button`":`"" button "`""
                . ",`"first_click_t_ms`":" previous.timeMs
                . ",`"interval_ms`":" intervalMs
                . ",`"x`":" x
                . ",`"y`":" y
                . "}"
            AppendLine(line)
            HandleGuideEvent("double_click")
            LastClicks.Delete(button)
            return
        }
    }

    LastClicks[button] := {timeMs: timeMs, x: x, y: y}
}

RecordWheel(direction, delta)
{
    global Recording

    if !Recording
        return

    MouseGetPos(&x, &y)
    line := "{`"t_ms`":" CurrentTimeMs()
        . ",`"event`":`"wheel`""
        . ",`"direction`":`"" direction "`""
        . ",`"delta`":" delta
        . ",`"x`":" x
        . ",`"y`":" y
        . "}"
    AppendLine(line)
    HandleGuideEvent("wheel")
}

RecordKeyPress(inputHook, vk, sc)
{
    global Recording

    if !Recording
        return

    ; Ignore the physical ` / ~ key used to toggle recording.
    if sc = 0x29
        return

    keyName := GetKeyName(Format("vk{:02X}sc{:03X}", vk, sc))

    ; Modifier state is stored on the actual keystroke instead of as separate
    ; events. This also prevents the Shift used for ~ from leaking into replay.
    if keyName = "LShift" || keyName = "RShift"
        || keyName = "LControl" || keyName = "RControl"
        || keyName = "LAlt" || keyName = "RAlt"
        || keyName = "LWin" || keyName = "RWin"
        return

    timeMs := CurrentTimeMs()
    ctrlPressed := GetKeyState("Ctrl", "P")
    shiftPressed := GetKeyState("Shift", "P")
    altPressed := GetKeyState("Alt", "P")

    line := "{`"t_ms`":" timeMs
        . ",`"event`":`"key_press`""
        . ",`"key`":`"" JsonEscape(keyName) "`""
        . ",`"vk`":" vk
        . ",`"sc`":" sc
        . ",`"ctrl`":" JsonBoolean(ctrlPressed)
        . ",`"shift`":" JsonBoolean(shiftPressed)
        . ",`"alt`":" JsonBoolean(altPressed)
        . "}"
    AppendLine(line)
    HandleGuideEvent("key_press", keyName)
}

IsDrag(startX, startY, endX, endY)
{
    dragThresholdX := Max(1, SysGet(68)) ; SM_CXDRAG
    dragThresholdY := Max(1, SysGet(69)) ; SM_CYDRAG
    return Abs(endX - startX) >= dragThresholdX
        || Abs(endY - startY) >= dragThresholdY
}

CurrentTimeMs()
{
    global RecordingStartedTick
    return A_TickCount - RecordingStartedTick
}

CreateOutputFile()
{
    global OutputDirectory

    DirCreate(OutputDirectory)
    stem := OutputDirectory "\mouse-recording-" FormatTime(, "yyyyMMdd-HHmmss")
    candidate := stem ".jsonl"
    suffix := 2

    while FileExist(candidate)
    {
        candidate := stem "-" suffix ".jsonl"
        suffix += 1
    }

    return candidate
}

AppendLine(line)
{
    global OutputFile
    FileAppend(line "`n", OutputFile, "UTF-8-RAW")
}

JsonEscape(value)
{
    value := StrReplace(value, "\", "\\")
    value := StrReplace(value, '"', '\"')
    value := StrReplace(value, "`r", "\r")
    value := StrReplace(value, "`n", "\n")
    value := StrReplace(value, "`t", "\t")
    return value
}

JsonBoolean(value)
{
    return value ? "true" : "false"
}

BuildTutorialOneGuide()
{
    return [
        {kind: "click", text: "2/15  Click Start with Juggle"},
        {kind: "click", text: "3/15  Click the scrollbar to move down to the Comment node"},
        {kind: "double_click", text: "4/15  Double-click the Count value on the Juggle node"},
        {kind: "text", value: "5", text: "5/15  Type 5"},
        {kind: "key", value: "Enter", text: "6/15  Press Enter"},
        {kind: "double_click", text: "7/15  Double-click the Speed value on the Juggle node"},
        {kind: "text", value: "0.7", text: "8/15  Type 0.7"},
        {kind: "key", value: "Enter", text: "9/15  Press Enter"},
        {kind: "wheel", text: "10/15  Scroll down in the Node Library"},
        {kind: "click", text: "11/15  Click Effects to open it"},
        {kind: "wheel", text: "12/15  Scroll down through Effects"},
        {kind: "drag", text: "13/15  Drag Trails directly onto the blue frame wire"},
        {kind: "drag", text: "14/15  Drag Transform directly onto the blue frame wire"},
        {
            kind: "finish",
            text: "15/15  Move the pointer to the animated LED Preview, then press ~ to stop"
        }
    ]
}

BuildGuideOverlay()
{
    overlayWindow := Gui("+AlwaysOnTop -Caption +ToolWindow +E0x20")
    overlayWindow.BackColor := "151922"
    overlayWindow.MarginX := 0
    overlayWindow.MarginY := 0
    overlayWindow.SetFont("s11 cFFFFFF", "Segoe UI Semibold")
    overlayLabel := overlayWindow.AddText(
        "Center +0x200 w1000 h38 Background151922",
        ""
    )
    return {window: overlayWindow, label: overlayLabel}
}

ShowCurrentGuide()
{
    global GuideActions
    global GuideIndex
    global GuideOverlay

    if GuideIndex > GuideActions.Length
        return

    GuideOverlay.label.Text := GuideActions[GuideIndex].text
    overlayWidth := 1000
    overlayX := Round((A_ScreenWidth - overlayWidth) / 2)
    GuideOverlay.window.Show("NA x" overlayX " y0 w" overlayWidth " h38")
}

HideGuide()
{
    global GuideOverlay
    GuideOverlay.window.Hide()
}

HandleGuideEvent(eventKind, keyName := "")
{
    global GuideActions
    global GuideIndex
    global GuideTextBuffer

    if GuideIndex > GuideActions.Length
        return

    expected := GuideActions[GuideIndex]

    if expected.kind = "text"
    {
        if eventKind != "key_press"
            return

        typedCharacter := KeyNameToText(keyName)
        if typedCharacter = ""
            return

        GuideTextBuffer .= typedCharacter
        if GuideTextBuffer = expected.value
        {
            AdvanceGuide()
            return
        }

        if !InStr(expected.value, GuideTextBuffer)
            GuideTextBuffer := typedCharacter
        return
    }

    if expected.kind = "key"
    {
        if eventKind = "key_press"
            && StrLower(keyName) = StrLower(expected.value)
            AdvanceGuide()
        return
    }

    if expected.kind = "wheel"
    {
        if eventKind = "wheel"
            SetTimer(CompleteWheelGuide, -450)
        return
    }

    if expected.kind = eventKind
        AdvanceGuide()
}

CompleteWheelGuide()
{
    global GuideActions
    global GuideIndex

    if GuideIndex <= GuideActions.Length
        && GuideActions[GuideIndex].kind = "wheel"
        AdvanceGuide()
}

AdvanceGuide()
{
    global GuideActions
    global GuideIndex
    global GuideTextBuffer

    GuideIndex += 1
    GuideTextBuffer := ""

    if GuideIndex <= GuideActions.Length
        ShowCurrentGuide()
}

KeyNameToText(keyName)
{
    if StrLen(keyName) = 1
        return keyName

    if RegExMatch(keyName, "^Numpad(\d)$", &digitMatch)
        return digitMatch[1]

    if keyName = "NumpadDot" || keyName = "NumpadDecimal"
        return "."

    return ""
}

ShowStatus(message, durationMs := 1200)
{
    ToolTip(message, 20, 20)
    SetTimer(HideStatus, -durationMs)
}

HideStatus()
{
    ToolTip()
}

HandleExit(exitReason, exitCode)
{
    global Recording
    if Recording
        StopRecording("script_exit")
}

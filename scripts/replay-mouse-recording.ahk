#Requires AutoHotkey v2.0
#SingleInstance Force
#Warn

; Replays JSONL files produced by mouse-action-recorder.ahk.
; Cursor travel between actions is interpolated along a gently curved path.
; Press Escape at any time to abort and release all held mouse buttons.

if A_Args.Length && A_Args[1] = "--check"
{
    ExitApp(0)
}

global AbortReplay := false
global HeldButtons := Map()
global RecordingPath := A_Args.Length
    ? A_Args[1]
    : FindLatestRecording()
global CountdownEnabled := !HasArgument("--no-countdown")
global QuietMode := HasArgument("--quiet")

CoordMode("Mouse", "Screen")
SetMouseDelay(-1)
OnExit(HandleReplayExit)

if !RecordingPath || !FileExist(RecordingPath)
{
    MsgBox(
        "No mouse recording was found.`n`n"
        . "Create one first, or pass a JSONL recording as an argument."
    )
    ExitApp(2)
}

recordedEvents := LoadReplayEvents(RecordingPath)
if !recordedEvents.Length
{
    MsgBox("The recording contains no replayable events.")
    ExitApp(2)
}

startEvent := FindStartEvent(recordedEvents)
if startEvent
{
    if startEvent.screenWidth && startEvent.screenHeight
        && (startEvent.screenWidth != A_ScreenWidth
            || startEvent.screenHeight != A_ScreenHeight)
    {
        MsgBox(
            "Screen size mismatch.`n"
            . "Recorded: " startEvent.screenWidth " x " startEvent.screenHeight "`n"
            . "Current: " A_ScreenWidth " x " A_ScreenHeight
        )
        ExitApp(3)
    }
}

targetChrome := WinExist("Design Studio for FastLED ahk_exe chrome.exe")
if !targetChrome
{
    MsgBox(
        "The FastLED Design Studio Chrome window was not found.`n`n"
        . "Open it before starting the replay."
    )
    ExitApp(4)
}

WinActivate("ahk_id " targetChrome)
if !WinWaitActive("ahk_id " targetChrome, , 3)
{
    MsgBox("The FastLED Design Studio Chrome window could not be activated.")
    ExitApp(4)
}
WinMaximize("ahk_id " targetChrome)
Sleep(350)

if CountdownEnabled
{
    Loop 3
    {
        remaining := 4 - A_Index
        ToolTip("Mouse replay starts in " remaining "...`nPress Esc to abort", 20, 20)
        Sleep(1000)
        if AbortReplay
            ExitApp()
    }
}

ToolTip()

if startEvent
    SmoothMoveTo(startEvent.x, startEvent.y, 450)

replayStartedTick := A_TickCount
previousTimeMs := 0

for scheduledEvent in recordedEvents
{
    if AbortReplay
        break

    if scheduledEvent.type = "recording_start" || scheduledEvent.type = "drag"
        continue

    gapMs := Max(0, scheduledEvent.timeMs - previousTimeMs)
    hasPosition := scheduledEvent.HasOwnProp("x") && scheduledEvent.HasOwnProp("y")
    isHeldMove := hasPosition && HeldButtons.Count

    if hasPosition
    {
        if isHeldMove
            moveDurationMs := gapMs
        else
            moveDurationMs := Min(700, Max(140, Round(gapMs * 0.35)))

        moveStartTick := replayStartedTick + scheduledEvent.timeMs - moveDurationMs
        WaitUntil(moveStartTick)
        if AbortReplay
            break

        SmoothMoveTo(scheduledEvent.x, scheduledEvent.y, moveDurationMs)
    }

    WaitUntil(replayStartedTick + scheduledEvent.timeMs)
    if AbortReplay
        break

    switch scheduledEvent.type
    {
        case "button_down":
            SetButtonState(scheduledEvent.button, true)
        case "button_up":
            SetButtonState(scheduledEvent.button, false)
        case "wheel":
            SendWheelDelta(scheduledEvent.direction, scheduledEvent.delta)
        case "key_press":
            SendRecordedKey(scheduledEvent)
        case "recording_stop":
            ReleaseAllButtons()
    }

    previousTimeMs := scheduledEvent.timeMs
}

ReleaseAllButtons()

if !QuietMode
{
    if AbortReplay
        ToolTip("Mouse replay aborted", 20, 20)
    else
        ToolTip("Mouse replay complete", 20, 20)

    Sleep(1200)
    ToolTip()
}
ExitApp(AbortReplay ? 1 : 0)

Esc::
{
    global AbortReplay
    AbortReplay := true
    ReleaseAllButtons()
}

HasArgument(argument)
{
    for suppliedArgument in A_Args
    {
        if suppliedArgument = argument
            return true
    }
    return false
}

FindLatestRecording()
{
    recordingsDirectory := A_ScriptDir "\..\outputs\mouse-recordings"
    latestPath := ""
    latestModified := ""

    Loop Files, recordingsDirectory "\*.jsonl", "F"
    {
        if !latestPath || A_LoopFileTimeModified > latestModified
        {
            latestPath := A_LoopFileFullPath
            latestModified := A_LoopFileTimeModified
        }
    }

    return latestPath
}

LoadReplayEvents(path)
{
    events := []
    contents := FileRead(path, "UTF-8")

    for rawLine in StrSplit(contents, "`n", "`r")
    {
        line := Trim(rawLine)
        if !line
            continue

        eventType := ExtractText(line, "event")
        if !eventType
            continue

        parsedEvent := {
            type: eventType,
            timeMs: ExtractNumber(line, "t_ms", 0)
        }

        if RegExMatch(line, '"button":"([^"]+)"', &buttonMatch)
            parsedEvent.button := buttonMatch[1]
        if RegExMatch(line, '"direction":"([^"]+)"', &directionMatch)
            parsedEvent.direction := directionMatch[1]
        if RegExMatch(line, '"delta":(-?\d+)', &deltaMatch)
            parsedEvent.delta := Integer(deltaMatch[1])
        if RegExMatch(line, '"key":"([^"]+)"', &keyMatch)
            parsedEvent.key := keyMatch[1]
        if RegExMatch(line, '"vk":(-?\d+)', &vkMatch)
            parsedEvent.vk := Integer(vkMatch[1])
        if RegExMatch(line, '"sc":(-?\d+)', &scMatch)
            parsedEvent.sc := Integer(scMatch[1])
        parsedEvent.ctrl := ExtractBoolean(line, "ctrl")
        parsedEvent.shift := ExtractBoolean(line, "shift")
        parsedEvent.alt := ExtractBoolean(line, "alt")

        ; For primitive events the first x/y pair is the event position.
        if RegExMatch(line, '"x":(-?\d+)', &xMatch)
            parsedEvent.x := Integer(xMatch[1])
        if RegExMatch(line, '"y":(-?\d+)', &yMatch)
            parsedEvent.y := Integer(yMatch[1])

        if eventType = "recording_start"
        {
            parsedEvent.screenWidth := ExtractNumber(line, "screen_width", 0)
            parsedEvent.screenHeight := ExtractNumber(line, "screen_height", 0)
        }

        events.Push(parsedEvent)
    }

    return events
}

FindStartEvent(events)
{
    for candidateEvent in events
    {
        if candidateEvent.type = "recording_start"
            return candidateEvent
    }
    return false
}

ExtractText(line, field)
{
    pattern := '"' field '":"([^"]*)"'
    return RegExMatch(line, pattern, &match) ? match[1] : ""
}

ExtractNumber(line, field, defaultValue := 0)
{
    pattern := '"' field '":(-?\d+)'
    return RegExMatch(line, pattern, &match)
        ? Integer(match[1])
        : defaultValue
}

ExtractBoolean(line, field)
{
    pattern := '"' field '":(true|false)'
    return RegExMatch(line, pattern, &match) && match[1] = "true"
}

WaitUntil(targetTick)
{
    global AbortReplay

    while !AbortReplay
    {
        remainingMs := targetTick - A_TickCount
        if remainingMs <= 0
            return
        Sleep(Min(10, remainingMs))
    }
}

SmoothMoveTo(endX, endY, durationMs)
{
    global AbortReplay
    global HeldButtons

    MouseGetPos(&startX, &startY)
    if AbortReplay
        return

    if durationMs < 16 || (startX = endX && startY = endY)
    {
        DllCall("SetCursorPos", "Int", endX, "Int", endY)
        return
    }

    deltaX := endX - startX
    deltaY := endY - startY
    distance := Sqrt(deltaX * deltaX + deltaY * deltaY)
    ; Click-to-click travel gets a subtle natural curve. While a button is
    ; held, use a straight eased path so graph-node splice hit testing remains
    ; predictable along the entire drag.
    curveAmount := HeldButtons.Count ? 0 : Min(34, distance * 0.07)
    curveSide := Mod(startX + startY + endX + endY, 2) ? 1 : -1

    if distance
    {
        normalX := -deltaY / distance
        normalY := deltaX / distance
    }
    else
    {
        normalX := 0
        normalY := 0
    }

    control1X := startX + deltaX * 0.33 + normalX * curveAmount * curveSide
    control1Y := startY + deltaY * 0.33 + normalY * curveAmount * curveSide
    control2X := startX + deltaX * 0.67 + normalX * curveAmount * curveSide
    control2Y := startY + deltaY * 0.67 + normalY * curveAmount * curveSide
    movementStartedTick := A_TickCount

    while !AbortReplay
    {
        elapsedMs := A_TickCount - movementStartedTick
        if elapsedMs >= durationMs
            break

        progress := elapsedMs / durationMs
        inverse := 1 - progress
        nextX := Round(
            inverse ** 3 * startX
            + 3 * inverse ** 2 * progress * control1X
            + 3 * inverse * progress ** 2 * control2X
            + progress ** 3 * endX
        )
        nextY := Round(
            inverse ** 3 * startY
            + 3 * inverse ** 2 * progress * control1Y
            + 3 * inverse * progress ** 2 * control2Y
            + progress ** 3 * endY
        )

        DllCall("SetCursorPos", "Int", nextX, "Int", nextY)
        Sleep(8)
    }

    if !AbortReplay
        DllCall("SetCursorPos", "Int", endX, "Int", endY)
}

SetButtonState(button, pressed)
{
    global HeldButtons

    token := ButtonToken(button)
    if !token
        return

    if pressed
    {
        SendEvent("{" token " down}")
        HeldButtons[button] := true
    }
    else
    {
        SendEvent("{" token " up}")
        if HeldButtons.Has(button)
            HeldButtons.Delete(button)
    }
}

ButtonToken(button)
{
    switch button
    {
        case "left":
            return "LButton"
        case "right":
            return "RButton"
        case "middle":
            return "MButton"
        case "x1":
            return "XButton1"
        case "x2":
            return "XButton2"
        default:
            return ""
    }
}

SendWheelDelta(direction, delta)
{
    if direction = "left" || direction = "right"
        DllCall("mouse_event", "UInt", 0x1000, "UInt", 0, "UInt", 0, "UInt", delta, "UPtr", 0)
    else
        DllCall("mouse_event", "UInt", 0x0800, "UInt", 0, "UInt", 0, "UInt", delta, "UPtr", 0)
}

SendRecordedKey(recordedKey)
{
    if !recordedKey.HasOwnProp("vk") || !recordedKey.HasOwnProp("sc")
        return

    modifiers := ""
    if recordedKey.ctrl
        modifiers .= "^"
    if recordedKey.alt
        modifiers .= "!"
    if recordedKey.shift
        modifiers .= "+"

    keySpec := Format("vk{:02X}sc{:03X}", recordedKey.vk, recordedKey.sc)
    SendEvent(modifiers "{" keySpec "}")
}

ReleaseAllButtons()
{
    global HeldButtons

    buttonsToRelease := []
    for button in HeldButtons
        buttonsToRelease.Push(button)

    for button in buttonsToRelease
    {
        token := ButtonToken(button)
        if token
            SendEvent("{" token " up}")
    }

    HeldButtons.Clear()
}

HandleReplayExit(exitReason, exitCode)
{
    ReleaseAllButtons()
}

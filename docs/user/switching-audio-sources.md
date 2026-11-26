# Switching audio sources on the board

The Audio node's body picks one source: **Microphone**, **Line Input** or
**Audio Decoder**. Its **Source** input changes that source while the board
runs, so one build can react to music in the room and to music it plays itself.

## Wire a control

Drag a control's output onto the **Source** row of the Audio node's body. The
row is a drop target even though the socket is hidden; dropping a wire on it
exposes the **Source** input and connects it in one step.

| Control | What it does |
| --- | --- |
| Button, IR remote key, Web Remote button, Encoder **Pressed** | Each press steps to the next source. Holding the button does not repeat. |
| Encoder **Position** | Picks a source by position: 0 is the first, 1 the second, and the count wraps round, so each click steps one source in either direction. |
| Encoder **Level**, Web Remote slider | Picks by the same rule. With two sources, below 0.5 is the first and from 0.5 up the second. |

A press is any switch (true/false) output. Anything else is read as a number.

## Which sources it switches between

Only the sources whose hardware is on the bench, in the menu's order:

1. **Microphone** — a Microphone part on the Hardware tab.
2. **Line Input** — a Line In (PCM1802) part.
3. **Audio Decoder** — a Music Player with music (an SD card, Bluetooth or
   Internet Radio) and an amplifier.

With a press control, the board starts on the source chosen in the body. With a
number, the number decides from the first frame.

Once **Source** is wired, the body shows:

- **Switch** — the sources it cycles through, for example
  `Microphone · Audio Decoder`.
- **Now** — the source the preview is listening to.
- **Control** — `Each press steps to the next source.`, or for a number
  `The number picks the source: 0 Microphone, 1 Audio Decoder, wrapping.`

## Preview

The preview follows the switch. **Microphone** and **Line Input** listen
through the computer's audio input, and **Audio Decoder** listens to the in-app
Music Player. While the switch can reach a microphone or line input, the
computer's input stays open, so switching back is immediate.

## On the board

The generated sketch opens every source at once and feeds FastLED's one audio
Processor from whichever is active. Frequency bands, beat, BPM, the detectors
and the Stereo VU levels all follow the switch, with no reboot. The Music
Player keeps playing while the microphone is active.

Each source needs its own I2S port. The amplifier uses I2S0; a microphone or
line input beside it uses I2S1. An ESP32 or ESP32-S3 has two ports, so it can
switch between two sources: a microphone and the Audio Decoder, a line input
and the Audio Decoder, or a microphone and a line input (ESP32-S3 only).

## When it cannot work

Checks and the Audio node's body say so:

- **One source on the bench** — `Source switches between the audio sources on
  the bench, but only the Microphone is there. Add a Microphone or Line In
  part, or a Music Player with music and an amplifier, to switch to.`
- **A one-port chip** (ESP32-C3, C6, H2, S2) — `the ESP32-C3 has one I2S port,
  so the Microphone and the Audio Decoder cannot run at once. Switch between
  them on an ESP32 or ESP32-S3, which have two.` Deploy is blocked.
- **Three sources** — `the ESP32-S3 has 2 I2S ports, and the Microphone, the
  Line Input, the Audio Decoder need 3. Remove one of them from the bench to
  switch between the others.` Deploy is blocked.
- **A slideshow or Performance show** — `Source switching runs in a
  single-board sketch or a Music Player build. This slideshow listens to the
  Microphone only.`

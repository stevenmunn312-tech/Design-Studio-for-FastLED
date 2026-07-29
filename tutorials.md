# Design Studio for FastLED — Onboarding Tutorial Scripts

This series is designed for short, beginner-friendly screen-capture videos with
narration. The first videos introduce a simple pattern and the Studio interface,
then move quickly into reusable audio-reactive patterns, generative shows, and
music-synced SD shows.

## Recording notes

- Record at or near the supported 1440 × 900 desktop viewport.
- Use a visible cursor highlight and pause briefly after each click.
- Begin each video from the state described in its **On screen** section.
- Keep node labels and ports large enough to read.
- Let visible results play for a moment before moving to the next action.
- Use the titles below as simple opening title cards.

## Pattern terminology

Use these terms consistently throughout the series:

| Term | Meaning |
| --- | --- |
| **Patterns category** | Individual pixel-generating nodes such as Juggle, Fire, or Spectrum Visualizer |
| **Group** | A reusable mini-patch containing one or more nodes |
| **Pattern Library** | Where saved Groups are stored |
| **Pattern Collection** | A curated set of saved Groups supplied to a show engine |

---

## 1. Build your first pattern with Juggle

**Target length:** 45–55 seconds

### On screen

1. Begin on the empty welcome canvas.
2. Click **Start with Juggle**.
3. Read the Comment node.
4. Set Juggle **Count** to 5 and raise **Speed**.
5. Open **Effects** in the Node Library.
6. Drag **Trails**, then **Transform**, directly onto the blue frame wire.
7. Finish on the animated LED Preview.

### Narration

> Let’s create your first animation with Juggle.
>
> The Comment node contains a short challenge for this patch. First, set
> Juggle’s Count to five, then raise its Speed. The LED Preview updates
> immediately.
>
> Next, open Effects and drag Trails directly onto the blue frame wire. Then
> splice Transform into the wire in the same way.
>
> Juggle creates the pixels, the effects modify them, and Matrix Output sends
> the finished frame to the preview or your LEDs.

---

## 2. Understand the Studio interface

**Target length:** 50–60 seconds

### On screen

1. Identify the Node Library, canvas, LED Preview, toolbar, and status bar.
2. Pan and zoom around the canvas.
3. Select a node and show its highlighted signal path.
4. Demonstrate **Undo**, **Redo**, and **Tidy**.
5. Switch the Node Library between **Beginner** and **All**.

### Narration

> The Studio has three main working areas.
>
> The Node Library on the left contains the building blocks. The canvas in the
> centre is where you connect them, and the LED Preview on the right shows the
> result.
>
> Designs normally read from left to right. Select a node to make its signal
> path easier to follow. Drag the background to move around and use the mouse
> wheel to zoom.
>
> Use Beginner mode for a smaller node selection. Undo and Redo protect your
> experiments, while Tidy arranges the graph into clean columns.

---

## 3. Create a simple audio-reactive pattern

**Target length:** 60–70 seconds

### On screen

1. Start a blank canvas.
2. Add **Microphone**, **Spectrum Visualizer**, **Trails**, and
   **Matrix Output**.
3. Connect the Microphone Audio output to Spectrum Visualizer.
4. Connect Spectrum Visualizer through Trails to Matrix Output.
5. Show the Microphone node’s **I2S WS**, **I2S SCK**, and **I2S SD** settings.
6. Allow browser microphone access.
7. Play music and adjust Spectrum **Style** and **Gain**.
8. Adjust Trails **Decay**.

### Narration

> Now let’s build an audio-reactive pattern from scratch.
>
> Add Microphone, Spectrum Visualizer, Trails, and Matrix Output. Connect the
> Microphone’s teal Audio port to Spectrum Visualizer. Then connect its blue
> Frame output through Trails and into Matrix Output.
>
> The Microphone node also contains the I2S pins used by your physical
> microphone: WS, serial clock—or SCK—and serial data—or SD. Set these to match
> the pins connected to your controller. They are used by the uploaded
> firmware; the browser preview uses your computer’s microphone instead.
>
> Allow microphone access, then play some music. Adjust the visualizer Style
> and Gain, and use Trails Decay to control how long the movement remains
> visible.

---

## 4. Pattern nodes, Groups, and the Pattern Library

**Target length:** 60–70 seconds

### On screen

1. Point to Spectrum Visualizer in the **Patterns** category.
2. Select Spectrum Visualizer and Trails only.
3. Leave Microphone, Matrix Output, and any Comment node unselected.
4. Press **Ctrl/Cmd + G** or choose **Group**.
5. Name the Group **Live Spectrum Trails**.
6. Enable **Save to library**.
7. Create the Group.
8. Show it under **Pattern Library → New & Unsorted**.

### Narration

> Before building a show, there is an important distinction.
>
> Nodes in the Patterns category are individual pixel generators. A reusable
> library pattern is a Group, which can contain an entire mini-patch.
>
> Select Spectrum Visualizer and Trails, but leave out the shared Microphone
> and Matrix Output nodes. Choose Group, name it Live Spectrum Trails, and
> enable Save to library.
>
> The Group keeps an Audio input and a Frame output, so it can be reused
> elsewhere. Its saved copy now appears in the Pattern Library under New and
> Unsorted.

---

## 5. Create an advanced audio-reactive pattern

**Target length:** 60–70 seconds

### On screen

1. Add the **Percussion trails** Quick Recipe.
2. Read its Comment node.
3. Highlight the kick, snare, and hi-hat connections.
4. Adjust Percussion Detect **Sensitivity**.
5. Adjust Trails **Decay**.
6. Select Percussion Detect, Kick Shock, and Trails.
7. Leave Microphone, Matrix Output, and the Comment node unselected.
8. Group the selection as **Percussion Shockwaves**.
9. Enable **Save to library** and create the Group.

### Narration

> Let’s create a more advanced audio-reactive pattern.
>
> Add the Percussion Trails Quick Recipe. Instead of treating the music as one
> continuous signal, Percussion Detect separates kick, snare, and hi-hat
> events. Kick Shock gives each event a visual role, and Trails extends the
> resulting movement.
>
> Try changing Sensitivity, then adjust Trails Decay.
>
> Select Percussion Detect, Kick Shock, and Trails—but not the Microphone or
> Matrix Output. Group them as Percussion Shockwaves and save the Group to the
> Pattern Library.

---

## 6. Build a generative show

**Target length:** 60–70 seconds

### On screen

1. Open **✦ Start → Generative Show**.
2. Identify Pattern Collection, Show Engine, and Matrix Output.
3. Click **Add patterns…** in Pattern Collection.
4. Add **Live Spectrum Trails** and **Percussion Shockwaves** from the Pattern
   Library.
5. Add a Microphone node and connect it to Show Engine’s Audio input.
6. Adjust Show Engine dwell and transition timing.
7. Let the live show run in the LED Preview.

### Narration

> We can now turn our saved patterns into a generative show.
>
> Open the Generative Show starter. Pattern Collection is the show’s pool of
> reusable Group patterns. It does not contain every node from the Patterns
> category.
>
> Choose Add Patterns and add Live Spectrum Trails and Percussion Shockwaves
> from the Pattern Library. Pattern Collection sends this set to Show Engine.
>
> Connect a Microphone to the engine’s Audio input, then adjust its dwell and
> transition timing. The engine chooses between the collected patterns while
> the show runs, creating a continuously changing live performance.

---

## 7. Prepare a music-synced SD show

**Target length:** 60–70 seconds

### On screen

1. Open **✦ Start → Music-synced SD Show**.
2. Identify the main pipeline:
   **Music Library → Performance Generator → SD Card → Matrix Output**.
3. Add a Pattern Collection.
4. Populate it with the saved Groups.
5. Connect Pattern Collection to Performance Generator’s Patterns input.
6. Drop a prepared, rights-cleared audio file into Music Library.
7. Run the track analysis.

### Narration

> The second show workflow is designed around a specific piece of music.
>
> Open the Music-synced SD Show starter. Its main path runs from Music Library,
> through Performance Generator and SD Card, into Matrix Output.
>
> Add a Pattern Collection, fill it with our saved Groups, and connect it to
> Performance Generator’s Patterns input.
>
> Drop a music file into Music Library and run its analysis. Studio examines
> the song’s beats, energy, mood, and sections so it can build a performance
> timed to that track.

---

## 8. Preview and package the SD show

**Target length:** 60–70 seconds

### On screen

1. Select the analyzed track in Performance Generator.
2. Generate or preview its timeline.
3. Show the performance in the main preview.
4. Adjust energy, hold, palette, and transition settings.
5. Show the SD Card storage and audio-output configuration.
6. Open the Matrix Output upload tools.
7. Choose **Upload show to SD**.

### Narration

> Select the analyzed track in Performance Generator and preview the generated
> timeline.
>
> The generator chooses patterns and transitions using the song’s analysis.
> Adjust its energy response, pattern hold, palette behaviour, and transition
> settings until the result suits the music.
>
> The SD Card node defines the storage and audio-output wiring. Matrix Output
> still provides the LED configuration.
>
> When everything is ready, open the upload tools and choose Upload Show to SD.
> Studio packages the music and show data, writes the card, and flashes the
> dedicated player firmware.

---

## 9. Generative show or SD show?

**Target length:** 40–50 seconds

### On screen

1. Show the two workflows side by side, or alternate between their graphs.
2. Highlight their different engines and outputs.
3. Finish on their shared use of Pattern Collection.
4. Display the comparison text below.

### Narration

> These workflows use the same reusable patterns, but they run differently.
>
> A generative show uses Show Engine. It chooses patterns and transitions while
> the controller is running, and it can react to live inputs. It does not need
> a song or SD card.
>
> A music-synced show uses Performance Generator. Its decisions are prepared
> from an analyzed song and played back on a timed schedule from an SD card.
>
> Pattern Collection is shared by both workflows: it supplies the Group
> patterns that each engine is allowed to use.

### End-screen comparison

```text
GENERATIVE
Pattern Collection → Show Engine → Matrix Output
Live · evolving · no song required

MUSIC-SYNCED
Music + Pattern Collection → Performance Generator → SD Card
Pre-planned · song-timed · SD playback
```

---

## 10. Configure and test your hardware

**Target length:** 60 seconds

### On screen

1. Open **Matrix Output → Setup**.
2. Choose the controller and detected USB port.
3. Set the display dimensions and physical layout.
4. Match the LED chipset, colour order, and pins.
5. Set conservative brightness and power limits.
6. Open **Upload readiness**.
7. Run **Flash Wiring Test**.

### Narration

> Before uploading either workflow, configure Matrix Output for your physical
> LEDs.
>
> Choose the exact controller and USB port. Set the display dimensions and
> wiring layout, then match the chipset, colour order, and pins. Begin with
> conservative brightness and power settings.
>
> Open Upload readiness to check the helper, toolchain, graph, connection, and
> controller capacity.
>
> On new hardware, run Flash Wiring Test first. Confirm colour order,
> orientation, pixel order, and panel layout before flashing your finished
> show.

---

## 11. Save, share, and find help

**Target length:** 40–50 seconds

### On screen

1. Open **File → Save Project File As…**.
2. Name and save the project.
3. Show **Recent Projects** in the File menu.
4. Choose **Copy Share Link**.
5. Open **Help**.
6. Show Quick Start, Upload, and Node Reference.

### Narration

> Save your work with File, Save Project File As. Named projects autosave while
> you edit and appear in the Recent Projects list.
>
> Copy Share Link creates a snapshot you can send to another Studio user. For a
> portable backup, keep the complete project file.
>
> If you get stuck, open Help. Quick Start covers the basic workflow, Upload
> explains hardware deployment, and Node Reference documents every node, port,
> and control in the Studio.


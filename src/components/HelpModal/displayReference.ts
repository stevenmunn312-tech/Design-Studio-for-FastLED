/** User workflow copy for physical displays, shared by their reference articles. */
export interface DisplayReferenceContent {
  overview: string[]
  steps: string[]
  propertyNote: string
}

export const DISPLAY_REFERENCE: Record<string, DisplayReferenceContent> = {
  SegmentDisplay: {
    overview: [
      'A separate physical readout for an RTC clock, Music Player position, Pattern Slideshow index, or LED output level. Connect the source’s Display output to the module’s Display input; the source determines what the digits show. An LED output reads as whole percent of effective brightness (0 when blacked out). An unwired display shows dashes.',
      'Choose the exact TM1637 four-digit module with a colon or MAX7219 eight-digit module without a colon. Other controllers and digit arrangements are unsupported.',
    ],
    steps: [
      'Use Add Hardware → Displays to add the module. Select it in the workbench to choose its identity and GPIO wiring, then use Show in graph if its node is hidden.',
      'Connect RTC Clock, Music Player, Pattern Slideshow, or an LED output using the Display socket. A raw number or Format Number string belongs on a custom-screen readout instead.',
      'Set brightness and digit formatting on the graph node. Check Graph Health and the generated build before upload; a module appearing in the catalogue does not establish physical validation for your board.',
    ],
    propertyNote: 'Module identity and GPIO belong to the hardware inspector. The graph node controls digit formatting, brightness, and whether the display is enabled. The colon is available only on the TM1637 module.',
  },
  InfoDisplay: {
    overview: [
      'A separate 128×64 OLED panel. Connect a Display output from RTC Clock, Music Player, Pattern Slideshow, or an LED output: the source chooses the clock, now-playing, pattern-browser, or LED Status screen. There is no layout selector. With no source connected, the panel reports that it is unwired.',
      'Choose the exact SH1106 or SSD1306 module in Hardware. SH1106 is offered in SPI and I²C variants; SSD1306 uses I²C. Match the module’s header and identity, since the same controller can use different wiring. An unlisted OLED is unsupported even if its size looks similar.',
    ],
    steps: [
      'Add the OLED through Add Hardware → Displays and select its exact module in the workbench. Configure the active module’s pins; an I²C module also needs the correct address.',
      'Connect the source’s Display output to Info Display. Pattern Slideshow owns the pattern selection; the OLED only reports it. Route physical browsing controls to the slideshow’s named action inputs, or through Control Map when you want one compact bundle. An LED output reports its own name, on/blackout state and level.',
      'Choose rotation on the graph node, resolve Graph Health issues, and check the build. Firmware thumbnails are baked at export, so regenerate and upload when the collection changes.',
    ],
    propertyNote: 'Choose module identity and GPIO in Hardware. The graph exposes rotation, enabled state, and the I²C address when relevant. All I²C parts in one sketch must use the same SDA/SCL pair.',
  },
  TransportDisplay: {
    overview: [
      'A physical colour TFT. Connect one Display wire from RTC Clock, Music Player, Pattern Slideshow, or an LED output for Clock, Now Playing/Fixed Transport, Show Status, or LED Status. The source determines the content; the layout setting chooses its presentation. An unwired panel says Waiting.',
      'For custom content, choose Create screen design on the panel. The design belongs to the glass: there is no second node and no Screen Design cable. The panel keeps its Display wire, which bound widgets read. Module, pins, rotation, and Enabled belong to the physical panel.',
      'Choose the non-touch ST7789 1.54-inch 240×240 module or the ST7789V 2.4-inch 240×320 module with XPT2046 touch. Other TFT and touch controllers are unsupported.',
    ],
    steps: [
      'Add Display panel through Add Hardware → Displays. Set its exact module and wiring in the workbench, including the touch header when present. Set layout and rotation on the graph node.',
      'For a fixed music screen, connect Music Player Display → Display Panel Display. Bound custom widgets read a field of that same source from the inspector’s Reads row. Use Song Info only when you genuinely need one field on a cable.',
      'For fixed music touch, wire named Touch outputs such as Play / Pause directly to matching Music Player action inputs, or send Touch Controls through Control Map when you need the compact bundle, chaining, or repeat settings. Volume is a direct Music Player property input. Clock and Show Status are read-only. A custom screen publishes its individual widget outputs on the companion Touch node. Connect template controls draws the obvious wires without overriding yours.',
      'For a panel self-test, choose Diagnostics in the panel’s layout menu. It overrides a screen design as well as the fixed layouts, so there is nothing to disconnect first. Upload to check the physical panel and mapped touch coordinates; browser touches are only a simulation. Select the previous layout to restore your content.',
    ],
    propertyNote: 'Hardware owns module identity and display/touch GPIO. The companion Touch node owns the raw X/Y bounds for touch modules; defaults are provisional. Enable Report telemetry on the Board, compile and upload, then use Calibrate touch on the Touch node and upload again with the saved bounds. Diagnostics reports mapped pixels, not raw calibration samples. The square ST7789 has no touch controller.',
  },
  Display: {
    overview: [
      'A screen design lives on the Display Panel it was drawn for. Click Create screen design on the panel to mint, size, and open it in one step. There is no second node and no mount wire. The square ST7789 can show custom readouts; physical touch requires the ST7789V module with XPT2046.',
      'Click Edit screen design on the panel. Design mode edits the screen; Run mode lets you exercise local browser controls. This preview does not send touches to the device or verify physical calibration.',
    ],
    steps: [
      'Start with Create screen design on the panel. In Design, add widgets or a template and set labels, bounds, values, theme, and background. Portrait/Landscape rotates the panel and re-fits its design. A template whose destination is unambiguous draws ordinary graph wires; Connect template controls fills any that are still missing.',
      'Return with Graph to wire the ports created by each widget. Readouts have Value inputs on the panel, buttons have Output ports on the companion Touch node, and toggles, sliders, and dials also have optional Set inputs. Renaming or moving a widget keeps its wires; deleting a wired widget asks before removing those connections.',
      'For a level control, add a Slider and Numeric Readout, then wire the slider’s Output from the companion Touch node to the readout’s input and the intended control input. A player’s Volume is a direct property input. For SD-player fixture brightness, use Control Map → Music Player. Keep normalized brightness and volume sliders in the 0–1 range.',
      'Use Set when another graph value should synchronize a control. Touch owns it while held; after release, the wired Set value takes over. Without Set, it keeps its local value. Run repaints graph-fed readouts and lets you exercise local controls; its temporary touch state resets when switching editor modes.',
      'Resolve layout, asset, and Graph Health issues before measuring capacity or uploading. Normal, generative-show, and SD-player builds generate LVGL widgets. Show/player wiring accepts supported float, boolean, and text paths; arbitrary nodes, nested groups, and wired colour or pattern-selection widget inputs are unsupported there.',
    ],
    propertyNote: 'Ports depend on this screen’s widgets, so the empty default node has no fixed port list. A single-port widget uses its label on the graph socket; controls append Output or Set. The inspector shows each role and type. Hardware owns module identity and GPIO; Edit screen design owns widgets and appearance. The saved project includes the screen layout, but not temporary Run-mode touch values. Use the companion Touch node’s calibration wizard for physical bounds; performance validation remains outstanding.',
  },
}

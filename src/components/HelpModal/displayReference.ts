/** User workflow copy for physical displays, shared by their reference articles. */
export interface DisplayReferenceContent {
  overview: string[]
  steps: string[]
  propertyNote: string
}

export const DISPLAY_REFERENCE: Record<string, DisplayReferenceContent> = {
  SegmentDisplay: {
    overview: [
      'A separate physical readout for an RTC clock, Music Player position, or Pattern Slideshow index. Connect the source’s Display output to the module’s Display input; the source determines what the digits show. An unwired display shows dashes.',
      'Choose the exact TM1637 four-digit module with a colon or MAX7219 eight-digit module without a colon. Other controllers and digit arrangements are unsupported.',
    ],
    steps: [
      'Use Add Hardware → Displays to add the module. Select it in the workbench to choose its identity and GPIO wiring, then use Show in graph if its node is hidden.',
      'Connect RTC Clock, Music Player, or Pattern Slideshow using the Display socket. A raw number or Format Number string belongs on a Screen Design readout instead.',
      'Set brightness and digit formatting on the graph node. Check Graph Health and the generated build before upload; a module appearing in the catalogue does not establish physical validation for your board.',
    ],
    propertyNote: 'Module identity and GPIO belong to the hardware inspector. The graph node controls digit formatting, brightness, and whether the display is enabled. The colon is available only on the TM1637 module.',
  },
  InfoDisplay: {
    overview: [
      'A separate 128×64 OLED panel. Connect a Display output from RTC Clock, Music Player, or Pattern Slideshow: the source chooses the clock, now-playing, or pattern-browser screen. There is no layout selector. With no source connected, the panel reports that it is unwired.',
      'Choose the exact SH1106 or SSD1306 module in Hardware. SH1106 is offered in SPI and I²C variants; SSD1306 uses I²C. Match the module’s header and identity, since the same controller can use different wiring. An unlisted OLED is unsupported even if its size looks similar.',
    ],
    steps: [
      'Add the OLED through Add Hardware → Displays and select its exact module in the workbench. Configure the active module’s pins; an I²C module also needs the correct address.',
      'Connect the source’s Display output to Info Display. Pattern Slideshow owns the pattern selection; the OLED only reports it. Route physical browsing controls through Player Controls to the slideshow.',
      'Choose rotation on the graph node, resolve Graph Health issues, and check the build. Firmware thumbnails are baked at export, so regenerate and upload when the collection changes.',
    ],
    propertyNote: 'Choose module identity and GPIO in Hardware. The graph exposes rotation, enabled state, and the I²C address when relevant. All I²C parts in one sketch must use the same SDA/SCL pair.',
  },
  TransportDisplay: {
    overview: [
      'A physical colour TFT. Connect one Display wire from RTC Clock, Music Player, or Pattern Slideshow for Clock, Now Playing/Fixed Transport, or Show Status. The source determines the content; the layout setting chooses its presentation. An unwired panel says Waiting.',
      'For custom content, connect a Screen Design document to the panel’s Screen Design input. The two content inputs are exclusive: the newest content wire replaces the other. Module, pins, rotation, and Enabled belong to the physical panel.',
      'Choose the non-touch ST7789 1.54-inch 240×240 module or the ST7789V 2.4-inch 240×320 module with XPT2046 touch. Other TFT and touch controllers are unsupported.',
    ],
    steps: [
      'Add Display panel through Add Hardware → Displays. Set its exact module and wiring in the workbench, including the touch header when present. Set layout and rotation on the graph node.',
      'For a fixed music screen, connect Music Player Display → Display Panel Display. To put individual song fields on custom widgets, connect Music Player Display → Song Info Display, then wire the unpacked fields to the Screen Design’s widget inputs.',
      'For fixed music touch, connect Display Panel Controls → Player Controls Controls In → Music Player Controls. Clock and Show Status are read-only. A custom screen uses its document’s individual widget outputs instead of the panel’s fixed Controls output.',
      'For a panel self-test, disconnect any Screen Design wire and choose Diagnostics in the panel’s layout menu. Upload to check the physical panel and mapped touch coordinates; browser touches are only a simulation. Select the previous layout and reconnect the design to restore your content.',
    ],
    propertyNote: 'Hardware owns module identity and display/touch GPIO. The panel’s graph properties expose layout, rotation, Enabled, and raw touch X/Y bounds for touch modules. Use measured bounds, save, and upload again; defaults are provisional and a guided calibration wizard is not available yet. Diagnostics reports mapped pixels, not raw calibration samples. The square ST7789 has no touch controller.',
  },
  Display: {
    overview: [
      'A pinless screen document mounted on a Display Panel. Click Create screen design on the panel to create, size, connect, and open it in one step. The square ST7789 can show custom readouts; physical touch requires the ST7789V module with XPT2046. Use one document per panel.',
      'Click Edit screen design on its graph node. Design mode edits the screen; Run mode lets you exercise local browser controls. This preview does not send touches to the device or verify physical calibration.',
    ],
    steps: [
      'Start with Create screen design on the panel. A separately added document cannot be edited until it is connected to a panel. In Design, add widgets or a template and set labels, bounds, values, theme, and background. Portrait/Landscape rotates the connected panel and re-fits its design. Templates add a layout; you still wire its actions yourself.',
      'Return with Graph to wire the ports created by each widget. Readouts have Value inputs, buttons have Output ports, and toggles, sliders, and dials also have optional Set inputs. Renaming or moving a widget keeps its wires; deleting a wired widget asks before removing those connections.',
      'For a level control, add a Slider and Numeric Readout, then wire the slider’s Output to the readout’s input and the intended control input. For SD playback levels, use Player Controls → Music Player. Keep normalized brightness and volume sliders in the 0–1 range.',
      'Use Set when another graph value should synchronize a control. Touch owns it while held; after release, the wired Set value takes over. Without Set, it keeps its local value. Run repaints graph-fed readouts and lets you exercise local controls; its temporary touch state resets when switching editor modes.',
      'Resolve layout, asset, and Graph Health issues before measuring capacity or uploading. Normal, generative-show, and SD-player builds generate LVGL widgets. Show/player wiring accepts supported float, boolean, and text paths; arbitrary nodes, nested groups, and wired colour or pattern-selection widget inputs are unsupported there.',
    ],
    propertyNote: 'Ports depend on this screen’s widgets, so the empty default node has no fixed port list. A single-port widget uses its label on the graph socket; controls append Output or Set. The inspector shows each role and type. Hardware owns module identity and GPIO; Edit screen design owns widgets and appearance. The saved project includes the screen layout, but not temporary Run-mode touch values. Physical touch calibration and performance validation remain outstanding.',
  },
}

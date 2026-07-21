# Industrial UI elements

Reference-matched controls for the black anodized, rack-mounted visual direction.
The components are implemented with React and CSS Modules and do not depend on
screenshots or raster textures.

Open the complete interactive specimen at:

```text
http://localhost:5173/?ui-elements
```

Import individual elements from the barrel:

```tsx
import {
  HorizontalFader,
  JackSocket,
  LedMatrix,
  RackButton,
  RackPanel,
  RotaryKnob,
  SpectrumMeter,
  StatusLamp,
  ToggleSwitch,
  TransportControls,
} from './components/IndustrialUI'
```

All stateful controls use controlled props. This keeps them suitable for the
existing Zustand stores without coupling the component library to app state.

## Included elements

- screw-mounted textured panel
- embossed command button with active/accent states
- small and large rotary knobs with numeric readouts
- engraved on/off toggle
- status lamp
- connected/disconnected quarter-inch-style jack socket
- horizontal level fader
- cyan-to-violet spectrum meter
- generated LED matrix
- playback transport
- FastLED Studio dot-grid brand mark
- SVG patch cable

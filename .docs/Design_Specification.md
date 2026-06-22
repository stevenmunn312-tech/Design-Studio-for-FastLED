LumiNode Studio — Full Design Specification

1️⃣ Design Philosophy
- Core Principle: Modular, reactive, and visually immersive.  
- Goal: Empower creators to design LED patterns as intuitively as painting with light.  
- Tone: Futuristic, professional, and playful — bridging engineering precision with artistic freedom.  
- Visual Language: Neon accents, soft glows, and crisp typography on a deep dark canvas.  
- Accessibility: WCAG AA contrast compliance; color‑blind‑safe palettes for node connectors.

---

2️⃣ Color System

| Token | Hex | Usage |
|--------|------|--------|
| bg-primary | #0D0F12 | App background |
| bg-panel | #161A1F | Sidebar, inspector panels |
| bg-node | #1F242B | Node body |
| bg-node-hover | #252A31 | Node hover state |
| accent-audio | #00FFFF | Audio nodes |
| accent-pattern | #FF00FF | Pattern nodes |
| accent-math | #A8FF00 | Math nodes |
| accent-output | #00BFFF | Output nodes |
| accent-hardware | #FFA500 | Hardware nodes |
| text-primary | #E0E0E0 | Main text |
| text-secondary | #A0A0A0 | Labels, hints |
| border-glow | rgba(255,255,255,0.1) | Node outlines |
| connector-glow | Gradient from accent → white | Animated spline lines |
| preview-bg | #14181D | LED preview background |
| highlight-success | #00FF99 | Upload success |
| highlight-error | #FF3366 | Error states |

---

3️⃣ Typography

| Style | Font | Size | Weight | Usage |
|--------|------|------|--------|--------|
| Display | Inter | 20 px | Bold | Node headers |
| Body | Inter | 14 px | Regular | Panel text |
| Code | JetBrains Mono | 13 px | Regular | Node labels, GPIO pins |
| Caption | Inter | 12 px | Medium | Status bar, tooltips |

---

4️⃣ Component Library

A. Node Components
| Element | Spec |
|----------|------|
| Node Container | 200–240 px width, 120–160 px height, 8 px corner radius |
| Header Bar | 32 px height, accent color background |
| Body | Matte dark fill, subtle inner shadow |
| Ports | Circular 12 px connectors, glow intensity 0.6 |
| Connector Lines | Bezier curves, animated pulse when active |
| Selection State | Cyan border 2 px, drop shadow 0 0 8 px accent color |
| Hover State | Slight scale (1.02×), glow increase |

B. Sidebar
| Element | Spec |
|----------|------|
| Width | 280 px |
| Scroll | Smooth inertial |
| Category Headers | 16 px bold, accent underline |
| Node Items | 14 px, hover glow accent color |
| Expand/Collapse | Chevron animation 180° rotation |

C. Preview Panel
| Element | Spec |
|----------|------|
| LED Grid | 16×16, pixel size 28 px, glow radius 4 px |
| FPS Indicator | Top‑right overlay, 12 px |
| Audio Visualizer | 16 bars, gradient cyan→magenta |
| Interaction | Click to pause, drag to rotate (3D preview mode) |

D. Inspector Panel
| Element | Spec |
|----------|------|
| Field Height | 32 px |
| Label Width | 120 px |
| Input Style | Rounded, neon outline on focus |
| Buttons | 40 px height, accent glow |
| Divider | 1 px line, rgba(255,255,255,0.05) |

E. Status Bar
| Element | Spec |
|----------|------|
| Height | 40 px |
| Font | Inter 12 px |
| Icons | 16 px monochrome |
| States | Success (green glow), Error (red pulse), Upload (cyan animation) |

---

5️⃣ Interaction States

| State | Animation | Duration | Easing |
|--------|------------|-----------|--------|
| Node Hover | Glow fade‑in | 150 ms | ease‑out |
| Connector Drag | Spline pulse | 300 ms | cubic‑bezier(0.4,0,0.2,1) |
| Upload Success | Green flash + fade | 800 ms | ease‑in‑out |
| Audio Reactivity | FFT‑driven hue modulation | Real‑time | linear |
| Pattern Transition | Crossfade | 1.2 s | ease‑in‑out |

---

6️⃣ Layout Rules

- Grid: 8 px base spacing  
- Node Snap: 20 px increments  
- Connector Margin: 12 px from node edge  
- Preview Padding: 24 px  
- Inspector Padding: 16 px  
- Sidebar Scroll Padding: 12 px top/bottom  

---

7️⃣ Iconography

| Icon | Style | Color | Size |
|-------|--------|--------|------|
| Audio | Line icon, waveform | Cyan | 20 px |
| Pattern | Geometric swirl | Magenta | 20 px |
| Math | Function symbol (ƒ) | Lime | 20 px |
| Output | LED bulb | Blue | 20 px |
| Hardware | Chip outline | Orange | 20 px |
| Upload | Arrow‑up | Green | 20 px |

All icons use 2 px stroke, rounded ends, consistent visual rhythm.

---

8️⃣ Micro‑Interactions

- Node creation: Fade‑in + drop animation (200 ms)  
- Connection complete: Spark effect at port (80 ms)  
- Audio beat detected: Brief pulse across preview border  
- Pattern switch: Transition node triggers ripple animation  
- Error state: Red glow + tooltip “Invalid connection”  

---

9️⃣ Design Tokens (for implementation)

`json
{
  "colors": {
    "bgPrimary": "#0D0F12",
    "bgPanel": "#161A1F",
    "accentAudio": "#00FFFF",
    "accentPattern": "#FF00FF",
    "accentMath": "#A8FF00",
    "accentOutput": "#00BFFF",
    "accentHardware": "#FFA500"
  },
  "typography": {
    "fontDisplay": "Inter-Bold",
    "fontBody": "Inter-Regular",
    "fontCode": "JetBrainsMono-Regular"
  },
  "spacing": {
    "base": 8,
    "nodeWidth": 220,
    "nodeHeight": 140
  },
  "animation": {
    "hoverDuration": 150,
    "transitionDuration": 1200
  }
}
`

---

🔟 Design System Extensions

- Theme Variants:  
  - Dark Neon (default)  
  - Solarized Dark (muted tones)  
  - Studio Light (for print/export clarity)

- Responsive Scaling:  
  - Node graph zoom 0.5×–2×  
  - Sidebar collapsible  
  - Preview resizable up to 512×512 LED simulation  

- Accessibility Modes:  
  - High‑contrast outlines  
  - Reduced motion toggle  
  - Color‑blind palette presets  

---

🧩 Component Hierarchy Diagram

`
App Root
 ├── MenuBar
 ├── Sidebar
 │    └── NodeLibrary
 ├── NodeGraphCanvas
 │    ├── Node
 │    │    ├── Header
 │    │    ├── Ports
 │    │    └── Body
 │    └── Connectors
 ├── PreviewPanel
 │    ├── LEDMatrix
 │    └── AudioVisualizer
 ├── InspectorPanel
 └── StatusBar
`

---

🧠 Design System Summary
- Visual DNA: Neon‑tech meets modular clarity.  
- Interaction Feel: Smooth, tactile, and reactive.  
- User Experience: Immediate feedback, intuitive flow, creative empowerment.  
- Scalability: Supports new node types, boards, and libraries seamlessly.  

---

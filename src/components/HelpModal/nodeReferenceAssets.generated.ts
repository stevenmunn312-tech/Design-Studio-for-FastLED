export interface NodeReferenceImageSet {
  node: string
  graph: string
  preview: string
}

export interface NodeReferenceAssets {
  categories: Record<string, string>
  nodes: Record<string, NodeReferenceImageSet>
}

export const NODE_REFERENCE_ASSETS: NodeReferenceAssets = {
  "categories": {
    "input": "/node-reference/categories/input.png",
    "audio": "/node-reference/categories/audio.png",
    "signal": "/node-reference/categories/signal.png",
    "math": "/node-reference/categories/math.png",
    "color": "/node-reference/categories/color.png",
    "pattern": "/node-reference/categories/pattern.png",
    "field": "/node-reference/categories/field.png",
    "composite": "/node-reference/categories/composite.png",
    "show": "/node-reference/categories/show.png",
    "output": "/node-reference/categories/output.png",
    "note": "/node-reference/categories/note.png"
  },
  "nodes": {
    "MicInput": {
      "node": "/node-reference/nodes/MicInput/node.png",
      "graph": "/node-reference/nodes/MicInput/graph.png",
      "preview": "/node-reference/nodes/MicInput/preview.png"
    },
    "MusicLibrary": {
      "node": "/node-reference/nodes/MusicLibrary/node.png",
      "graph": "/node-reference/nodes/MusicLibrary/graph.png",
      "preview": "/node-reference/nodes/MusicLibrary/preview.png"
    },
    "FFTAnalyzer": {
      "node": "/node-reference/nodes/FFTAnalyzer/node.png",
      "graph": "/node-reference/nodes/FFTAnalyzer/graph.png",
      "preview": "/node-reference/nodes/FFTAnalyzer/preview.png"
    },
    "BeatDetect": {
      "node": "/node-reference/nodes/BeatDetect/node.png",
      "graph": "/node-reference/nodes/BeatDetect/graph.png",
      "preview": "/node-reference/nodes/BeatDetect/preview.png"
    },
    "PercussionDetect": {
      "node": "/node-reference/nodes/PercussionDetect/node.png",
      "graph": "/node-reference/nodes/PercussionDetect/graph.png",
      "preview": "/node-reference/nodes/PercussionDetect/preview.png"
    },
    "AudioFeatures": {
      "node": "/node-reference/nodes/AudioFeatures/node.png",
      "graph": "/node-reference/nodes/AudioFeatures/graph.png",
      "preview": "/node-reference/nodes/AudioFeatures/preview.png"
    },
    "SolidColor": {
      "node": "/node-reference/nodes/SolidColor/node.png",
      "graph": "/node-reference/nodes/SolidColor/graph.png",
      "preview": "/node-reference/nodes/SolidColor/preview.png"
    },
    "Text": {
      "node": "/node-reference/nodes/Text/node.png",
      "graph": "/node-reference/nodes/Text/graph.png",
      "preview": "/node-reference/nodes/Text/preview.png"
    },
    "Circle": {
      "node": "/node-reference/nodes/Circle/node.png",
      "graph": "/node-reference/nodes/Circle/graph.png",
      "preview": "/node-reference/nodes/Circle/preview.png"
    },
    "Line": {
      "node": "/node-reference/nodes/Line/node.png",
      "graph": "/node-reference/nodes/Line/graph.png",
      "preview": "/node-reference/nodes/Line/preview.png"
    },
    "Shape": {
      "node": "/node-reference/nodes/Shape/node.png",
      "graph": "/node-reference/nodes/Shape/graph.png",
      "preview": "/node-reference/nodes/Shape/preview.png"
    },
    "Path": {
      "node": "/node-reference/nodes/Path/node.png",
      "graph": "/node-reference/nodes/Path/graph.png",
      "preview": "/node-reference/nodes/Path/preview.png"
    },
    "Noise": {
      "node": "/node-reference/nodes/Noise/node.png",
      "graph": "/node-reference/nodes/Noise/graph.png",
      "preview": "/node-reference/nodes/Noise/preview.png"
    },
    "Fire": {
      "node": "/node-reference/nodes/Fire/node.png",
      "graph": "/node-reference/nodes/Fire/graph.png",
      "preview": "/node-reference/nodes/Fire/preview.png"
    },
    "Fire2012": {
      "node": "/node-reference/nodes/Fire2012/node.png",
      "graph": "/node-reference/nodes/Fire2012/graph.png",
      "preview": "/node-reference/nodes/Fire2012/preview.png"
    },
    "Blur2D": {
      "node": "/node-reference/nodes/Blur2D/node.png",
      "graph": "/node-reference/nodes/Blur2D/graph.png",
      "preview": "/node-reference/nodes/Blur2D/preview.png"
    },
    "Blend": {
      "node": "/node-reference/nodes/Blend/node.png",
      "graph": "/node-reference/nodes/Blend/graph.png",
      "preview": "/node-reference/nodes/Blend/preview.png"
    },
    "Mask": {
      "node": "/node-reference/nodes/Mask/node.png",
      "graph": "/node-reference/nodes/Mask/graph.png",
      "preview": "/node-reference/nodes/Mask/preview.png"
    },
    "Plasma": {
      "node": "/node-reference/nodes/Plasma/node.png",
      "graph": "/node-reference/nodes/Plasma/graph.png",
      "preview": "/node-reference/nodes/Plasma/preview.png"
    },
    "Rainbow": {
      "node": "/node-reference/nodes/Rainbow/node.png",
      "graph": "/node-reference/nodes/Rainbow/graph.png",
      "preview": "/node-reference/nodes/Rainbow/preview.png"
    },
    "Pride2015": {
      "node": "/node-reference/nodes/Pride2015/node.png",
      "graph": "/node-reference/nodes/Pride2015/graph.png",
      "preview": "/node-reference/nodes/Pride2015/preview.png"
    },
    "Pacifica": {
      "node": "/node-reference/nodes/Pacifica/node.png",
      "graph": "/node-reference/nodes/Pacifica/graph.png",
      "preview": "/node-reference/nodes/Pacifica/preview.png"
    },
    "TwinkleFox": {
      "node": "/node-reference/nodes/TwinkleFox/node.png",
      "graph": "/node-reference/nodes/TwinkleFox/graph.png",
      "preview": "/node-reference/nodes/TwinkleFox/preview.png"
    },
    "Scanner": {
      "node": "/node-reference/nodes/Scanner/node.png",
      "graph": "/node-reference/nodes/Scanner/graph.png",
      "preview": "/node-reference/nodes/Scanner/preview.png"
    },
    "Confetti": {
      "node": "/node-reference/nodes/Confetti/node.png",
      "graph": "/node-reference/nodes/Confetti/graph.png",
      "preview": "/node-reference/nodes/Confetti/preview.png"
    },
    "Juggle": {
      "node": "/node-reference/nodes/Juggle/node.png",
      "graph": "/node-reference/nodes/Juggle/graph.png",
      "preview": "/node-reference/nodes/Juggle/preview.png"
    },
    "SpectrumBars": {
      "node": "/node-reference/nodes/SpectrumBars/node.png",
      "graph": "/node-reference/nodes/SpectrumBars/graph.png",
      "preview": "/node-reference/nodes/SpectrumBars/preview.png"
    },
    "BrightnessMod": {
      "node": "/node-reference/nodes/BrightnessMod/node.png",
      "graph": "/node-reference/nodes/BrightnessMod/graph.png",
      "preview": "/node-reference/nodes/BrightnessMod/preview.png"
    },
    "Fade": {
      "node": "/node-reference/nodes/Fade/node.png",
      "graph": "/node-reference/nodes/Fade/graph.png",
      "preview": "/node-reference/nodes/Fade/preview.png"
    },
    "HueShift": {
      "node": "/node-reference/nodes/HueShift/node.png",
      "graph": "/node-reference/nodes/HueShift/graph.png",
      "preview": "/node-reference/nodes/HueShift/preview.png"
    },
    "Gamma": {
      "node": "/node-reference/nodes/Gamma/node.png",
      "graph": "/node-reference/nodes/Gamma/graph.png",
      "preview": "/node-reference/nodes/Gamma/preview.png"
    },
    "Saturation": {
      "node": "/node-reference/nodes/Saturation/node.png",
      "graph": "/node-reference/nodes/Saturation/graph.png",
      "preview": "/node-reference/nodes/Saturation/preview.png"
    },
    "ColorBoost": {
      "node": "/node-reference/nodes/ColorBoost/node.png",
      "graph": "/node-reference/nodes/ColorBoost/graph.png",
      "preview": "/node-reference/nodes/ColorBoost/preview.png"
    },
    "Transform": {
      "node": "/node-reference/nodes/Transform/node.png",
      "graph": "/node-reference/nodes/Transform/graph.png",
      "preview": "/node-reference/nodes/Transform/preview.png"
    },
    "Array": {
      "node": "/node-reference/nodes/Array/node.png",
      "graph": "/node-reference/nodes/Array/graph.png",
      "preview": "/node-reference/nodes/Array/preview.png"
    },
    "BassPulse": {
      "node": "/node-reference/nodes/BassPulse/node.png",
      "graph": "/node-reference/nodes/BassPulse/graph.png",
      "preview": "/node-reference/nodes/BassPulse/preview.png"
    },
    "BassRings": {
      "node": "/node-reference/nodes/BassRings/node.png",
      "graph": "/node-reference/nodes/BassRings/graph.png",
      "preview": "/node-reference/nodes/BassRings/preview.png"
    },
    "MidrangeWaves": {
      "node": "/node-reference/nodes/MidrangeWaves/node.png",
      "graph": "/node-reference/nodes/MidrangeWaves/graph.png",
      "preview": "/node-reference/nodes/MidrangeWaves/preview.png"
    },
    "MidrangeBloom": {
      "node": "/node-reference/nodes/MidrangeBloom/node.png",
      "graph": "/node-reference/nodes/MidrangeBloom/graph.png",
      "preview": "/node-reference/nodes/MidrangeBloom/preview.png"
    },
    "TrebleSparks": {
      "node": "/node-reference/nodes/TrebleSparks/node.png",
      "graph": "/node-reference/nodes/TrebleSparks/graph.png",
      "preview": "/node-reference/nodes/TrebleSparks/preview.png"
    },
    "TreblePrism": {
      "node": "/node-reference/nodes/TreblePrism/node.png",
      "graph": "/node-reference/nodes/TreblePrism/graph.png",
      "preview": "/node-reference/nodes/TreblePrism/preview.png"
    },
    "AudioCascade": {
      "node": "/node-reference/nodes/AudioCascade/node.png",
      "graph": "/node-reference/nodes/AudioCascade/graph.png",
      "preview": "/node-reference/nodes/AudioCascade/preview.png"
    },
    "BeatFlash": {
      "node": "/node-reference/nodes/BeatFlash/node.png",
      "graph": "/node-reference/nodes/BeatFlash/graph.png",
      "preview": "/node-reference/nodes/BeatFlash/preview.png"
    },
    "KickShock": {
      "node": "/node-reference/nodes/KickShock/node.png",
      "graph": "/node-reference/nodes/KickShock/graph.png",
      "preview": "/node-reference/nodes/KickShock/preview.png"
    },
    "VocalAurora": {
      "node": "/node-reference/nodes/VocalAurora/node.png",
      "graph": "/node-reference/nodes/VocalAurora/graph.png",
      "preview": "/node-reference/nodes/VocalAurora/preview.png"
    },
    "BeatKaleidoscope": {
      "node": "/node-reference/nodes/BeatKaleidoscope/node.png",
      "graph": "/node-reference/nodes/BeatKaleidoscope/graph.png",
      "preview": "/node-reference/nodes/BeatKaleidoscope/preview.png"
    },
    "SpectraMosaic": {
      "node": "/node-reference/nodes/SpectraMosaic/node.png",
      "graph": "/node-reference/nodes/SpectraMosaic/graph.png",
      "preview": "/node-reference/nodes/SpectraMosaic/preview.png"
    },
    "PercussionBlobs": {
      "node": "/node-reference/nodes/PercussionBlobs/node.png",
      "graph": "/node-reference/nodes/PercussionBlobs/graph.png",
      "preview": "/node-reference/nodes/PercussionBlobs/preview.png"
    },
    "EmberPulse": {
      "node": "/node-reference/nodes/EmberPulse/node.png",
      "graph": "/node-reference/nodes/EmberPulse/graph.png",
      "preview": "/node-reference/nodes/EmberPulse/preview.png"
    },
    "TurbulentBloom": {
      "node": "/node-reference/nodes/TurbulentBloom/node.png",
      "graph": "/node-reference/nodes/TurbulentBloom/graph.png",
      "preview": "/node-reference/nodes/TurbulentBloom/preview.png"
    },
    "GravityWell": {
      "node": "/node-reference/nodes/GravityWell/node.png",
      "graph": "/node-reference/nodes/GravityWell/graph.png",
      "preview": "/node-reference/nodes/GravityWell/preview.png"
    },
    "RainRipples": {
      "node": "/node-reference/nodes/RainRipples/node.png",
      "graph": "/node-reference/nodes/RainRipples/graph.png",
      "preview": "/node-reference/nodes/RainRipples/preview.png"
    },
    "PrismStorm": {
      "node": "/node-reference/nodes/PrismStorm/node.png",
      "graph": "/node-reference/nodes/PrismStorm/graph.png",
      "preview": "/node-reference/nodes/PrismStorm/preview.png"
    },
    "RadialBurst": {
      "node": "/node-reference/nodes/RadialBurst/node.png",
      "graph": "/node-reference/nodes/RadialBurst/graph.png",
      "preview": "/node-reference/nodes/RadialBurst/preview.png"
    },
    "Spiral": {
      "node": "/node-reference/nodes/Spiral/node.png",
      "graph": "/node-reference/nodes/Spiral/graph.png",
      "preview": "/node-reference/nodes/Spiral/preview.png"
    },
    "Kaleidoscope": {
      "node": "/node-reference/nodes/Kaleidoscope/node.png",
      "graph": "/node-reference/nodes/Kaleidoscope/graph.png",
      "preview": "/node-reference/nodes/Kaleidoscope/preview.png"
    },
    "Particles": {
      "node": "/node-reference/nodes/Particles/node.png",
      "graph": "/node-reference/nodes/Particles/graph.png",
      "preview": "/node-reference/nodes/Particles/preview.png"
    },
    "Invert": {
      "node": "/node-reference/nodes/Invert/node.png",
      "graph": "/node-reference/nodes/Invert/graph.png",
      "preview": "/node-reference/nodes/Invert/preview.png"
    },
    "Mirror": {
      "node": "/node-reference/nodes/Mirror/node.png",
      "graph": "/node-reference/nodes/Mirror/graph.png",
      "preview": "/node-reference/nodes/Mirror/preview.png"
    },
    "Trails": {
      "node": "/node-reference/nodes/Trails/node.png",
      "graph": "/node-reference/nodes/Trails/graph.png",
      "preview": "/node-reference/nodes/Trails/preview.png"
    },
    "FrameSwitch": {
      "node": "/node-reference/nodes/FrameSwitch/node.png",
      "graph": "/node-reference/nodes/FrameSwitch/graph.png",
      "preview": "/node-reference/nodes/FrameSwitch/preview.png"
    },
    "Zones": {
      "node": "/node-reference/nodes/Zones/node.png",
      "graph": "/node-reference/nodes/Zones/graph.png",
      "preview": "/node-reference/nodes/Zones/preview.png"
    },
    "GradientFrame": {
      "node": "/node-reference/nodes/GradientFrame/node.png",
      "graph": "/node-reference/nodes/GradientFrame/graph.png",
      "preview": "/node-reference/nodes/GradientFrame/preview.png"
    },
    "GradientSampler": {
      "node": "/node-reference/nodes/GradientSampler/node.png",
      "graph": "/node-reference/nodes/GradientSampler/graph.png",
      "preview": "/node-reference/nodes/GradientSampler/preview.png"
    },
    "PaletteSampler": {
      "node": "/node-reference/nodes/PaletteSampler/node.png",
      "graph": "/node-reference/nodes/PaletteSampler/graph.png",
      "preview": "/node-reference/nodes/PaletteSampler/preview.png"
    },
    "Math": {
      "node": "/node-reference/nodes/Math/node.png",
      "graph": "/node-reference/nodes/Math/graph.png",
      "preview": "/node-reference/nodes/Math/preview.png"
    },
    "Clamp": {
      "node": "/node-reference/nodes/Clamp/node.png",
      "graph": "/node-reference/nodes/Clamp/graph.png",
      "preview": "/node-reference/nodes/Clamp/preview.png"
    },
    "MapRange": {
      "node": "/node-reference/nodes/MapRange/node.png",
      "graph": "/node-reference/nodes/MapRange/graph.png",
      "preview": "/node-reference/nodes/MapRange/preview.png"
    },
    "Sin": {
      "node": "/node-reference/nodes/Sin/node.png",
      "graph": "/node-reference/nodes/Sin/graph.png",
      "preview": "/node-reference/nodes/Sin/preview.png"
    },
    "Cos": {
      "node": "/node-reference/nodes/Cos/node.png",
      "graph": "/node-reference/nodes/Cos/graph.png",
      "preview": "/node-reference/nodes/Cos/preview.png"
    },
    "Wave": {
      "node": "/node-reference/nodes/Wave/node.png",
      "graph": "/node-reference/nodes/Wave/graph.png",
      "preview": "/node-reference/nodes/Wave/preview.png"
    },
    "ComplexWave": {
      "node": "/node-reference/nodes/ComplexWave/node.png",
      "graph": "/node-reference/nodes/ComplexWave/graph.png",
      "preview": "/node-reference/nodes/ComplexWave/preview.png"
    },
    "Lerp": {
      "node": "/node-reference/nodes/Lerp/node.png",
      "graph": "/node-reference/nodes/Lerp/graph.png",
      "preview": "/node-reference/nodes/Lerp/preview.png"
    },
    "Ease": {
      "node": "/node-reference/nodes/Ease/node.png",
      "graph": "/node-reference/nodes/Ease/graph.png",
      "preview": "/node-reference/nodes/Ease/preview.png"
    },
    "Interval": {
      "node": "/node-reference/nodes/Interval/node.png",
      "graph": "/node-reference/nodes/Interval/graph.png",
      "preview": "/node-reference/nodes/Interval/preview.png"
    },
    "Envelope": {
      "node": "/node-reference/nodes/Envelope/node.png",
      "graph": "/node-reference/nodes/Envelope/graph.png",
      "preview": "/node-reference/nodes/Envelope/preview.png"
    },
    "TimeNode": {
      "node": "/node-reference/nodes/TimeNode/node.png",
      "graph": "/node-reference/nodes/TimeNode/graph.png",
      "preview": "/node-reference/nodes/TimeNode/preview.png"
    },
    "Abs": {
      "node": "/node-reference/nodes/Abs/node.png",
      "graph": "/node-reference/nodes/Abs/graph.png",
      "preview": "/node-reference/nodes/Abs/preview.png"
    },
    "Mod": {
      "node": "/node-reference/nodes/Mod/node.png",
      "graph": "/node-reference/nodes/Mod/graph.png",
      "preview": "/node-reference/nodes/Mod/preview.png"
    },
    "Random": {
      "node": "/node-reference/nodes/Random/node.png",
      "graph": "/node-reference/nodes/Random/graph.png",
      "preview": "/node-reference/nodes/Random/preview.png"
    },
    "Counter": {
      "node": "/node-reference/nodes/Counter/node.png",
      "graph": "/node-reference/nodes/Counter/graph.png",
      "preview": "/node-reference/nodes/Counter/preview.png"
    },
    "Gate": {
      "node": "/node-reference/nodes/Gate/node.png",
      "graph": "/node-reference/nodes/Gate/graph.png",
      "preview": "/node-reference/nodes/Gate/preview.png"
    },
    "Smooth": {
      "node": "/node-reference/nodes/Smooth/node.png",
      "graph": "/node-reference/nodes/Smooth/graph.png",
      "preview": "/node-reference/nodes/Smooth/preview.png"
    },
    "SampleHold": {
      "node": "/node-reference/nodes/SampleHold/node.png",
      "graph": "/node-reference/nodes/SampleHold/graph.png",
      "preview": "/node-reference/nodes/SampleHold/preview.png"
    },
    "Switch": {
      "node": "/node-reference/nodes/Switch/node.png",
      "graph": "/node-reference/nodes/Switch/graph.png",
      "preview": "/node-reference/nodes/Switch/preview.png"
    },
    "Not": {
      "node": "/node-reference/nodes/Not/node.png",
      "graph": "/node-reference/nodes/Not/graph.png",
      "preview": "/node-reference/nodes/Not/preview.png"
    },
    "Compare": {
      "node": "/node-reference/nodes/Compare/node.png",
      "graph": "/node-reference/nodes/Compare/graph.png",
      "preview": "/node-reference/nodes/Compare/preview.png"
    },
    "Trigger": {
      "node": "/node-reference/nodes/Trigger/node.png",
      "graph": "/node-reference/nodes/Trigger/graph.png",
      "preview": "/node-reference/nodes/Trigger/preview.png"
    },
    "AudioHue": {
      "node": "/node-reference/nodes/AudioHue/node.png",
      "graph": "/node-reference/nodes/AudioHue/graph.png",
      "preview": "/node-reference/nodes/AudioHue/preview.png"
    },
    "HSVToRGB": {
      "node": "/node-reference/nodes/HSVToRGB/node.png",
      "graph": "/node-reference/nodes/HSVToRGB/graph.png",
      "preview": "/node-reference/nodes/HSVToRGB/preview.png"
    },
    "RGBToHSV": {
      "node": "/node-reference/nodes/RGBToHSV/node.png",
      "graph": "/node-reference/nodes/RGBToHSV/graph.png",
      "preview": "/node-reference/nodes/RGBToHSV/preview.png"
    },
    "Temperature": {
      "node": "/node-reference/nodes/Temperature/node.png",
      "graph": "/node-reference/nodes/Temperature/graph.png",
      "preview": "/node-reference/nodes/Temperature/preview.png"
    },
    "HeatColor": {
      "node": "/node-reference/nodes/HeatColor/node.png",
      "graph": "/node-reference/nodes/HeatColor/graph.png",
      "preview": "/node-reference/nodes/HeatColor/preview.png"
    },
    "BlendColors": {
      "node": "/node-reference/nodes/BlendColors/node.png",
      "graph": "/node-reference/nodes/BlendColors/graph.png",
      "preview": "/node-reference/nodes/BlendColors/preview.png"
    },
    "CHSV": {
      "node": "/node-reference/nodes/CHSV/node.png",
      "graph": "/node-reference/nodes/CHSV/graph.png",
      "preview": "/node-reference/nodes/CHSV/preview.png"
    },
    "PaletteSelector": {
      "node": "/node-reference/nodes/PaletteSelector/node.png",
      "graph": "/node-reference/nodes/PaletteSelector/graph.png",
      "preview": "/node-reference/nodes/PaletteSelector/preview.png"
    },
    "CustomPalette": {
      "node": "/node-reference/nodes/CustomPalette/node.png",
      "graph": "/node-reference/nodes/CustomPalette/graph.png",
      "preview": "/node-reference/nodes/CustomPalette/preview.png"
    },
    "Poline": {
      "node": "/node-reference/nodes/Poline/node.png",
      "graph": "/node-reference/nodes/Poline/graph.png",
      "preview": "/node-reference/nodes/Poline/preview.png"
    },
    "PaletteBlend": {
      "node": "/node-reference/nodes/PaletteBlend/node.png",
      "graph": "/node-reference/nodes/PaletteBlend/graph.png",
      "preview": "/node-reference/nodes/PaletteBlend/preview.png"
    },
    "BeatSin": {
      "node": "/node-reference/nodes/BeatSin/node.png",
      "graph": "/node-reference/nodes/BeatSin/graph.png",
      "preview": "/node-reference/nodes/BeatSin/preview.png"
    },
    "Clock": {
      "node": "/node-reference/nodes/Clock/node.png",
      "graph": "/node-reference/nodes/Clock/graph.png",
      "preview": "/node-reference/nodes/Clock/preview.png"
    },
    "XYMapper": {
      "node": "/node-reference/nodes/XYMapper/node.png",
      "graph": "/node-reference/nodes/XYMapper/graph.png",
      "preview": "/node-reference/nodes/XYMapper/preview.png"
    },
    "FractalNoise": {
      "node": "/node-reference/nodes/FractalNoise/node.png",
      "graph": "/node-reference/nodes/FractalNoise/graph.png",
      "preview": "/node-reference/nodes/FractalNoise/preview.png"
    },
    "GaborNoise": {
      "node": "/node-reference/nodes/GaborNoise/node.png",
      "graph": "/node-reference/nodes/GaborNoise/graph.png",
      "preview": "/node-reference/nodes/GaborNoise/preview.png"
    },
    "PaletteGradient": {
      "node": "/node-reference/nodes/PaletteGradient/node.png",
      "graph": "/node-reference/nodes/PaletteGradient/graph.png",
      "preview": "/node-reference/nodes/PaletteGradient/preview.png"
    },
    "Image": {
      "node": "/node-reference/nodes/Image/node.png",
      "graph": "/node-reference/nodes/Image/graph.png",
      "preview": "/node-reference/nodes/Image/preview.png"
    },
    "Blobs": {
      "node": "/node-reference/nodes/Blobs/node.png",
      "graph": "/node-reference/nodes/Blobs/graph.png",
      "preview": "/node-reference/nodes/Blobs/preview.png"
    },
    "FlowField": {
      "node": "/node-reference/nodes/FlowField/node.png",
      "graph": "/node-reference/nodes/FlowField/graph.png",
      "preview": "/node-reference/nodes/FlowField/preview.png"
    },
    "Starfield": {
      "node": "/node-reference/nodes/Starfield/node.png",
      "graph": "/node-reference/nodes/Starfield/graph.png",
      "preview": "/node-reference/nodes/Starfield/preview.png"
    },
    "Boids": {
      "node": "/node-reference/nodes/Boids/node.png",
      "graph": "/node-reference/nodes/Boids/graph.png",
      "preview": "/node-reference/nodes/Boids/preview.png"
    },
    "AudioFlow": {
      "node": "/node-reference/nodes/AudioFlow/node.png",
      "graph": "/node-reference/nodes/AudioFlow/graph.png",
      "preview": "/node-reference/nodes/AudioFlow/preview.png"
    },
    "ReactionDiffusion": {
      "node": "/node-reference/nodes/ReactionDiffusion/node.png",
      "graph": "/node-reference/nodes/ReactionDiffusion/graph.png",
      "preview": "/node-reference/nodes/ReactionDiffusion/preview.png"
    },
    "GameOfLife": {
      "node": "/node-reference/nodes/GameOfLife/node.png",
      "graph": "/node-reference/nodes/GameOfLife/graph.png",
      "preview": "/node-reference/nodes/GameOfLife/preview.png"
    },
    "Transition": {
      "node": "/node-reference/nodes/Transition/node.png",
      "graph": "/node-reference/nodes/Transition/graph.png",
      "preview": "/node-reference/nodes/Transition/preview.png"
    },
    "PatternMaster": {
      "node": "/node-reference/nodes/PatternMaster/node.png",
      "graph": "/node-reference/nodes/PatternMaster/graph.png",
      "preview": "/node-reference/nodes/PatternMaster/preview.png"
    },
    "Sequencer": {
      "node": "/node-reference/nodes/Sequencer/node.png",
      "graph": "/node-reference/nodes/Sequencer/graph.png",
      "preview": "/node-reference/nodes/Sequencer/preview.png"
    },
    "PatternCollection": {
      "node": "/node-reference/nodes/PatternCollection/node.png",
      "graph": "/node-reference/nodes/PatternCollection/graph.png",
      "preview": "/node-reference/nodes/PatternCollection/preview.png"
    },
    "TransitionSet": {
      "node": "/node-reference/nodes/TransitionSet/node.png",
      "graph": "/node-reference/nodes/TransitionSet/graph.png",
      "preview": "/node-reference/nodes/TransitionSet/preview.png"
    },
    "CustomFormula": {
      "node": "/node-reference/nodes/CustomFormula/node.png",
      "graph": "/node-reference/nodes/CustomFormula/graph.png",
      "preview": "/node-reference/nodes/CustomFormula/preview.png"
    },
    "Code": {
      "node": "/node-reference/nodes/Code/node.png",
      "graph": "/node-reference/nodes/Code/graph.png",
      "preview": "/node-reference/nodes/Code/preview.png"
    },
    "FieldFormula": {
      "node": "/node-reference/nodes/FieldFormula/node.png",
      "graph": "/node-reference/nodes/FieldFormula/graph.png",
      "preview": "/node-reference/nodes/FieldFormula/preview.png"
    },
    "FieldNoise": {
      "node": "/node-reference/nodes/FieldNoise/node.png",
      "graph": "/node-reference/nodes/FieldNoise/graph.png",
      "preview": "/node-reference/nodes/FieldNoise/preview.png"
    },
    "WaveSim": {
      "node": "/node-reference/nodes/WaveSim/node.png",
      "graph": "/node-reference/nodes/WaveSim/graph.png",
      "preview": "/node-reference/nodes/WaveSim/preview.png"
    },
    "FieldToFrame": {
      "node": "/node-reference/nodes/FieldToFrame/node.png",
      "graph": "/node-reference/nodes/FieldToFrame/graph.png",
      "preview": "/node-reference/nodes/FieldToFrame/preview.png"
    },
    "DistanceField": {
      "node": "/node-reference/nodes/DistanceField/node.png",
      "graph": "/node-reference/nodes/DistanceField/graph.png",
      "preview": "/node-reference/nodes/DistanceField/preview.png"
    },
    "FrameToField": {
      "node": "/node-reference/nodes/FrameToField/node.png",
      "graph": "/node-reference/nodes/FrameToField/graph.png",
      "preview": "/node-reference/nodes/FrameToField/preview.png"
    },
    "FieldMath": {
      "node": "/node-reference/nodes/FieldMath/node.png",
      "graph": "/node-reference/nodes/FieldMath/graph.png",
      "preview": "/node-reference/nodes/FieldMath/preview.png"
    },
    "FieldWarp": {
      "node": "/node-reference/nodes/FieldWarp/node.png",
      "graph": "/node-reference/nodes/FieldWarp/graph.png",
      "preview": "/node-reference/nodes/FieldWarp/preview.png"
    },
    "FieldRotate": {
      "node": "/node-reference/nodes/FieldRotate/node.png",
      "graph": "/node-reference/nodes/FieldRotate/graph.png",
      "preview": "/node-reference/nodes/FieldRotate/preview.png"
    },
    "FieldTile": {
      "node": "/node-reference/nodes/FieldTile/node.png",
      "graph": "/node-reference/nodes/FieldTile/graph.png",
      "preview": "/node-reference/nodes/FieldTile/preview.png"
    },
    "MatrixOutput": {
      "node": "/node-reference/nodes/MatrixOutput/node.png",
      "graph": "/node-reference/nodes/MatrixOutput/graph.png",
      "preview": "/node-reference/nodes/MatrixOutput/preview.png"
    },
    "ButtonInput": {
      "node": "/node-reference/nodes/ButtonInput/node.png",
      "graph": "/node-reference/nodes/ButtonInput/graph.png",
      "preview": "/node-reference/nodes/ButtonInput/preview.png"
    },
    "PotInput": {
      "node": "/node-reference/nodes/PotInput/node.png",
      "graph": "/node-reference/nodes/PotInput/graph.png",
      "preview": "/node-reference/nodes/PotInput/preview.png"
    },
    "EncoderInput": {
      "node": "/node-reference/nodes/EncoderInput/node.png",
      "graph": "/node-reference/nodes/EncoderInput/graph.png",
      "preview": "/node-reference/nodes/EncoderInput/preview.png"
    },
    "MidiInput": {
      "node": "/node-reference/nodes/MidiInput/node.png",
      "graph": "/node-reference/nodes/MidiInput/graph.png",
      "preview": "/node-reference/nodes/MidiInput/preview.png"
    },
    "PerformanceGenerator": {
      "node": "/node-reference/nodes/PerformanceGenerator/node.png",
      "graph": "/node-reference/nodes/PerformanceGenerator/graph.png",
      "preview": "/node-reference/nodes/PerformanceGenerator/preview.png"
    },
    "SDCard": {
      "node": "/node-reference/nodes/SDCard/node.png",
      "graph": "/node-reference/nodes/SDCard/graph.png",
      "preview": "/node-reference/nodes/SDCard/preview.png"
    },
    "Comment": {
      "node": "/node-reference/nodes/Comment/node.png",
      "graph": "/node-reference/nodes/Comment/graph.png",
      "preview": "/node-reference/nodes/Comment/preview.png"
    }
  }
} as const

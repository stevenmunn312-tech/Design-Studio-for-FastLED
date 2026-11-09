/**
 * The preview's "unplug" switch, shared by every sensor with a Connected
 * output. The browser has no part to pull out, so the stand-in widget carries
 * a toggle and the evaluator reads the sensor as the sketch would with the
 * module missing: Connected false, and the readings the firmware keeps
 * (held, or at rest) for that module. Lets a graph's fallback branch be
 * tried while designing. Run-state in the hardware input store's button map.
 */
export const unpluggedPreviewKey = (nodeId: string) => `${nodeId}:unplugged`

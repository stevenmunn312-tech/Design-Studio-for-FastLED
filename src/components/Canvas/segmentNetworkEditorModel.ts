import { fitNetworkToCanvas, parseSegmentNetwork, presetNetwork, type SegmentNetwork } from '../../state/output/segmentNetwork'

// The network editor's model, apart from its component so the dialog file
// exports only the component (react-refresh).

/** The editor works in a fixed 16 × 10 unit canvas; the output fits the result
 *  to its own canvas again, so only the shape matters. */
export const CANVAS_W = 16
export const CANVAS_H = 10
/** The network the properties describe, in editor units. */
export function networkFromProperties(properties: Record<string, unknown>): SegmentNetwork {
  const preset = properties.networkPreset === 'triangles' ? 'triangles' : properties.networkPreset === 'custom' ? 'custom' : 'hexagons'
  const custom = preset === 'custom' ? parseSegmentNetwork(properties.network) : null
  const shape = custom ?? presetNetwork(preset === 'custom' ? 'hexagons' : preset)
  return fitNetworkToCanvas(shape, CANVAS_W, CANVAS_H)
}

/** The JSON the property stores: coordinates rounded to a hundredth. */
export function networkToJson(network: SegmentNetwork): string {
  return JSON.stringify({
    nodes: network.nodes.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]),
    edges: network.edges,
  })
}


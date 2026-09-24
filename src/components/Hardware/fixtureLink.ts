import { oledTransportForProps, segmentControllerForProps, tftTransportForProps } from '../../state/nodeLibrary'

/**
 * What a bench run from the board to a fixture carries, in words.
 *
 * Every fixture run was once labelled "Board I2S out to the …", which was true
 * only of the amplifier: an SD card is on SPI, a relay module on plain control
 * lines, an OLED on I2C or SPI depending on the module. The bus comes from the
 * same resolvers the pin fields and firmware use, so a module's label follows
 * its catalogued interface rather than a second list.
 */
export function fixtureLinkLabel(
  nodeType: string,
  properties: Record<string, unknown>,
  partLabel: string,
): string {
  return `Board ${fixtureBus(nodeType, properties)} out to the ${partLabel}`
}

function fixtureBus(nodeType: string, properties: Record<string, unknown>): string {
  switch (nodeType) {
    case 'Amplifier': return 'I2S'
    // Only drawn when the board's own DAC feeds it; a DAC-fed amp has no run.
    case 'PowerAmplifier': return 'DAC line'
    case 'SDCard': return 'SPI'
    case 'InfoDisplay': return oledTransportForProps(properties) === 'i2c' ? 'I2C' : 'SPI'
    case 'TransportDisplay': return tftTransportForProps(properties) === 'parallel' ? '8-bit parallel' : 'SPI'
    // A TM1637's two wires are not I2C (it has no address), so say what it is.
    case 'SegmentDisplay': return segmentControllerForProps(properties).id === 'MAX7219' ? 'SPI' : 'two-wire serial'
    case 'StereoVuMeter': return 'LED data'
    case 'RelayOutput': return 'relay control lines'
    case 'PowerSwitchOutput': return 'switch control line'
    default: return 'signal'
  }
}

/**
 * How a fixture run moves on the bench: the same motion families the graph's
 * noodles use, chosen by what the run carries. Every fixture once animated as
 * audio, so an SD card's SPI and a relay's switch lines pulsed like a song.
 */
export function fixtureLinkDataType(nodeType: string): 'audio' | 'frame' | 'control' {
  switch (nodeType) {
    case 'Amplifier':
    case 'PowerAmplifier':
      return 'audio'
    // Pixels, whether LEDs or a screen.
    case 'StereoVuMeter':
    case 'InfoDisplay':
    case 'TransportDisplay':
    case 'SegmentDisplay':
      return 'frame'
    default:
      return 'control'
  }
}

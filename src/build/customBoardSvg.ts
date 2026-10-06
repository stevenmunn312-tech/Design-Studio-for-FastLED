import { customBoardSlotLabel, type CustomBoardDefinition } from '../state/customBoard'
import type { BoardI2cDefault } from './boardI2cDefaults'
import { customBoardGeometry } from './customBoardGeometry'

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]!)
}

function shortened(value: string, length: number): string {
  const characters = Array.from(value)
  return characters.length > length ? `${characters.slice(0, length - 1).join('')}…` : value
}

/** Trusted generated markup only. Every user string is escaped as XML text or
 * an attribute; user-authored SVG, URLs and styles are never accepted. */
export function customBoardSvgFragment(definition: CustomBoardDefinition, bus?: BoardI2cDefault): string {
  const geometry = customBoardGeometry(definition)
  const { body } = geometry
  const pads = geometry.pads.map(({ slot, side, row, x, y, labelX, textAnchor }) => {
    const functions = slot.role === 'gpio' ? [
      slot.gpio === bus?.sda.arduinoPin ? 'SDA' : '', slot.gpio === bus?.scl.arduinoPin ? 'SCL' : '',
    ].filter(Boolean) : []
    const label = [customBoardSlotLabel(slot), ...functions].join(' · ')
    const disabled = slot.role === 'gpio' && !slot.enabled
    const color = disabled ? '#87939e' : {
      gpio: '#8fdac5', ground: '#c5cbd3', supply: '#f2bc78', reset: '#c5abf1',
      reserved: '#e49b96', unconnected: '#87939e', undefined: '#f2bc78',
    }[slot.role]
    return `<g data-slot-id="${escapeXml(slot.id)}" opacity="${disabled ? '0.55' : '1'}">
<title>${escapeXml(`${side} ${row}: ${label}${disabled ? ' (disabled)' : ''}`)}</title>
<circle cx="${x}" cy="${y}" r="5" fill="#18232d" stroke="${color}" stroke-width="2"/>
<text x="${labelX}" y="${y + 3.5}" text-anchor="${textAnchor}" fill="${color}" font-size="10">${escapeXml(shortened(label, 24))}</text>
</g>`
  }).join('\n')
  return `<g font-family="monospace">
<rect x="${body.x}" y="${body.y}" width="${body.width}" height="${body.height}" rx="8" fill="#18232d" stroke="#637280" stroke-width="1.5"/>
<text x="200" y="32" text-anchor="middle" fill="#b3bdc8" font-size="9">▲ FRONT / TOP · ROW 1 AT TOP</text>
<text x="200" y="54" text-anchor="middle" fill="#f1f5f8" font-size="13"><title>${escapeXml(definition.name)}</title>${escapeXml(shortened(definition.name, 38))}</text>
${pads}
<text x="200" y="${geometry.height - 22}" text-anchor="middle" fill="#b3bdc8" font-size="9">User-defined pinout — schematic</text>
</g>`
}

/** Standalone SVG for previews and exports, using the same fragment as React. */
export function customBoardSvg(definition: CustomBoardDefinition, bus?: BoardI2cDefault): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${customBoardGeometry(definition).viewBox}" role="img" aria-label="${escapeXml(definition.name)}">${customBoardSvgFragment(definition, bus)}</svg>`
}

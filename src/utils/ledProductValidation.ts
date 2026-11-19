// Plain-copy checks for an LED output that names a product (a bundled or
// downloaded LED part). A Custom output is never checked here: nothing is
// stated about it, so nothing can disagree.
//
// Tone (docs/development/patterns/validation-and-deploy.md): offer the fix; red
// only when the build cannot work. A product's supply voltage that the user's
// supply does not match is a real blocker, because LEDs on the wrong rail do not
// light or are damaged. Everything else (a count the reel cannot give, a clock
// the product cannot take) still builds safely, so it is a warning and the
// firmware already holds to the product's limit.

import type { StudioNode } from '../state/graphStore'
import { powerSupplies, powerSupplyName, powerSupplyRating, supplyForLoad } from '../state/peripherals/powerSupply'
import {
  clampLedCount, ledCountBounds, ledFormFits, ledProductFacts, ledProductOf, lockedLedKeys,
} from '../state/output/ledProduct'
import { effectiveDataRateMhz } from '../build/ledDrivers'
import type { GraphDiagnostic } from './validateGraph'

const COUNT_FORMS: ReadonlySet<string> = new Set(['strip', 'corkscrew', 'ring'])

function volts(value: number): string {
  return `${Number(value.toFixed(2))} V`
}

/** The diagnostics for one LED output node, given every node (for its supply). */
export function ledProductDiagnostics(
  node: StudioNode,
  nodes: readonly StudioNode[],
  label: string,
): GraphDiagnostic[] {
  const props = node.data.properties as Record<string, unknown>
  const product = ledProductOf(props)
  if (!product) return []
  const { spec } = product
  const name = product.label
  const out: GraphDiagnostic[] = []
  const base = { nodeIds: [node.id], nodeLabel: label }

  if (!ledFormFits(spec.form, props.form)) {
    out.push({
      ...base,
      id: `${node.id}-led-product-form`, severity: 'warning', category: 'layout',
      title: `${label} is not shaped like ${name}`,
      message: `${name} is a ${spec.form}, and this LED output is set to ${String(props.form ?? 'strip')}. The build uses the output as you set it, so the part's facts may not apply.`,
      fix: `Choose Custom in the LED product picker to keep this shape, or choose a ${String(props.form ?? 'strip')} product.`,
      propertyKey: 'partId',
    })
  }

  const bounds = ledCountBounds(spec)
  if (bounds && COUNT_FORMS.has(String(props.form ?? spec.form))) {
    const count = Math.round(Number(props.ledCount))
    if (Number.isFinite(count)) {
      const allowed = clampLedCount(spec, count)
      if (allowed !== count) {
        const fixedCount = bounds.min === bounds.max
        out.push({
          ...base,
          id: `${node.id}-led-product-count`, severity: 'warning', category: 'layout',
          title: `${label} has a count ${name} does not come in`,
          message: fixedCount
            ? `${name} has ${bounds.min} LEDs, and this LED output says ${count}.`
            : count > bounds.max
              ? `${name} comes at most ${bounds.max} LEDs on a reel, and this LED output says ${count}.`
              : `${name} is cut in steps of ${bounds.step} LEDs, and this LED output says ${count}.`,
          fix: `Set the LED count to ${allowed}, or choose Custom if your strip is a different length.`,
          propertyKey: 'ledCount',
        })
      }
    }
  }

  const locked = lockedLedKeys(spec)
  const drift = Object.entries(ledProductFacts(spec, props))
    .filter(([key, value]) => locked.includes(key) && key !== 'ledCount' && props[key] !== undefined && props[key] !== value)
    .map(([key]) => key)
  if (drift.length > 0) {
    out.push({
      ...base,
      id: `${node.id}-led-product-facts`, severity: 'warning', category: 'layout',
      title: `${label} differs from ${name}`,
      message: `${drift.join(', ')} ${drift.length === 1 ? 'is' : 'are'} set to something other than ${name} states.`,
      fix: `Choose ${name} again to restore its settings, or choose Custom to keep yours.`,
      propertyKey: drift[0],
    })
  }

  const ceiling = spec.maxDataRateMhz
  const asked = Number(props.dataRateMhz)
  if (ceiling !== undefined && Number.isFinite(asked) && asked > ceiling) {
    const chipset = String(props.chipset ?? spec.chipset)
    const safe = effectiveDataRateMhz(chipset, asked, ceiling)
    out.push({
      ...base,
      id: `${node.id}-led-product-data-rate`, severity: 'warning', category: 'connection',
      title: `${label} is clocked faster than ${name} takes`,
      message: `The data rate is ${asked} MHz, and ${name} takes at most ${ceiling} MHz. The firmware sends at ${safe ?? ceiling} MHz instead.`,
      fix: `Set the data rate to ${safe ?? ceiling} MHz.`,
      propertyKey: 'dataRateMhz',
      ...(safe !== null
        ? { action: 'raise-data-rate' as const, repair: { kind: 'set-data-rate' as const, nodeId: node.id, dataRateMhz: safe } }
        : {}),
    })
  }

  // The user's own supply: a rail converter makes the LED rail itself, so the
  // supply then sits upstream and the electrical plan reads it instead.
  if (!nodes.some((candidate) => candidate.data.nodeType === 'PowerConverter')) {
    const supply = powerSupplies(nodes).length > 0 ? supplyForLoad(nodes, props) : undefined
    if (supply) {
      const rating = powerSupplyRating(supply.data.properties as Record<string, unknown>)
      if (rating.voltage !== spec.supplyVolts) {
        const supplyName = powerSupplyName(nodes, supply)
        out.push({
          ...base,
          id: `${node.id}-led-product-supply`, severity: 'error', category: 'power',
          title: `${name} cannot run from ${supplyName}`,
          message: spec.supplyVolts > rating.voltage
            ? `${name} needs ${volts(spec.supplyVolts)}, and ${supplyName} is a ${volts(rating.voltage)} supply. The LEDs will not light.`
            : `${name} runs from ${volts(spec.supplyVolts)}, and ${supplyName} is a ${volts(rating.voltage)} supply. That voltage can damage the LEDs.`,
          fix: `Power ${label} from a ${volts(spec.supplyVolts)} supply: change the supply's voltage, or choose another under Powered by.`,
          propertyKey: 'poweredBy',
        })
      }
    }
  }
  return out
}

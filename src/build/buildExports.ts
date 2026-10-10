import { boardDataProvenance, type PhysicalBoardProfile } from './boards/boardProfiles'
import type { BuildProfile } from './buildProfile'
import type { ElectricalPlanSummary } from './power/electricalPlan'
import { boardPinLabelForUse, POWER_PATH_KINDS, type HardwareManifest, type HardwareManifestItem, type HardwarePinUse } from './hardwareManifest'
import { fuseBlockAllocations } from './power/powerDistribution'
import { partById, sharedPadsAcrossBoards } from './parts/partCatalogue'
import { planSourceLabel, planSourceVoltageLabel } from './power/planSource'
import { standardFuseRatingFor } from './power/electricalRules'

export interface BuildConnectionRow {
  from: string
  fromTerminal: string
  to: string
  toTerminal: string
  purpose: string
}

export interface BuildBomRow {
  quantity: string
  item: string
  specification: string
  status: 'configured' | 'calculated' | 'unresolved'
}

export interface BuildExportMetadata {
  status: string
  ruleSetVersion: string
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function formatAmps(valueMa: number): string {
  return `${Number((valueMa / 1000).toFixed(valueMa % 1000 === 0 ? 0 : 1))} A`
}

function supplyNumber(supplyId: string): string {
  return supplyId.replace('supply-', '')
}

function supplyLabelFor(plan: ElectricalPlanSummary, supplyId: string): string {
  const supply = plan.totals?.supplies.find((candidate) => candidate.id === supplyId)
  return supply?.converter
    ? `${supply.converter.label} zone ${supplyNumber(supplyId)}`
    : `5 V PSU ${supplyNumber(supplyId)}`
}

function numberedTerminal(terminals: string[], index: number): string {
  const raw = terminals[index] ?? '?'
  const label = terminals.length > 4 && raw === '+' ? 'V+' : terminals.length > 4 && raw === '-' ? 'V-' : raw
  return terminals.length > 4 ? `${index + 1} ${label}` : label
}

function converterTerminals(terminals: string[]) {
  if (terminals.length === 2) {
    return {
      inputPositive: terminals[0],
      inputNegative: terminals[1],
      frameGround: undefined,
      outputNegative: terminals.find((terminal) => terminal.includes('-')) ?? terminals[1],
      outputPositive: terminals.find((terminal) => terminal.includes('+')) ?? terminals[0],
    }
  }
  const frameIndex = terminals.findIndex((terminal) => terminal === 'FG' || terminal === 'PE')
  const outputNegative = terminals.map((terminal, index) => ({ terminal, index }))
    .filter(({ terminal, index }) => index > 1 && terminal.includes('-') && index !== frameIndex)
  const outputPositive = terminals.map((terminal, index) => ({ terminal, index }))
    .filter(({ terminal, index }) => index > 1 && terminal.includes('+'))
  const grouped = (matches: Array<{ terminal: string; index: number }>, fallbackIndex: number) => matches.length > 0
    ? terminals.length > 4
      ? `${matches.map(({ index }) => index + 1).join('-')} ${matches[0].terminal}`
      : matches[0].terminal
    : numberedTerminal(terminals, fallbackIndex)
  return {
    inputPositive: numberedTerminal(terminals, 0),
    inputNegative: numberedTerminal(terminals, 1),
    frameGround: frameIndex >= 0 ? numberedTerminal(terminals, frameIndex) : undefined,
    outputNegative: grouped(outputNegative, Math.max(2, terminals.length - 1)),
    outputPositive: grouped(outputPositive, Math.max(2, terminals.length - 2)),
  }
}

export function rowsToCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function buildConnectionRows(
  items: HardwareManifestItem[],
  plan: ElectricalPlanSummary,
  exactBoard?: PhysicalBoardProfile,
): BuildConnectionRow[] {
  const rows: BuildConnectionRow[] = []
  const controller = exactBoard?.label ?? 'Controller'
  const outputs = items.filter((item) => item.kind === 'matrix-output')
  const nonOutputs = items.filter((item) => item.kind !== 'matrix-output')
  const boardTerminal = (pin: HardwarePinUse) => boardPinLabelForUse(exactBoard, pin)
  const includedOutputIds = new Set(outputs.map((output) => output.id))
  const includedPlanOutputs = plan.outputs.filter((output) => includedOutputIds.has(output.itemId))
  const logicSupplyId = includedPlanOutputs.flatMap((output) => output.injections)
    .find((injection) => injection.supplyId)?.supplyId ?? 'supply-1'
  const logicDistribution = `${supplyLabelFor(plan, logicSupplyId)} fuse-block distribution`

  const battery = plan.battery
  if (battery && items.some((item) => item.id === battery.packItemId)) {
    const packLabel = items.find((item) => item.id === battery.packItemId)?.title ?? 'Battery pack'
    const mainFuse = `Battery ${battery.mainFuse.ratingMa ? formatAmps(battery.mainFuse.ratingMa) : 'rated'} main fuse`
    const protection = battery.protection
    rows.push({ from: packLabel, fromTerminal: 'B+', to: mainFuse, toTerminal: 'Input', purpose: 'Battery positive; fuse as close to cells as holder allows' })
    rows.push({ from: mainFuse, fromTerminal: 'Output', to: '+BATT bus', toTerminal: '+BATT', purpose: 'Protected battery trunk' })
    if (protection) {
      const terminals = protection.spec.protection!.powerTerminals
      rows.push({ from: packLabel, fromTerminal: 'B-', to: protection.label, toTerminal: terminals.find((terminal) => terminal === 'B-') ?? 'B-', purpose: 'Only protection board and B0 sense lead touch cell negative' })
      rows.push({ from: protection.label, fromTerminal: terminals.find((terminal) => terminal === 'P-') ?? 'P-', to: 'Common ground bus', toTerminal: 'GND', purpose: 'Protected negative; one system 0 V net' })
    }
    for (const module of battery.modules) {
      const spec = module.spec
      if (spec.balance) {
        rows.push({ from: packLabel, fromTerminal: `B0-B${battery.pack.series}`, to: module.label, toTerminal: spec.balance.balanceTerminals.join(', '), purpose: 'Balance taps in printed order; meter-check before plugging in harness' })
      }
      if (spec.charger) {
        const chargerFuseRatingMa = standardFuseRatingFor(spec.charger.maxChargeMa)
        const chargerFuse = `${module.label} ${chargerFuseRatingMa ? formatAmps(chargerFuseRatingMa) : 'rated'} charger branch fuse`
        rows.push({ from: '+BATT bus', fromTerminal: '+BATT', to: chargerFuse, toTerminal: 'Input', purpose: 'DC-rated charger branch protection' })
        rows.push({ from: chargerFuse, fromTerminal: 'Output', to: module.label, toTerminal: spec.charger.batteryTerminals[0], purpose: 'Protected charge positive' })
        rows.push({ from: 'Common ground bus', fromTerminal: 'GND / P-', to: module.label, toTerminal: spec.charger.batteryTerminals[1], purpose: 'Protected charge return; never connect charger negative to B-' })
      }
    }
  }

  const supply = plan.controllerSupply
  if (supply && items.some((item) => item.id === supply.itemId)) {
    const source = planSourceLabel(supply.source)
    const terminals = converterTerminals(supply.terminals)
    const fuse = `${supply.label} ${supply.inputFuse.ratingMa ? formatAmps(supply.inputFuse.ratingMa) : 'rated'} input fuse`
    const wire = supply.inputConductor ? `AWG ${supply.inputConductor.awg} copper` : 'rated copper'
    rows.push({ from: source, fromTerminal: supply.source.kind === 'battery' ? '+BATT' : '+', to: fuse, toTerminal: 'Input', purpose: `Converter input positive, fused at the source; ${wire}` })
    rows.push({ from: fuse, fromTerminal: 'Output', to: supply.label, toTerminal: terminals.inputPositive, purpose: `Converter input positive; ${wire}` })
    rows.push({ from: source, fromTerminal: supply.source.kind === 'battery' ? 'P- / GND' : '-', to: supply.label, toTerminal: terminals.inputNegative, purpose: `Converter input negative; ${wire}` })
    rows.push({ from: supply.label, fromTerminal: terminals.outputPositive, to: controller, toTerminal: supply.powerInPinLabel ?? '5 V input', purpose: `Controller power at ${supply.outputVoltage} V; set the converter's output before connecting` })
    rows.push({ from: supply.label, fromTerminal: terminals.outputNegative, to: 'Common ground bus', toTerminal: 'GND', purpose: 'Converter negative; joins the controller and LED grounds' })
  } else if (battery?.output?.spec.output) {
    const output = battery.output.spec.output
    rows.push({ from: battery.output.label, fromTerminal: output.terminals.find((terminal) => terminal.includes('+')) ?? '5V+', to: controller, toTerminal: exactBoard?.pins?.find((pin) => pin.role === 'power-in')?.label ?? '5 V input', purpose: 'Controller power from integrated pack output' })
    rows.push({ from: battery.output.label, fromTerminal: output.terminals.find((terminal) => terminal.includes('-')) ?? '5V-', to: 'Common ground bus', toTerminal: 'GND', purpose: 'Controller and LED common negative' })
  } else if (exactBoard?.hasUsb === false) {
    const input = exactBoard.pins?.find((pin) => pin.role === 'power-in')?.label ?? '5 V input'
    rows.push({ from: 'Regulated 5 V supply', fromTerminal: '+5V', to: controller, toTerminal: input, purpose: 'Controller power only; the board has no USB' })
  } else {
    rows.push({ from: 'USB-C power source', fromTerminal: 'USB-C', to: controller, toTerminal: 'USB-C power', purpose: 'Controller power only' })
  }

  for (const item of nonOutputs) {
    // Power-path parts are wired by the power rows below. A controller ground
    // row to one would put the controller's GND on a converter's or BMS's
    // terminal by name, which is not where it joins.
    if (POWER_PATH_KINDS.has(item.kind)) continue
    for (const pin of item.pins) {
      rows.push({
        from: controller,
        fromTerminal: boardTerminal(pin),
        to: item.title,
        toTerminal: pin.label,
        purpose: 'Signal',
      })
    }
    if (item.kind === 'mic-input' || item.kind === 'pot-input' || item.kind === 'rtc-input') {
      rows.push({ from: controller, fromTerminal: '3V3', to: item.title, toTerminal: item.kind === 'mic-input' ? 'VDD' : '3V3', purpose: 'Logic power' })
    } else if (item.kind === 'amplifier' && item.facts.stage === 'power') {
      // A power amplifier's supply is read off the terminal it prints. A 12 V
      // board is powered from its own supply: the controller has no 12 V to
      // give it, and a row naming the controller would say it did.
      const pads = partById(String(item.facts.partId ?? ''))?.pinLabelsLeftToRight ?? []
      rows.push(pads.includes('+12V')
        ? { from: 'Amplifier 12 V supply', fromTerminal: '+12V', to: item.title, toTerminal: '+12V', purpose: 'Amplifier power — not from the controller' }
        : { from: controller, fromTerminal: '5V / VIN', to: item.title, toTerminal: '+5V', purpose: 'Module power' })
      // Fed by a DAC, the amplifier's only signal is the DAC's line out. It
      // has no GPIO row, so without this the table would show it unconnected.
      if ((item.facts.feed === 'dac' || item.facts.feed === 'dfPlayer') && item.facts.fedBy) {
        rows.push({ from: String(item.facts.fedBy), fromTerminal: 'Line out (L/R)', to: item.title, toTerminal: 'Line in (L/R)', purpose: 'Line-level audio' })
      }
    } else if (item.kind === 'amplifier' && item.facts.stage === 'player') {
      // The module prints VCC, not VIN. 5 V is the recommended supply.
      rows.push({
        from: controller,
        fromTerminal: '5V / VIN',
        to: item.title,
        toTerminal: 'VCC',
        purpose: 'Module power, 3.2–5 V; 5 V recommended',
      })
    } else if (item.kind === 'amplifier' || item.kind === 'line-input') {
      // A class-D amp's output power is its supply power, so 3.3 V here reads
      // as a weak speaker rather than as a wiring mistake.
      rows.push({
        from: controller,
        fromTerminal: '5V / VIN',
        to: item.title,
        toTerminal: item.kind === 'line-input' ? '5V' : 'VIN',
        purpose: 'Module power',
      })
    } else if (item.kind === 'sd-card') {
      const supplyVoltage = Number(item.facts.supplyVoltage ?? 5)
      rows.push({
        from: controller,
        fromTerminal: supplyVoltage === 3.3 ? '3V3' : '5V / VIN',
        to: item.title,
        toTerminal: supplyVoltage === 3.3 ? '3V3' : 'VCC',
        purpose: 'Module power',
      })
    }
    rows.push({ from: controller, fromTerminal: 'GND', to: item.title, toTerminal: 'GND', purpose: 'Common ground reference' })
    // A two-board part is wired from the controller to its left board; the
    // right board joins those same lines, or it never hears the bus.
    for (const pad of sharedPadsAcrossBoards(String(item.facts.partId ?? ''))) {
      rows.push({ from: item.title, fromTerminal: `L:${pad}`, to: item.title, toTerminal: `R:${pad}`, purpose: 'Right board shares this line' })
    }
  }

  outputs.forEach((item, outputIndex) => {
    const pin = item.pins[0]
    if (!pin) return
    const outputPlan = includedPlanOutputs.find((output) => output.itemId === item.id)
    const chip = Math.floor(outputIndex / 4) + 1
    const channel = (outputIndex % 4) + 1
    const shifter = `74AHCT125 level shifter ${chip}`
    const resistor = `${item.title} 330 ohm data resistor`
    const extenderPartId = typeof item.facts.dataLinkPartId === 'string' ? item.facts.dataLinkPartId : ''
    const extenderLabel = extenderPartId ? (partById(extenderPartId)?.label ?? 'Pixel Data Extender TX/RX pair') : ''
    rows.push({ from: controller, fromTerminal: boardTerminal(pin), to: shifter, toTerminal: `A${channel}`, purpose: '3.3 V LED data' })
    rows.push({ from: shifter, fromTerminal: `Y${channel}`, to: resistor, toTerminal: 'Input', purpose: '5 V conditioned LED data' })
    if (extenderPartId) {
      rows.push({ from: resistor, fromTerminal: 'Output', to: `${item.title} ${extenderLabel} TX`, toTerminal: 'DATA', purpose: 'Series-protected pixel data into transmitter' })
      rows.push({ from: `${item.title} ${extenderLabel} TX`, fromTerminal: 'A', to: `${item.title} ${extenderLabel} RX`, toTerminal: 'A', purpose: 'Twisted differential conductor A' })
      rows.push({ from: `${item.title} ${extenderLabel} TX`, fromTerminal: 'B', to: `${item.title} ${extenderLabel} RX`, toTerminal: 'B', purpose: 'Twisted differential conductor B' })
      rows.push({ from: `${item.title} ${extenderLabel} TX`, fromTerminal: 'GND', to: `${item.title} ${extenderLabel} RX`, toTerminal: 'GND', purpose: 'Twisted common-reference conductor; bond grounds even with separate supplies' })
      rows.push({ from: logicDistribution, fromTerminal: '+5V bus', to: `${item.title} ${extenderLabel} TX`, toTerminal: '+', purpose: 'Transmitter power' })
      rows.push({ from: `${item.title} LED-side 5 V distribution`, fromTerminal: '+5V', to: `${item.title} ${extenderLabel} RX`, toTerminal: '+', purpose: 'Receiver power; do not join separate supply positive outputs' })
      rows.push({
        from: `${item.title} ${extenderLabel} RX`, fromTerminal: 'DATA', to: item.title, toTerminal: 'DIN',
        purpose: outputPlan?.operatingCurrentCapMa != null
          ? `Recovered 5 V pixel data; configured FastLED current limit ${outputPlan.operatingCurrentCapMa} mA`
          : 'Recovered 5 V pixel data',
      })
    } else {
      rows.push({
        from: resistor,
        fromTerminal: 'Output',
        to: item.title,
        toTerminal: 'DIN',
        purpose: outputPlan?.operatingCurrentCapMa != null
          ? `Series-protected LED data; configured FastLED current limit ${outputPlan.operatingCurrentCapMa} mA`
          : 'Series-protected LED data',
      })
    }
    rows.push({ from: shifter, fromTerminal: `/OE${channel}`, to: 'Common ground bus', toTerminal: 'GND', purpose: 'Enable level-shifter channel' })
  })
  if (outputs.length > 0) {
    rows.push({ from: controller, fromTerminal: 'GND', to: 'Common ground bus', toTerminal: 'GND', purpose: 'Common ground reference' })
    for (let chip = 1; chip <= Math.ceil(outputs.length / 4); chip += 1) {
      rows.push({ from: logicDistribution, fromTerminal: '+5V bus', to: `74AHCT125 level shifter ${chip}`, toTerminal: 'VCC', purpose: 'Level-shifter power' })
      rows.push({ from: 'Common ground bus', fromTerminal: 'GND', to: `74AHCT125 level shifter ${chip}`, toTerminal: 'GND', purpose: 'Level-shifter ground' })
    }
  }

  const includedInjections = includedPlanOutputs.flatMap((output) => output.injections)
  const includedInjectionIds = new Set(includedInjections.map((injection) => injection.id))
  for (const supply of plan.totals?.supplies ?? []) {
    const supplyInjections = includedInjections.filter((injection) =>
      injection.supplyId === supply.id && includedInjectionIds.has(injection.id))
    if (supplyInjections.length === 0) continue
    const supplyLabel = supplyLabelFor(plan, supply.id)
    const distribution = `${supplyLabel} fuse-block distribution`
    const mainFuse = `${supplyLabel} ${supply.trunk.mainFuse.ratingMa ? formatAmps(supply.trunk.mainFuse.ratingMa) : 'rated'} main fuse`
    const trunkWire = supply.trunk.conductor ? `AWG ${supply.trunk.conductor.awg}` : 'rated'
    if (supply.converter) {
      const converter = supply.converter
      const source = planSourceLabel(converter.source)
      const terminals = converterTerminals(converter.terminals)
      const inputFuse = `${supplyLabel} ${converter.inputFuse.ratingMa ? formatAmps(converter.inputFuse.ratingMa) : 'rated'} input fuse`
      const inputWire = converter.inputConductor ? `AWG ${converter.inputConductor.awg}` : 'rated'
      if (!converter.integrated) {
        rows.push({ from: source, fromTerminal: converter.source.kind === 'battery' ? '+BATT' : '+', to: inputFuse, toTerminal: 'Input', purpose: `Converter input positive, fused at the source; ${inputWire} copper` })
        rows.push({ from: inputFuse, fromTerminal: 'Output', to: supplyLabel, toTerminal: terminals.inputPositive, purpose: `Converter input positive; ${inputWire} copper` })
        rows.push({ from: converter.source.kind === 'battery' ? 'Common ground bus' : source, fromTerminal: converter.source.kind === 'battery' ? 'GND / P-' : '-', to: supplyLabel, toTerminal: terminals.inputNegative, purpose: `Converter input negative; ${inputWire} copper` })
      }
      if (converter.isolated && terminals.frameGround) rows.push({ from: 'Protective earth / metal enclosure', fromTerminal: 'PE', to: supplyLabel, toTerminal: terminals.frameGround, purpose: converter.source.kind === 'battery' ? 'Converter case bond; battery has no protective earth' : 'Converter case protective-earth bond' })
      rows.push({ from: supplyLabel, fromTerminal: terminals.outputNegative, to: distribution, toTerminal: 'Common negative bus', purpose: converter.isolated ? 'Isolated output return; bond to common ground at this distribution point' : 'Common-negative converter return' })
    }
    rows.push({ from: supplyLabel, fromTerminal: supply.converter ? converterTerminals(supply.converter.terminals).outputPositive : '+5V', to: mainFuse, toTerminal: 'Input', purpose: `DC supply positive; fuse at the supply terminal, ${trunkWire} copper` })
    rows.push({ from: mainFuse, fromTerminal: 'Output', to: distribution, toTerminal: 'Positive input stud', purpose: `Protected ${trunkWire} trunk, ${supply.trunk.oneWayLengthMm} mm` })
    if (!supply.converter) {
      rows.push({ from: supplyLabel, fromTerminal: 'GND', to: distribution, toTerminal: 'Common negative bus', purpose: `DC supply return, ${trunkWire} copper` })
    }
    for (const injection of supplyInjections) {
      const destination = `${injection.outputTitle} ${injection.role} injection @ ${injection.positionMm} mm`
      const fuse = `${destination} ${injection.fuse.ratingMa ?? 'rated'} mA branch fuse`
      const capacitor = `${destination} 1000 uF 6.3 V electrolytic capacitor`
      rows.push({ from: distribution, fromTerminal: '+5V bus', to: fuse, toTerminal: 'Input', purpose: `${injection.designCurrentMa} mA protected branch` })
      rows.push({ from: fuse, fromTerminal: 'Output', to: capacitor, toTerminal: '+', purpose: 'Fused capacitor positive' })
      rows.push({ from: distribution, fromTerminal: 'Common negative bus', to: capacitor, toTerminal: '-', purpose: 'Capacitor negative and branch return' })
      rows.push({ from: capacitor, fromTerminal: '+', to: destination, toTerminal: '+5V', purpose: `Power injection via ${injection.conductor ? `AWG ${injection.conductor.awg}` : 'rated'} copper pair` })
      rows.push({ from: capacitor, fromTerminal: '-', to: destination, toTerminal: 'GND', purpose: 'Power-injection return' })
    }
  }
  const includedSupplyIds = [...new Set(includedInjections.map((injection) => injection.supplyId).filter(Boolean))]
  for (const supplyId of includedSupplyIds.slice(1)) {
    const converter = plan.totals?.supplies.find((supply) => supply.id === supplyId)?.converter
    rows.push({ from: supplyLabelFor(plan, String(supplyId)), fromTerminal: converter ? converterTerminals(converter.terminals).outputNegative : 'GND', to: 'Common ground bus', toTerminal: 'GND', purpose: 'Shared data-reference ground; keep +5 V zones isolated' })
  }
  return rows
}

export function buildBomRows(
  manifest: HardwareManifest,
  plan: ElectricalPlanSummary,
  _buildProfile: BuildProfile,
  exactBoard?: PhysicalBoardProfile,
  includedItemIds?: Set<string>,
): BuildBomRow[] {
  const include = (item: HardwareManifestItem) => !includedItemIds || includedItemIds.has(item.id)
  const items = manifest.primaryItems.filter(include)
  const rows: BuildBomRow[] = []
  const outputPlanByItemId = new Map(plan.outputs.map((output) => [output.itemId, output]))
  if (exactBoard) rows.push({ quantity: '1', item: exactBoard.label, specification: boardDataProvenance(exactBoard), status: 'configured' })
  for (const item of items) {
    if (item.kind === 'battery-pack') continue
    if (item.kind === 'power-converter' && item.facts.role === 'led-rail') continue
    const outputPlan = outputPlanByItemId.get(item.id)
    const limit = outputPlan?.operatingCurrentCapMa != null
      ? `; configured FastLED current limit ${formatAmps(outputPlan.operatingCurrentCapMa)}; uncapped full-white ceiling ${formatAmps(outputPlan.designCurrentMa)}`
      : ''
    rows.push({ quantity: '1', item: item.title, specification: `${item.subtitle}${limit}`, status: 'configured' })
  }
  if (plan.battery && items.some((item) => item.id === plan.battery!.packItemId)) {
    const battery = plan.battery
    rows.push({ quantity: String(battery.pack.cellCount), item: battery.pack.label, specification: `${battery.pack.series}S${battery.pack.parallel}P matched pack; ${battery.pack.nominalV} V nominal, ${battery.pack.capacityAh} Ah, ${battery.pack.energyWh} Wh`, status: 'configured' })
    rows.push({ quantity: '1', item: 'Battery main fuse and insulated holder', specification: battery.mainFuse.ratingMa ? `${formatAmps(battery.mainFuse.ratingMa)} DC-rated; limited by ${battery.limitedBy}` : battery.mainFuse.unresolvedReason ?? 'Unresolved battery main fuse', status: battery.mainFuse.ratingMa ? 'calculated' : 'unresolved' })
    rows.push({ quantity: '3 runs', item: 'Battery pack conductors', specification: battery.trunkConductor ? `AWG ${battery.trunkConductor.awg} copper minimum for B+, +BATT and P-` : 'Unresolved battery conductor size', status: battery.trunkConductor ? 'calculated' : 'unresolved' })
    if (battery.charger) {
      const chargeCurrentMa = battery.charger.spec.charger!.maxChargeMa
      const chargerFuseRatingMa = standardFuseRatingFor(chargeCurrentMa)
      rows.push({ quantity: '1', item: 'Charger branch fuse and holder', specification: chargerFuseRatingMa ? `${formatAmps(chargerFuseRatingMa)} DC-rated for ${formatAmps(chargeCurrentMa)} maximum charge current at 75% loading` : `Unresolved for ${formatAmps(chargeCurrentMa)} maximum charge current`, status: chargerFuseRatingMa ? 'calculated' : 'unresolved' })
      rows.push({ quantity: '2 runs', item: 'Charger branch conductors', specification: 'From +BATT and P-; never from B-', status: 'calculated' })
      if (battery.charger.spec.charger!.inputProtocols.includes('USB-C')) rows.push({ quantity: '1', item: 'USB-C PD charger and cable', specification: `${battery.charger.spec.charger!.inputMaxW} W minimum${battery.charger.spec.charger!.inputMaxW >= 100 ? '; 5 A e-marked cable' : ''}`, status: 'configured' })
    }
    if (battery.balance) rows.push({ quantity: '1', item: "Board's own balance harness", specification: `Connect ${battery.balance.spec.balance!.balanceTerminals.join(', ')} in the board's printed order`, status: 'configured' })
  }
  const supply = plan.controllerSupply
  if (supply && items.some((item) => item.id === supply.itemId)) {
    rows.push({
      quantity: '1',
      item: `${supply.label} input fuse and inline holder`,
      specification: supply.inputFuse.ratingMa
        ? `${formatAmps(supply.inputFuse.ratingMa)} DC-rated blade or glass fuse at the ${planSourceLabel(supply.source)}; carries the converter's full rated input of ${formatAmps(supply.inputCurrentMa)} at 75% loading`
        : supply.inputFuse.unresolvedReason ?? 'Unresolved input fuse rating',
      status: supply.inputFuse.ratingMa ? 'calculated' : 'unresolved',
    })
    rows.push({
      quantity: '2 runs',
      item: `${supply.label} input conductors (+ and -)`,
      specification: supply.inputConductor
        ? `AWG ${supply.inputConductor.awg} / ${supply.inputConductor.crossSectionMm2} mm2 ${supply.inputConductor.material} minimum from the ${planSourceLabel(supply.source)}`
        : 'Unresolved input conductor size',
      status: supply.inputConductor ? 'calculated' : 'unresolved',
    })
  }
  const outputs = plan.outputs.filter((output) => items.some((item) => item.id === output.itemId))
  if (outputs.length > 0) {
    rows.push({ quantity: String(Math.ceil(outputs.length / 4)), item: '74AHCT125 level shifter', specification: '5 V supply, TTL-compatible input; one channel per LED data route', status: 'calculated' })
    rows.push({ quantity: String(outputs.length), item: 'Data-line resistor', specification: '330 ohm at each LED data entry', status: 'calculated' })
    const extended = items.filter((item) => typeof item.facts.dataLinkPartId === 'string')
    if (extended.length > 0) {
      rows.push({ quantity: String(extended.length), item: 'NLED Pixel Data Extender TX/RX pair', specification: 'Matched one-wire transmitter and receiver; power both ends from 3.3-12 V', status: 'configured' })
      rows.push({ quantity: `${extended.length} run${extended.length === 1 ? '' : 's'}`, item: 'Differential pixel-data cable', specification: 'Three twisted conductors: A, B and common ground; maximum 1000 ft / 304.8 m per manufacturer', status: 'configured' })
    }
  }
  if (plan.totals && outputs.length > 0) {
    const outputIds = new Set(outputs.map((output) => output.itemId))
    const includedInjectionIds = new Set(outputs.flatMap((output) => output.injections.map((injection) => injection.id)))
    const supplies = plan.totals.supplies.filter((supply) => supply.outputIds.some((id) => outputIds.has(id))
      && supply.injectionIds.some((id) => includedInjectionIds.has(id)))
    if (plan.totals.source && supplies.some((supply) => supply.converter)) {
      rows.push({
        quantity: '1',
        item: `Recommended ${plan.totals.source.voltage} V DC source`,
        specification: `${formatAmps(plan.totals.source.recommendedCurrentMa)}, ${plan.totals.source.recommendedWattage} W continuous for the converter inputs${plan.controllerSupply ? ' and controller buck' : ''}`,
        status: 'calculated',
      })
    }
    for (const supply of supplies) {
      const sizingBasis = `derived from the ${formatAmps(supply.designCurrentMa)} full-white load with ${plan.totals.headroomPercent}% target headroom; a FastLED current limit does not reduce it`
      if (supply.converter) {
        const converter = supply.converter
        if (!converter.integrated) rows.push({
          quantity: '1',
          item: converter.label,
          specification: `${planSourceVoltageLabel(converter.source)} in, ${converter.outputVoltage} V out; ${formatAmps(converter.deratedCurrentMa)} continuous at 40 C (${formatAmps(converter.ratedCurrentMa)} nameplate); ${sizingBasis}`,
          status: 'configured',
        })
        if (!converter.integrated) rows.push({
          quantity: '1',
          item: `${supplyLabelFor(plan, supply.id)} input fuse and holder`,
          specification: converter.inputFuse.ratingMa
            ? `${formatAmps(converter.inputFuse.ratingMa)} DC-rated fuse at the ${converter.sourceVoltage} V source; planned converter input ${formatAmps(converter.inputCurrentMa)}`
            : converter.inputFuse.unresolvedReason ?? 'Unresolved converter input fuse rating',
          status: converter.inputFuse.ratingMa ? 'calculated' : 'unresolved',
        })
        if (!converter.integrated) rows.push({
          quantity: '2 runs',
          item: `${supplyLabelFor(plan, supply.id)} input conductors (+ and -)`,
          specification: converter.inputConductor
            ? `AWG ${converter.inputConductor.awg} / ${converter.inputConductor.crossSectionMm2} mm2 ${converter.inputConductor.material} minimum from the ${converter.sourceVoltage} V source`
            : 'Unresolved converter input conductor size',
          status: converter.inputConductor ? 'calculated' : 'unresolved',
        })
      } else {
        rows.push({ quantity: '1', item: `Recommended 5 V DC power supply ${supplyNumber(supply.id)}`, specification: `5 V, ${formatAmps(supply.recommendedCurrentMa)}, ${supply.recommendedWattage} W continuous; ${sizingBasis}`, status: 'calculated' })
      }
      const zone = supply.id.replace('supply-', '')
      const { mainFuse, conductor } = supply.trunk
      rows.push({
        quantity: '1',
        item: `${supply.converter ? `Converter zone ${zone}` : `PSU ${zone}`} main fuse and holder`,
        specification: mainFuse.ratingMa
          ? `${formatAmps(mainFuse.ratingMa)} DC-rated bolt-down fuse (MIDI/ANL class) in an insulated holder at the supply positive; carries ${formatAmps(supply.trunk.designCurrentMa)} at 75% loading`
          : mainFuse.unresolvedReason ?? 'Unresolved main fuse rating',
        status: mainFuse.ratingMa ? 'calculated' : 'unresolved',
      })
      rows.push({
        quantity: '2 runs',
        item: `${supply.converter ? `Converter zone ${zone}` : `PSU ${zone}`} trunk conductors (+ and -)`,
        specification: conductor
          ? `AWG ${conductor.awg} / ${conductor.crossSectionMm2} mm2 ${conductor.material} minimum, ${supply.trunk.oneWayLengthMm} mm one-way, ring lugs rated for the cable; ${conductor.voltageDrop} V calculated drop`
          : 'Unresolved trunk conductor size',
        status: conductor ? 'calculated' : 'unresolved',
      })
      const feedCount = supply.injectionIds.filter((id) => includedInjectionIds.has(id)).length
      for (const [blockIndex, block] of fuseBlockAllocations(feedCount).entries()) {
        rows.push({
          quantity: '1',
          item: `${supply.id} fuse block ${blockIndex + 1}`,
          specification: `${block.circuitCount}-circuit fixed fuse block with common negative bus; ${block.assignedFeedCount} circuit${block.assignedFeedCount === 1 ? '' : 's'} used`,
          status: 'calculated',
        })
      }
    }
    rows.push({ quantity: String(includedInjectionIds.size), item: 'Power-output electrolytic capacitor', specification: '1000 uF, 6.3 V, good-quality low-ESR radial electrolytic; one correctly polarized across +5 V and GND after every branch fuse', status: 'calculated' })
  }
  for (const output of outputs) {
    for (const injection of output.injections) {
      const location = `${injection.role} @ ${injection.positionMm} mm`
      rows.push({ quantity: '1 run', item: `${output.title} ${location} feed conductor`, specification: injection.conductor ? `AWG ${injection.conductor.awg} / ${injection.conductor.crossSectionMm2} mm2 ${injection.conductor.material} minimum, ${injection.conductor.oneWayLengthMm} mm one-way, ${injection.conductor.voltageDrop} V calculated drop` : 'Unresolved conductor size', status: injection.conductor ? 'calculated' : 'unresolved' })
      rows.push({ quantity: '1', item: `${output.title} ${location} connector`, specification: injection.connectorMinimumMa ? `${injection.connectorMinimumMa} mA minimum continuous rating` : 'Unresolved connector rating', status: injection.connectorMinimumMa ? 'calculated' : 'unresolved' })
      rows.push({ quantity: '1', item: `${output.title} ${location} branch fuse`, specification: injection.fuse.ratingMa ? `${injection.fuse.ratingMa} mA` : injection.fuse.unresolvedReason ?? 'Unresolved fuse rating', status: injection.fuse.ratingMa ? 'calculated' : 'unresolved' })
    }
  }
  return rows
}

export function connectionsCsv(rows: BuildConnectionRow[], metadata?: BuildExportMetadata): string {
  const metadataHeaders = metadata ? ['Export status', 'Rule set'] : []
  return rowsToCsv(
    ['From', 'From terminal', 'To', 'To terminal', 'Purpose', ...metadataHeaders],
    rows.map((row) => [
      row.from,
      row.fromTerminal,
      row.to,
      row.toTerminal,
      row.purpose,
      ...(metadata ? [metadata.status, metadata.ruleSetVersion] : []),
    ]),
  )
}

export function bomCsv(rows: BuildBomRow[], metadata?: BuildExportMetadata): string {
  const metadataHeaders = metadata ? ['Export status', 'Rule set'] : []
  return rowsToCsv(
    ['Quantity', 'Item', 'Specification', 'Status', ...metadataHeaders],
    rows.map((row) => [
      row.quantity,
      row.item,
      row.specification,
      row.status,
      ...(metadata ? [metadata.status, metadata.ruleSetVersion] : []),
    ]),
  )
}

// Test-only catalogue entries for the generic sensor types. None of these is a
// real part: no bundled part carries a digital or analog sensor block yet, and
// inventing one would put an unverified size and render in the shipped
// catalogue. A test registers these into the live catalogue for its own run
// and removes them after, so nothing leaks into the next file.
import { PART_CATALOGUE, type PartCatalogueEntry } from '../../../build/parts/partCatalogue'

export const TEST_REED_ID = 'test-reed-switch'
export const TEST_HALL_ID = 'test-hall-module'
export const TEST_SOIL_ID = 'test-soil-probe'
export const TEST_FSR_ID = 'test-force-pad'

const reed: PartCatalogueEntry = {
  partId: TEST_REED_ID,
  label: 'Test reed switch',
  dimensionsMm: { width: 20, height: 10 },
  digitalSensor: {
    activeLevel: 'low', pullUp: 'internal', debounceMs: 20, activeLabel: 'Magnet near', idleLabel: 'Magnet away',
  },
}

const hall: PartCatalogueEntry = {
  partId: TEST_HALL_ID,
  label: 'Test Hall module',
  dimensionsMm: { width: 30, height: 12 },
  digitalSensor: {
    activeLevel: 'high', pullUp: 'none', debounceMs: 0, supplyVolts: 5, activeLabel: 'Field present', idleLabel: 'No field',
  },
}

// Wetter soil pulls the probe's output down: a falling curve, 100 % at 1.2 V.
const soil: PartCatalogueEntry = {
  partId: TEST_SOIL_ID,
  label: 'Test soil probe',
  dimensionsMm: { width: 25, height: 90 },
  analogSensor: {
    unit: '%', supplyVolts: 3.3, adcRange: { minVolts: 0, maxVolts: 3.3 },
    curve: [{ volts: 1.2, value: 100 }, { volts: 2.8, value: 0 }],
    outputMin: 0, outputMax: 100, decimals: 0,
  },
}

// A bent curve: 0 to 5 N lightly, then a long soft tail.
const fsr: PartCatalogueEntry = {
  partId: TEST_FSR_ID,
  label: 'Test force pad',
  dimensionsMm: { width: 18, height: 18 },
  analogSensor: {
    unit: 'N', supplyVolts: 3.3, adcRange: { minVolts: 0, maxVolts: 3.3 },
    curve: [{ volts: 0.3, value: 0 }, { volts: 1.3, value: 5 }, { volts: 3.0, value: 20 }],
    outputMin: 0, outputMax: 20,
  },
}

const FIXTURES = [reed, hall, soil, fsr]

export function registerSensorFixtures(): void {
  for (const entry of FIXTURES) PART_CATALOGUE[entry.partId] = entry
}

export function unregisterSensorFixtures(): void {
  for (const entry of FIXTURES) delete PART_CATALOGUE[entry.partId]
}

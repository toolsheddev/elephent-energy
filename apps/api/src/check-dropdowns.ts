/* Compares the app's fixed dropdown lists with the Retool page export (legacy/page-logic/_page-decoded.json): same values, same labels, same order.
   Run: npm run check:dropdowns -w @sd/api. Skips with a message when the export is not on disk (it is git-ignored). */
import { existsSync, readFileSync } from 'node:fs'
import * as O from '@sd/domain/options'
import { REQUEST_KINDS } from '@sd/domain/bayou'

const file = new URL('../../../legacy/page-logic/_page-decoded.json', import.meta.url)
if (!existsSync(file)) { console.log('Retool export not found, nothing to compare.'); process.exit(0) }
const P = JSON.parse(readFileSync(file, 'utf8')).page.v.plugins as Record<string, { v: { template?: Record<string, unknown> } & Record<string, unknown> }>

type Item = { value: string; label: string }
const norm = (list: readonly unknown[]): Item[] => list.map((x) => {
  if (typeof x === 'string' || typeof x === 'number') return { value: String(x), label: String(x) }
  const o = x as { value: unknown; label?: unknown }
  return { value: String(o.value), label: String(o.label ?? o.value) }
})
function retool(key: string): Item[] {
  const t = (P[key]!.v.template ?? P[key]!.v) as { _values?: unknown[]; _labels?: unknown[]; data?: string }
  if (Array.isArray(t._values) && t._values.length) return t._values.map((v, i) => ({ value: String(v), label: (t._labels?.[i] ? String(t._labels[i]) : '') || String(v) }))
  // lists written inline in the data field, e.g. [ "Attic", ... ] or [ { "label": ..., "value": ... } ]
  return norm(JSON.parse(String(t.data)))
}
/** Retool's cascaders store every node; only the leaves are selectable values. Compare the leaf values. */
function cascaderLeaves(key: string): string[] {
  const vals = ((P[key]!.v.template ?? P[key]!.v) as { _values: string[] })._values
  return vals.filter((v) => !vals.some((o) => o !== v && o.startsWith(v + '-')) && /-/.test(v) || v === 'none').sort()
}

const pairs: [string, string, readonly unknown[]][] = [
  ['Source', 'SOURCES', O.SOURCES], ['sourceDetail', 'SOURCE_DETAILS', O.SOURCE_DETAILS], ['select2', 'MAINTENANCE_INTEREST', O.MAINTENANCE_INTEREST],
  ['Systems', 'SYSTEMS_INTEREST (labels)', O.SYSTEMS_INTEREST], ['HomeType', 'HOME_TYPES', O.HOME_TYPES], ['homeFeatures', 'HOME_FEATURES', O.HOME_FEATURES],
  ['specialConsiderations', 'SPECIAL_CONSIDERATIONS', O.SPECIAL_CONSIDERATIONS], ['checkboxGroup2', 'EXISTING_OTHER', O.EXISTING_OTHER],
  ['incomeVerification', 'INCOME_VERIFICATION', O.INCOME_VERIFICATION], ['financing', 'FINANCING_OPTIONS', O.FINANCING_OPTIONS], ['lender', 'LENDERS', O.LENDERS],
  ['MAEnergyAudit', 'MA_AUDIT', O.MA_AUDIT], ['MARecsQ', 'MA_RECS', O.MA_RECS], ['MACoC', 'MA_COC', O.MA_COC], ['heatLoanStatus', 'MA_HEAT_LOAN', O.MA_HEAT_LOAN],
  ['wholeHomeVerification', 'MA_WHV', O.MA_WHV], ['COefficiency', 'CO_EFFICIENCY', O.CO_EFFICIENCY], ['HEARAmount', 'HEAR_AMOUNTS', O.HEAR_AMOUNTS],
  ['PricingStructure', 'PRICING_STRUCTURES', O.PRICING_STRUCTURES], ['PricingStructure3', 'PRICING_STRUCTURES_QUICK_ADD', O.PRICING_STRUCTURES_QUICK_ADD],
  ['costSystemType', 'SYSTEM_TYPES', O.SYSTEM_TYPES], ['massRebateType', 'MA_REBATE_TYPES', O.MA_REBATE_TYPES], ['heatingLoadCoverage', 'HEATING_LOAD_COVERAGE', O.HEATING_LOAD_COVERAGE],
  ['surgeProtectionSelection', 'SURGE_OPTIONS', O.SURGE_OPTIONS], ['quickAddSurge', 'SURGE_OPTIONS (base design)', O.SURGE_OPTIONS],
  ['AHULocationType3', 'EQUIPMENT_LOCATIONS (AHU)', O.EQUIPMENT_LOCATIONS], ['WHLocation4', 'EQUIPMENT_LOCATIONS (HPWH)', O.EQUIPMENT_LOCATIONS],
  ['CircuitLengthCondenser3', 'CIRCUIT_LENGTH_HP (condenser)', O.CIRCUIT_LENGTH_HP], ['CircuitLengthAHU3', 'CIRCUIT_LENGTH_HP (AHU)', O.CIRCUIT_LENGTH_HP],
  ['CircuitLengthHPWH3', 'CIRCUIT_LENGTH_HPWH', O.CIRCUIT_LENGTH_HPWH], ['PlugOrHardwiredEV3', 'EV_CONNECTION', O.EV_CONNECTION],
  ['laborWarrantyLength', 'LABOR_WARRANTY_HP', O.LABOR_WARRANTY_HP], ['laborWarrantyLength2', 'LABOR_WARRANTY_HPWH', O.LABOR_WARRANTY_HPWH],
  ['requester2', 'CO_PARTIES (requester)', O.CO_PARTIES], ['responsible2', 'CO_PARTIES (responsible)', O.CO_PARTIES],
  ['impact2', 'CO_IMPACT', O.CO_IMPACT], ['timeline2', 'CO_TIMELINE', O.CO_TIMELINE], ['select1', 'REQUEST_KINDS', REQUEST_KINDS],
]

// Known, deliberate differences
const NOTES: Record<string, string> = {
  SYSTEM_TYPES: 'Retool label "Energy Efficency" is a typo; corrected to "Energy Efficiency".',
  'SYSTEMS_INTEREST (labels)': 'Retool values are Salesforce product ids; the app stores the product names.',
}

let bad = 0
for (const [key, name, ours] of pairs) {
  let r = retool(key), o = norm(ours)
  if (name === 'SYSTEMS_INTEREST (labels)') { r = r.map((x) => ({ value: x.label, label: x.label })); }
  const same = (a: Item[], b: Item[], f: (i: Item) => string) => a.length === b.length && a.every((x, i) => f(x) === f(b[i]!))
  const vOk = same(r, o, (i) => i.value), lOk = same(r, o, (i) => i.label)
  const note = NOTES[name]
  if (vOk && (lOk || note)) { console.log(`ok    ${name.padEnd(32)} ${r.length} options${!lOk ? `  (${note})` : ''}`); continue }
  bad++
  console.log(`DIFF  ${name.padEnd(32)} retool ${key}`)
  console.log('        retool:', r.map((x) => x.value === x.label ? x.value : `${x.value}=${x.label}`).join(' | '))
  console.log('        app:   ', o.map((x) => x.value === x.label ? x.value : `${x.value}=${x.label}`).join(' | '))
}

// Existing-system cascaders: compare the selectable leaves
for (const [key, name, ours] of [['heatingDetails', 'HEATING_TYPES', O.HEATING_TYPES], ['coolingDetails', 'COOLING_TYPES', O.COOLING_TYPES], ['whDetails', 'WATER_HEATER_TYPES', O.WATER_HEATER_TYPES]] as const) {
  const r = cascaderLeaves(key), o = (ours as { value: string }[]).map((x) => x.value).sort()
  const missing = r.filter((v) => !o.includes(v)), extra = o.filter((v) => !r.includes(v))
  if (!missing.length && !extra.length) console.log(`ok    ${name.padEnd(32)} ${r.length} leaf values`)
  else { bad++; console.log(`DIFF  ${name.padEnd(32)} missing: ${missing.join(', ') || '-'}  extra: ${extra.join(', ') || '-'}`) }
}

// Move-in year: Retool offers 1900 through this year
const years = O.MOVE_IN_YEARS.map(Number)
const yOk = Math.min(...years) === 1900 && Math.max(...years) === new Date().getFullYear() && years.length === new Date().getFullYear() - 1899
console.log(`${yOk ? 'ok  ' : 'DIFF'}  ${'MOVE_IN_YEARS'.padEnd(32)} ${years.length} years (Retool: 1900 to ${new Date().getFullYear()})`)
if (!yOk) bad++

console.log(bad ? `\n${bad} list(s) differ from Retool.` : '\nAll fixed lists match Retool.')
process.exit(bad ? 1 : 0)

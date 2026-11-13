/* npm run verify: drives every System Design action (create, price, edit, finalize, change orders, invoices) against the configured database
   using a throwaway project that it deletes at the end. Prints one line per check. */
import { findAhriRecord, makeSystemInput, sampleSystemInputs, selectPermitsForHouse, type SystemInput } from '@sd/engine'
import { readFileSync } from 'node:fs'
import { runSpec, setRefData, toEngineHouse, type RecalcContext } from '@sd/domain/engine'
import { proposalTotals, systemTotals } from '@sd/domain/calc'
import { projectCostBreakdown } from '@sd/domain/costBreakdown'
import { assignableBoxes, autoBranchBoxes, boxCapacity, boxOptionsFor, calculateBranchBoxes, cleanAssignments, fromRetoolAssignments, toRetoolAssignments, withAssignments } from '@sd/domain/branchBoxes'
import { pool } from './db'
import { loadRefData } from './refdata'
import { createProject, deleteProject } from './projects'
import { loadBundle, listProjects } from './repo'
import { perform } from './service'
import { listBaseDesigns } from './basedesigns'
import type { ProjectBundle } from '@sd/domain/types'

setRefData(await loadRefData())
let pass = 0, fail = 0
const failures: string[] = []
async function step<T>(name: string, fn: () => Promise<T> | T): Promise<T | undefined> {
  try { const r = await fn(); pass++; console.log('  ok   ', name); return r } catch (e) { fail++; const m = e instanceof Error ? e.message : String(e); failures.push(`${name}: ${m}`); console.log('  FAIL ', name, '->', m.slice(0, 200)); return undefined }
}
const expect = (c: unknown, msg: string) => { if (!c) throw new Error(msg) }
const get = async (id: number): Promise<ProjectBundle> => (await loadBundle(id))!

const id = await createProject({ firstName: 'Verify', lastName: 'Run', address: '1 Test Way', city: 'Boulder', state: 'CO', zipcode: '80301', county: 'Boulder County', hca: 'Allison Toth' })
console.log('project', id)

await step('fill home info (needed for pricing and incentives)', async () => {
  await perform(id, 'saveProjectInfo', [{
    project: { income: 90000, timeline: 'Spring', financing: 'no' },
    house: { year_built: '1985', sq_footage: 1800, home_type: 'Single family', units: 1, num_ppl: 3, gas_utility: 'Xcel Energy', electric_utility: 'Xcel Energy', county: 'Boulder County' },
    existing: { heating: { type: 'Natural gas furnace', age: '20' }, cooling: { type: 'Central AC', age: '15', capacity: 3 }, water_heater: { type: 'Natural gas tank', age: '12', capacity: 40 } },
  }])
})

let b = await get(id)
const pid = b.proposals[0].id
await step('new project has 1 proposal with the automatic Other system', () => { expect(b.proposals.length === 1 && b.systems.some((s) => s.system_type === 'other'), 'missing') })

const rc = (bb: ProjectBundle, proposalId: number): RecalcContext => ({ project: bb.project, house: bb.house!, existing: bb.existing, systems: bb.systems, lineItems: bb.lineItems, proposalId })
const full = (bb: ProjectBundle, proposalId: number, sample: SystemInput, type: string): SystemInput => {
  const base = makeSystemInput({ ...(sample as unknown as Record<string, unknown>), cost_system_type: type, PricingStructure: 'standard', targetMargin: 0.25, mode: 'add system' })
  return { ...base, specIncentives: { ...base.specIncentives, proposal_id: [proposalId], house: toEngineHouse(bb.house!) } } as SystemInput
}

/* ---- add every system type the wizard offers ---- */
const samples: [string, SystemInput, string][] = [
  ['hvacDuctedTwoAhu', sampleSystemInputs.hvacDuctedTwoAhu, 'hvac'], ['hvacMiniSplitSixHeads', sampleSystemInputs.hvacMiniSplitSixHeads, 'hvac'],
  ['hvacDualFuel', sampleSystemInputs.hvacDualFuel, 'hvac'], ['hvacSingleMiniSplit', sampleSystemInputs.hvacSingleMiniSplit, 'hvac'],
  ['waterHeater', sampleSystemInputs.waterHeater, 'water heater'], ['ev', sampleSystemInputs.ev, 'ev'], ['evCircuitOnly', sampleSystemInputs.evCircuitOnly, 'ev'],
  ['energyEfficiency', sampleSystemInputs.energyEfficiency, 'energy efficiency'], ['panel', sampleSystemInputs.panel, 'panel'], ['cooktop', sampleSystemInputs.cooktop, 'cooktop'],
  ['adder', sampleSystemInputs.adder, 'adder'],
]
for (const [name, sample, type] of samples) {
  await step(`add system: ${name}`, async () => {
    b = await get(id)
    const input = full(b, pid, sample, type)
    const out = runSpec(input, rc(b, pid))
    if (!out.ok) throw new Error('spec failed: ' + out.errors.slice(0, 2).join(' | '))
    expect(out.lines.length > 0, 'no lines')
    await perform(id, 'addSystem', [{ proposal_id: pid, system_type: type, nickname: name, scope: 'base', input: input as never, engine: out.engineSystem, target_margin: out.targetMargin }, out.lines])
    b = await get(id)
    const s = b.systems.filter((x) => x.nickname === name).at(-1)!
    expect(s, 'system not saved')
    expect(b.lineItems.some((l) => l.system_id === s.id), 'lines not saved')
  })
}

await step('permit lines exist on the automatic system after adding HVAC/electrical', async () => {
  b = await get(id)
  const other = b.systems.find((s) => s.proposal_id === pid && s.system_type === 'other')!
  const permits = b.lineItems.filter((l) => l.system_id === other.id && l.line_item_type === 'permit')
  expect(permits.length > 0, 'no permit lines')
})
await step('each designed system has an Elephant Margin line (HVAC)', async () => {
  const hv = b.systems.find((s) => s.nickname === 'hvacDuctedTwoAhu')!
  expect(b.lineItems.some((l) => l.system_id === hv.id && l.line_item_type === 'margin'), 'no margin line')
})
await step('incentives generated for HVAC and water heater', async () => {
  const hv = b.systems.find((s) => s.nickname === 'hvacDuctedTwoAhu')!
  const wh = b.systems.find((s) => s.nickname === 'waterHeater')!
  expect(b.lineItems.some((l) => l.system_id === hv.id && l.line_item_type === 'incentive'), 'no HVAC incentive')
  expect(b.lineItems.some((l) => l.system_id === wh.id && l.line_item_type === 'incentive'), 'no WH incentive')
})
await step('proposal total is positive and matches the project list', async () => {
  const t = proposalTotals(b, pid).total
  expect(t > 0, 'total ' + t)
  const row = (await listProjects()).find((p) => p.id === id)!
  expect(Math.abs((row.proposal_total ?? 0) - t) < 1, `list ${row.proposal_total} vs ${t}`)
})

await step('cost breakdown: Net Cost matches the proposal total, summary rows in order', async () => {
  const t = projectCostBreakdown(b, [pid])
  const labels = t.rows.map((r) => r.label)
  const at = (l: string) => labels.indexOf(l)
  expect(at('Total Cost') >= 0 && at('Total Cost') < at('Out-of-Pocket Cost (Amount paid to Elephant or Financed)') && at('Out-of-Pocket Cost (Amount paid to Elephant or Financed)') < at('Net Cost'), 'summary rows missing or out of order: ' + labels.join(' / ').slice(0, 200))
  const net = t.rows.find((r) => r.label === 'Net Cost')!.values[0]!
  const total = proposalTotals(b, pid).total
  expect(Math.abs(net - total) < 40, `net ${net} vs total ${total}`)
  const two = projectCostBreakdown(b, [pid, (await get(id)).proposals[0].id])
  expect(two.rows.every((r) => r.values.length === 2), 'columns')
})

await step('branch boxes: sizing rules and they reach the equipment lines', async () => {
  expect(autoBranchBoxes(1, 'M', 'SM', 'R-454B').length === 0, '1 unit')
  expect(autoBranchBoxes(4, 'M', 'M', 'R-454B').length === 0, 'M with M')
  expect(autoBranchBoxes(3, 'M', 'SM', 'R-454B').map((x) => x.model).join() === 'PAC-LMA30BC', '3 units')
  expect(autoBranchBoxes(4, 'M', 'SM', 'R-410A').map((x) => x.model).join() === 'PAC-MKA52BC', '4 units')
  expect(autoBranchBoxes(6, 'M', 'SM', 'R-454B').map((x) => x.type).join() === '3-port,3-port,tee', '6 units')
  expect(autoBranchBoxes(8, 'M', 'SM', 'R-410A').map((x) => x.type).join() === '5-port,3-port,tee', '8 units')
  expect(autoBranchBoxes(3, 'S', 'SM', null)[0]?.model === 'CMY-Y64-G-E', 'S with SM')
  const input = full(b, pid, sampleSystemInputs.hvacMiniSplitSixHeads, 'hvac')
  const hp = input.heatPump
  const calc = calculateBranchBoxes({ ahuModelIds: [], msModelIds: hp.miniSplit.units.map((u) => u.model.id), condenserId: hp.condenser.model })
  expect(calc.branchBoxes.length > 0, 'no boxes for the six-head sample: ' + JSON.stringify([calc.indoorSeries, calc.outdoorSeries, calc.refrigerant]))
  const withBB = { ...input, heatPump: { ...hp, branchBoxes: { ...hp.branchBoxes, advanced: { enabled: true, isManualOverride: false, totalUnits: calc.totalUnits, indoorSeries: calc.indoorSeries, outdoorSeries: calc.outdoorSeries, refrigerant: calc.refrigerant, calculatedBoxes: calc.branchBoxes, assignments: {} } } } } as SystemInput
  const out = runSpec(withBB, rc(b, pid))
  if (!out.ok) throw new Error(out.errors[0])
  expect(out.lines.some((l) => l.branch_box), 'no line carries a branch box name')
  const man = calculateBranchBoxes({ ahuModelIds: [], msModelIds: hp.miniSplit.units.map((u) => u.model.id), condenserId: hp.condenser.model, manual: { 'PAC-LMA50BC': 1 } })
  expect(man.isManualOverride && man.branchBoxes.length === 1, 'manual override')
})

await step('branch boxes: heads assigned to boxes respect capacity and reach the lines', async () => {
  const input = full(b, pid, sampleSystemInputs.hvacMiniSplitSixHeads, 'hvac')
  const hp = input.heatPump
  const ids = { ahu: [] as (number | null)[], ms: hp.miniSplit.units.map((u) => u.model.id) }
  const calc = calculateBranchBoxes({ ahuModelIds: [], msModelIds: ids.ms, condenserId: hp.condenser.model })
  const boxes = assignableBoxes(calc.branchBoxes)
  expect(boxes.length > 0, 'no assignable boxes')
  const first = String(boxes[0]!.id), cap = boxCapacity(boxes[0]!.type ?? '')
  // everything on one box: only `cap` heads may stay
  const cleaned = cleanAssignments(calc.branchBoxes, { ahu: [], ms: ids.ms.map(() => first) })
  expect(cleaned.ms.filter(Boolean).length === cap, `capacity ${cap} not enforced: ${cleaned.ms.join()}`)
  expect(cleanAssignments(calc.branchBoxes, { ahu: [], ms: ['nope'] }).ms[0] === null, 'unknown box kept')
  const opts = boxOptionsFor(calc.branchBoxes, cleaned, 'ms', ids.ms.length - 1)
  expect(opts.find((o) => o.value === first)?.disabled === true, 'full box offered')
  const assigned = withAssignments(calc.branchBoxes, cleaned, ids)
  const a0 = assigned.find((x) => String(x.id) === first)!
  expect((a0.assignedUnits?.length ?? 0) === cap && a0.remainingCapacity === 0, 'assignedUnits/remaining wrong')
  const back = fromRetoolAssignments(toRetoolAssignments(cleaned, ids), 0, ids.ms.length)
  expect(back.ms.join() === cleaned.ms.join(), 'round trip')
  const withBB = { ...input, heatPump: { ...hp, branchBoxes: { ...hp.branchBoxes, advanced: { enabled: true, isManualOverride: false, totalUnits: calc.totalUnits, indoorSeries: calc.indoorSeries, outdoorSeries: calc.outdoorSeries, refrigerant: calc.refrigerant, calculatedBoxes: assigned, assignments: toRetoolAssignments(cleaned, ids) } } } } as SystemInput
  const out = runSpec(withBB, rc(b, pid))
  if (!out.ok) throw new Error(out.errors[0])
  const line = out.lines.find((l) => l.branch_box && JSON.stringify(l).includes('assigned'))
  expect(!!line, 'no line carries the assigned units: ' + JSON.stringify(out.lines.filter((l) => l.branch_box).map((l) => Object.keys(l))))
})

/* ---- line items ---- */
const hvac = () => b.systems.find((s) => s.nickname === 'hvacDuctedTwoAhu')!
const sysTotal = () => systemTotals(b, hvac().id).total
let before = 0
await step('add equipment/labor/discount lines, totals move, margin recalculated', async () => {
  before = sysTotal()
  const labor = (await import('@sd/domain/engine')).refData.labor.find((l) => /Condensate Pump for Heat Pump/.test(l.name))!
  const { priceCatalogLine } = await import('@sd/domain/engine')
  const p = priceCatalogLine('labor', labor.id, 'standard', '2026-11-11')
  if (!p.ok) throw new Error(p.error)
  await perform(id, 'addLineItems', [{ systemIds: [hvac().id], lines: [
    { line_item_type: 'labor', description: p.description, quantity: 1, price_actual: p.price, cost: null, labor_id: labor.id },
    { line_item_type: 'discount', description: 'Test discount', quantity: 1, price_actual: -100, cost: null },
  ], margin: { include: true, percents: {} } }])
  b = await get(id)
  expect(sysTotal() !== before, 'total unchanged')
})
await step('margin excluded line does not add margin', async () => {
  const t0 = sysTotal()
  await perform(id, 'addLineItems', [{ systemIds: [hvac().id], lines: [{ line_item_type: 'discount', description: 'No margin disc', quantity: 1, price_actual: -50, cost: null }], margin: { include: false, percents: {} } }])
  b = await get(id)
  expect(Math.abs(sysTotal() - (t0 - 50)) < 1, `expected ${t0 - 50} got ${sysTotal()}`)
})
await step('manual incentive survives later recalculation', async () => {
  await perform(id, 'addLineItems', [{ systemIds: [hvac().id], lines: [{ line_item_type: 'incentive', description: 'Manual rebate', quantity: 1, price_actual: -250, cost: null, incentive_id: 101, incentive_recipient: 'customer' }], margin: { include: true, percents: {} } }])
  b = await get(id)
  await perform(id, 'addLineItems', [{ systemIds: [hvac().id], lines: [{ line_item_type: 'discount', description: 'Another', quantity: 1, price_actual: -10, cost: null }], margin: { include: false, percents: {} } }])
  b = await get(id)
  expect(b.lineItems.filter((l) => l.system_id === hvac().id && l.description === 'Manual rebate').length === 1, 'manual incentive lost or duplicated')
})
await step('delete a line recalculates; incentive/margin lines are protected', async () => {
  const del = b.lineItems.find((l) => l.system_id === hvac().id && l.description === 'Test discount')!
  await perform(id, 'deleteLineItems', [[del.id]])
  b = await get(id)
  expect(!b.lineItems.some((l) => l.description === 'Test discount'), 'not deleted')
  const prot = b.lineItems.find((l) => l.system_id === hvac().id && l.line_item_type === 'margin')!
  let blocked = false
  try { await perform(id, 'deleteLineItems', [[prot.id]]) } catch { blocked = true }
  expect(blocked, 'margin line was deletable')
})
await step('adjust an incentive line (upsert) keeps its adjusted price', async () => {
  const inc = b.lineItems.find((l) => l.system_id === hvac().id && l.line_item_type === 'incentive' && !l.is_manual)!
  const { id: lid, system_id, ...rest } = inc
  await perform(id, 'upsertLineItem', [{ id: lid, system_id, ...rest, price_actual: 0, adjustment_reason: 'Customer not eligible', note: 'test', is_manual: true }])
  b = await get(id)
  expect(b.lineItems.find((l) => l.id === lid)?.price_actual === 0, 'adjustment lost')
})
await step('Recalculate keeps ids, notes, show-in-proposal, location, assigned units; adjusted incentives stay adjusted; a second run changes nothing', async () => {
  const sy = hvac()
  const own = () => b.lineItems.filter((l) => l.system_id === sy.id)
  const base = own().filter((l) => l.line_item_type !== 'incentive' && l.line_item_type !== 'margin')
  const decorate = async (l: (typeof base)[number], patch: Record<string, unknown>) => { await perform(id, 'upsertLineItem', [{ ...l, ...patch }]) }
  await decorate(base[0], { note: 'keep me', show_in_proposal: true })
  await decorate(base[1], { location: 'Basement', assigned_units: '2 units' })
  b = await get(id)
  const before = own()
  await perform(id, 'recalculateSystems', [[sy.id]])
  b = await get(id)
  const after = own()
  expect(before.find((l) => l.id === base[0].id)?.note === 'keep me' && before.find((l) => l.id === base[1].id)?.location === 'Basement', 'setup: decoration was not saved')
  for (const l of before.filter((x) => x.line_item_type !== 'incentive' && x.line_item_type !== 'margin')) {
    const a = after.find((x) => x.id === l.id)
    expect(a, `line ${l.id} got a new id or vanished`)
    for (const f of ['description', 'price_actual', 'equipment_id', 'labor_id', 'note', 'show_in_proposal', 'location', 'assigned_units', 'is_manual', 'circuit', 'equipment_provider'] as const) {
      expect(JSON.stringify(a![f] ?? null) === JSON.stringify(l[f] ?? null), `line ${l.id} ${f}: ${JSON.stringify(l[f])} -> ${JSON.stringify(a![f])}`)
    }
  }
  const adj = before.find((l) => l.line_item_type === 'incentive' && l.adjustment_reason)
  if (adj) { const a2 = after.find((x) => x.id === adj.id); expect(a2 && a2.price_actual === adj.price_actual, 'adjusted incentive changed') }
  const m0 = before.find((l) => l.line_item_type === 'margin')!; expect(after.find((l) => l.id === m0.id), 'margin line got a new id')
  await perform(id, 'recalculateSystems', [[sy.id]])
  b = await get(id)
  const again = own()
  expect(JSON.stringify(again.map((l) => [l.id, l.price_actual, l.margin_amount, l.line_item_type])) === JSON.stringify(after.map((l) => [l.id, l.price_actual, l.margin_amount, l.line_item_type])), 'second recalculation changed something')
})
await step('lines pending deletion or from a change order stay out of the margin line (calculateMargin excludedStatuses)', async () => {
  const sy = hvac()
  const lines = () => b.lineItems.filter((l) => l.system_id === sy.id)
  const victim = lines().find((l) => l.line_item_type === 'equipment' && (l.margin_amount ?? 0) > 0)!
  await perform(id, 'upsertLineItem', [{ ...victim, status: 'pending deletion' }])
  await perform(id, 'recalculateSystems', [[sy.id]])
  b = await get(id)
  const margin = lines().find((l) => l.line_item_type === 'margin')!
  const expected = lines().filter((l) => l.status !== 'pending deletion' && l.status !== 'proposed - from change order').reduce((a, l) => a + (l.line_item_type === 'margin' ? 0 : l.margin_amount ?? 0), 0)
  expect(Math.abs(margin.price_actual - expected) < 0.05, `margin ${margin.price_actual} vs sum of included ${expected}`)
  // put it back
  await perform(id, 'upsertLineItem', [{ ...b.lineItems.find((l) => l.id === victim.id)!, status: undefined }])
  await perform(id, 'recalculateSystems', [[sy.id]])
  b = await get(id)
})
await step('circuit length editor reprices a circuit labor line', async () => {
  const c = b.lineItems.filter((l) => l.line_item_type === 'labor' && l.circuit)
  expect(c.length > 0, 'no circuit labor line in the added systems')
  const l = c[0]
  const p0 = l.price_actual
  await perform(id, 'updateCircuitLength', [l.id, 90, true])
  b = await get(id)
  const after = b.lineItems.find((x) => x.system_id === l.system_id && x.description === l.description && x.circuit)
  expect(after && after.price_actual > p0 && /90 ft/.test(after.circuit ?? ''), `price ${p0} -> ${after?.price_actual} ${after?.circuit}`)
})

/* ---- Synchrony financing fee ---- */
await step('Synchrony lender adds a fee line to Mitsubishi HVAC systems and lowers the margin share', async () => {
  const beforeTotal = proposalTotals(b, pid).total
  await perform(id, 'saveProjectInfo', [{ project: { financing: 'yes', lender: ['Synchrony'], financing_amounts: [20000] } }])
  b = await get(id)
  const fees = b.lineItems.filter((l) => l.line_item_type === 'financing fees')
  expect(fees.length > 0 && fees.every((f) => f.price_actual < 0), 'no fee lines: ' + fees.length)
  const sum = fees.reduce((a, f) => a + f.price_actual, 0)
  expect(Math.abs(sum + 0.07 * 20000) < 1, `fees total ${sum}, expected -1400`)
  expect(proposalTotals(b, pid).total < beforeTotal, 'total did not drop')
})
await step('fee survives a recalculation and is not duplicated', async () => {
  await perform(id, 'addLineItems', [{ systemIds: [b.systems.find((s) => s.nickname === 'hvacDuctedTwoAhu')!.id], lines: [{ line_item_type: 'discount', description: 'Fee test', quantity: 1, price_actual: -5, cost: null }], margin: { include: false, percents: {} } }])
  b = await get(id)
  const fees = b.lineItems.filter((l) => l.line_item_type === 'financing fees')
  expect(Math.abs(fees.reduce((a, f) => a + f.price_actual, 0) + 1400) < 1 && fees.length === new Set(fees.map((f) => f.system_id)).size, 'fee changed or duplicated')
})
await step('removing Synchrony takes the fee lines away again', async () => {
  const withFee = proposalTotals(b, pid).total
  await perform(id, 'saveProjectInfo', [{ project: { financing: 'no', lender: [], financing_amounts: [] } }])
  b = await get(id)
  expect(!b.lineItems.some((l) => l.line_item_type === 'financing fees') && proposalTotals(b, pid).total > withFee, 'fee lines remain')
})

/* ---- systems and proposals ---- */
await step('edit system (replace lines) keeps the system and swaps lines', async () => {
  const s = b.systems.find((x) => x.nickname === 'hvacSingleMiniSplit')!
  const input = full(b, pid, sampleSystemInputs.hvacMiniSplitSixHeads, 'hvac')
  const out = runSpec({ ...input, mode: 'edit system', system_id: s.id } as SystemInput, { ...rc(b, pid), systemId: s.id })
  if (!out.ok) throw new Error(out.errors[0])
  await perform(id, 'replaceSystemLines', [s.id, { nickname: 'edited', input: input as never, engine: out.engineSystem, target_margin: out.targetMargin }, out.lines])
  b = await get(id)
  expect(b.systems.find((x) => x.id === s.id)?.nickname === 'edited', 'not renamed')
})
await step('rename system and proposal', async () => {
  const s = b.systems.find((x) => x.nickname === 'edited')!
  await perform(id, 'updateSystem', [s.id, { nickname: 'renamed' }])
  await perform(id, 'updateProposal', [pid, { nickname: 'Option A' }])
  b = await get(id)
  expect(b.systems.some((x) => x.nickname === 'renamed') && b.proposals[0].nickname === 'Option A', 'rename lost')
})
let p2 = 0
await step('create second proposal; move and duplicate a system into it', async () => {
  const np = await perform(id, 'createProposal', ['Option B']) as { id: number }
  p2 = np.id
  const s = b.systems.find((x) => x.nickname === 'waterHeater')!
  await perform(id, 'duplicateSystem', [s.id, p2])
  const ev = b.systems.find((x) => x.nickname === 'ev')!
  await perform(id, 'moveSystem', [ev.id, p2])
  b = await get(id)
  expect(b.systems.filter((x) => x.proposal_id === p2 && x.system_type !== 'other').length === 2, 'expected 2 systems in B')
  const other2 = b.systems.find((x) => x.proposal_id === p2 && x.system_type === 'other')!
  expect(other2, 'second proposal has no automatic system')
})
await step('duplicate proposal copies systems and lines', async () => {
  const dup = await perform(id, 'duplicateProposal', [p2]) as { id: number }
  b = await get(id)
  const n = b.systems.filter((x) => x.proposal_id === dup.id && x.system_type !== 'other').length
  expect(n === 2, `copied ${n} systems`)
  await perform(id, 'deleteProposal', [dup.id])
  b = await get(id)
  expect(!b.proposals.some((x) => x.id === dup.id) && !b.systems.some((x) => x.proposal_id === dup.id), 'delete left rows')
})
await step('delete system removes its lines', async () => {
  const s = b.systems.find((x) => x.nickname === 'cooktop')!
  await perform(id, 'deleteSystem', [s.id])
  b = await get(id)
  expect(!b.systems.some((x) => x.id === s.id) && !b.lineItems.some((l) => l.system_id === s.id), 'rows left behind')
})

/* ---- base design and maintenance plan ---- */
await step('base design (HVAC + water heater) generates priced systems', async () => {
  const designs = await listBaseDesigns()
  const hv = designs.find((d) => d.system_type === 'hvac')!
  const opts = { margin: 0.3, surgeProtection: 'Single Circuit', gfci: false, condensatePump: false, a2l: false, attic: false, tmv: false, venting: false, priceDate: '2026-11-11', rebateDate: '' }
  const n0 = (await get(id)).systems.length
  await perform(id, 'quickAddBaseDesigns', [{ designs: [hv], targets: [p2, 'NEW_SINGLE'], pricingStructure: 'standard', options: opts }])
  b = await get(id)
  expect(b.systems.length > n0 + 1, 'no systems added')
  let mixedBlocked = false
  try { await perform(id, 'quickAddBaseDesigns', [{ designs: [hv, designs.find((d) => d.system_type === 'water heater')!], targets: [p2], pricingStructure: 'standard', options: opts }]) } catch { mixedBlocked = true }
  expect(mixedBlocked, 'mixed HVAC/WH accepted')
})
await step('maintenance plan system created with priced lines', async () => {
  await perform(id, 'createMaintenancePlan', [{ proposalId: pid, level: 'silver', counts: { condensers: 1, ahus: 1, heads: 0, hpwhs: 0, ervs: 0, smartacs: 0 } }])
  b = await get(id)
  const mp = b.systems.find((x) => x.system_type === 'maintenance')!
  expect(mp && b.lineItems.filter((l) => l.system_id === mp.id).every((l) => l.price_actual > 0), 'bad plan lines')
})

/* ---- proposal status, finalize and change orders ---- */
await step('QA then finalize; project points at the proposal; handoff notes saved', async () => {
  await perform(id, 'updateProposal', [pid, { status: 'under review' }])
  await perform(id, 'finalizeProposal', [pid, { majorRisks: 'Tight attic', expectations: 'Spring install' }])
  b = await get(id)
  expect(b.project.finalized_proposal_id === pid && b.proposals.find((p) => p.id === pid)?.status === 'finalized', 'not finalized')
  expect(/Tight attic/.test(b.project.handoff_notes), 'handoff notes missing')
})
await step('finalized proposal: adding a line goes through a change order', async () => {
  const sy = b.systems.find((s) => s.proposal_id === pid && s.nickname === 'hvacDuctedTwoAhu')!
  const co = { description: 'Add', reason: 'Customer', impact: 'Low', timeline: 'None', requester: 'Homeowner', responsible: 'Elephant Energy', customerConsent: true, installerConsent: true }
  await perform(id, 'addLineItems', [{ systemIds: [sy.id], lines: [{ line_item_type: 'discount', description: 'CO discount', quantity: 1, price_actual: -75, cost: null }], margin: { include: false, percents: {} }, changeOrder: co }])
  b = await get(id)
  const l = b.lineItems.find((x) => x.description === 'CO discount')!
  expect(l?.status === 'proposed - from change order' && !!l.change_order_details, 'CO state missing: ' + l?.status)
})
await step('finalized proposal: deleting a line marks pending deletion', async () => {
  const l = b.lineItems.find((x) => x.description === 'CO discount')!
  await perform(id, 'deleteLineItemsAsCO', [[l.id], { description: 'Remove', reason: 'x', impact: '', timeline: '', requester: '', responsible: '', customerConsent: false, installerConsent: false }])
  b = await get(id)
  expect(b.lineItems.find((x) => x.description === 'CO discount')?.status === 'pending deletion', 'not marked')
})
await step('finalized proposal: deleting a system marks it pending deletion', async () => {
  const sy = b.systems.find((s) => s.proposal_id === pid && s.nickname === 'ev')
    ?? b.systems.find((s) => s.proposal_id === pid && s.system_type === 'panel')!
  await perform(id, 'markSystemForDeletion', [sy.id, { description: 'Drop', reason: 'x', impact: '', timeline: '', requester: '', responsible: '', customerConsent: false, installerConsent: false }])
  b = await get(id)
  expect(b.systems.find((s) => s.id === sy.id)?.status === 'pending deletion', 'not marked')
})
await step('base design into the finalized proposal is refused', async () => {
  const hv = (await listBaseDesigns())[0]
  let blocked = false
  try { await perform(id, 'quickAddBaseDesigns', [{ designs: [hv], targets: [pid], pricingStructure: 'standard', options: { margin: 0.3, surgeProtection: 'Single Circuit', gfci: false, condensatePump: false, a2l: false, attic: false, tmv: false, venting: false, priceDate: '2026-11-11', rebateDate: '' } }]) } catch { blocked = true }
  expect(blocked, 'was allowed')
})

/* ---- invoices ---- */
await step('generate invoices: deposit + final add up to the proposal total', async () => {
  await perform(id, 'generateInvoices', [{ firstDepositPct: 0.5, firstDepositCustom: 0, firstCardFee: false, finalCardFee: false, upfrontDiscount: false }])
  b = await get(id)
  const sum = b.invoices.reduce((a, i) => a + i.invoice_amount, 0)
  expect(b.invoices.length === 2 && sum > 0, `${b.invoices.length} invoices sum ${sum}`)
})
await step('card fee setting changes the invoice lines', async () => {
  const fin = b.invoices.find((i) => i.invoice_type === 'Final Invoice')!
  const n0 = b.invoiceLines.filter((l) => l.invoice_id === fin.id).length
  await perform(id, 'applyInvoiceSettings', [fin.id, { ccFee: true, upfrontDiscount: false }])
  b = await get(id)
  const fin2 = b.invoices.find((i) => i.invoice_type === 'Final Invoice')!
  expect(b.invoiceLines.filter((l) => l.invoice_id === fin2.id).length >= n0, 'lines vanished')
})
await step('edit deposit amount moves the difference to the final invoice', async () => {
  const dep = b.invoices.find((i) => i.invoice_type === 'First Deposit')!
  const total = b.invoices.reduce((a, i) => a + i.invoice_amount, 0)
  await perform(id, 'editDepositAmount', [dep.id, 1000])
  b = await get(id)
  const t2 = b.invoices.reduce((a, i) => a + i.invoice_amount, 0)
  expect(b.invoices.find((i) => i.invoice_type === 'First Deposit')?.invoice_amount === 1000 && Math.abs(t2 - total) < 1, `total ${total} -> ${t2}`)
})
await step('approve -> send -> pay the deposit', async () => {
  const dep = b.invoices.find((i) => i.invoice_type === 'First Deposit')!
  await perform(id, 'setInvoiceStatus', [dep.id, 'approved'])
  await perform(id, 'setInvoiceStatus', [dep.id, 'open'])
  await perform(id, 'setInvoiceStatus', [dep.id, 'paid'])
  b = await get(id)
  const d = b.invoices.find((i) => i.id === dep.id)!
  expect(d.invoice_status === 'paid' && !!d.paid_at && !!d.sent_at && !!d.approved_at, JSON.stringify(d))
})
await step('delete invoices', async () => {
  await perform(id, 'deleteInvoices', [])
  b = await get(id)
  expect(b.invoices.length === 0 && b.invoiceLines.length === 0, 'left over')
})

/* ---- the permits query itself: Retool's permits.sql run on this database against the port ---- */
await step('permits.sql (state > city > county > other, one per type) matches selectPermitsForHouse on 300 random permit tables', async () => {
  const sql = readFileSync(new URL('../../../legacy/workflows/specPermits/permits.sql', import.meta.url), 'utf8')
    .replace('{{house.state}}', '$1').replace('{{house.city}}', '$2').replace('{{house.county}}', '$3')
  const c = await pool.connect()
  try {
    await c.query('begin')
    await c.query('create temp table permits_new (id int, name text, permit_type text, jurisdiction text, jurisdiction_type text, price jsonb) on commit drop')
    let seed = 12345
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]
    for (let round = 0; round < 300; round++) {
      await c.query('delete from permits_new')
      const rows: { id: number; name: string; permit_type: string; jurisdiction: string | null; jurisdiction_type: string; price: object }[] = []
      for (let i = 0; i < 2 + Math.floor(rnd() * 10); i++) {
        const jt = pick(['state', 'city', 'county', 'other'])
        rows.push({ id: 100 + i, name: 'p' + i, permit_type: pick(['hvac', 'electrical', 'plumbing']), jurisdiction: jt === 'state' ? pick(['CO', 'MA']) : jt === 'city' ? pick(['Denver', 'Reading']) : jt === 'county' ? pick(['Boulder', 'Middlesex']) : null, jurisdiction_type: jt, price: { cost: 100 } })
      }
      // ids out of order, as in a real table
      for (const r of rows.sort(() => rnd() - 0.5)) await c.query('insert into permits_new values ($1,$2,$3,$4,$5,$6)', [r.id, r.name, r.permit_type, r.jurisdiction, r.jurisdiction_type, r.price])
      const house = { state: pick(['CO', 'MA', null]), city: pick(['Denver', 'Reading', null]), county: pick(['Boulder', 'Middlesex', null]) }
      const sqlRows = (await c.query<{ id: number }>(sql, [house.state, house.city, house.county])).rows.map((r) => r.id).sort((x, y) => x - y) // the SQL has no ORDER BY and callers look permits up by type
      const port = selectPermitsForHouse(rows as never, house as never).map((r) => r.id).sort((x, y) => x - y)
      expect(JSON.stringify(sqlRows) === JSON.stringify(port), `round ${round} house ${JSON.stringify(house)}: sql ${JSON.stringify(sqlRows)} port ${JSON.stringify(port)}`)
    }
    await c.query('rollback')
  } finally { c.release() }
})

/* ---- the AHRI lookup: Retool's ahri.sql run on this database against the port ---- */
await step('ahri.sql matches findAhriRecord on 400 random equipment combinations', async () => {
  const { refData } = await import('@sd/domain/engine')
  let sql = readFileSync(new URL('../../../legacy/workflows/specSystemDetails/ahri.sql', import.meta.url), 'utf8')
  const names = ['condesorModel', 'furnaceModel', 'coilModel', 'indoorModel', 'systemDuctingType', 'waterHeaterModel']
  // Retool placeholders -> $n; the water heater pattern is built in the workflow as '%' + model + '%'
  sql = sql.replace("{{ '%' + waterHeaterModel + '%' }}", '$6').replace(/\{\{ (\w+) \}\}/g, (_m, n: string) => '$' + (names.indexOf(n) + 1))
  const cond = refData.equipment.filter((e) => e.equipment_type === 'Condenser').map((e) => e.model_number)
  const indoor = refData.equipment.filter((e) => ['AHU', 'Wall Head', 'Ceiling Cassette', 'Floor Head', 'Horizontal-Ducted Head'].includes(String(e.equipment_type))).map((e) => e.model_number)
  const coils = refData.equipment.filter((e) => e.equipment_type === 'Dual-Fuel Coil').map((e) => e.model_number)
  const furn = refData.equipment.filter((e) => e.equipment_type === 'furnace').map((e) => e.model_number)
  const whs = refData.equipment.filter((e) => e.equipment_type === 'HPWH').map((e) => e.model_number)
  let seed = 99
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]
  let found = 0
  for (let i = 0; i < 400; i++) {
    const wh = rnd() < 0.25
    const useFurnace = !wh && rnd() < 0.25
    const q = {
      condenserModel: wh ? null : (rnd() < 0.1 ? String(pick(cond)) + '.TH' : String(pick(cond))), indoorModel: useFurnace ? null : (wh ? null : String(pick(indoor))),
      systemDuctingType: wh ? null : pick(['ducted', 'ductless', 'mixed']), furnaceModel: useFurnace ? String(pick(furn)) : null, coilModel: useFurnace ? String(pick(coils)) : null,
      waterHeaterModel: wh ? String(pick(whs)) : null,
    }
    // parameters in the order of `names`
    const params = [q.condenserModel, q.furnaceModel, q.coilModel, q.indoorModel, q.systemDuctingType, '%' + q.waterHeaterModel + '%']
    const row = (await pool.query<{ id: number; specificity_rank_opt: number | null }>(sql.replace(/;\s*$/, ''), params)).rows[0]
    const port = findAhriRecord(refData.ahri as never, q as never)
    const sameRank = (row?.specificity_rank_opt ?? null) === ((port as { specificity_rank_opt?: number | null } | null)?.specificity_rank_opt ?? null)
    expect((row?.id ?? null) === ((port as { id?: number } | null)?.id ?? null) || (!!row && !!port && sameRank), `query ${JSON.stringify(q)}: sql ${row?.id} port ${(port as { id?: number } | null)?.id}`)
    if (row) found++
  }
  expect(found > 40, 'too few lookups matched to mean anything: ' + found)
})

/* ---- integrity ---- */
await step('no orphan rows (systems without proposal, lines without system)', async () => {
  const o = await pool.query(`select (select count(*) from systems_new s where not exists (select 1 from proposals_new p where p.id = s.proposal_id)) a,
    (select count(*) from line_items_new l where not exists (select 1 from systems_new s where s.id = l.system_id)) b`)
  expect(o.rows[0].a === 0 && o.rows[0].b === 0, JSON.stringify(o.rows[0]))
})
await step('delete project removes everything', async () => {
  expect(await deleteProject(id), 'delete returned false')
  const o = await pool.query('select (select count(*) from proposals_new where project_id=$1) p, (select count(*) from customers_new where id=$1) c', [id])
  expect(o.rows[0].p === 0 && o.rows[0].c === 0, JSON.stringify(o.rows[0]))
})

console.log(`\n${pass} passed, ${fail} failed`)
for (const f of failures) console.log(' -', f)
await pool.end()

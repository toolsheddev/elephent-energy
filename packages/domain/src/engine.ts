/* Adapter between the pure @sd/engine package and the UI.
   The chain mirrors Retool: specSystemDetails -> priceLineItems -> specIncentives (margin + incentives).
   Recalculate runs only the last step on the system's current lines. */
import {
  checkCriteria, priceLineItems, recalculateSystem, sampleRefData, selectPermitCostRows, specIncentives, specSystemDetails, TERRITORY_BY_STRUCTURE,
  type EngineError, type House as EngineHouse, type RefData, type LineItem as EngineLineItem, type System as EngineSystem, type SystemInput,
} from '@sd/engine'
import type { ExistingSystems, House, LineItemRec, LineItemType, Project, SystemRec } from './types'

export { TERRITORY_BY_STRUCTURE }

/** Reference data (catalog, prices, permits, incentives). Starts as the engine's sample set and is replaced by the database's
 *  rows at start-up, so every module that imports `refData` sees the live binding. */
export let refData: RefData = sampleRefData
export function setRefData(r: RefData) { refData = r }
export type { SystemInput }

export type NewLine = Omit<LineItemRec, 'id' | 'system_id'>

/** What the incentive step needs to know about the rest of the project. */
export interface RecalcContext {
  project: Project
  house: House
  existing: ExistingSystems
  /** All systems and lines of the project (used for limits already granted and for permits). */
  systems: SystemRec[]
  lineItems: LineItemRec[]
  proposalId: number
  /** System being edited or recalculated, so its own old lines are not counted against limits. */
  systemId?: number
}

export type SpecOutcome =
  | { ok: true; lines: NewLine[]; warnings: string[]; ms: number; engineSystem?: Record<string, unknown>; targetMargin: number }
  | { ok: false; errors: string[] }

const typeMap: Record<string, LineItemType> = {
  equipment: 'equipment', labor: 'labor', permit: 'permit', incentive: 'incentive', discount: 'discount',
  maintenance_plan: 'maintenance', 'maintenance plan': 'maintenance', fee: 'fee', margin: 'margin', 'financing fees': 'financing fees',
}
const toEngineType = (t: LineItemType) => (t === 'maintenance' ? 'maintenance plan' : t)

const msg = (e: EngineError) => (e.lineItemIndex != null ? `Line ${e.lineItemIndex + 1}: ${e.message}` : e.message)

/** "50 ft, difficult" from the engine's circuit data, or empty when the line has no circuit. */
function circuitText(l: EngineLineItem): string | undefined {
  const e = l.additional_data?.electrical
  if (!e || e.circuit_length == null) return undefined
  return `${e.circuit_length} ft${e.difficult ? ', difficult' : ''}`
}

/** Engine house shape from the UI house. */
export function toEngineHouse(h: House): EngineHouse {
  return {
    id: h.project_id, address: h.address, city: h.city, state: h.state, zipcode: h.zipcode,
    county: h.county.replace(/ County$/, ''), electric_utility: h.electric_utility, gas_utility: h.gas_utility,
    home_type: h.home_type, year_built: Number(h.year_built) || null, sq_footage: h.sq_footage, units: h.units,
    massachusetts_details: h.state === 'MA' ? {
      energy_audit: h.ma.energy_audit, completed: h.ma.recommendations_complete, primaryResidence: h.ma.primary_residence,
    } : null,
  }
}

/* ---------- line conversion ---------- */

export function toEngineLine(l: LineItemRec): EngineLineItem {
  return {
    id: l.id, system_id: l.system_id, line_item_type: toEngineType(l.line_item_type), description: l.description,
    price_actual: l.price_actual, quantity: l.quantity,
    equipment_id: l.equipment_id ?? null, labor_id: l.labor_id ?? null, permit_id: l.permit_id ?? null, maintenance_plan_id: l.maintenance_plan_id ?? null,
    equipment_provider: l.equipment_provider ?? null, location: l.location ?? null,
    incentive_id: l.incentive_id ?? null, incentive_recipient: l.incentive_recipient ?? null,
    margin_amount: l.margin_amount ?? 0, margin_percent: l.margin_percent ?? null,
    margin_to_include: l.margin_to_include, adjustment_reason: l.adjustment_reason ?? null,
    show_in_proposal: l.show_in_proposal, state: 'persisted', status: l.status ?? null, // the engine leaves change-order and pending-deletion lines out of the margin
    ...(l.is_manual ? { manually_added: true } : {}),
    // The engine keeps circuit and branch box details in additional_data; without them a recalculation would drop the "50 ft" text
    ...(() => {
      const c = parseCircuit(l.circuit)
      const data = { ...(c ? { electrical: { circuit_length: c.length, difficult: c.difficult } } : {}), ...(l.branch_box ? { branchBoxName: l.branch_box } : {}) }
      return Object.keys(data).length ? { additional_data: data } : {}
    })(),
  } as EngineLineItem
}

export function fromEngineLine(l: EngineLineItem): NewLine {
  const t = typeMap[String(l.line_item_type)] ?? 'labor'
  const adj = l.adjustment_reason as string | null | undefined
  return {
    line_item_type: t,
    description: l.description ?? (t === 'margin' ? 'Elephant Margin' : 'Line item'),
    quantity: l.quantity ?? 1,
    price_actual: Number(l.price_actual ?? 0),
    cost: null,
    equipment_provider: l.equipment_provider ?? undefined,
    location: l.location ?? undefined,
    circuit: circuitText(l),
    assigned_units: Array.isArray(l.additional_data?.assignedUnits) && l.additional_data.assignedUnits.length ? `${l.additional_data.assignedUnits.length} units` : undefined,
    branch_box: typeof l.additional_data?.branchBoxName === 'string' ? l.additional_data.branchBoxName : undefined,
    show_in_proposal: l.show_in_proposal === false ? false : undefined,
    margin_amount: l.margin_amount != null ? Number(l.margin_amount) : undefined,
    margin_percent: l.margin_percent != null ? Number(l.margin_percent) : null,
    margin_to_include: l.margin_to_include === false ? false : undefined,
    incentive_id: l.incentive_id ?? null,
    incentive_recipient: typeof l.incentive_recipient === 'string' ? l.incentive_recipient : undefined,
    adjustment_reason: adj ?? undefined,
    is_manual: l.manually_added ? true : undefined,
    equipment_id: l.equipment_id ?? null,
    labor_id: l.labor_id ?? null,
    permit_id: l.permit_id ?? null,
    maintenance_plan_id: (l.maintenance_plan_id as number | null | undefined) ?? null,
  }
}

/* ---------- context for the incentive step ---------- */

const fuelOf = (type: string) => {
  const t = type.toLowerCase().replace(/_/g, ' ')
  if (t.includes('heat pump')) return 'heat pump'
  if (t.includes('gas')) return 'gas'
  if (t.includes('oil')) return 'oil'
  if (t.includes('propane')) return 'propane'
  if (t.includes('electric') || t.includes('baseboard')) return 'electric'
  return t
}

/** The home's existing equipment, as "active" systems so `existing_system` criteria can see it. */
function activeSystems(ex: ExistingSystems, houseId: number): EngineSystem[] {
  const out: EngineSystem[] = []
  out.push({
    id: -1, house_id: houseId, proposal_id: null, system_type: 'hvac', system_status: 'active',
    system_type_detail: { heating: { fuel: fuelOf(ex.heating.type), type: ex.heating.type, age: Number(ex.heating.age) || null }, cooling: { type: ex.cooling.type, capacity: ex.cooling.capacity } },
  } as EngineSystem)
  out.push({
    id: -2, house_id: houseId, proposal_id: null, system_type: 'water heater', system_status: 'active',
    system_type_detail: { fuel: fuelOf(ex.water_heater.type), type: ex.water_heater.type, capacity: ex.water_heater.capacity },
  } as EngineSystem)
  return out
}

const toEngineSystem = (s: SystemRec, houseId: number): EngineSystem => ({
  id: s.id, house_id: houseId, proposal_id: s.proposal_id, system_type: s.system_type, system_status: s.status ?? 'proposed',
  target_margin: s.target_margin ?? 0.25, rebate_effective_date: s.rebate_effective_date || null,
  rebate_eligibility_type: s.rebate_eligibility_type || null, heating_load_coverage: s.heating_load_coverage ?? null,
  ...((s.engine ?? {}) as object),
} as EngineSystem)

function incentiveInputs(rc: RecalcContext) {
  const house = { ...toEngineHouse(rc.house), id: rc.project.id }
  const customer = { id: rc.project.id, first_name: rc.project.first_name, last_name: rc.project.last_name, annual_gross_income: rc.project.income }
  const systems = [...activeSystems(rc.existing, house.id), ...rc.systems.map((s) => toEngineSystem(s, house.id))]
  const lineItems = rc.lineItems.map(toEngineLine)
  const permitLineItems = selectPermitCostRows({ proposalId: rc.proposalId, systems, lineItems, permits: refData.permits })
  return { house, customer, systems, lineItems, permitLineItems }
}

const now = () => new Date().toISOString()

/* ---------- add / edit a system ---------- */

/** Spec a system, price it, then add margin and incentives. Synchronous: the engine does no I/O. */
export function runSpec(input: SystemInput, rc?: RecalcContext): SpecOutcome {
  const t0 = performance.now()
  try {
    const spec = specSystemDetails(input, refData, {})
    if (!spec.ok) return { ok: false, errors: spec.errors.map(msg) }
    const priced = priceLineItems(spec.lineItems, refData, {
      pricingStructure: input.PricingStructure, pricingEffectiveDate: input.PricingEffectiveDate,
    })
    if (!priced.ok) return { ok: false, errors: priced.errors.map(msg) }

    const warnings = [...spec.errors, ...priced.errors].map(msg)
    const targetMargin = Number(spec.newSystem.target_margin ?? input.targetMargin ?? 0.25)
    let lines: EngineLineItem[] = priced.result

    if (rc) {
      const ctxIn = incentiveInputs({ ...rc, lineItems: rc.lineItems.filter((l) => l.system_id !== rc.systemId) })
      const inc = specIncentives(
        {
          system: { ...spec.newSystem, id: rc.systemId, house_id: ctxIn.house.id } as unknown as EngineSystem,
          lineItems: lines.map((l) => ({ ...l, state: 'transient' as const })),
          house: ctxIn.house, customer: ctxIn.customer,
          ahriRecord: spec.ahriRecord ?? null, ahri_id: spec.newSystem.ahri_id ?? null,
          proposal_id: rc.proposalId, mode: input.mode, existing_system_id: rc.systemId ?? null,
          rebateEffectiveDate: input.rebateEffectiveDate ?? null, system_margin: 'add', initialAdd: true,
          incentivesLimitData: refData.incentiveLimits,
        },
        refData,
        { now: now(), houseSystems: ctxIn.systems.filter((s) => s.system_status !== 'proposed' || s.id !== rc.systemId), houseLineItems: ctxIn.lineItems, permitLineItems: ctxIn.permitLineItems },
      )
      if (!inc.ok) warnings.push(...inc.errors.map((e) => `Incentives: ${msg(e)}`))
      else {
        lines = inc.result
        warnings.push(...inc.errors.map(msg))
      }
    }

    return {
      ok: true, lines: lines.map(fromEngineLine), warnings, ms: performance.now() - t0, targetMargin,
      engineSystem: { system_type_detail: spec.newSystem.system_type_detail, ahri_id: spec.newSystem.ahri_id ?? null, additional_data: spec.newSystem.additional_data },
    }
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] }
  }
}

/* ---------- Recalculate ---------- */

/** A recalculated line. `id` is set for lines that already existed (the engine reuses ids so the caller updates them in place). */
export type RecalcLine = NewLine & { id?: number }
export type RecalcOutcome =
  | { ok: true; lines: RecalcLine[]; warnings: string[]; ms: number }
  | { ok: false; errors: string[] }

/** The Recalculate button: margin and incentives on the system's CURRENT lines (no re-spec), as in Retool. */
export function recalcLines(rc: RecalcContext, system: SystemRec): RecalcOutcome {
  const t0 = performance.now()
  try {
    const mine = rc.lineItems.filter((l) => l.system_id === system.id)
    const others = rc.lineItems.filter((l) => l.system_id !== system.id)
    const ctxIn = incentiveInputs({ ...rc, lineItems: others, systems: rc.systems })
    const res = recalculateSystem({
      system: toEngineSystem(system, ctxIn.house.id),
      lineItems: mine.map(toEngineLine),
      house: ctxIn.house, customer: ctxIn.customer,
      rebateEffectiveDate: system.rebate_effective_date || null,
      incentivesLimitData: refData.incentiveLimits,
      refData: refData,
      ctx: { now: now(), houseSystems: ctxIn.systems, houseLineItems: ctxIn.lineItems, permitLineItems: ctxIn.permitLineItems },
    })
    if (!res.ok) return { ok: false, errors: res.errors.map(msg) }
    return { ok: true, lines: res.lineItems.map((l) => ({ ...fromEngineLine(l), ...(typeof l.id === 'number' ? { id: l.id } : {}) })), warnings: [...res.errors, ...res.warnings].map(msg), ms: performance.now() - t0 }
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] }
  }
}

/* ---------- the "Line Items" step of the Add System flow ---------- */

/** Margin and incentives on a draft (lines not saved yet). New manual lines are 'transient' so they get the target margin. */
export function recalcDraft(
  rc: RecalcContext,
  a: { engineSystem?: Record<string, unknown>; systemType: string; targetMargin: number; rebateEffectiveDate?: string; lines: NewLine[]; newIndexes: Set<number>; mode: 'add system' | 'edit system' },
): RecalcOutcome {
  const t0 = performance.now()
  try {
    const ctxIn = incentiveInputs({ ...rc, lineItems: rc.lineItems.filter((l) => l.system_id !== rc.systemId) })
    const engineLines = a.lines.map((l, i) => ({ ...toEngineLine({ ...l, id: i + 1, system_id: 0 } as LineItemRec), state: a.newIndexes.has(i) ? 'transient' : 'persisted' } as EngineLineItem))
    const res = specIncentives(
      {
        system: { id: rc.systemId, house_id: ctxIn.house.id, system_type: a.systemType, target_margin: a.targetMargin, ...(a.engineSystem ?? {}) } as unknown as EngineSystem,
        lineItems: engineLines, house: ctxIn.house, customer: ctxIn.customer,
        ahri_id: (a.engineSystem?.ahri_id as number | null | undefined) ?? null,
        proposal_id: rc.proposalId, mode: a.mode, existing_system_id: rc.systemId ?? null,
        rebateEffectiveDate: a.rebateEffectiveDate ?? null, system_margin: 'add', initialAdd: false,
        incentivesLimitData: refData.incentiveLimits,
      },
      refData,
      { now: now(), houseSystems: ctxIn.systems, houseLineItems: ctxIn.lineItems, permitLineItems: ctxIn.permitLineItems },
    )
    if (!res.ok) return { ok: false, errors: res.errors.map(msg) }
    return { ok: true, lines: res.result.filter((l) => l.line_item_type !== 'permit').map(fromEngineLine), warnings: res.errors.map(msg), ms: performance.now() - t0 }
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] }
  }
}

/** Price one catalog item (equipment or labor) for a manual line. */
export function priceCatalogLine(kind: 'equipment' | 'labor', id: number, pricingStructure: string, date?: string): { ok: true; description: string; price: number } | { ok: false; error: string } {
  try {
    const line = kind === 'equipment' ? { equipment_id: id, line_item_type: 'equipment' } : { labor_id: id, line_item_type: 'labor' }
    const res = priceLineItems([line as EngineLineItem], refData, { pricingStructure, pricingEffectiveDate: date })
    if (!res.ok) return { ok: false, error: res.errors.map(msg)[0] ?? 'Could not price this item' }
    if (res.errors.length) return { ok: false, error: res.errors.map(msg)[0] }
    const l = res.result[0]
    const eq = kind === 'equipment' ? refData.equipment.find((e) => e.id === id) : undefined
    const lb = kind === 'labor' ? refData.labor.find((x) => x.id === id) : undefined
    return { ok: true, description: l.description ?? (eq ? `${eq.model_number ?? ''} | ${eq.equipment_name}` : lb?.name ?? 'Line item'), price: Number(l.price_actual ?? 0) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/* ---------- Analyze Incentives: why one rebate does or does not apply ---------- */

export interface IncentiveGroupCheck { key: string; ok: boolean; criteria: unknown }
export interface IncentiveOptionCheck { name: string; eligible: boolean; notEligibleByRule: boolean; maxAmount?: number; groups: IncentiveGroupCheck[] }
export interface IncentiveExplanation {
  id: number
  name: string
  program?: string
  systemType: string
  typeMatches: boolean
  inEffect: boolean
  effective: { from?: string | null; to?: string | null }
  options: IncentiveOptionCheck[]
  applied: boolean
}

/** Checks one incentive against a system the way specIncentives does, but reports each criteria group instead of only the result. */
export function explainIncentive(rc: RecalcContext, system: SystemRec, incentiveId: number): IncentiveExplanation | null {
  const inc = refData.incentives.find((i) => i.id === incentiveId)
  if (!inc) return null
  const ctxIn = incentiveInputs({ ...rc, lineItems: rc.lineItems.filter((l) => l.system_id !== system.id) })
  const mine = rc.lineItems.filter((l) => l.system_id === system.id)
  const equipment = mine.filter((l) => l.equipment_id).map((l) => refData.equipment.find((e) => e.id === l.equipment_id)).filter(Boolean)
  const labor = mine.filter((l) => l.labor_id).map((l) => refData.labor.find((x) => x.id === l.labor_id)).filter(Boolean)
  const engineSystem = toEngineSystem(system, ctxIn.house.id)
  const ahriId = (system.engine?.ahri_id as number | null | undefined) ?? null
  const ahri = ahriId ? refData.ahri.find((a) => a.id === ahriId) : undefined
  const existing = ctxIn.systems.find((x) => x.id === (system.system_type === 'water heater' ? -2 : -1)) as { system_type_detail?: { heating?: unknown; cooling?: unknown } } | undefined

  const at = new Date(system.rebate_effective_date || now())
  const inEffect = (!inc.active_date || new Date(inc.active_date) <= at) && (!inc.inactive_date || new Date(inc.inactive_date) >= at)
  const typeMatches = inc.system_type === system.system_type

  const evalGroup = (key: string, criteria: Record<string, unknown>): boolean => {
    try {
      if (key === 'equipment') return equipment.some((e) => !!checkCriteria(criteria, e))
      if (key === 'labor') return labor.some((x) => !!checkCriteria(criteria, x))
      if (key === 'home' || key === 'house') return !!checkCriteria(criteria, ctxIn.house)
      if (key === 'customer') return !!checkCriteria(criteria, ctxIn.customer)
      if (key === 'system') return !!checkCriteria(criteria, engineSystem)
      if (key === 'ahri') return !!checkCriteria(criteria, ahri)
      if (key === 'existing_system') {
        const d = existing?.system_type_detail as { heating?: unknown; cooling?: unknown } | undefined
        const c = criteria as { heating?: unknown; cooling?: unknown }
        const data = c.heating && c.cooling ? { cooling: d?.cooling ?? {}, heating: d?.heating ?? {} } : c.cooling ? d?.cooling : c.heating ? d?.heating : d?.heating ?? d
        return !!checkCriteria(criteria, data)
      }
    } catch { /* a malformed criterion counts as not met */ }
    return false
  }

  const options = Object.entries((inc.incentive_criteria ?? {}) as Record<string, { criteria?: Record<string, any>; amount?: { max_amount?: number } }>).map(([name, opt]) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const crit = opt.criteria ?? {}
    const keys = Object.keys(crit)
    const notEligibleByRule = crit.amount?.max_amount === 0
    const groups = keys.filter((k) => k !== 'amount').map((k) => ({ key: k, ok: evalGroup(k, crit[k]), criteria: crit[k] }))
    return { name, notEligibleByRule, maxAmount: opt.amount?.max_amount, groups, eligible: !notEligibleByRule && groups.every((g) => g.ok) }
  })
  return {
    id: inc.id, name: String(inc.name ?? ''), program: (inc as { program?: string }).program, systemType: String(inc.system_type ?? ''),
    typeMatches, inEffect, effective: { from: inc.active_date, to: inc.inactive_date }, options,
    applied: mine.some((l) => l.line_item_type === 'incentive' && l.incentive_id === inc.id),
  }
}

/* ---------- Circuit length: reprice one circuit labor line ---------- */

export const formatCircuit = (length: number, difficult: boolean) => `${length} ft${difficult ? ', difficult' : ''}`

/** "50 ft, difficult" back into numbers. */
export function parseCircuit(text: string | undefined): { length: number; difficult: boolean } | null {
  const m = /(\d+(?:\.\d+)?)\s*ft/i.exec(text ?? '')
  return m ? { length: Number(m[1]), difficult: /difficult/i.test(text ?? '') } : null
}

/** Is this a circuit labor line (the ones priced by length)? */
export function isCircuitLine(l: Pick<LineItemRec, 'line_item_type' | 'labor_id'>): boolean {
  return l.line_item_type === 'labor' && !!l.labor_id && refData.labor.find((x) => x.id === l.labor_id)?.subcategory === 'circuit'
}

/** Price of a circuit for a given length. The first circuit in a system carries the first-circuit adder; the engine applies it once per call,
 *  so a later circuit is priced as the second line of a pair. */
export function priceCircuit(laborId: number, length: number, difficult: boolean, firstInSystem: boolean, pricingStructure: string, date: string):
  { ok: true; price: number } | { ok: false; error: string } {
  try {
    const line = { labor_id: laborId, line_item_type: 'labor', additional_data: { electrical: { circuit_length: length, difficult } } } as unknown as EngineLineItem
    const res = priceLineItems([line, { ...line }], refData, { pricingStructure, pricingEffectiveDate: date })
    if (!res.ok) return { ok: false, error: res.errors.map(msg)[0] ?? 'Could not price this circuit' }
    if (res.errors.length) return { ok: false, error: res.errors.map(msg)[0] }
    return { ok: true, price: Number(res.result[firstInSystem ? 0 : 1].price_actual ?? 0) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Merge a recalculation back onto the system's saved lines, by id, the way Retool upserts. The engine only owns margin and incentive data; anything else on a
 *  line (note, "show in proposal", assigned units, status, change order details, cost, ...) is kept. New incentive lines get ids from `nextId`.
 *  Lines the engine no longer returns (replaced incentives) are dropped. */
export function mergeRecalculated(existing: LineItemRec[], out: RecalcLine[], systemId: number, nextId: () => number): LineItemRec[] {
  const byId = new Map(existing.map((l) => [l.id, l]))
  return out.map((o) => {
    const { id, ...fields } = o
    const defined = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as Partial<LineItemRec>
    const old = id !== undefined ? byId.get(id) : undefined
    if (!old) return { ...(defined as NewLine), id: nextId(), system_id: systemId } as LineItemRec
    // a line the engine returns as new data keeps the saved values it does not set
    return { ...old, ...defined, id: old.id, system_id: systemId, ...(o.line_item_type === 'margin' || o.line_item_type === 'incentive' ? {} : { price_actual: old.price_actual, description: old.description }) } as LineItemRec
  })
}

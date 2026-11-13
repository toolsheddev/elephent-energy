/* Advanced branch boxes for multi-unit Mitsubishi systems. Port of Retool's calculateBranchBoxes.js: from the number of indoor units, the indoor and
   outdoor series and the refrigerant, which branch boxes, tee joints or branch joints the system needs. The result goes into
   heatPump.branchBoxes.advanced, and the spec engine attaches it to the matching equipment lines. */
import type { CalculatedBranchBox } from '@sd/engine'
import { refData } from './engine'

export interface BranchBoxCalculation {
  enabled: boolean
  totalUnits: number
  ahuCount: number
  miniSplitCount: number
  indoorSeries: string | null
  outdoorSeries: string | null
  refrigerant: string | null
  branchBoxes: CalculatedBranchBox[]
  /** series could not be read from the chosen models */
  needsSeriesSelection: boolean
  isManualOverride: boolean
}

const MODELS = {
  'R-454B': { bb3: 'PAC-LMA30BC', bb5: 'PAC-LMA50BC', joint: 'MSDD-50AR2-E' },
  'R-410A': { bb3: 'PAC-MKA32BC', bb5: 'PAC-MKA52BC', joint: 'MSDD-50AR-E' },
}
const modelsFor = (refrigerant: string | null) => (refrigerant === 'R-454B' ? MODELS['R-454B'] : MODELS['R-410A']) // unknown refrigerant defaults to R-410A

function box(id: string, name: string, type: string, model: string, refrigerant: string | null): CalculatedBranchBox {
  return { id, name, type, model, refrigerant }
}

/** Which boxes a system of `unitCount` indoor units needs. M indoor with M outdoor needs none. */
export function autoBranchBoxes(unitCount: number, indoor: string | null, outdoor: string | null, refrigerant: string | null): CalculatedBranchBox[] {
  if (unitCount <= 1) return []
  if (indoor === 'M' && outdoor === 'M') return []
  const m = modelsFor(refrigerant)
  const bb3 = `Branch Box (3-port ${m.bb3})`
  const bb5 = `Branch Box (5-port ${m.bb5})`
  const joint = `Tee Joint (${m.joint})`
  const r = refrigerant

  if (indoor === 'M' && outdoor === 'SM') {
    if (unitCount <= 3) return [box('bb3_1', bb3, '3-port', m.bb3, r)]
    if (unitCount <= 5) return [box('bb5_1', bb5, '5-port', m.bb5, r)]
    if (unitCount === 6) return [box('bb3_1', `Box 1 ${bb3}`, '3-port', m.bb3, r), box('bb3_2', `Box 2 ${bb3}`, '3-port', m.bb3, r), box('msdd_1', joint, 'tee', m.joint, r)]
    if (unitCount <= 8) return [box('bb5_1', `Box 1 ${bb5}`, '5-port', m.bb5, r), box('bb3_1', `Box 2 ${bb3}`, '3-port', m.bb3, r), box('msdd_1', joint, 'tee', m.joint, r)]
    if (unitCount <= 10) return [box('bb5_1', `Box 1 ${bb5}`, '5-port', m.bb5, r), box('bb5_2', `Box 2 ${bb5}`, '5-port', m.bb5, r), box('msdd_1', joint, 'tee', m.joint, r)]
    return []
  }
  if (indoor === 'S' && outdoor === 'SM') {
    if (unitCount === 2) return [{ id: 'cmy62_1', name: 'Branch Joint (2-port CMY-Y62-G-E)', type: '2-port', model: 'CMY-Y62-G-E' }]
    if (unitCount <= 4) return [{ id: 'cmy64_1', name: 'Branch Joint (4-port CMY-Y64-G-E)', type: '4-port', model: 'CMY-Y64-G-E' }]
    if (unitCount <= 8) return [{ id: 'cmy68_1', name: 'Branch Joint (8-port CMY-Y68-G-E)', type: '8-port', model: 'CMY-Y68-G-E' }]
  }
  return []
}

/** The branch box equipment a person can pick from in manual override (3- and 5-port boxes). */
export const manualBranchBoxOptions = () => refData.equipment.filter((e) => e.equipment_type === 'Branch Box' && e.active !== false)

export function calculateBranchBoxes(args: {
  ahuModelIds: (number | null)[]
  msModelIds: (number | null)[]
  condenserId: number | null
  /** manual override: model number -> quantity */
  manual?: Record<string, number>
}): BranchBoxCalculation {
  const eq = (id: number | null) => refData.equipment.find((e) => e.id === id)
  const ahuCount = args.ahuModelIds.length
  const miniSplitCount = args.msModelIds.length
  const totalUnits = ahuCount + miniSplitCount
  const condenser = eq(args.condenserId)
  const outdoorSeries = (condenser?.model_series as string | null | undefined) ?? null
  const refrigerant = (condenser?.refrigerant as string | null | undefined) ?? null
  // The indoor series comes from the first chosen air handler, else the first chosen head
  const indoorSeries = [...args.ahuModelIds, ...args.msModelIds].map((id) => (eq(id)?.model_series as string | null | undefined) ?? null).find((s) => !!s) ?? null
  const base = { enabled: true, totalUnits, ahuCount, miniSplitCount, indoorSeries, outdoorSeries, refrigerant }

  if (args.manual) {
    const boxes: CalculatedBranchBox[] = []
    for (const [model, qty] of Object.entries(args.manual)) {
      if (!(qty > 0)) continue
      const portType = model.includes('30') || model.includes('32') ? '3-port' : model.includes('50') || model.includes('52') ? '5-port' : ''
      const refrig = (refData.equipment.find((e) => e.model_number === model)?.refrigerant as string | null | undefined) ?? refrigerant
      for (let i = 1; i <= qty; i++) {
        boxes.push({ id: `${model}_${i}`, name: qty > 1 ? `Box ${i} Branch Box (${portType} ${model})` : `Branch Box (${portType} ${model})`, type: portType, model, refrigerant: refrig, maxCapacity: portType === '3-port' ? 3 : 5, assignedUnits: [] })
      }
    }
    if (boxes.length > 1 && indoorSeries === 'M' && outdoorSeries === 'SM') {
      const m = modelsFor(refrigerant)
      boxes.push({ id: 'msdd_1', name: `Tee Joint (${m.joint})`, type: 'tee', model: m.joint, refrigerant, maxCapacity: 2, assignedUnits: [] })
    }
    return { ...base, branchBoxes: boxes, needsSeriesSelection: false, isManualOverride: true }
  }

  return { ...base, branchBoxes: autoBranchBoxes(totalUnits, indoorSeries, outdoorSeries, refrigerant), needsSeriesSelection: !indoorSeries || !outdoorSeries, isManualOverride: false }
}

/* ---- Assigning each indoor head to a box (Retool: trackBranchBoxCapacity + collectBranchBoxAssignments) ---- */

/** Which box (by id) each air handler and mini-split head is connected to; null when not assigned. Index = position in the unit list. */
export interface UnitAssignments { ahu: (string | null)[]; ms: (string | null)[] }

/** How many indoor units a box or joint can serve. A tee joint connects two boxes, not units. */
export function boxCapacity(type: string): number {
  switch (type) {
    case '2-port': return 2
    case '3-port': return 3
    case '4-port': return 4
    case '5-port': return 5
    case '8-port': return 8
    default: return 0
  }
}

/** Boxes that take units. Tee joints are not offered in the dropdowns. */
export const assignableBoxes = (boxes: CalculatedBranchBox[]) => boxes.filter((b) => b.type !== 'tee')

/** Drops assignments that point at a box that no longer exists, or beyond a box's capacity (first come first kept). */
export function cleanAssignments(boxes: CalculatedBranchBox[], a: UnitAssignments): UnitAssignments {
  const cap = new Map(assignableBoxes(boxes).map((b) => [String(b.id), boxCapacity(b.type ?? "")]))
  const used = new Map<string, number>()
  const keep = (id: string | null) => {
    if (!id || !cap.has(id)) return null
    const n = used.get(id) ?? 0
    if (n >= (cap.get(id) ?? 0)) return null
    used.set(id, n + 1)
    return id
  }
  return { ahu: a.ahu.map(keep), ms: a.ms.map(keep) }
}

/** Boxes a given unit may pick: those with room left, plus the one it already has. */
export function boxOptionsFor(boxes: CalculatedBranchBox[], a: UnitAssignments, kind: 'ahu' | 'ms', index: number) {
  const mine = a[kind][index] ?? null
  const used = new Map<string, number>()
  for (const id of [...a.ahu, ...a.ms]) if (id) used.set(id, (used.get(id) ?? 0) + 1)
  return assignableBoxes(boxes).map((b) => {
    const id = String(b.id), max = boxCapacity(b.type ?? ""), n = used.get(id) ?? 0
    return { value: id, label: `${b.name} (${n} of ${max} used)`, disabled: n >= max && mine !== id }
  })
}

/** The boxes with `assignedUnits`, `maxCapacity` and `remainingCapacity` filled in, as the spec engine and the line items expect. */
export function withAssignments(
  boxes: CalculatedBranchBox[], a: UnitAssignments, unitModelIds: { ahu: (number | null)[]; ms: (number | null)[] },
): CalculatedBranchBox[] {
  const clean = cleanAssignments(boxes, a)
  const name = (id: number | null, fallback: string) => {
    const e = refData.equipment.find((x) => x.id === id)
    return (e?.model_number as string | undefined) || (e?.equipment_name as string | undefined) || fallback
  }
  return boxes.map((b) => {
    const max = b.type === 'tee' ? 2 : boxCapacity(b.type ?? "")
    const units = [
      ...clean.ahu.map((id, index) => (id === String(b.id) ? { type: 'AHU', index, name: name(unitModelIds.ahu[index] ?? null, `AHU ${index + 1}`), modelId: unitModelIds.ahu[index] ?? null } : null)),
      ...clean.ms.map((id, index) => (id === String(b.id) ? { type: 'MS', index, name: name(unitModelIds.ms[index] ?? null, `MS ${index + 1}`), modelId: unitModelIds.ms[index] ?? null } : null)),
    ].filter((x) => x !== null)
    return { ...b, maxCapacity: max, assignedUnits: units, remainingCapacity: b.type === 'tee' ? 0 : max - units.length }
  })
}

/** Retool's `assignments` object, `{ ahus: {0: {key, modelId, assignedTo}}, miniSplits: {...} }`. */
export function toRetoolAssignments(a: UnitAssignments, unitModelIds: { ahu: (number | null)[]; ms: (number | null)[] }) {
  const out = { ahus: {} as Record<number, unknown>, miniSplits: {} as Record<number, unknown> }
  a.ahu.forEach((id, i) => { out.ahus[i] = { key: i, modelId: unitModelIds.ahu[i] ?? null, assignedTo: id } })
  a.ms.forEach((id, i) => { out.miniSplits[i] = { key: i, modelId: unitModelIds.ms[i] ?? null, assignedTo: id } })
  return out
}

/** Reads `assignments` back from a saved system (the inverse of toRetoolAssignments). */
export function fromRetoolAssignments(raw: unknown, ahuCount: number, msCount: number): UnitAssignments {
  const r = (raw ?? {}) as { ahus?: Record<string, { assignedTo?: string | null }>; miniSplits?: Record<string, { assignedTo?: string | null }> }
  return {
    ahu: Array.from({ length: ahuCount }, (_, i) => r.ahus?.[i]?.assignedTo ?? null),
    ms: Array.from({ length: msCount }, (_, i) => r.miniSplits?.[i]?.assignedTo ?? null),
  }
}

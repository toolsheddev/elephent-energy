/* Keeps each proposal's permit lines in sync with its systems, using the ported specPermits logic.
   Permits are stored on the proposal's catch-all 'other' system, as in Retool. */
import { specPermits, type LineItem as EngineLine, type System as EngineSystem } from '@sd/engine'
import { refData, toEngineHouse } from './engine'
import type { LineItemRec, ProjectBundle, SystemRec } from './types'

const today = () => new Date().toISOString().slice(0, 10)

/** Create the catch-all system for a proposal if it does not have one. */
export function ensureCatchAll(b: ProjectBundle, proposalId: number, nextId: () => number): SystemRec {
  let sys = b.systems.find((s) => s.proposal_id === proposalId && s.system_type === 'other')
  if (!sys) {
    const prop = b.proposals.find((p) => p.id === proposalId)
    sys = {
      id: nextId(), proposal_id: proposalId, system_type: 'other', nickname: '', scope: 'base', input: {},
      status: 'proposed', target_margin: 0.3, rebate_eligibility_type: '', rebate_effective_date: '', created_at: prop?.created_at ?? today(), stock_alert: false,
    }
    b.systems.push(sys)
  }
  return sys
}

/** Recompute the permit lines for one proposal. Mutates the bundle. */
export function recomputePermits(b: ProjectBundle, proposalId: number, nextId: () => number) {
  if (!b.house) return
  const other = ensureCatchAll(b, proposalId, nextId)
  const house = { ...toEngineHouse(b.house), id: b.project.id }

  const systems: EngineSystem[] = b.systems
    .filter((s) => s.proposal_id === proposalId)
    .map((s) => ({ id: s.id, house_id: house.id, proposal_id: proposalId, system_type: s.system_type, system_status: s.status ?? 'proposed' }))

  const ids = new Set(systems.map((s) => s.id))
  const lineItems: EngineLine[] = b.lineItems
    .filter((l) => ids.has(l.system_id))
    .map((l) => ({
      id: l.id, system_id: l.system_id, line_item_type: l.line_item_type, description: l.description, quantity: l.quantity,
      price_actual: l.price_actual, equipment_id: l.equipment_id ?? null, labor_id: l.labor_id ?? null, permit_id: l.permit_id ?? null,
      status: l.status ?? null, // line_items.sql leaves out change-order and pending-deletion lines
    }))

  const res = specPermits({ house, proposalId, systems, lineItems }, refData)
  if (!res.ok) { console.warn('permits:', res.errors.map((e) => e.message)); return }

  const { inserts, updates, deletes } = res.writes
  if (deletes.length) b.lineItems = b.lineItems.filter((l) => !deletes.includes(l.id))
  for (const u of updates) {
    b.lineItems = b.lineItems.map((l) => (l.id === u.id ? { ...l, price_actual: u.price_actual, description: u.description } : l))
  }
  for (const i of inserts) {
    const rec: LineItemRec = {
      id: nextId(), system_id: other.id, line_item_type: 'permit', description: i.description, quantity: 1,
      price_actual: i.price_actual, cost: null, permit_id: i.permit_id,
    }
    b.lineItems.push(rec)
  }
}

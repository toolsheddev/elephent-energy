/* Every write the UI can make. Each action loads the project, applies the change in memory with the shared domain logic
   (permits, invoices), and writes back inside one transaction. The project row is locked so edits to one project run in order. */
import type {
  ChangeOrderDetails, DepositConfig, ExistingSystems, House, Invoice, InvoiceStatus, LineItemRec, Project, ProjectBundle, Proposal, SystemRec,
} from '@sd/domain/types'
import { buildInvoices, type InvoiceOptions } from '@sd/domain/invoicing'
import { formatCircuit, isCircuitLine, mergeRecalculated, priceCircuit, recalcLines, refData, toEngineLine, type NewLine } from '@sd/domain/engine'
import { calculateFinancingFees } from '@sd/engine'
import { specMaintenancePlan, type MaintenanceCounts } from '@sd/domain/maintenancePlan'
import { generateBaseDesign, mapPricingStructure, type BaseDesignRow, type QuickAddOptions } from '@sd/domain/baseDesign'
import { ensureCatchAll, recomputePermits } from '@sd/domain/permits'
import { reserveIds, tx } from './db'
import { loadBundle, saveBundle, type SaveParts } from './repo'

type NextId = () => number
type Result = { value: unknown; parts: SaveParts }

const DESIGN: SaveParts = { design: true }
const INVOICES: SaveParts = { invoices: true }
const now = () => new Date().toISOString()
/** After a design change: permits are re-derived, then the Synchrony financing fee is shared across the proposal's eligible systems. */
const touch = (b: ProjectBundle, proposalId: number | undefined, nextId: NextId) => {
  if (!proposalId) return
  recomputePermits(b, proposalId, nextId)
  applyFinancingFees(b, nextId, proposalId)
}

/** Port of calculateLineItemFee.js. Only when the project's lender includes Synchrony with an amount. The fee line and its share of the margin move
 *  with the proposal; when the fee no longer applies, an old fee line is removed and its margin given back. */
function applyFinancingFees(b: ProjectBundle, nextId: NextId, proposalId: number) {
  const project = { lender: b.project.lender, financing_amounts: b.project.financing_amounts.map((amount, i) => ({ lender: b.project.lender[i] ?? '', amount })) }
  const mine = b.systems.filter((s) => s.proposal_id === proposalId)
  // The condenser is found by its equipment type (Retool finds it by the description "Condenser")
  const asEngine = (l: LineItemRec) => {
    const e = toEngineLine(l)
    return refData.equipment.find((x) => x.id === l.equipment_id)?.equipment_type === 'Condenser' ? { ...e, description: 'Condenser' } : e
  }
  const systems = mine.map((s) => ({ id: s.id, system_type: s.system_type, line_items: b.lineItems.filter((l) => l.system_id === s.id).map(asEngine) }))
  const res = calculateFinancingFees({ systems, project, equipment: refData.equipment })
  const fed = new Set(res.upserts.map((u) => u.system_id))

  // Systems that no longer get a fee
  for (const s of mine) {
    if (fed.has(s.id)) continue
    const fee = b.lineItems.find((l) => l.system_id === s.id && l.line_item_type === 'financing fees')
    if (!fee) continue
    b.lineItems = b.lineItems.filter((l) => l.id !== fee.id).map((l) => (l.system_id === s.id && l.line_item_type === 'margin' ? { ...l, price_actual: Math.round((l.price_actual - (fee.margin_amount ?? 0)) * 100) / 100 } : l))
  }
  for (const u of res.upserts) {
    const existing = b.lineItems.find((l) => l.system_id === u.system_id && l.line_item_type === 'financing fees')
    if (existing) b.lineItems = b.lineItems.map((l) => (l.id === existing.id ? { ...l, price_actual: u.price_actual, margin_amount: u.margin_amount } : l))
    else b.lineItems.push({ id: nextId(), system_id: u.system_id, line_item_type: 'financing fees', description: u.description, quantity: 1, price_actual: u.price_actual, cost: null, margin_amount: u.margin_amount, show_in_proposal: true })
  }
  for (const m of res.marginUpdates) b.lineItems = b.lineItems.map((l) => (l.id === m.id ? { ...l, price_actual: m.price_actual } : l))
}

class NotFound extends Error {}

/** Margin and incentives for one system's current lines (the engine's Recalculate), merged back onto the saved lines by id. Throws if the engine cannot price it.
 *  Returns the engine's notes (limits reached, EnergySmart cap, ...). */
function recalcSystem(b: ProjectBundle, nextId: NextId, systemId: number): string[] {
  const sy = b.systems.find((x) => x.id === systemId)
  if (!sy || sy.system_type === 'other' || sy.system_type === 'maintenance' || !b.house) return []
  // The fee line is re-applied after the recalculation
  b.lineItems = b.lineItems.filter((l) => !(l.system_id === systemId && l.line_item_type === 'financing fees'))
  const out = recalcLines({ project: b.project, house: b.house, existing: b.existing, systems: b.systems, lineItems: b.lineItems, proposalId: sy.proposal_id, systemId }, sy)
  if (!out.ok) throw new Error(`Could not recalculate ${sy.nickname || sy.system_type}: ${out.errors[0]}`)
  const mine = b.lineItems.filter((l) => l.system_id === systemId)
  // Incentives added by hand are not eligibility results, so the recalculation must not drop or duplicate them
  const manualIncentives = mine.filter((l) => l.line_item_type === 'incentive' && l.is_manual)
  const manualIds = new Set(manualIncentives.map((l) => l.incentive_id))
  const merged = mergeRecalculated(mine, out.lines.filter((l) => !(l.line_item_type === 'incentive' && !l.id && manualIds.has(l.incentive_id ?? null))), systemId, nextId)
  const keptManual = manualIncentives.filter((m) => !merged.some((x) => x.id === m.id))
  b.lineItems = [...b.lineItems.filter((l) => l.system_id !== systemId), ...merged, ...keptManual]
  return out.warnings
}

export interface QuickAddPayload {
  designs: BaseDesignRow[]
  /** existing proposal ids, or the two "create" targets Retool offers */
  targets: (number | 'NEW_EACH' | 'NEW_SINGLE')[]
  pricingStructure: string
  options: QuickAddOptions
}

export interface AddLinesPayload {
  systemIds: number[]
  lines: NewLine[]
  /** include: lines take part in the Elephant Margin; percents holds a per-system override (null = the system's target). */
  margin: { include: boolean; percents: Record<number, number | null> }
  changeOrder?: ChangeOrderDetails
}

async function run(projectId: number, fn: (b: ProjectBundle, nextId: NextId) => Result | Promise<Result>) {
  return tx(async (c) => {
    const lock = await c.query('select 1 from projects_new where id = $1 for update', [projectId])
    if (!lock.rowCount) throw new NotFound(`Project ${projectId} not found`)
    const b = await loadBundle(projectId, c)
    if (!b) throw new NotFound(`Project ${projectId} not found`)
    const nextId = await reserveIds(c)
    const out = await fn(b, nextId)
    await saveBundle(c, b, nextId, out.parts)
    return out.value
  })
}

const ok = (parts: SaveParts): Result => ({ value: true, parts })

/** Action name -> handler. `args` is the array the client sends after the project id. */
export const actions: Record<string, (b: ProjectBundle, nextId: NextId, ...args: any[]) => Result | Promise<Result>> = { // eslint-disable-line @typescript-eslint/no-explicit-any
  /* ---- project info ---- */
  saveProjectInfo(b, _n, patch: { project?: Partial<Project>; house?: Partial<House>; existing?: Partial<ExistingSystems> }) {
    const before = JSON.stringify([b.project.lender, b.project.financing_amounts])
    if (patch.project) b.project = { ...b.project, ...patch.project, updated_at: now() }
    if (patch.house && b.house) b.house = { ...b.house, ...patch.house }
    if (patch.existing) b.existing = { ...b.existing, ...patch.existing }
    const financingChanged = JSON.stringify([b.project.lender, b.project.financing_amounts]) !== before
    if (financingChanged) for (const p of b.proposals) applyFinancingFees(b, _n, p.id)
    return { value: b, parts: { info: true, design: financingChanged } }
  },

  /* ---- invoices ---- */
  generateInvoices(b, nextId, o: InvoiceOptions) {
    const build = buildInvoices(b, o)
    b.invoices = []; b.invoiceLines = []
    b.depositConfig = { first_deposit_pct: o.firstDepositPct, first_deposit_amount_custom: o.firstDepositCustom, first_card_fees: o.firstCardFee, final_card_fees: o.finalCardFee, upfront_discount: o.upfrontDiscount }
    for (const d of build.drafts) {
      const inv: Invoice = {
        id: nextId(), project_id: b.project.id, invoice_type: d.invoice_type, invoice_status: 'not sent', invoice_amount: d.invoice_amount,
        payment_type: 'ACH', finalizing_method: 'customer', memo: '', footer: d.footer, notes: '', evergreen: false, created_at: now(),
      }
      b.invoices.push(inv)
      for (const l of d.lines) b.invoiceLines.push({ ...l, id: nextId(), invoice_id: inv.id })
    }
    return ok(INVOICES)
  },
  /** "Apply Settings": rebuild the lines with new card-fee / upfront-discount choices, keeping the deposit and each invoice's state. */
  applyInvoiceSettings(b, nextId, invoiceId: number, s: { ccFee: boolean; upfrontDiscount: boolean }) {
    const inv = b.invoices.find((i) => i.id === invoiceId)
    const cfg: DepositConfig = b.depositConfig ?? { first_deposit_pct: 0.5, first_deposit_amount_custom: 0, first_card_fees: false, final_card_fees: false, upfront_discount: false }
    if (inv?.invoice_type === 'First Deposit') cfg.first_card_fees = s.ccFee
    else { cfg.final_card_fees = s.ccFee; cfg.upfront_discount = s.upfrontDiscount }
    b.depositConfig = cfg
    const firstAmount = b.invoices.find((i) => i.invoice_type === 'First Deposit')?.invoice_amount ?? 0
    const build = buildInvoices(b, {
      firstDepositPct: firstAmount > 0 && !cfg.first_deposit_amount_custom ? cfg.first_deposit_pct : 0,
      firstDepositCustom: firstAmount > 0 ? (cfg.first_deposit_amount_custom || (cfg.first_deposit_pct ? 0 : firstAmount)) : 0,
      firstCardFee: cfg.first_card_fees, finalCardFee: cfg.final_card_fees, upfrontDiscount: cfg.upfront_discount,
    })
    for (const d of build.drafts) {
      const target = b.invoices.find((i) => i.invoice_type === d.invoice_type)
      if (!target) continue
      target.invoice_amount = d.invoice_amount
      b.invoiceLines = b.invoiceLines.filter((l) => l.invoice_id !== target.id)
      for (const l of d.lines) b.invoiceLines.push({ ...l, id: nextId(), invoice_id: target.id })
    }
    return ok(INVOICES)
  },
  updateInvoice(b, _n, invoiceId: number, patch: Partial<Invoice>) {
    b.invoices = b.invoices.map((i) => (i.id === invoiceId ? { ...i, ...patch } : i))
    return ok(INVOICES)
  },
  /** Sample transitions standing in for Stripe: approve -> send (open) -> paid, or void. */
  setInvoiceStatus(b, _n, invoiceId: number, status: InvoiceStatus | 'approved') {
    b.invoices = b.invoices.map((i) => {
      if (i.id !== invoiceId) return i
      if (status === 'approved') return { ...i, approved_at: now() }
      if (status === 'open') return { ...i, invoice_status: 'open', sent_at: now(), stripe_invoice_id: i.stripe_invoice_id ?? `in_demo_${i.id}` }
      if (status === 'paid') return { ...i, invoice_status: 'paid', paid_at: now() }
      return { ...i, invoice_status: status }
    })
    return ok(INVOICES)
  },
  /** Editing the first deposit cancels outstanding invoices (back to "not sent") and moves the difference to the final invoice. */
  editDepositAmount(b, _n, invoiceId: number, amount: number) {
    const dep = b.invoices.find((i) => i.id === invoiceId)
    const fin = b.invoices.find((i) => i.invoice_type === 'Final Invoice')
    if (!dep || !fin) return { value: false, parts: {} }
    const total = fin.invoice_amount + dep.invoice_amount
    dep.invoice_amount = amount
    fin.invoice_amount = total - amount
    b.invoiceLines = b.invoiceLines.map((l) => {
      if (l.invoice_id === dep.id && l.line_item_type === 'deposit') return { ...l, amount, name: 'First Deposit' }
      if (l.invoice_id === fin.id && l.name === 'Credit for First Deposit') return { ...l, amount: -amount }
      return l
    })
    b.depositConfig = { ...(b.depositConfig ?? { first_deposit_pct: 0, first_card_fees: false, final_card_fees: false, upfront_discount: false }), first_deposit_amount_custom: amount } as DepositConfig
    for (const i of b.invoices) if (i.invoice_status === 'open') { i.invoice_status = 'not sent'; delete i.stripe_invoice_id; delete i.sent_at; delete i.approved_at }
    return ok(INVOICES)
  },
  setCreditCardFee(b, nextId, invoiceId: number, on: boolean) {
    const rest = b.invoiceLines.filter((l) => !(l.invoice_id === invoiceId && l.line_item_type === 'credit card fee'))
    if (on) {
      const due = rest.filter((l) => l.invoice_id === invoiceId).reduce((a, l) => a + l.amount, 0)
      rest.push({ id: nextId(), invoice_id: invoiceId, line_item_type: 'credit card fee', name: '3% Credit Card Fee', amount: Math.round(due * 0.03 * 100) / 100, system_id: null })
    }
    b.invoiceLines = rest
    return ok(INVOICES)
  },
  deleteInvoices(b) {
    b.invoices = []; b.invoiceLines = []; b.depositConfig = null
    return ok(INVOICES)
  },

  /* ---- proposals ---- */
  createProposal(b, nextId, nickname?: string) {
    const p: Proposal = {
      id: nextId(), project_id: b.project.id, nickname: nickname ?? `Proposal ${b.proposals.length + 1}`,
      pricing_structure: b.proposals[0]?.pricing_structure ?? 'standard', status: 'pending', target_margin: 0.25, created_at: now().slice(0, 10),
    }
    b.proposals.push(p)
    ensureCatchAll(b, p.id, nextId)
    return { value: p, parts: DESIGN }
  },
  updateProposal(b, _n, proposalId: number, patch: Partial<Proposal>) {
    b.proposals = b.proposals.map((p) => (p.id === proposalId ? { ...p, ...patch } : p))
    return ok(DESIGN)
  },
  /** Finalize: the proposal becomes 'finalized' and the project points at it. From then on changes go through change orders. */
  finalizeProposal(b, _n, proposalId: number, handoff?: { majorRisks?: string; expectations?: string }) {
    b.proposals = b.proposals.map((p) => (p.id === proposalId ? { ...p, status: 'finalized' } : p))
    const notes = [b.project.handoff_notes, handoff?.majorRisks?.trim() && `Major risks: ${handoff.majorRisks.trim()}`, handoff?.expectations?.trim() && `Customer expectations: ${handoff.expectations.trim()}`].filter(Boolean).join('\n\n')
    b.project = { ...b.project, finalized_proposal_id: proposalId, handoff_notes: notes, updated_at: now() }
    return { value: true, parts: { design: true, info: !!handoff?.majorRisks || !!handoff?.expectations } }
  },
  deleteProposal(b, _n, proposalId: number) {
    const sysIds = new Set(b.systems.filter((s) => s.proposal_id === proposalId).map((s) => s.id))
    b.proposals = b.proposals.filter((p) => p.id !== proposalId)
    b.systems = b.systems.filter((s) => s.proposal_id !== proposalId)
    b.lineItems = b.lineItems.filter((l) => !sysIds.has(l.system_id))
    if (b.project.finalized_proposal_id === proposalId) b.project = { ...b.project, finalized_proposal_id: null }
    return ok(DESIGN)
  },
  duplicateProposal(b, nextId, proposalId: number) {
    const src = b.proposals.find((p) => p.id === proposalId)
    if (!src) throw new NotFound('Proposal not found')
    const np: Proposal = { ...src, id: nextId(), nickname: `${src.nickname} (copy)`, status: 'pending' }
    b.proposals.push(np)
    for (const s of b.systems.filter((s) => s.proposal_id === proposalId)) {
      const ns: SystemRec = { ...s, id: nextId(), proposal_id: np.id }
      b.systems.push(ns)
      for (const l of b.lineItems.filter((l) => l.system_id === s.id)) b.lineItems.push({ ...l, id: nextId(), system_id: ns.id })
    }
    return { value: np, parts: DESIGN }
  },

  /* ---- systems and line items ---- */
  addSystem(b, nextId, system: Omit<SystemRec, 'id'>, lineItems: Omit<LineItemRec, 'id' | 'system_id'>[]) {
    const prop = b.proposals.find((p) => p.id === system.proposal_id)
    if (!prop) throw new NotFound('Proposal not found')
    const inp = system.input as { rebateEligibilityType?: string; rebateEffectiveDate?: string; heatLoadCoverage?: string | null }
    const s: SystemRec = {
      status: 'proposed', target_margin: prop.target_margin ?? 0.25, rebate_eligibility_type: inp.rebateEligibilityType ?? 'none',
      heating_load_coverage: inp.heatLoadCoverage ?? null, rebate_effective_date: (inp.rebateEffectiveDate ?? '').slice(0, 10), created_at: now().slice(0, 10), stock_alert: false,
      ...system, id: nextId(),
    }
    b.systems.push(s)
    for (const l of lineItems) b.lineItems.push({ ...l, id: nextId(), system_id: s.id })
    touch(b, s.proposal_id, nextId)
    return { value: s, parts: DESIGN }
  },
  replaceSystemLines(b, nextId, systemId: number, patch: Partial<SystemRec>, lineItems: Omit<LineItemRec, 'id' | 'system_id'>[]) {
    b.systems = b.systems.map((s) => (s.id === systemId ? { ...s, ...patch } : s))
    b.lineItems = b.lineItems.filter((l) => l.system_id !== systemId)
    for (const l of lineItems) b.lineItems.push({ ...l, id: nextId(), system_id: systemId })
    touch(b, b.systems.find((x) => x.id === systemId)?.proposal_id, nextId)
    return ok(DESIGN)
  },
  updateSystem(b, _n, systemId: number, patch: Partial<SystemRec>) {
    b.systems = b.systems.map((s) => (s.id === systemId ? { ...s, ...patch } : s))
    return ok(DESIGN)
  },
  markSystemForDeletion(b, _n, systemId: number, co: ChangeOrderDetails) {
    b.systems = b.systems.map((s) => (s.id === systemId ? { ...s, status: 'pending deletion', change_order: co } : s))
    return ok(DESIGN)
  },
  deleteSystem(b, nextId, systemId: number) {
    const proposalId = b.systems.find((s) => s.id === systemId)?.proposal_id
    b.systems = b.systems.filter((s) => s.id !== systemId)
    b.lineItems = b.lineItems.filter((l) => l.system_id !== systemId)
    touch(b, proposalId, nextId)
    return ok(DESIGN)
  },
  duplicateSystem(b, nextId, systemId: number, toProposalId?: number) {
    const src = b.systems.find((s) => s.id === systemId)
    if (!src) throw new NotFound('System not found')
    const ns: SystemRec = { ...src, id: nextId(), proposal_id: toProposalId ?? src.proposal_id, nickname: `${src.nickname} dup` }
    b.systems.push(ns)
    for (const l of b.lineItems.filter((l) => l.system_id === systemId)) b.lineItems.push({ ...l, id: nextId(), system_id: ns.id })
    touch(b, ns.proposal_id, nextId)
    return { value: ns, parts: DESIGN }
  },
  moveSystem(b, nextId, systemId: number, toProposalId: number) {
    const from = b.systems.find((s) => s.id === systemId)?.proposal_id
    b.systems = b.systems.map((s) => (s.id === systemId ? { ...s, proposal_id: toProposalId } : s))
    touch(b, from, nextId)
    touch(b, toProposalId, nextId)
    return ok(DESIGN)
  },
  /** Retool's "Add a Maintenance Plan": a system of its own whose lines are the plan options, priced from the maintenance plan rows. */
  createMaintenancePlan(b, nextId, p: { proposalId: number; level: string; counts: MaintenanceCounts }) {
    const prop = b.proposals.find((x) => x.id === p.proposalId)
    if (!prop) throw new NotFound('Proposal not found')
    if (b.project.finalized_proposal_id === prop.id) throw new Error('This proposal is finalized. Add a maintenance plan through a change order.')
    const out = specMaintenancePlan(p.level, p.counts, prop.pricing_structure, new Date().toISOString().slice(0, 10))
    if (!out.ok) throw new Error(out.errors[0])
    const sys: SystemRec = {
      id: nextId(), proposal_id: prop.id, system_type: 'maintenance', nickname: `${p.level[0].toUpperCase()}${p.level.slice(1)} maintenance plan`, scope: 'base', status: 'proposed',
      target_margin: 0, rebate_eligibility_type: '', rebate_effective_date: '', created_at: now().slice(0, 10), stock_alert: false, input: { maintenancePlan: { level: p.level, counts: p.counts } },
    }
    b.systems.push(sys)
    for (const l of out.lines) b.lineItems.push({ ...l, id: nextId(), system_id: sys.id })
    return { value: sys, parts: DESIGN }
  },
  /** Retool's "Select a Base Design" flow: every chosen base design becomes a system in every target proposal. */
  quickAddBaseDesigns(b, nextId, p: QuickAddPayload) {
    if (!p.designs.length || !p.targets.length) throw new Error('Select at least one Base Design and one proposal')
    if (new Set(p.designs.map((d) => d.system_type.toLowerCase())).size > 1) throw new Error('You cannot mix HVAC and Water Heater systems in the same batch')
    if (!b.house) throw new Error('This project has no house yet')
    const finalizedId = b.project.finalized_proposal_id
    const existing = p.targets.filter((t): t is number => typeof t === 'number')
    if (existing.some((id) => id === finalizedId)) throw new Error('The finalized proposal changes through change orders, not Base Designs')
    const pricing = p.pricingStructure || mapPricingStructure(p.designs[0].pricing_structure)
    // The project and its proposals share one pricing structure
    b.proposals = b.proposals.map((x) => ({ ...x, pricing_structure: pricing }))
    const newProposal = (name: string) => {
      const prop: Proposal = { id: nextId(), project_id: b.project.id, nickname: name, pricing_structure: pricing, status: 'pending', target_margin: p.options.margin, created_at: now().slice(0, 10) }
      b.proposals.push(prop)
      ensureCatchAll(b, prop.id, nextId)
      return prop.id
    }
    const single = p.targets.includes('NEW_SINGLE') ? newProposal(p.designs[0].nickname) : null
    const touched = new Set<number>()
    for (const d of p.designs) {
      const targets = [...existing, ...(single ? [single] : []), ...(p.targets.includes('NEW_EACH') ? [newProposal(d.nickname)] : [])]
      for (const proposalId of targets) {
        const { input, outcome } = generateBaseDesign({ project: b.project, house: b.house, existing: b.existing, systems: b.systems, lineItems: b.lineItems, proposalId }, d, p.options, pricing)
        if (!outcome.ok) throw new Error(`${d.nickname}: ${outcome.errors[0]}`)
        const sys: SystemRec = {
          id: nextId(), proposal_id: proposalId, system_type: d.system_type.toLowerCase() as SystemRec['system_type'], nickname: d.nickname, scope: 'base',
          status: 'proposed', target_margin: outcome.targetMargin, rebate_eligibility_type: 'none', rebate_effective_date: (p.options.rebateDate || '').slice(0, 10),
          created_at: now().slice(0, 10), stock_alert: false, input: input as unknown as Record<string, unknown>, engine: outcome.engineSystem,
        }
        b.systems.push(sys)
        for (const l of outcome.lines) b.lineItems.push({ ...l, id: nextId(), system_id: sys.id })
        touched.add(proposalId)
      }
    }
    for (const id of touched) touch(b, id, nextId)
    return { value: touched.size, parts: { design: true, info: true } }
  },
  /** The Recalculate button: margin and incentives on the current lines of the given systems (no re-spec), then permits and the financing fee. */
  recalculateSystems(b, nextId, systemIds: number[]) {
    const notes: string[] = []
    const proposals = new Set<number>()
    let lines = 0
    for (const sid of systemIds) {
      const sy = b.systems.find((x) => x.id === sid)
      if (!sy) throw new NotFound('System not found')
      notes.push(...recalcSystem(b, nextId, sid))
      proposals.add(sy.proposal_id)
      lines += b.lineItems.filter((l) => l.system_id === sid).length
    }
    for (const pid of proposals) touch(b, pid, nextId)
    return { value: { systems: systemIds.length, lines, notes }, parts: DESIGN }
  },
  /** Retool's circuit-length editor: new length (and difficulty) for one circuit line, repriced, then margin, incentives and permits are redone. */
  updateCircuitLength(b, nextId, lineId: number, length: number, difficult: boolean) {
    const line = b.lineItems.find((l) => l.id === lineId)
    if (!line) throw new NotFound('Line item not found')
    if (!isCircuitLine(line) || !line.labor_id) throw new Error('Only circuit labor lines are priced by length')
    if (!(length > 0)) throw new Error('Circuit length must be more than 0')
    const sy = b.systems.find((x) => x.id === line.system_id)
    if (!sy) throw new NotFound('System not found')
    if (b.project.finalized_proposal_id === sy.proposal_id) throw new Error('This proposal is finalized. Change its lines through a change order.')
    const pricing = b.proposals.find((p) => p.id === sy.proposal_id)?.pricing_structure ?? 'standard'
    const firstCircuit = b.lineItems.find((l) => l.system_id === sy.id && isCircuitLine(l))
    const out = priceCircuit(line.labor_id, length, difficult, firstCircuit?.id === line.id, pricing, new Date().toISOString().slice(0, 10))
    if (!out.ok) throw new Error(out.error)
    b.lineItems = b.lineItems.map((l) => (l.id === lineId ? { ...l, price_actual: out.price, circuit: formatCircuit(length, difficult) } : l))
    recalcSystem(b, nextId, sy.id)
    touch(b, sy.proposal_id, nextId)
    return ok(DESIGN)
  },
  /** Retool's "Add Line Items" modal: the same lines onto each selected system, then margin, incentives and permits are redone. */
  addLineItems(b, nextId, p: AddLinesPayload) {
    if (!p.lines.length || !p.systemIds.length) throw new Error('Pick at least one system and one line item')
    const finalizedId = b.project.finalized_proposal_id
    const proposalsTouched = new Set<number>()
    for (const sid of p.systemIds) {
      const sy = b.systems.find((x) => x.id === sid)
      if (!sy) throw new NotFound('System not found')
      if (sy.system_type === 'other') throw new Error('Permits and other lines are calculated automatically')
      const inChangeOrder = !!p.changeOrder && finalizedId === sy.proposal_id
      const override = p.margin.percents[sid]
      const target = sy.target_margin ?? null
      for (const l of p.lines) {
        b.lineItems.push({
          ...l, id: nextId(), system_id: sid, is_manual: true, show_in_proposal: true,
          margin_to_include: p.margin.include ? undefined : false,
          margin_percent: p.margin.include && override != null && override !== target ? override : null,
          status: inChangeOrder ? 'proposed - from change order' : finalizedId === sy.proposal_id ? 'active - from finalized proposal' : undefined,
          change_order_details: inChangeOrder ? p.changeOrder : undefined,
        })
        // A change order paid for by someone other than the homeowner gets a matching discount, as in Retool
        if (inChangeOrder && p.changeOrder!.responsible && p.changeOrder!.responsible !== 'Homeowner' && l.price_actual > 0) {
          b.lineItems.push({
            line_item_type: 'discount', description: `Price Matching Discount (${l.description})`, quantity: l.quantity, price_actual: -l.price_actual, cost: null,
            id: nextId(), system_id: sid, is_manual: true, show_in_proposal: true, margin_to_include: false, status: 'proposed - from change order', change_order_details: p.changeOrder,
          })
        }
      }
      recalcSystem(b, nextId, sid)
      proposalsTouched.add(sy.proposal_id)
    }
    for (const pid of proposalsTouched) touch(b, pid, nextId)
    return ok(DESIGN)
  },
  upsertLineItem(b, nextId, item: Omit<LineItemRec, 'id'> & { id?: number }) {
    if (item.id) b.lineItems = b.lineItems.map((l) => (l.id === item.id ? ({ ...l, ...item } as LineItemRec) : l))
    else b.lineItems.push({ ...item, id: nextId() } as LineItemRec)
    return ok(DESIGN)
  },
  /** Delete lines, then redo margin, incentives and permits for the systems they were on. Incentive and margin lines cannot be deleted. */
  deleteLineItems(b, nextId, ids: number[]) {
    const del = new Set(ids)
    const gone = b.lineItems.filter((l) => del.has(l.id))
    if (gone.some((l) => l.line_item_type === 'incentive' || l.line_item_type === 'margin')) throw new Error('Cannot delete incentive or margin line items')
    b.lineItems = b.lineItems.filter((l) => !del.has(l.id))
    const systems = [...new Set(gone.map((l) => l.system_id))]
    for (const sid of systems) recalcSystem(b, nextId, sid)
    for (const pid of new Set(systems.map((sid) => b.systems.find((x) => x.id === sid)?.proposal_id))) touch(b, pid, nextId)
    return ok(DESIGN)
  },
  /** On a finalized proposal lines are not deleted at once: they are marked and keep their price until the change order is approved. */
  deleteLineItemsAsCO(b, _n, ids: number[], co: ChangeOrderDetails) {
    const del = new Set(ids)
    if (b.lineItems.some((l) => del.has(l.id) && (l.line_item_type === 'incentive' || l.line_item_type === 'margin'))) throw new Error('Cannot delete incentive or margin line items')
    b.lineItems = b.lineItems.map((l) => (del.has(l.id) ? { ...l, status: 'pending deletion', change_order_details: co } : l))
    return ok(DESIGN)
  },
}

export async function perform(projectId: number, action: string, args: unknown[]) {
  const handler = actions[action]
  if (!handler) throw new NotFound(`Unknown action ${action}`)
  return run(projectId, (b, nextId) => handler(b, nextId, ...args))
}

export { NotFound }

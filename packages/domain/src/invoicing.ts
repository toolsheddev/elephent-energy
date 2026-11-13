/* Invoice generation, ported from the Retool page logic (invoiceLogic.js / tabsUpsertInvoiceLogic.js).
   Rules that are NOT in the export are marked "ASSUMPTION" below, notably the Final Invoice 90/10 split,
   which lives in the unexported `invoicingWorkflow`. */
import { refData } from './engine'
import type { InvoiceLine, InvoiceType, LineItemRec, ProjectBundle } from './types'

export interface InvoiceOptions {
  /** 0, 0.25, 0.33, 0.5, 1 */
  firstDepositPct: number
  /** When > 0 it replaces the percentage. */
  firstDepositCustom: number
  firstCardFee: boolean
  finalCardFee: boolean
  upfrontDiscount: boolean
}

export type DraftLine = Omit<InvoiceLine, 'id' | 'invoice_id'>

export interface InvoiceDraft {
  invoice_type: InvoiceType
  invoice_amount: number
  lines: DraftLine[]
  footer: string
}

export interface InvoiceBuild {
  drafts: InvoiceDraft[]
  projectTotal: number
  netCost: number
}

const LABOR_NAMES: Record<string, string> = {
  hvac: 'Electric Heat Pump Installation',
  'water heater': 'Heat Pump Water Heater Installation',
  ev: 'Electric Vehicle Charger Installation',
  solar: 'Solar Panel Installation',
  panel: 'Panel Upgrades',
  cooktop: 'Induction Cooktop Wiring',
  'energy efficiency': 'Energy Efficiency Measures',
  maintenance: 'Maintenance Plan',
  other: 'Other',
}

/** Equipment types that get their own invoice line. Everything else is rolled into "Parts & Accessories". */
const ENUMERATED = ['Condenser', 'AHU', 'Dual-Fuel Coil', 'Horizontal-Ducted Head', 'Wall Head', 'Floor Head', 'Ceiling Cassette', 'Thermostat', 'ERV', 'EV Charger', 'HPWH']
const SORT = ['labor', ...ENUMERATED, 'parts', 'permit', 'discount', 'change order', 'incentive']
const LINE_ORDER = ['labor', 'equipment', 'margin', 'discount', 'change order', 'permit', 'maintenance plan']
const EXCLUDED = ['proposed - from change order', 'deleted - from change order', 'pending deletion']
const DENVER_CARES = [38, 70, 71, 72, 73]

interface Item { sort: string; type: string; system_id: number | null; name: string; amount: number; incentive_id?: number | null }

const round2 = (n: number) => Math.round(n * 100) / 100

export function buildInvoices(b: ProjectBundle, o: InvoiceOptions): InvoiceBuild {
  const proposalId = b.project.finalized_proposal_id
  if (!proposalId) throw new Error('A proposal must be finalized in order to generate invoices')

  const systems = b.systems.filter((s) => s.proposal_id === proposalId && !EXCLUDED.includes(s.status ?? ''))
  const perSystem = new Map<number, Record<string, Item>>(systems.map((s) => [s.id, {}]))
  const typeOf = new Map(systems.map((s) => [s.id, s.system_type]))

  const globals: Item[] = []
  let electrical: Item | null = null
  let permits: Item | null = null
  let denver: Item | null = null
  const footerLines: { name: string; amount: number }[] = []

  const amountOf = (l: LineItemRec) => l.price_actual * l.quantity + (l.margin_amount ?? 0)
  const equipmentOf = (id?: number | null) => refData.equipment.find((e) => e.id === id)
  const laborOf = (id?: number | null) => refData.labor.find((x) => x.id === id)

  const lines = b.lineItems
    .filter((l) => perSystem.has(l.system_id))
    .sort((a, c) => {
      const ia = LINE_ORDER.indexOf(a.line_item_type), ic = LINE_ORDER.indexOf(c.line_item_type)
      if (ia !== -1 && ic !== -1) return ia - ic
      return ia !== -1 ? -1 : ic !== -1 ? 1 : 0
    })

  for (const l of lines) {
    const items = perSystem.get(l.system_id)!
    const stype = typeOf.get(l.system_id) ?? 'other'
    const amt = amountOf(l)

    switch (l.line_item_type) {
      case 'labor': {
        const category = laborOf(l.labor_id)?.category
        if (category?.toLowerCase() === 'electrical') {
          if (electrical) electrical.amount += amt
          else { electrical = { sort: 'electrical', type: 'labor', system_id: l.system_id, name: 'Electrical Upgrades', amount: amt }; globals.push(electrical) }
        } else if (stype === 'adder') {
          items[`labor_${l.id}`] = { sort: 'labor', type: 'labor', system_id: l.system_id, name: l.description || 'Custom Installation', amount: amt }
        } else if (items.labor) {
          items.labor.amount += amt
        } else {
          items.labor = { sort: 'labor', type: 'labor', system_id: l.system_id, name: LABOR_NAMES[stype] ?? l.description ?? 'Custom Installation', amount: amt }
        }
        break
      }
      case 'equipment': {
        const eq = equipmentOf(l.equipment_id)
        if (eq && ENUMERATED.includes(eq.equipment_type)) {
          let name = `${eq.equipment_name}  \nModel Number: ${eq.model_number ?? ''}    Serial Number: `
          if (eq.equipment_type === 'HPWH') name += `  \nUEF: ${eq.uef ?? ''}`
          items[`equipment_${l.id}`] = { sort: eq.equipment_type, type: 'equipment', system_id: l.system_id, name, amount: amt }
        } else if (items.parts) {
          items.parts.amount += amt
        } else {
          items.parts = { sort: 'parts', type: 'equipment', system_id: l.system_id, name: 'Parts & Accessories', amount: amt }
        }
        break
      }
      case 'margin':
        break // margin is already spread into the other lines (price + margin_amount)
      case 'financing fees':
        items[`financing_fee_${l.id}`] = { sort: 'discount', type: 'financing fees', system_id: l.system_id, name: 'Synchrony Financing Fee', amount: l.price_actual }
        break
      case 'discount':
        items[`discount_${l.id}`] = { sort: 'discount', type: 'discount', system_id: l.system_id, name: l.description, amount: l.price_actual }
        break
      case 'incentive': {
        if (l.price_actual === 0) break
        const recipient = l.incentive_recipient ?? 'elephant'
        if (l.incentive_id != null && DENVER_CARES.includes(l.incentive_id)) {
          if (!denver) { denver = { sort: 'incentive', type: 'incentive', system_id: null, name: 'Denver Cares Electrical Rebate', amount: 0 }; globals.push(denver) }
          denver.amount += l.price_actual
        } else if (recipient === 'elephant' && l.price_actual > 0) {
          // A positive incentive line (a finance charge) is added to the system's labor line.
          if (items.labor) items.labor.amount += l.price_actual
          else items.labor = { sort: 'labor', type: 'labor', system_id: l.system_id, name: LABOR_NAMES[stype] ?? 'Installation', amount: l.price_actual }
        } else if (recipient === 'elephant') {
          items[`incentive_${l.id}`] = { sort: 'incentive', type: 'incentive', system_id: l.system_id, name: l.description || 'Incentive', amount: l.price_actual }
        } else {
          // Customer / homeowner incentives are paid directly, so they go to the footer, not the invoice total.
          footerLines.push({ name: l.description || 'Incentive', amount: -Math.abs(l.price_actual) })
        }
        break
      }
      case 'permit': {
        if (!permits) { permits = { sort: 'permit', type: 'permit', system_id: null, name: 'Permits', amount: 0 }; globals.push(permits) }
        permits.amount += l.price_actual
        break
      }
      case 'maintenance':
        items.maintenance = { sort: 'maintenance', type: 'maintenance', system_id: l.system_id, name: 'Maintenance Plan', amount: (items.maintenance?.amount ?? 0) + amt }
        break
      default: {
        // ASSUMPTION: Retool throws on an unknown type; we roll it into parts so one odd line does not block invoicing.
        items.parts = { sort: 'parts', type: 'equipment', system_id: l.system_id, name: 'Parts & Accessories', amount: (items.parts?.amount ?? 0) + amt }
      }
    }
  }

  // Assemble: global lines first, then each system's lines in sort order, then discounts, change orders, incentives
  let invoiceLines: Item[] = [...globals]
  const incentiveLines: Item[] = [], discountLines: Item[] = [], changeOrderLines: Item[] = []
  for (const s of systems) {
    const own: Item[] = []
    for (const it of Object.values(perSystem.get(s.id) ?? {})) {
      if (it.sort === 'incentive') incentiveLines.push(it)
      else if (it.sort === 'discount') discountLines.push(it)
      else if (it.sort === 'change order') changeOrderLines.push(it)
      else own.push(it)
    }
    own.sort((a, c) => SORT.indexOf(a.sort) - SORT.indexOf(c.sort))
    invoiceLines = invoiceLines.concat(own)
  }
  invoiceLines = invoiceLines.concat(discountLines, changeOrderLines, incentiveLines)

  const out: DraftLine[] = invoiceLines.map((i) => ({ line_item_type: i.type, name: i.name, amount: round2(i.amount), system_id: i.system_id }))
  let subtotal = out.reduce((a, l) => a + l.amount, 0)

  const other = systems.find((s) => s.system_type === 'other')
  if (o.upfrontDiscount) {
    // Retool also inserts this discount as a line item on the "other" system; we keep it on the invoice only.
    const d = round2(-0.03 * subtotal)
    out.push({ line_item_type: 'discount', name: '3% Upfront Payment Discount', amount: d, system_id: other?.id ?? null })
    subtotal += d
  }
  if (o.finalCardFee) out.push({ line_item_type: 'credit card fee', name: '3% Credit Card Fee', amount: round2(0.03 * subtotal), system_id: null })

  const netCost = round2(out.reduce((a, l) => a + l.amount, 0) + footerLines.reduce((a, l) => a + l.amount, 0))
  const projectTotal = Math.round(out.reduce((a, l) => a + l.amount, 0))

  const hasFirst = o.firstDepositPct > 0 || o.firstDepositCustom > 0
  const drafts: InvoiceDraft[] = []
  let firstAmount = 0
  if (hasFirst) {
    firstAmount = o.firstDepositCustom > 0 ? o.firstDepositCustom : Math.round(projectTotal * o.firstDepositPct)
    const first: DraftLine[] = [{
      line_item_type: 'deposit',
      name: o.firstDepositCustom > 0 ? 'First Deposit' : `First Deposit: ${Math.round(o.firstDepositPct * 100)}% of total`,
      amount: firstAmount, system_id: null,
    }]
    if (o.firstCardFee) first.push({ line_item_type: 'credit card fee', name: '3% Credit Card Fee', amount: round2(0.03 * firstAmount), system_id: null })
    drafts.push({ invoice_type: 'First Deposit', invoice_amount: firstAmount, lines: first, footer: '' })
    out.push({ line_item_type: 'deposit', name: 'Credit for First Deposit', amount: -firstAmount, system_id: null })
  }

  let footer = ''
  if (footerLines.length > 0) {
    footer = 'Incentives payable directly to customer: '
    for (const f of footerLines) footer += `\n $${-f.amount} - ${f.name}`
    footer += `\n\nNet Project Cost: $${netCost}`
    footer += `\nEquipment Purchase Date: ${b.project.closed_at ?? ''}`
    if (b.house?.state === 'MA') {
      footer += '\n\nFor Massachusetts Projects:\nHPIN Company ID NMTPPS1553827498'
      footer += `\nInstall Date: ${b.project.install_start || new Date().toLocaleDateString('en-US')}`
    }
    if (b.house && (b.house.city.includes('Boulder') || b.house.county.includes('Boulder'))) footer += '\n\nRemoval & disposal of old equipment included'
  }
  drafts.push({ invoice_type: 'Final Invoice', invoice_amount: projectTotal - firstAmount, lines: out, footer })

  return { drafts, projectTotal, netCost }
}

/** Default generation options, as in the Retool form (50% first deposit). */
export const DEFAULT_INVOICE_OPTIONS: InvoiceOptions = {
  firstDepositPct: 0.5, firstDepositCustom: 0, firstCardFee: false, finalCardFee: false, upfrontDiscount: false,
}

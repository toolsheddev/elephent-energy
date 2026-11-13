import { PROPOSAL_STATUS_ORDER } from './options'
import type { LineItemRec, ProjectBundle, ProposalStatus } from './types'

export const money = (n: number | null | undefined, opts: { cents?: boolean } = {}) => {
  if (n == null || Number.isNaN(n)) return '—'
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  })
  return n < 0 ? `−$${abs}` : `$${abs}`
}

export const pct = (n: number | null | undefined, digits = 1) =>
  n == null || Number.isNaN(n) ? '—' : `${(n * 100).toFixed(digits)}%`

export const lineTotal = (l: LineItemRec) => l.price_actual * l.quantity
export const lineCost = (l: LineItemRec) => (l.cost ?? 0) * l.quantity

export interface Totals {
  gross: number          // base lines + the Elephant Margin line (before incentives)
  base: number           // base lines only
  marginAmount: number   // sum of 'margin' lines
  incentives: number     // negative
  discounts: number      // negative
  total: number          // what the customer pays
  cost: number
  /** Effective margin = margin / (base + margin). Null until a margin line exists. */
  margin: number | null
}

/** Margin is a line item in Retool ("Elephant Margin"), so customer price = base + margin + incentives. */
export function totalsOf(items: LineItemRec[]): Totals {
  let base = 0, marginAmount = 0, incentives = 0, discounts = 0, cost = 0, hasMargin = false
  for (const l of items) {
    const t = lineTotal(l)
    if (l.line_item_type === 'incentive') incentives += t
    else if (l.line_item_type === 'discount') discounts += t
    else if (l.line_item_type === 'margin') { marginAmount += t; hasMargin = true }
    else base += t
    cost += lineCost(l)
  }
  const gross = base + marginAmount
  return {
    gross, base, marginAmount, incentives, discounts,
    total: gross + incentives + discounts,
    cost,
    margin: hasMargin && gross > 0 ? marginAmount / gross : null,
  }
}

export function systemTotals(b: ProjectBundle, systemId: number) {
  return totalsOf(b.lineItems.filter((l) => l.system_id === systemId))
}

export function proposalTotals(b: ProjectBundle, proposalId: number) {
  const sys = new Set(b.systems.filter((s) => s.proposal_id === proposalId).map((s) => s.id))
  return totalsOf(b.lineItems.filter((l) => sys.has(l.system_id)))
}

/* ---------- Finalization readiness ----------
   The Retool page shows red "Must fill out…" / "Must select…" lines scattered across the form.
   They are collected here as one checklist. */

export interface ReadinessCheck {
  id: string
  label: string
  ok: boolean
  where: 'project' | 'design'
}

export function readiness(b: ProjectBundle, proposalId?: number): ReadinessCheck[] {
  const { project: p, house: h, existing: e } = b
  const sys = b.systems.filter((s) => s.system_type !== 'other' && (proposalId ? s.proposal_id === proposalId : true))
  const hasHvac = sys.some((s) => s.system_type === 'hvac')
  const hasWh = sys.some((s) => s.system_type === 'water heater')
  const checks: ReadinessCheck[] = [
    { id: 'timeline', label: 'Timeline filled out', ok: !!p.timeline.trim(), where: 'project' },
    { id: 'handoff', label: 'Handoff notes filled out', ok: !!p.handoff_notes.trim(), where: 'project' },
    { id: 'financing', label: 'Financing selected (and lender, if financing)', ok: p.financing === 'no' || (p.financing === 'yes' && p.lender.length > 0), where: 'project' },
    { id: 'address', label: 'Home address complete', ok: !!(h?.address && h.city && h.state && h.zipcode), where: 'project' },
    { id: 'panel', label: 'Panel location recorded', ok: !!e.panel.location.trim(), where: 'project' },
  ]
  if (hasHvac) checks.push({ id: 'heating', label: 'Previous heating source selected for HVAC', ok: !!e.heating.type, where: 'project' })
  if (hasWh) checks.push({ id: 'wh', label: 'Previous water heater selected', ok: !!e.water_heater.type, where: 'project' })
  if (h?.state === 'MA') {
    const m = h.ma
    checks.push({
      id: 'ma', label: 'Massachusetts questions answered',
      ok: !!(m.energy_audit && m.recommendations_complete && m.certificate_of_completion && m.whole_home_verification),
      where: 'project',
    })
  }
  checks.push({ id: 'systems', label: 'At least one system designed', ok: sys.length > 0, where: 'design' })
  return checks
}

/** Same rule as the Retool `statuses` function: the most advanced proposal status wins, default 'pending'. */
export function rollupProposalStatus(statuses: ProposalStatus[]): ProposalStatus | null {
  if (statuses.length === 0) return null
  const known = statuses.filter((s) => (PROPOSAL_STATUS_ORDER as readonly string[]).includes(s))
  known.sort((a, b) => (PROPOSAL_STATUS_ORDER as readonly string[]).indexOf(a) - (PROPOSAL_STATUS_ORDER as readonly string[]).indexOf(b))
  return known[0] ?? 'pending'
}

/** Retool: for each invoice type take the most advanced status (paid > open > not sent > void > draft), else 'not created'. */
const INVOICE_STATUS_ORDER = ['paid', 'open', 'not sent', 'void', 'draft']
export function invoiceStatuses(b: ProjectBundle) {
  const pick = (type: string) => {
    const known = (b.invoices ?? []).filter((i) => i.invoice_type === type && INVOICE_STATUS_ORDER.includes(i.invoice_status))
    known.sort((x, y) => INVOICE_STATUS_ORDER.indexOf(x.invoice_status) - INVOICE_STATUS_ORDER.indexOf(y.invoice_status))
    return known[0]?.invoice_status ?? 'not created'
  }
  return { deposit1: pick('First Deposit'), deposit2: pick('Second Deposit'), deposit_final: pick('Final Invoice') }
}

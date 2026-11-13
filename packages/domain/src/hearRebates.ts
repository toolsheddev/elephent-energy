/* HEAR rebate breakdown. Port of the proposal module's hearRebateBreakdown.sql, nonHearRebateBreakdown.sql and hearTotals.js.
   HEAR (Colorado's Home Electrification and Appliance Rebates) shows up as incentive lines whose description mentions HEAR. */
import { refData } from './engine'
import { projectCostBreakdown } from './costBreakdown'
import type { LineItemRec, ProjectBundle } from './types'

export interface HearRow { program: 'Colorado HEAR'; description: string; household_income_category: string | null; type: string; amount: number; line_item_id: number; system_type: string }
export interface NonHearRow { incentive_program: string; incentive_name: string; system_type: string; incentive_recipient_label: string; incentive_amount: number; line_item_id: number; incentive_id: number | null }

const recipientLabel = (r: string | undefined) => (r === 'homeowner' ? 'Reimbursement - Direct to Customer' : r === 'elephant' ? 'Instant discount' : (r ?? ''))
/** The SQL keeps lines that are active, pending deletion, or have no status yet. Proposed change-order lines are left out. */
const counts = (l: LineItemRec) => !l.status || l.status === 'active - from change order' || l.status === 'active - from finalized proposal' || l.status === 'pending deletion'

function incentiveLines(b: ProjectBundle, proposalId: number) {
  const sys = new Map(b.systems.filter((s) => s.proposal_id === proposalId).map((s) => [s.id, s]))
  return b.lineItems.filter((l) => sys.has(l.system_id) && l.line_item_type === 'incentive' && l.price_actual !== null && l.price_actual !== 0 && counts(l)).map((l) => ({ l, system_type: sys.get(l.system_id)!.system_type }))
}

export function hearBreakdown(b: ProjectBundle, proposalId: number): HearRow[] {
  // Retool compares customers_new.annual_gross_income with the codes '50' and '100'
  const category = b.project.income === 50 ? 'Moderate-income' : b.project.income === 100 ? 'Low-income' : null
  return incentiveLines(b, proposalId)
    .filter(({ l }) => /HEAR/i.test(l.description))
    .map(({ l, system_type }) => ({ program: 'Colorado HEAR' as const, description: l.description, household_income_category: category, type: recipientLabel(l.incentive_recipient), amount: Math.round(Math.abs(l.price_actual)), line_item_id: l.id, system_type }))
    .sort((a, c) => (a.household_income_category ?? '').localeCompare(c.household_income_category ?? '') || a.description.localeCompare(c.description))
}

export function nonHearBreakdown(b: ProjectBundle, proposalId: number): NonHearRow[] {
  return incentiveLines(b, proposalId)
    .filter(({ l }) => !/HEAR/i.test(l.description))
    // the SQL joins incentives_new, so lines without a known incentive are not listed
    .map(({ l, system_type }) => ({ l, system_type, inc: refData.incentives.find((i) => i.id === l.incentive_id) }))
    .filter((x) => !!x.inc)
    .map(({ l, system_type, inc }) => ({ incentive_program: String((inc as { program?: string }).program ?? ''), incentive_name: inc!.name, system_type, incentive_recipient_label: recipientLabel(l.incentive_recipient), incentive_amount: Math.round(Math.abs(l.price_actual) * 100) / 100, line_item_id: l.id, incentive_id: l.incentive_id ?? null }))
    .sort((a, c) => a.incentive_program.localeCompare(c.incentive_program) || a.incentive_name.localeCompare(c.incentive_name) || a.system_type.localeCompare(c.system_type))
}

/** hearTotals.js: the customer total before rebates, the two rebate groups, what is left, and the out-of-pocket amount from the cost breakdown. */
export function hearTotals(b: ProjectBundle, proposalId: number) {
  const hear = hearBreakdown(b, proposalId), other = nonHearBreakdown(b, proposalId)
  const rows = projectCostBreakdown(b, [proposalId]).rows
  const val = (label: string) => rows.find((r) => r.label === label)?.values[0] ?? 0
  // the customer total is the project cost before any incentive: gross of the proposal's non-incentive lines
  const sys = new Set(b.systems.filter((s) => s.proposal_id === proposalId).map((s) => s.id))
  const customer_total = b.lineItems.filter((l) => sys.has(l.system_id) && l.line_item_type !== 'incentive' && l.line_item_type !== 'discount' && counts(l)).reduce((n, l) => n + l.price_actual * l.quantity, 0)
  const non_ira_total = other.reduce((n, r) => n + r.incentive_amount, 0)
  const hear_total = hear.reduce((n, r) => n + r.amount, 0)
  return { customer_total, non_ira_total, hear_total, final_customer_cost: customer_total - non_ira_total - hear_total, amount_due: val('Out-of-Pocket Cost (Amount paid to Elephant or Financed)') }
}

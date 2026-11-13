import { totalsOf } from '@/lib/calc'
import type { ProjectBundle, Proposal } from '@/lib/types'

/** What one proposal costs the customer, computed from its saved lines. Used by the option cards, the quote panel and the compare table. */
export function summarizeProposal(b: ProjectBundle, p: Proposal) {
  const systems = b.systems.filter((s) => s.proposal_id === p.id)
  const ids = new Set(systems.map((s) => s.id))
  const lines = b.lineItems.filter((l) => ids.has(l.system_id) && l.status !== 'pending deletion')
  const fee = lines.filter((l) => l.line_item_type === 'financing fees').reduce((n, l) => n + l.price_actual * l.quantity, 0)
  const t = totalsOf(lines.filter((l) => l.line_item_type !== 'financing fees'))
  const designed = systems.filter((s) => s.system_type !== 'other')
  return { p, designed, t, fee, customer: t.total + fee }
}
export type ProposalSummary = ReturnType<typeof summarizeProposal>

/* ---- Stage of the deal, derived from what is saved (nothing is stored for it) ---- */

export const STAGES = ['Lead', 'Home visit', 'Design and price', 'Signed', 'Install'] as const
const INSTALL_STATUSES = ['Needs Dispatching', 'Dispatched', 'Scheduling in Progress', 'Scheduled', 'Installation in Progress', 'Installed', 'Needs Inspection', 'Project Complete']

/** Index of the stage the deal is in (0 to 4). */
export function stageOf(b: ProjectBundle): number {
  if (INSTALL_STATUSES.includes(b.project.project_status)) return 4
  if (b.project.finalized_proposal_id || b.project.project_status === 'won') return 3
  if (b.systems.some((s) => s.system_type !== 'other')) return 2
  if (b.house && (b.existing.panel.location || b.existing.heating.type)) return 1
  return 0
}

/** The same stages for a row of the project list, which only has the headline fields. */
export function listStageOf(r: { status: string; proposal_status: string | null }): number {
  if (INSTALL_STATUSES.includes(r.status)) return 4
  if (r.proposal_status === 'finalized' || r.status === 'won') return 3
  if (r.proposal_status) return 2
  return 0
}
export const isComplete = (status: string) => status === 'Project Complete' || status === 'Installed'

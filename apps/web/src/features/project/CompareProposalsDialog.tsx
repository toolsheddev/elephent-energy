import { useMemo } from 'react'
import { Modal } from '@/components/ui/overlay'
import { StatusPill } from '@/components/ui/core'
import { money, pct, totalsOf } from '@/lib/calc'
import type { LineItemRec, ProjectBundle, Proposal } from '@/lib/types'

/** One column per proposal, so the customer's options can be read side by side. Everything is computed from the saved lines. */
function summarize(b: ProjectBundle, p: Proposal) {
  const systems = b.systems.filter((s) => s.proposal_id === p.id)
  const ids = new Set(systems.map((s) => s.id))
  const lines = b.lineItems.filter((l) => ids.has(l.system_id) && l.status !== 'pending deletion')
  const fees = lines.filter((l) => l.line_item_type === 'financing fees')
  const t = totalsOf(lines.filter((l) => l.line_item_type !== 'financing fees'))
  const fee = fees.reduce((n, l) => n + l.price_actual * l.quantity, 0)
  const designed = systems.filter((s) => s.system_type !== 'other')
  const permits = lines.filter((l: LineItemRec) => systems.find((s) => s.id === l.system_id)?.system_type === 'other').reduce((n, l) => n + l.price_actual * l.quantity, 0)
  return { p, designed, t, fee, permits, customer: t.total + fee }
}

export function CompareProposalsDialog({ open, onClose, bundle: b }: { open: boolean; onClose: () => void; bundle: ProjectBundle }) {
  const cols = useMemo(() => b.proposals.map((p) => summarize(b, p)), [b])
  const priced = cols.filter((c) => c.designed.length > 0)
  const lowest = priced.length > 1 ? Math.min(...priced.map((c) => c.customer)) : null
  const finalizedId = b.project.finalized_proposal_id

  const rows: { label: string; cell: (c: (typeof cols)[number]) => React.ReactNode; strong?: boolean }[] = [
    { label: 'Status', cell: (c) => <StatusPill value={c.p.status} /> },
    {
      label: 'Systems',
      cell: (c) => (c.designed.length === 0 ? <span className="text-ink-3">None yet</span> : (
        <ul className="space-y-1">
          {c.designed.map((s) => <li key={s.id}><span className="font-medium">{s.nickname || s.system_type}</span> <span className="text-ink-3">{s.nickname ? s.system_type : ''}</span></li>)}
        </ul>
      )),
    },
    { label: 'Equipment and labor', cell: (c) => money(c.t.base) },
    { label: 'Elephant margin', cell: (c) => money(c.t.marginAmount) },
    { label: 'Incentives', cell: (c) => (c.t.incentives ? money(c.t.incentives) : '—') },
    { label: 'Discounts', cell: (c) => (c.t.discounts ? money(c.t.discounts) : '—') },
    { label: 'Financing fee', cell: (c) => (c.fee ? money(c.fee) : '—') },
    { label: 'Customer price', strong: true, cell: (c) => <span className={lowest !== null && c.customer === lowest && c.designed.length ? 'text-ok' : ''}>{money(c.customer)}{lowest !== null && c.customer === lowest && c.designed.length ? <span className="ml-2 text-xs font-medium">lowest</span> : null}</span> },
    { label: 'Margin', cell: (c) => pct(c.t.margin) },
    { label: 'Target margin', cell: (c) => pct(c.p.target_margin) },
  ]

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Compare proposals" description="Each column is one proposal. Prices come from the saved line items." size="xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[14px]">
          <thead>
            <tr>
              <th className="w-40 border-b border-line" />
              {cols.map((c) => (
                <th key={c.p.id} scope="col" className="border-b border-line px-4 py-2.5 text-left align-bottom">
                  <div className="font-semibold">{c.p.nickname || `Proposal ${c.p.id}`}</div>
                  <div className="text-xs font-normal text-ink-3">#{c.p.id}{finalizedId === c.p.id ? ' · finalized' : ''}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-line last:border-0">
                <th scope="row" className="whitespace-nowrap px-0 py-3 pr-4 text-left align-top text-xs font-semibold uppercase tracking-wide text-ink-3">{r.label}</th>
                {cols.map((c) => (
                  <td key={c.p.id} className={`num px-4 py-3 align-top ${r.strong ? 'text-[15px] font-semibold' : ''}`}>{r.cell(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

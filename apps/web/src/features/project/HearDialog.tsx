import { useMemo } from 'react'
import { Banner, Button } from '@/components/ui/core'
import { Modal } from '@/components/ui/overlay'
import { money } from '@/lib/calc'
import type { ProjectBundle } from '@/lib/types'
import { hearBreakdown, hearTotals, nonHearBreakdown } from '@sd/domain/hearRebates'

/** Retool's "Open HEAR Info": the Colorado HEAR rebates on the proposal, the other rebates, and what the customer ends up paying. */
export function HearDialog({ open, onClose, bundle: b, proposalId }: { open: boolean; onClose: () => void; bundle: ProjectBundle; proposalId: number }) {
  const proposal = b.proposals.find((p) => p.id === proposalId)
  const hear = useMemo(() => hearBreakdown(b, proposalId), [b, proposalId])
  const other = useMemo(() => nonHearBreakdown(b, proposalId), [b, proposalId])
  const t = useMemo(() => hearTotals(b, proposalId), [b, proposalId])

  const Table = ({ head, rows }: { head: string[]; rows: (string | number)[][] }) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] text-[13.5px]">
        <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-3">{head.map((h, i) => <th key={h} className={`py-1.5 pr-4 font-semibold ${i === head.length - 1 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className={`py-2 pr-4 ${j === r.length - 1 ? 'num text-right font-semibold' : ''}`}>{c}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  )

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="HEAR rebate info" description={proposal ? `${proposal.nickname}: rebates and what the customer pays` : undefined} size="lg" footer={<Button onClick={onClose}>Close</Button>}>
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-4">
          {[['Project cost', t.customer_total], ['Other rebates', -t.non_ira_total], ['HEAR rebates', -t.hear_total], ['After rebates', t.final_customer_cost]].map(([k, v]) => (
            <div key={String(k)} className="rounded-lg border border-line p-3"><p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{k}</p><p className="num text-[20px] font-bold">{money(Number(v))}</p></div>
          ))}
        </div>
        <p className="text-[13.5px] text-ink-2">Customer pays Elephant or finances <span className="num font-bold">{money(t.amount_due)}</span> (the out-of-pocket line of the cost breakdown).</p>

        <section>
          <h3 className="mb-1 text-[15px] font-bold">Colorado HEAR</h3>
          {hear.length === 0 ? <Banner tone="neutral">No HEAR rebate lines on this proposal.</Banner> : (
            <Table head={['Rebate', 'Household income', 'How it is paid', 'Amount']} rows={hear.map((r) => [r.description, r.household_income_category ?? '—', r.type, money(r.amount)])} />
          )}
        </section>
        <section>
          <h3 className="mb-1 text-[15px] font-bold">Other rebates and credits</h3>
          {other.length === 0 ? <Banner tone="neutral">No other rebate lines on this proposal.</Banner> : (
            <Table head={['Program', 'Rebate', 'System', 'How it is paid', 'Amount']} rows={other.map((r) => [r.incentive_program || '—', r.incentive_name, r.system_type, r.incentive_recipient_label, money(r.incentive_amount, { cents: true })])} />
          )}
        </section>
        <p className="text-[12.5px] text-ink-3">Built from the incentive lines on the proposal, like Retool's HEAR breakdown. The household income label follows Retool, which reads the customer's income field as the codes 50 and 100.</p>
      </div>
    </Modal>
  )
}

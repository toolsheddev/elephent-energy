import clsx from 'clsx'
import { Download, FileSignature, Printer, Send } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Banner, Button, Card, CardBody, CardHeader, EmptyState, StatusPill } from '@/components/ui/core'
import { Textarea } from '@/components/ui/form'
import { toast } from '@/components/ui/overlay'
import { money, proposalTotals, systemTotals } from '@/lib/calc'
import { useUpdateProposal } from '@/lib/hooks'
import { CostBreakdownCard } from './CostBreakdownCard'
import type { ProjectBundle } from '@/lib/types'

const today = () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

export function ProposalTab({ bundle: b }: { bundle: ProjectBundle }) {
  const [params, setParams] = useSearchParams()
  const [note, setNote] = useState('Thank you for choosing Elephant Energy. We designed this around how your home runs today, and what you can keep after the upgrade.')
  const proposals = b.proposals
  const id = Number(params.get('proposal')) || proposals[0]?.id
  const proposal = proposals.find((p) => p.id === id)
  const upd = useUpdateProposal(b.project.id)

  if (!proposal) {
    return <Card><EmptyState title="No proposals yet">Design a system first, then come back to preview and send the proposal.</EmptyState></Card>
  }

  const t = proposalTotals(b, proposal.id)
  const systems = b.systems.filter((s) => s.proposal_id === proposal.id && s.system_type !== 'other')
  const deposit = Math.round(t.total * 0.5)
  const hasSystems = systems.length > 0
  const locked = proposal.status === 'finalized'

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Proposal options">
          {proposals.map((p) => (
            <button
              key={p.id} role="tab" type="button" aria-selected={p.id === proposal.id}
              onClick={() => setParams((q) => { q.set('proposal', String(p.id)); return q }, { replace: true })}
              className={clsx('cursor-pointer rounded-full px-4 py-1.5 text-[15px] font-semibold transition-colors', p.id === proposal.id ? 'bg-brand-600 text-white' : 'bg-sunken text-ink-2 hover:bg-brand-50 hover:text-brand-700')}
            >
              {p.nickname}
            </button>
          ))}
        </div>

        {/* Document preview */}
        <div className="overflow-x-auto rounded-lg border border-line bg-sunken p-4 sm:p-8">
          <article id="proposal-doc" className="mx-auto w-full min-w-[560px] max-w-[820px] rounded-sm bg-white p-10 text-[14px] shadow-pop">
            <header className="flex items-start justify-between border-b-2 border-brand-600 pb-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-600">Elephant Energy</p>
                <h2 className="mt-1 text-[20px] font-extrabold leading-tight">Home electrification proposal</h2>
                <p className="mt-1 text-ink-3">{proposal.nickname}</p>
              </div>
              <div className="text-right text-[13px] text-ink-2">
                <p>{today()}</p>
                <p>Proposal #{proposal.id}</p>
              </div>
            </header>

            <section className="grid grid-cols-2 gap-6 py-5 text-[15px]">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-3">Prepared for</p>
                <p className="mt-1 font-semibold">{b.project.first_name} {b.project.last_name}</p>
                {b.house && <p className="text-ink-2">{b.house.address}<br />{b.house.city}, {b.house.state} {b.house.zipcode}</p>}
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-3">Your advisor</p>
                <p className="mt-1 font-semibold">{b.project.hca}</p>
                <p className="text-ink-2">{b.project.email}</p>
              </div>
            </section>

            {note && <p className="rounded-md bg-brand-50 px-4 py-3 text-[15px] leading-relaxed text-ink-2">{note}</p>}

            {!hasSystems ? (
              <p className="py-10 text-center text-ink-3">No systems in this option yet.</p>
            ) : (
              <>
                {systems.map((s) => {
                  const lines = b.lineItems.filter((l) => l.system_id === s.id)
                  const st = systemTotals(b, s.id)
                  const included = lines.filter((l) => l.line_item_type === 'equipment' && l.price_actual > 0 && l.show_in_proposal !== false)
                  return (
                    <section key={s.id} className="mt-6 break-inside-avoid">
                      <div className="flex items-baseline justify-between border-b border-line pb-1.5">
                        <h3 className="text-[16px] font-bold">{s.nickname}</h3>
                        <p className="num font-bold">{money(st.gross + st.discounts)}</p>
                      </div>
                      <ul className="mt-2 space-y-1 text-[15px] text-ink-2">
                        {included.map((l) => <li key={l.id} className="flex gap-2"><span className="text-brand-600">•</span><span>{l.description.split('|').pop()?.trim()}{l.location ? ` — ${l.location}` : ''}</span></li>)}
                        <li className="flex gap-2"><span className="text-brand-600">•</span><span>Professional installation, permits and commissioning</span></li>
                      </ul>
                    </section>
                  )
                })}

                <section className="mt-8 rounded-md border border-line">
                  <table className="w-full text-[14px]">
                    <tbody>
                      <tr><td className="px-4 py-2 text-ink-2">Total price</td><td className="num px-4 py-2 text-right">{money(t.gross + t.discounts)}</td></tr>
                      {t.incentives !== 0 && <tr><td className="px-4 py-2 text-ink-2">Rebates and incentives</td><td className="num px-4 py-2 text-right text-ok">{money(t.incentives)}</td></tr>}
                      <tr className="border-t border-line bg-brand-50"><td className="px-4 py-3 text-[16px] font-bold">Your investment</td><td className="num px-4 py-3 text-right text-[20px] font-extrabold text-brand-700">{money(t.total)}</td></tr>
                      <tr className="border-t border-line"><td className="px-4 py-2 text-ink-2">Deposit to schedule install (50%)</td><td className="num px-4 py-2 text-right font-semibold">{money(deposit)}</td></tr>
                    </tbody>
                  </table>
                </section>
                <p className="mt-4 text-[13px] leading-relaxed text-ink-3">Estimated rebates are subject to utility and program approval. Final amounts may change if the site conditions differ from the survey.</p>
              </>
            )}
          </article>
        </div>
        {hasSystems && <CostBreakdownCard key={proposal.id} bundle={b} activeProposalId={proposal.id} />}
      </div>

      <aside className="space-y-5 xl:sticky xl:top-16">
        <Card>
          <CardHeader title="Send to customer" actions={<StatusPill value={proposal.status} />} />
          <CardBody className="space-y-4">
            <Textarea label="Note to homeowner" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="grid gap-2">
              <Button icon={<Printer className="size-4" />} onClick={() => window.print()} disabled={!hasSystems}>Print preview</Button>
              <Button icon={<Download className="size-4" />} disabled={!hasSystems} onClick={() => toast.success('PDF generated', 'In the live build this calls the proposal service and returns a signed URL.')}>Download PDF</Button>
              {proposal.status === 'out for signature' ? (
                <Button loading={upd.isPending} onClick={() => upd.mutate({ proposalId: proposal.id, patch: { status: 'pending' } }, { onSuccess: () => toast.success('Signature request cancelled', 'The proposal is pending again.') })}>Cancel signature request</Button>
              ) : (
                <Button variant="primary" icon={<FileSignature className="size-4" />} loading={upd.isPending} disabled={!hasSystems || locked}
                  onClick={() => upd.mutate({ proposalId: proposal.id, patch: { status: 'out for signature' } }, { onSuccess: () => toast.success('Sent for signature', `${b.project.email} (sample: no e-signature service is connected)`) })}>Send for signature</Button>
              )}
              <Button icon={<Send className="size-4" />} loading={upd.isPending} disabled={!hasSystems || locked || proposal.status === 'out for signature'}
                title={proposal.status === 'out for signature' ? 'Customer has already selected a proposal for signature' : undefined}
                onClick={() => upd.mutate({ proposalId: proposal.id, patch: { status: 'out for review' } }, { onSuccess: () => toast.success('Numbers sent', 'The proposal is now out for review (sample: no email is sent).') })}>Send the numbers</Button>
            </div>
          </CardBody>
        </Card>
        {b.house?.state === 'MA' && (
          <Banner tone="info" title="Massachusetts">Upload the Whole Home Verification once the energy audit certificate arrives.</Banner>
        )}
      </aside>
    </div>
  )
}

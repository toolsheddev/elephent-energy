import clsx from 'clsx'
import { CheckCircle2, Circle } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Button, StatusPill } from '@/components/ui/core'
import { money, pct, readiness } from '@/lib/calc'
import type { ProjectBundle } from '@/lib/types'
import { summarizeProposal } from './quote'
import { useView, VIEW_OF_CHECK } from './views'


/** The live quote for the active option, plus what is still missing before it can be signed. Stays in view while you scroll. */
export function QuotePanel({ bundle: b, className }: { bundle: ProjectBundle; className?: string }) {
  const [params, setParams] = useSearchParams()
  const { go } = useView()
  const proposal = b.proposals.find((p) => p.id === Number(params.get('proposal'))) ?? b.proposals[0]
  const s = proposal ? summarizeProposal(b, proposal) : null
  const checks = proposal ? readiness(b, proposal.id) : readiness(b)
  const open = checks.filter((c) => !c.ok)
  const finalized = !!b.project.finalized_proposal_id
  const hasSystems = !!s && s.designed.length > 0
  const ask = (what: 'finalize' | 'qa') => { setParams((p) => { p.set('do', what); p.set('view', 'design'); return p }, { replace: true }) }
  const gap = s?.t.margin != null && proposal ? s.t.margin - proposal.target_margin : null

  return (
    <aside aria-label="Live quote" className={clsx('space-y-3 xl:sticky xl:top-[84px] xl:max-h-[calc(100vh-100px)] xl:overflow-y-auto xl:pr-0.5', className)}>
      <section className="rounded-lg border border-line bg-surface p-4">
        {!proposal || !s ? (
          <p className="text-[14px] text-ink-3">Add an option to see the quote.</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-[13.5px] font-semibold text-ink-2">{proposal.nickname}</p>
              <StatusPill value={proposal.status} />
            </div>
            <p className="num mt-1 text-[26px] font-extrabold leading-none tracking-tight">{hasSystems ? money(s.customer) : '—'}</p>
            <p className="mt-1 text-[13px] text-ink-3">{hasSystems ? 'customer price after incentives' : 'Add a system to price this option'}</p>
            {hasSystems && (
              <>
                <dl className="num mt-3 space-y-1 text-[13px]">
                  <div className="flex justify-between gap-3"><dt className="text-ink-3">Equipment and labor</dt><dd className="font-semibold">{money(s.t.base)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink-3">Elephant margin</dt><dd className="font-semibold">{money(s.t.marginAmount)}</dd></div>
                  {s.t.incentives !== 0 && <div className="flex justify-between gap-3"><dt className="text-ink-3">Incentives</dt><dd className="font-semibold text-ok">{money(s.t.incentives)}</dd></div>}
                  {s.t.discounts !== 0 && <div className="flex justify-between gap-3"><dt className="text-ink-3">Discounts</dt><dd className="font-semibold text-ok">{money(s.t.discounts)}</dd></div>}
                  {s.fee !== 0 && <div className="flex justify-between gap-3"><dt className="text-ink-3">Financing fee</dt><dd className="font-semibold">{money(s.fee)}</dd></div>}
                </dl>
                <div className="mt-3">
                  <div className="flex justify-between text-[12.5px] text-ink-3"><span>Margin</span><span className="num font-semibold text-ink">{pct(s.t.margin)}</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`Margin ${pct(s.t.margin)} against a target of ${pct(proposal.target_margin)}`}>
                    <div className={clsx('h-full rounded-full', gap !== null && gap < -0.01 ? 'bg-warn' : 'bg-ok')} style={{ width: `${Math.min(100, Math.max(0, ((s.t.margin ?? 0) / Math.max(proposal.target_margin, 0.01)) * 100))}%` }} />
                  </div>
                  <p className="mt-1 text-[12px] text-ink-3">Target {pct(proposal.target_margin)}</p>
                </div>
              </>
            )}
          </>
        )}
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[14px] font-bold">{finalized ? 'Signed' : open.length ? 'Before this can be signed' : 'Ready to sign'}</h2>
        {finalized ? (
          <p className="mt-1 text-[13.5px] text-ink-3">This proposal is finalized. Changes go through a change order.</p>
        ) : (
          <>
            <ul className="mt-2">
              {checks.map((c) => (
                <li key={c.id}>
                  <button
                    type="button" onClick={() => go(VIEW_OF_CHECK[c.id] ?? 'customer')} disabled={c.ok}
                    className={clsx('flex w-full items-start gap-2 rounded-md py-1 text-left text-[13px] leading-snug', c.ok ? 'cursor-default text-ink-3' : 'cursor-pointer text-ink hover:text-brand-700')}
                  >
                    {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <Circle className="mt-0.5 size-4 shrink-0 text-warn" />}
                    <span className={clsx(!c.ok && 'font-medium')}>{c.label}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid gap-2">
              <Button variant="primary" className="w-full" disabled={!hasSystems} onClick={() => ask('finalize')}>
                Finalize
              </Button>
              <Button className="w-full" disabled={!hasSystems || proposal?.status !== 'pending'} onClick={() => ask('qa')}>Submit for QA</Button>
            </div>
          </>
        )}
      </section>
    </aside>
  )
}

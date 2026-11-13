import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { StatusPill } from '@/components/ui/core'
import { money, pct } from '@/lib/calc'
import { useCreateProposal } from '@/lib/hooks'
import type { ProjectBundle } from '@/lib/types'
import { summarizeProposal } from './quote'

/** The customer's options side by side. Picking one makes it the active proposal for the systems, line items and the quote panel. */
export function OptionCards({ bundle: b }: { bundle: ProjectBundle }) {
  const [params, setParams] = useSearchParams()
  const create = useCreateProposal(b.project.id)
  const activeId = Number(params.get('proposal')) || b.proposals[0]?.id
  const cols = b.proposals.map((p) => summarizeProposal(b, p))
  const priced = cols.filter((c) => c.designed.length > 0)
  const lowest = priced.length > 1 ? Math.min(...priced.map((c) => c.customer)) : null
  const pick = (id: number) => setParams((p) => { p.set('proposal', String(id)); return p }, { replace: true })

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Options for the customer">
      {cols.map((c) => {
        const on = c.p.id === activeId
        const isLowest = lowest !== null && c.designed.length > 0 && c.customer === lowest
        return (
          <button
            key={c.p.id} type="button" role="radio" aria-checked={on} onClick={() => pick(c.p.id)}
            className={clsx('flex min-w-0 cursor-pointer flex-col gap-2 rounded-xl border-2 p-4 text-left transition-colors', on ? 'border-brand-600 bg-brand-50' : 'border-line bg-surface hover:border-brand-300')}
          >
            <span className="flex items-start justify-between gap-2">
              <span className="line-clamp-2 min-w-0 break-words text-[14.5px] font-bold leading-snug">{c.p.nickname || `Proposal ${c.p.id}`}</span>
              <StatusPill value={c.p.status} />
            </span>
            <span className="num text-[28px] font-extrabold leading-none tracking-tight">{c.designed.length ? money(c.customer) : '—'}</span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
              <span>{c.designed.length} {c.designed.length === 1 ? 'system' : 'systems'}</span>
              {c.designed.length > 0 && <span>Margin {pct(c.t.margin)}</span>}
              {c.t.incentives !== 0 && <span className="text-ok">{money(c.t.incentives)} incentives</span>}
              {isLowest && <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[12px] font-semibold text-ok">Lowest</span>}
              {b.project.finalized_proposal_id === c.p.id && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[12px] font-semibold text-brand-700">Signed</span>}
            </span>
          </button>
        )
      })}
      <button
        type="button" disabled={create.isPending}
        onClick={() => create.mutate(undefined, { onSuccess: (p) => pick((p as { id: number }).id) })}
        className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line-strong p-4 text-[14px] font-semibold text-ink-2 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60"
      >
        <Plus className="size-5" /> {create.isPending ? 'Adding…' : 'New option'}
      </button>
    </div>
  )
}

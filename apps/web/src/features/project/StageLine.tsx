import clsx from 'clsx'
import { STAGES } from './quote'

/** Five-step progress line. `current` is the stage the deal is in; earlier ones are done. */
export function StageLine({ current, complete, compact }: { current: number; complete?: boolean; compact?: boolean }) {
  return (
    <div>
    <ol className={clsx('grid min-w-0 grid-cols-5', compact ? 'gap-1' : 'gap-1.5')} aria-label={`Stage: ${STAGES[current]}`}>
      {STAGES.map((s, i) => {
        const done = complete || i < current
        const now = !complete && i === current
        return (
          <li key={s} className="min-w-0" aria-current={now ? 'step' : undefined}>
            <span className={clsx('block rounded-full', compact ? 'h-1' : 'h-1.5', done ? 'bg-brand-600' : now ? 'bg-brand-400' : 'bg-line')} />
            {!compact && <span className={clsx('mt-1.5 block truncate text-[12.5px] max-sm:hidden', now ? 'font-semibold text-ink' : 'text-ink-3')}>{s}</span>}
          </li>
        )
      })}
    </ol>
    {!compact && <p className="mt-1.5 text-[12.5px] font-semibold sm:hidden">Stage: {complete ? 'Complete' : STAGES[current]}</p>}
    </div>
  )
}

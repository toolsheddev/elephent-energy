import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { Card, CardBody, CardHeader } from '@/components/ui/core'
import { Checkbox, Switch } from '@/components/ui/form'
import { money } from '@/lib/calc'
import type { ProjectBundle } from '@/lib/types'
import { projectCostBreakdown } from '@sd/domain/costBreakdown'

/** The project cost breakdown from Retool's proposal workflow: costs, point-of-sale rebates and net cost, one column per proposal. */
export function CostBreakdownCard({ bundle: b, activeProposalId }: { bundle: ProjectBundle; activeProposalId: number }) {
  const [picked, setPicked] = useState<number[]>([activeProposalId])
  const [electrical, setElectrical] = useState(false)
  const ids = b.proposals.filter((p) => picked.includes(p.id)).map((p) => p.id)
  const table = useMemo(() => projectCostBreakdown(b, ids, { electricalBreakout: electrical }), [b, ids.join(','), electrical]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card>
      <CardHeader title="Project cost breakdown" subtitle="Costs, rebates and net cost. Pick several proposals to compare them side by side." />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {b.proposals.map((p) => (
            <Checkbox key={p.id} className="py-0.5" label={p.nickname} checked={picked.includes(p.id)} onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id)))} />
          ))}
          <Switch label="Break out electrical" checked={electrical} onChange={setElectrical} className="ml-auto" />
        </div>
        {ids.length === 0 ? <p className="text-[14px] text-ink-3">Pick at least one proposal.</p> : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="bg-canvas/70">
                  <th className="border-b border-line px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">Item</th>
                  {ids.map((id) => <th key={id} className="whitespace-nowrap border-b border-line px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-ink-3">{b.proposals.find((p) => p.id === id)?.nickname}</th>)}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i} className={clsx('border-b border-line last:border-0', r.bold && 'bg-canvas/50')}>
                    <td className={clsx('px-4 py-2', r.bold && 'font-bold', r.italic && 'italic')}>{r.label}</td>
                    {r.values.map((v, j) => <td key={j} className={clsx('num px-4 py-2 text-right', r.bold && 'font-bold', r.italic && 'italic', v != null && v < 0 && 'text-ok')}>{v == null ? '' : money(v)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

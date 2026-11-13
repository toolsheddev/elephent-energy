import clsx from 'clsx'
import { PackageX, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge, Button, Card, EmptyState } from '@/components/ui/core'
import { MoreMenu } from '@/components/ui/menu'
import { money, pct, proposalTotals, systemTotals } from '@/lib/calc'
import type { ProjectBundle, Proposal, SystemRec } from '@/lib/types'

/* Type pills use a fixed hue per system type so rows are recognisable at a glance (same idea as Retool's coloured tags). */
const TYPE_STYLE: Record<string, string> = {
  other: 'bg-fuchsia-100 text-fuchsia-800',
  'water heater': 'bg-sky-100 text-sky-800',
  hvac: 'bg-sky-100 text-sky-800',
  ev: 'bg-emerald-100 text-emerald-800',
  panel: 'bg-amber-100 text-amber-800',
  cooktop: 'bg-rose-100 text-rose-800',
  'energy efficiency': 'bg-lime-100 text-lime-800',
  'labor warranty': 'bg-teal-100 text-teal-800',
  adder: 'bg-stone-200 text-stone-700',
  maintenance: 'bg-cyan-100 text-cyan-800',
}
/** Retool shows the raw enum text; acronyms read better in capitals. */
const TYPE_LABEL: Record<string, string> = { hvac: 'HVAC', ev: 'EV' }
function Pill({ className, children }: { className: string; children: string }) {
  return <span className={clsx('inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold', className)}><span className="first-letter:uppercase">{children}</span></span>
}

/** Text that looks like plain text until you hover it, then edits in place and saves on blur or Enter. */
export function InlineText({ value, placeholder, onSave, label }: { value: string; placeholder: string; onSave: (v: string) => void; label: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input
      value={v} placeholder={placeholder} aria-label={label} title={v}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => { if (v.trim() !== value) onSave(v.trim()) }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setV(value); (e.target as HTMLInputElement).blur() } }}
      className="h-8 w-full min-w-0 text-ellipsis rounded-md border border-transparent bg-transparent px-2 text-[14px] placeholder:text-ink-3 hover:border-line-strong focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-3 focus:ring-brand-100"
    />
  )
}

export interface SystemsTableProps {
  bundle: ProjectBundle
  activeProposalId: number | undefined
  activeSystemId: number | null
  onSelect: (proposalId: number, systemId: number | null) => void
  onNewProposal: () => void
  creating?: boolean
  onDuplicateProposal: (p: Proposal) => void
  onDeleteProposal: (p: Proposal) => void
  onRevertProposal: (p: Proposal) => void
  onRenameProposal: (p: Proposal, nickname: string) => void
  onRenameSystem: (s: SystemRec, nickname: string) => void
  onEditSystem: (s: SystemRec) => void
  onMoveSystem: (s: SystemRec) => void
  onDuplicateSystem: (s: SystemRec) => void
  onDeleteSystem: (s: SystemRec) => void
  onDeleteSystemAsCO: (s: SystemRec) => void
  onStockAlert: (p: Proposal) => void
  onRefresh: () => void
  refreshing?: boolean
  onAddSystem: () => void
  onGeneratePdf: () => void
  onMaintenancePlan: () => void
  onCompare: () => void
  onBaseDesign: () => void
  pdfDisabled?: boolean
}

const STATUS_DOT: Record<string, string> = {
  finalized: 'bg-ok', 'out for signature': 'bg-info', 'out for review': 'bg-warn', 'under review': 'bg-warn', pending: 'bg-ink-3', rejected: 'bg-bad',
}

/** Options and their systems. Options are tabs; the selected option shows its systems as a short list. Rare actions sit in "⋯" menus. */
export function SystemsTable(p: SystemsTableProps) {
  const { bundle: b } = p
  const finalizedId = b.project.finalized_proposal_id

  if (b.proposals.length === 0) {
    return (
      <Card>
        <EmptyState title="No options yet" action={<Button variant="primary" icon={<Plus className="size-4" />} loading={p.creating} onClick={p.onNewProposal}>New option</Button>}>
          An option (proposal) holds the systems you design for this home.
        </EmptyState>
      </Card>
    )
  }

  const prop = b.proposals.find((x) => x.id === p.activeProposalId) ?? b.proposals[0]!
  const sys = b.systems.filter((s) => s.proposal_id === prop.id)
  const designed = sys.filter((s) => s.system_type !== 'other')
  const other = sys.find((s) => s.system_type === 'other')
  const shown = [...designed, ...(other && b.lineItems.some((l) => l.system_id === other.id) ? [other] : [])]
  const t = proposalTotals(b, prop.id)
  const alerts = sys.some((s) => s.stock_alert)
  const onFinalized = finalizedId === prop.id

  return (
    <Card>
      {/* Options */}
      <div role="tablist" aria-label="Options" className="flex items-end gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-2 pt-1.5">
        {b.proposals.map((x) => {
          const on = x.id === prop.id
          const tt = proposalTotals(b, x.id)
          const n = b.systems.filter((s) => s.proposal_id === x.id && s.system_type !== 'other').length
          return (
            <button key={x.id} type="button" role="tab" aria-selected={on} onClick={() => p.onSelect(x.id, null)}
              className={clsx('-mb-px flex min-w-0 max-w-64 shrink-0 cursor-pointer flex-col items-start gap-0.5 border-b-2 px-3 pb-2 pt-1.5 text-left transition-colors', on ? 'border-brand-600' : 'border-transparent hover:bg-sunken')}>
              <span className={clsx('w-full truncate text-[13.5px] font-semibold', on ? 'text-ink' : 'text-ink-2')}>{x.nickname || `Proposal ${x.id}`}</span>
              <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px] text-ink-3">
                <span className={clsx('size-1.5 shrink-0 rounded-full', STATUS_DOT[x.status] ?? 'bg-ink-3')} />
                {x.status}{finalizedId === x.id ? ' · signed' : ''} · <span className="num font-semibold text-ink-2">{n ? money(tt.total) : 'no systems'}</span>
              </span>
            </button>
          )
        })}
        <button type="button" onClick={p.onNewProposal} disabled={p.creating}
          className="mb-1.5 ml-1 inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2.5 py-1.5 text-[13px] font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50">
          <Plus className="size-4" /> New option
        </button>
      </div>

      {/* The selected option */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
        <div className="min-w-0 flex-1 basis-56">
          <InlineText value={prop.nickname} placeholder="Name this option" label={`Option ${prop.id} name`} onSave={(v) => p.onRenameProposal(prop, v)} />
        </div>
        <span className="num whitespace-nowrap text-[12.5px] text-ink-3">#{prop.id} · {designed.length} {designed.length === 1 ? 'system' : 'systems'}{t.margin != null ? ` · margin ${pct(t.margin, 1)}` : ''}</span>
        {alerts && (
          <button type="button" onClick={() => p.onStockAlert(prop)} className="cursor-pointer" aria-label="Show stock alerts"><Badge tone="warn"><PackageX className="size-3.5" /> Low stock</Badge></button>
        )}
        <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={p.onAddSystem}>Add system</Button>
        <Button size="sm" icon={<Plus className="size-4" />} onClick={p.onBaseDesign}>Base design</Button>
        <MoreMenu label="Option actions" items={[
          { label: 'Compare', onSelect: p.onCompare, disabled: b.proposals.length < 2, hint: b.proposals.length < 2 ? 'Create a second option to compare' : undefined },
          { label: 'Generate PDF', onSelect: p.onGeneratePdf, disabled: p.pdfDisabled },
          { label: 'Maintenance plan', onSelect: p.onMaintenancePlan },
          (prop.status === 'out for review' || prop.status === 'under review') && { label: 'Revert to pending', onSelect: () => p.onRevertProposal(prop) },
          { kind: 'separator' },
          { label: 'Duplicate', onSelect: () => p.onDuplicateProposal(prop), disabled: !!finalizedId },
          { label: 'Delete', onSelect: () => p.onDeleteProposal(prop), disabled: !!finalizedId, danger: true },
        ]} />
      </div>

      {/* Its systems */}
      {designed.length === 0 ? (
        <p className="px-4 py-4 text-[13.5px] text-ink-3">No systems in this option yet. Use <strong className="font-semibold text-ink-2">Add system</strong> or <strong className="font-semibold text-ink-2">Base design</strong>.</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((s) => {
            const sel = s.id === p.activeSystemId
            const st = systemTotals(b, s.id)
            const isOther = s.system_type === 'other'
            const locked = !!finalizedId || isOther
            const pending = s.status === 'pending deletion'
            const name = s.nickname || TYPE_LABEL[s.system_type] || s.system_type
            return (
              <li key={s.id}>
                <div role="button" tabIndex={0} aria-pressed={sel} onClick={() => p.onSelect(prop.id, sel ? null : s.id)}
                  onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); p.onSelect(prop.id, sel ? null : s.id) } }}
                  className={clsx('flex cursor-pointer items-center gap-3 px-3 py-1.5 transition-colors hover:bg-sunken', sel && 'bg-brand-50 shadow-[inset_3px_0_0_var(--color-brand-600)] hover:bg-brand-50')}>
                  <span className="w-24 shrink-0"><Pill className={TYPE_STYLE[s.system_type] ?? 'bg-stone-200 text-stone-700'}>{isOther ? 'Permits' : TYPE_LABEL[s.system_type] ?? s.system_type}</Pill></span>
                  <div className="min-w-0 flex-1">
                    {isOther ? <span className="block truncate px-2 text-[13.5px] text-ink-2">Permits and other (added automatically)</span>
                      : <InlineText value={s.nickname} placeholder="Name this system" label={`System ${s.id} name`} onSave={(v) => p.onRenameSystem(s, v)} />}
                  </div>
                  {pending && <Badge tone="bad">Pending deletion</Badge>}
                  {s.status && s.status !== 'proposed' && !pending && <Badge tone="info">{s.status}</Badge>}
                  {s.stock_alert && <Badge tone="warn">Low stock</Badge>}
                  <span className="num w-24 shrink-0 text-right text-[13.5px] font-semibold">{st.total !== 0 ? money(st.total) : <span className="font-normal text-ink-3">—</span>}</span>
                  {isOther ? <span className="size-8 shrink-0" /> : (
                    <MoreMenu label={`Actions for ${name}`} items={[
                      { label: 'Edit', onSelect: () => p.onEditSystem(s), disabled: locked },
                      { label: 'Duplicate', onSelect: () => p.onDuplicateSystem(s), disabled: locked },
                      { label: 'Move', onSelect: () => p.onMoveSystem(s), disabled: locked },
                      { kind: 'separator' },
                      onFinalized
                        ? { label: 'Delete (change order)', onSelect: () => p.onDeleteSystemAsCO(s), disabled: pending, danger: true }
                        : { label: 'Delete', onSelect: () => p.onDeleteSystem(s), danger: true },
                    ]} />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {finalizedId && <p className="border-t border-line px-4 py-2 text-[12.5px] text-ink-3">This project has a signed option, so changes go through change orders.</p>}
    </Card>
  )
}


import clsx from 'clsx'
import { ChevronRight, Copy, PackageX, Pencil, Plus, RotateCcw, Scissors, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Badge, Button, Card, CardHeader, EmptyState, IconButton } from '@/components/ui/core'
import { Tip } from '@/components/ui/overlay'
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
const PROPOSAL_STATUS_STYLE: Record<string, string> = {
  finalized: 'bg-emerald-100 text-emerald-800',
  'out for signature': 'bg-sky-100 text-sky-800',
  'out for review': 'bg-amber-100 text-amber-800',
  'under review': 'bg-amber-100 text-amber-900',
  pending: 'bg-stone-200 text-stone-700',
  rejected: 'bg-rose-100 text-rose-800',
}

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
      className="h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-[14px] placeholder:text-ink-3 hover:border-line-strong focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-3 focus:ring-brand-100"
    />
  )
}

/** Icon button with a tooltip that also works when the button is disabled. */
function Act({ label, disabled, onClick, tone, children }: { label: string; disabled?: boolean; onClick: () => void; tone?: 'warn'; children: ReactNode }) {
  return (
    <Tip content={disabled ? `${label} (not available)` : label}>
      <span className="inline-flex">
        <IconButton
          label={label} disabled={disabled}
          className={clsx('border border-line bg-surface', tone === 'warn' && !disabled && 'text-warn')}
          onClick={(e) => { e.stopPropagation(); onClick() }}
        >
          {children}
        </IconButton>
      </span>
    </Tip>
  )
}

const fmtDate = (iso?: string) => (iso ? new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')

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

export function SystemsTable(p: SystemsTableProps) {
  const { bundle: b } = p
  const finalizedId = b.project.finalized_proposal_id
  const [open, setOpen] = useState<Set<number>>(() => new Set(p.activeProposalId ? [p.activeProposalId] : []))

  // Make sure the active proposal is always visible
  useEffect(() => {
    if (p.activeProposalId) setOpen((s) => (s.has(p.activeProposalId!) ? s : new Set(s).add(p.activeProposalId!)))
  }, [p.activeProposalId])

  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allOpen = b.proposals.length > 0 && b.proposals.every((x) => open.has(x.id))

  return (
    <Card>
      <CardHeader
        title="Systems"
        subtitle={`${b.proposals.length} ${b.proposals.length === 1 ? 'proposal' : 'proposals'}`}
        actions={
          <>
            <Button size="sm" onClick={() => setOpen(allOpen ? new Set() : new Set(b.proposals.map((x) => x.id)))}>{allOpen ? 'Collapse all' : 'Expand all'}</Button>
            <Button size="sm" icon={<Plus className="size-4" />} loading={p.creating} onClick={p.onNewProposal}>New proposal</Button>
            <Button size="sm" disabled={b.proposals.length < 2} title={b.proposals.length < 2 ? 'Create a second proposal to compare' : undefined} onClick={p.onCompare}>Compare</Button>
            <Button size="sm" disabled={p.pdfDisabled} onClick={p.onGeneratePdf}>Generate PDF</Button>
            <Button size="sm" disabled={!p.activeProposalId} onClick={p.onMaintenancePlan}>Maintenance Plan</Button>
            <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={p.onBaseDesign}>Base Design</Button>
            <Button size="sm" variant="primary" icon={<Plus className="size-4" />} disabled={!p.activeProposalId} onClick={p.onAddSystem}>Custom System</Button>
          </>
        }
      />

      {b.proposals.length === 0 ? (
        <EmptyState title="No proposals yet" action={<Button variant="primary" icon={<Plus className="size-4" />} onClick={p.onNewProposal}>Create first proposal</Button>}>
          A proposal holds the systems you design for this home.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[14px]">
            <thead className="bg-canvas/70">
              <tr>
                <th className="w-10 border-b border-line" />
                {['ID', 'Nickname', 'Status', 'Systems', 'Total', 'Margin', 'Stock alert?'].map((h, i) => (
                  <th key={h} scope="col" className={clsx('whitespace-nowrap border-b border-line px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-3', (h === 'Total' || h === 'Systems' || h === 'ID' || h === 'Margin') && 'text-right', i === 0 && 'w-24')}>{h}</th>
                ))}
                <th className="w-32 border-b border-line" />
              </tr>
            </thead>
            <tbody>
              {b.proposals.map((prop) => {
                const sys = b.systems.filter((s) => s.proposal_id === prop.id)
                const designed = sys.filter((s) => s.system_type !== 'other')
                const t = proposalTotals(b, prop.id)
                const isOpen = open.has(prop.id)
                const active = prop.id === p.activeProposalId
                const alerts = sys.some((s) => s.stock_alert)
                const other = sys.find((s) => s.system_type === 'other')
                const shown = [...designed, ...(other && b.lineItems.some((l) => l.system_id === other.id) ? [other] : [])]
                // Columns that are empty for every system are left out so the table stays readable
                const showRebate = shown.some((s) => s.rebate_eligibility_type && s.rebate_eligibility_type !== 'none') || shown.some((s) => s.rebate_effective_date)
                const showStock = shown.some((s) => s.stock_alert)
                return (
                  <Rows key={prop.id}>
                    <tr
                      className={clsx('cursor-pointer border-b border-line transition-colors hover:bg-brand-50/60', active && 'bg-brand-50/70')}
                      onClick={() => { p.onSelect(prop.id, p.activeProposalId === prop.id ? p.activeSystemId : null); toggle(prop.id) }}
                    >
                      <td className="pl-3">
                        <button
                          type="button" aria-expanded={isOpen} aria-label={`${isOpen ? 'Collapse' : 'Expand'} proposal ${prop.id}`}
                          onClick={(e) => { e.stopPropagation(); toggle(prop.id) }}
                          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink"
                        >
                          <ChevronRight className={clsx('size-4 transition-transform', isOpen && 'rotate-90')} />
                        </button>
                      </td>
                      <td className="num px-4 py-3 text-right font-semibold">{prop.id.toLocaleString()}</td>
                      <td className="px-2 py-1.5"><InlineText value={prop.nickname} placeholder="Name this proposal" label={`Proposal ${prop.id} nickname`} onSave={(v) => p.onRenameProposal(prop, v)} /></td>
                      <td className="px-4 py-3"><Pill className={PROPOSAL_STATUS_STYLE[prop.status] ?? 'bg-stone-200 text-stone-700'}>{prop.status}</Pill></td>
                      <td className="num px-4 py-3 text-right text-ink-2">{designed.length}</td>
                      <td className="num px-4 py-3 text-right font-bold">{money(t.total)}</td>
                      <td className="num px-4 py-3 text-right">
                        {t.margin == null ? <span className="text-ink-3">—</span> : (
                          <span className={t.margin + 0.005 >= prop.target_margin ? 'font-semibold text-ok' : 'font-semibold text-warn'} title={`Target ${pct(prop.target_margin, 0)}`}>{pct(t.margin, 1)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {alerts && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); p.onStockAlert(prop) }} className="cursor-pointer rounded-full focus-visible:outline-2" aria-label="Show stock alerts">
                            <Badge tone="warn"><PackageX className="size-3.5" /> Low stock</Badge>
                          </button>
                        )}
                      </td>
                      <td className="px-3">
                        <div className="flex justify-end gap-1">
                          {(prop.status === 'out for review' || prop.status === 'under review') && (
                            <Act label="Revert to Pending" onClick={() => p.onRevertProposal(prop)}><RotateCcw className="size-4" /></Act>
                          )}
                          <Act label="Duplicate Proposal" disabled={!!finalizedId} onClick={() => p.onDuplicateProposal(prop)}><Copy className="size-4" /></Act>
                          <Act label="Delete Proposal" disabled={!!finalizedId} onClick={() => p.onDeleteProposal(prop)}><Trash2 className="size-4" /></Act>
                        </div>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="border-b border-line bg-canvas/40">
                        <td />
                        <td colSpan={8} className="px-4 pb-4 pt-2">
                          {designed.length === 0 ? (
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-line-strong bg-surface px-5 py-5">
                              <div>
                                <p className="font-semibold">No systems in this proposal yet</p>
                                <p className="mt-0.5 text-[13.5px] text-ink-2">Add a system and its line items and price appear below.</p>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => { p.onSelect(prop.id, null); p.onAddSystem() }}>Custom System</Button>
                                <Button size="sm" icon={<Plus className="size-4" />} onClick={p.onBaseDesign}>Base Design</Button>
                              </div>
                            </div>
                          ) : (
                          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
                            <table className="w-full border-collapse text-[14px]">
                              <thead>
                                <tr className="bg-canvas/70">
                                  {['ID', 'Type', 'Status', 'Margin', 'Nickname', ...(showRebate ? ['Rebate type', 'Rebate date'] : []), ...(showStock ? ['Stock'] : []), 'Created', 'Price', ''].map((h, i) => (
                                    <th key={h + i} scope="col" className={clsx('whitespace-nowrap border-b border-line px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-3', (h === 'Margin' || h === 'Price' || h === 'ID') && 'text-right', h === 'Nickname' && 'min-w-44')}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {shown.map((s) => {
                                  const sel = s.id === p.activeSystemId
                                  const st = systemTotals(b, s.id)
                                  const isOther = s.system_type === 'other'
                                  const locked = !!finalizedId || isOther
                                  const onFinalized = !!finalizedId && finalizedId === s.proposal_id
                                  const pending = s.status === 'pending deletion'
                                  const label = s.nickname || TYPE_LABEL[s.system_type] || s.system_type
                                  return (
                                    <tr
                                      key={s.id} aria-selected={sel}
                                      onClick={() => p.onSelect(prop.id, s.id)}
                                      className={clsx('cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-brand-50/60', sel && 'bg-brand-50 shadow-[inset_3px_0_0_var(--color-brand-600)]')}
                                    >
                                      <td className="num px-2 py-2.5 text-right">{s.id.toLocaleString()}</td>
                                      <td className="px-2 py-2.5"><Pill className={TYPE_STYLE[s.system_type] ?? 'bg-stone-200 text-stone-700'}>{TYPE_LABEL[s.system_type] ?? s.system_type}</Pill></td>
                                      <td className="px-2 py-2.5"><Pill className={pending ? 'bg-rose-100 text-rose-800' : 'bg-orange-100 text-orange-800'}>{s.status ?? 'proposed'}</Pill></td>
                                      <td className="num px-2 py-2.5 text-right">{s.target_margin != null ? pct(s.target_margin, 0) : ''}</td>
                                      <td className="px-1 py-1">{isOther ? <span className="whitespace-nowrap px-2 text-ink-3">Added automatically</span> : <InlineText value={s.nickname} placeholder="Enter value" label={`System ${s.id} nickname`} onSave={(v) => p.onRenameSystem(s, v)} />}</td>
                                      {showRebate && <td className="px-2 py-2.5 text-ink-2">{s.rebate_eligibility_type === 'none' ? '' : s.rebate_eligibility_type}</td>}
                                      {showRebate && <td className="whitespace-nowrap px-2 py-2.5 text-ink-2">{fmtDate(s.rebate_effective_date)}</td>}
                                      {showStock && <td className="px-2 py-2.5">{s.stock_alert && <button type="button" onClick={(e) => { e.stopPropagation(); p.onStockAlert(prop) }} className="cursor-pointer" aria-label="Show stock alerts"><Badge tone="warn">Low stock</Badge></button>}</td>}
                                      <td className="whitespace-nowrap px-2 py-2.5 text-ink-2">{fmtDate(s.created_at)}</td>
                                      <td className="num px-2 py-2.5 text-right font-semibold">{st.total !== 0 ? money(st.total) : <span className="font-normal text-ink-3">—</span>}</td>
                                      <td className="px-2.5 py-1.5">
                                        {!isOther && <div className="flex justify-end gap-1">
                                          <Act label="Edit System" disabled={locked} onClick={() => p.onEditSystem(s)}><Pencil className="size-4" /></Act>
                                          <Act label="Move System" disabled={locked} onClick={() => p.onMoveSystem(s)}><Scissors className="size-4" /></Act>
                                          <Act label="Duplicate System" disabled={locked} onClick={() => p.onDuplicateSystem(s)}><Copy className="size-4" /></Act>
                                          {onFinalized && !isOther ? (
                                            <Act label={`Delete ${label} as a change order`} tone="warn" disabled={pending} onClick={() => p.onDeleteSystemAsCO(s)}><Trash2 className="size-4" /></Act>
                                          ) : !onFinalized ? (
                                            <Act label="Delete System" disabled={isOther} onClick={() => p.onDeleteSystem(s)}><Trash2 className="size-4" /></Act>
                                          ) : null}
                                        </div>}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                            {finalizedId && <div className="border-t border-line px-3 py-2 text-[12.5px] text-ink-3">This project has a finalized proposal, so changes go through change orders.</div>}
                          </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Rows>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

/** Fragment wrapper so a proposal row and its expanded row share one key. */
function Rows({ children }: { children: ReactNode }) {
  return <>{children}</>
}

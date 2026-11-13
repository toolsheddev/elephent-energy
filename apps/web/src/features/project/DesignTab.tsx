import type { ColumnDef } from '@tanstack/react-table'
import clsx from 'clsx'
import {
  Calculator, Download, Pencil, Plus, RefreshCw, Sparkles, Thermometer, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Banner, Button, Card, CardHeader, EmptyState, IconButton } from '@/components/ui/core'
import { Checkbox, Input, NumberInput, Select, Switch, Textarea } from '@/components/ui/form'
import { Drawer, Modal, toast } from '@/components/ui/overlay'
import { DataTable } from '@/components/ui/table'
import { money, proposalTotals, readiness, systemTotals } from '@/lib/calc'
import {
  useCreateProposal, useDeleteLineItems, useDeleteLineItemsAsCO, useRecalculate, useUpdateCircuit, useDeleteProposal, useDeleteSystem, useDuplicateProposal,
  qk, useFinalizeProposal, useDuplicateSystem, useMarkSystemDeletion, useMoveSystem, useUpdateProposal, useUpdateSystem, useUpsertLineItem,
} from '@/lib/hooks'
import type { LineItemRec, LineItemType, ProjectBundle, Proposal, SystemRec } from '@/lib/types'
import { AddSystemDrawer } from './AddSystemDrawer'
import { ProposalTab } from './ProposalTab'
import { InlineText, SystemsTable } from './SystemsTable'
import { explainIncentive, isCircuitLine, parseCircuit, priceCircuit, refData } from '@/lib/engine'
import { useSaveProjectInfo } from '@/lib/hooks'
import { AddLineItemsDialog } from './AddLineItemsDialog'
import { BaseDesignDialog } from './BaseDesignDialog'
import { CompareProposalsDialog } from './CompareProposalsDialog'
import { MaintenancePlanDialog } from './MaintenancePlanDialog'
import { blankChangeOrder, ChangeOrderFields, changeOrderValid } from './ChangeOrderForm'

const typeTone: Record<LineItemType, 'brand' | 'neutral' | 'info' | 'ok' | 'warn' | 'bad'> = {
  equipment: 'brand', labor: 'neutral', permit: 'info', incentive: 'ok', discount: 'ok', fee: 'warn', maintenance: 'neutral', margin: 'warn', 'financing fees': 'neutral',
}

export function DesignTab({ bundle: b }: { bundle: ProjectBundle }) {
  const pid = b.project.id
  const [params, setParams] = useSearchParams()
  const proposals = b.proposals

  const activeProposalId = Number(params.get('proposal')) || proposals[0]?.id
  const proposal = proposals.find((p) => p.id === activeProposalId) ?? proposals[0]
  const systems = useMemo(() => b.systems.filter((s) => s.proposal_id === proposal?.id), [b.systems, proposal?.id])

  const [systemId, setSystemId] = useState<number | null>(null)
  // Like Retool: no system is selected until you click a system row.
  const system = systems.find((s) => s.id === systemId) ?? null

  const [selected, setSelected] = useState<Set<number>>(new Set())
  useEffect(() => setSelected(new Set()), [system?.id])

  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<SystemRec | null>(null)
  const [lineDialog, setLineDialog] = useState<{ item?: LineItemRec; mode: 'add' | 'adjust' } | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [circuitFor, setCircuitFor] = useState<LineItemRec | null>(null)
  const [baseOpen, setBaseOpen] = useState(false)
  const [mpOpen, setMpOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [deleteCO, setDeleteCO] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<'lines' | 'system' | 'proposal' | null>(null)
  const [transfer, setTransfer] = useState<{ system: SystemRec; action: 'move' | 'duplicate' } | null>(null)
  const [coDelete, setCoDelete] = useState<SystemRec | null>(null)
  const [stockFor, setStockFor] = useState<Proposal | null>(null)
  const qc = useQueryClient()
  const [advanced, setAdvanced] = useState(false)
  const [extraCols, setExtraCols] = useState<Set<string>>(new Set())
  const [incentivesOpen, setIncentivesOpen] = useState(false)
  const upsert = useUpsertLineItem(pid)
  const [preview, setPreview] = useState(false)

  const createProposal = useCreateProposal(pid)
  const delProposal = useDeleteProposal(pid)
  const dupProposal = useDuplicateProposal(pid)
  const delSystem = useDeleteSystem(pid)
  const delLines = useDeleteLineItems(pid)
  const delLinesCO = useDeleteLineItemsAsCO(pid)
  const updProposal = useUpdateProposal(pid)
  const finalize = useFinalizeProposal(pid)
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [qaOpen, setQaOpen] = useState(false)
  const saveInfo = useSaveProjectInfo(pid)
  const updSystem = useUpdateSystem(pid)
  const recalculate = useRecalculate(pid)
  // The quote panel asks for these with ?do=finalize or ?do=qa
  const doParam = params.get('do')
  useEffect(() => {
    if (!doParam) return
    setParams((p) => { p.delete('do'); return p }, { replace: true })
    if (doParam === 'finalize') setConfirmFinalize(true)
    if (doParam === 'qa') setQaOpen(true)
  }, [doParam, setParams])

  if (!proposal) {
    return (
      <Card>
        <EmptyState
          icon={<Sparkles className="size-5" />} title="No proposal yet"
          action={<Button variant="primary" icon={<Plus className="size-4" />} loading={createProposal.isPending} onClick={() => createProposal.mutate('Proposal 1')}>Create first proposal</Button>}
        >
          A proposal holds the systems you design for this home. Create one to start adding a heat pump, water heater or electrical work.
        </EmptyState>
      </Card>
    )
  }

  const items = b.lineItems.filter((l) => l.system_id === system?.id)
  const checks = readiness(b, proposal.id)
  const blockers = checks.filter((c) => !c.ok)

  const setProposal = (id: number) => setParams((p) => { p.set('proposal', String(id)); return p }, { replace: true })

  const saveLine = (r: LineItemRec, patch: Partial<LineItemRec>) => upsert.mutate({ ...r, ...patch, is_manual: true })
  // Default view is every line in the proposal; focusing a system (row or chip) narrows it.
  const ordered = [...systems].sort((a, b2) => Number(a.system_type === 'other') - Number(b2.system_type === 'other'))
  const allLines = ordered.flatMap((sy) => b.lineItems.filter((l) => l.system_id === sy.id))
  const lines = system ? items : allLines
  const nameOf = (id: number) => { const sy = systems.find((x) => x.id === id); return !sy ? '' : sy.system_type === 'other' ? 'Permits and other' : sy.nickname || sy.system_type }
  const protectedLine = (l: LineItemRec) => l.line_item_type === 'incentive' || l.line_item_type === 'margin'
  const deleteDisabled = selected.size === 0 || lines.some((l) => selected.has(l.id) && protectedLine(l))
  // Recalculate = margin + incentives on the system's CURRENT lines (no re-spec), exactly as the Retool button does.
  const recalcable = (system ? [system] : systems).filter((sy) => sy.system_type !== 'other' && sy.system_type !== 'maintenance')
  const canRecalc = recalcable.length > 0 && !!b.house

  const recalc = async () => {
    if (!canRecalc) return
    try {
      const r = (await recalculate.mutateAsync(recalcable.map((sy) => sy.id))) as { systems: number; lines: number; notes: string[] }
      toast.success('Recalculated margin and incentives', `${r.systems} ${r.systems === 1 ? 'system' : 'systems'}, ${r.lines} lines${r.notes.length ? `. ${r.notes.length} note${r.notes.length === 1 ? '' : 's'}: ${r.notes[0]}` : ''}`)
    } catch (e) {
      toast.error('Could not recalculate', e instanceof Error ? e.message : undefined)
    }
  }

  const downloadCsv = () => {
    if (lines.length === 0) return
    const rows = [['ID', 'System', 'Type', 'Description', 'Location', 'Circuit detail', 'Price', 'Show in proposal'],
      ...lines.map((l) => [l.id, nameOf(l.system_id), l.line_item_type, l.description, l.location ?? '', l.circuit ?? '', (l.price_actual * l.quantity).toFixed(2), l.show_in_proposal === false ? 'no' : 'yes'])]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = system ? `system-${system.id}-line-items.csv` : `proposal-${proposal.id}-line-items.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  /* Columns follow the Retool table. Default visible: Type, Description, Location, Circuit detail, Price, Margin amount,
     Show in proposal?, Status. Assigned Units and Branch Box Assigned appear only for a focused HVAC system, as in Retool.
     Fixed widths: the description takes the remaining space and truncates, so the table never scrolls sideways. */
  const hvacFocused = system?.system_type === 'hvac'
  const sysStatus = (id: number) => systems.find((x) => x.id === id)?.status ?? 'proposed'
  const text = (get: (r: LineItemRec) => string | number | null | undefined): ColumnDef<LineItemRec>['cell'] =>
    ({ row: { original: r } }) => <span className="block truncate text-ink-2" title={String(get(r) ?? '')}>{get(r) ?? ''}</span>
  const col = (c: ColumnDef<LineItemRec>) => c

  const lineColumns: ColumnDef<LineItemRec>[] = [
    col({
      id: 'sel', size: 36,
      header: () => (
        <input
          type="checkbox" aria-label="Select all line items" className="size-4 cursor-pointer accent-brand-600"
          checked={lines.length > 0 && selected.size === lines.length}
          onChange={(e) => setSelected(e.target.checked ? new Set(lines.map((i) => i.id)) : new Set())}
        />
      ),
      cell: ({ row: { original: r } }) => (
        <input
          type="checkbox" aria-label={`Select ${r.description}`} className="size-4 cursor-pointer accent-brand-600"
          checked={selected.has(r.id)} onClick={(e) => e.stopPropagation()}
          onChange={(e) => setSelected((cur) => { const n = new Set(cur); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n })}
        />
      ),
    }),
    ...(extraCols.has('id') ? [col({ id: 'id', header: 'ID', size: 68, accessorFn: (r) => r.id, cell: text((r) => r.id) })] : []),
    col({ accessorKey: 'line_item_type', header: 'Type', size: 100, cell: ({ getValue }) => <Badge tone={typeTone[getValue<LineItemType>()]}>{getValue<string>()}</Badge> }),
    col({
      accessorKey: 'description', header: 'Description', size: 0, // 0 = flexible: takes the remaining width
      cell: ({ row: { original: r } }) => (
        <div className="min-w-[200px]">
          <InlineText value={r.description} placeholder="Description" label={`Description of line ${r.id}`} onSave={(v) => v && saveLine(r, { description: v })} />
          {!system && (
            <button type="button" title="Show only this system" onClick={() => setSystemId(r.system_id)}
              className="mt-0.5 block max-w-full cursor-pointer truncate px-2 text-left text-[11.5px] font-semibold text-brand-600 hover:underline">{nameOf(r.system_id)}</button>
          )}
        </div>
      ),
    }),
    ...(extraCols.has('qty') ? [col({ id: 'qty', header: 'Qty', size: 60, meta: { align: 'right' }, accessorFn: (r) => r.quantity, cell: text((r) => r.quantity) })] : []),
    col({
      id: 'location', header: 'Location', size: 150, accessorFn: (r) => r.location ?? '',
      cell: ({ row: { original: r } }) => <InlineText value={r.location ?? ''} placeholder="—" label={`Location of line ${r.id}`} onSave={(v) => saveLine(r, { location: v || undefined })} />,
    }),
    col({
      id: 'circuit', header: 'Circuit detail', size: 104, accessorFn: (r) => r.circuit ?? '',
      cell: ({ row: { original: r } }) => (isCircuitLine(r) && r.circuit && b.project.finalized_proposal_id !== proposal.id ? (
        <button type="button" title="Edit circuit length" onClick={(e) => { e.stopPropagation(); setCircuitFor(r) }}
          className="block max-w-full cursor-pointer truncate rounded text-left font-medium text-brand-700 underline decoration-dotted underline-offset-4 hover:text-brand-800">{r.circuit}</button>
      ) : <span className="block truncate text-ink-2" title={r.circuit ?? ''}>{r.circuit ?? ''}</span>),
    }),
    ...(hvacFocused && lines.some((l) => l.assigned_units) ? [col({ id: 'assigned', header: 'Assigned units', size: 96, accessorFn: (r) => r.assigned_units ?? '', cell: text((r) => r.assigned_units) })] : []),
    ...(hvacFocused && lines.some((l) => l.branch_box) ? [col({ id: 'branch', header: 'Branch box', size: 120, accessorFn: (r) => r.branch_box ?? '', cell: text((r) => r.branch_box) })] : []),
    col({
      id: 'price', header: 'Price', size: 116, meta: { align: 'right' }, accessorFn: (r) => r.price_actual * r.quantity,
      cell: ({ row: { original: r }, getValue }) =>
        advanced && !protectedLine(r) ? (
          <input
            type="number" step="0.01" defaultValue={getValue<number>()} aria-label={`Price of line ${r.id}`}
            onBlur={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v) && v !== getValue<number>()) saveLine(r, { price_actual: v / (r.quantity || 1) }) }}
            className="num h-8 w-full rounded-md border border-line-strong bg-surface px-2 text-right focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-100"
          />
        ) : (
          <span className={clsx('font-semibold', getValue<number>() < 0 && 'text-ok')}>{money(getValue<number>(), { cents: true })}</span>
        ),
    }),
    col({
      id: 'margin', header: 'Margin amount', size: 104, meta: { align: 'right' }, accessorFn: (r) => r.margin_amount ?? 0,
      cell: ({ row: { original: r } }) => (r.margin_amount ? <span className="text-ink-2">{money(r.margin_amount, { cents: true })}</span> : <span className="text-ink-3">—</span>),
    }),
    col({
      id: 'show', header: 'Show in proposal?', size: 92,
      cell: ({ row: { original: r } }) => (
        <input
          type="checkbox" aria-label={`Show ${r.description} in proposal`} className="size-4 cursor-pointer accent-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={r.line_item_type === 'incentive' || r.line_item_type === 'discount'}
          checked={r.show_in_proposal !== false} onClick={(e) => e.stopPropagation()}
          onChange={(e) => saveLine(r, { show_in_proposal: e.target.checked })}
        />
      ),
    }),
    col({
      id: 'status', header: 'Status', size: 150, accessorFn: (r) => r.status ?? sysStatus(r.system_id),
      cell: ({ getValue }) => {
        const v = String(getValue())
        return <span title={v} className={clsx('inline-flex max-w-full rounded-full px-2 py-0.5 text-[12px] font-semibold', v === 'pending deletion' ? 'bg-rose-100 text-rose-800' : 'bg-orange-100 text-orange-800')}><span className="truncate first-letter:uppercase">{v}</span></span>
      },
    }),
    ...(extraCols.has('equipment_id') ? [col({ id: 'equipment_id', header: 'Equipment ID', size: 88, accessorFn: (r) => r.equipment_id ?? '', cell: text((r) => r.equipment_id) })] : []),
    ...(extraCols.has('labor_id') ? [col({ id: 'labor_id', header: 'Labor ID', size: 72, accessorFn: (r) => r.labor_id ?? '', cell: text((r) => r.labor_id) })] : []),
    ...(extraCols.has('provider') ? [col({ id: 'provider', header: 'Provider', size: 88, accessorFn: (r) => r.equipment_provider ?? '', cell: text((r) => r.equipment_provider) })] : []),
    ...(extraCols.has('manual') ? [col({ id: 'manual', header: 'Manual', size: 64, accessorFn: (r) => !!r.is_manual, cell: text((r) => (r.is_manual ? 'yes' : '')) })] : []),
    ...(extraCols.has('adjustment') ? [col({ id: 'adjustment', header: 'Adjustment reason', size: 140, accessorFn: (r) => r.note ?? '', cell: text((r) => r.note) })] : []),
    col({
      id: 'actions', header: '', size: 40,
      cell: ({ row: { original: r } }) =>
        r.line_item_type === 'incentive' ? (
          <IconButton label={`Edit ${r.description}`} onClick={(e) => { e.stopPropagation(); setLineDialog({ item: r, mode: 'adjust' }) }}><Pencil className="size-4" /></IconButton>
        ) : null,
    }),
  ]
  const priceIdx = lineColumns.findIndex((c) => c.id === 'price')

  return (
    <div className="space-y-5">
      <SystemsTable
        bundle={b}
        activeProposalId={proposal.id}
        activeSystemId={system?.id ?? null}
        onSelect={(pid2, sid) => { setProposal(pid2); setSystemId(sid) }}
        onNewProposal={() => createProposal.mutate(undefined, { onSuccess: (p) => setProposal((p as { id: number }).id) })}
        creating={createProposal.isPending}
        onDuplicateProposal={(p) => dupProposal.mutate(p.id, { onSuccess: () => toast.success('Proposal duplicated') })}
        onDeleteProposal={(p) => { setProposal(p.id); setConfirmDelete('proposal') }}
        onRenameProposal={(p, nickname) => updProposal.mutate({ proposalId: p.id, patch: { nickname: nickname || p.nickname } })}
        onRenameSystem={(sy, nickname) => updSystem.mutate({ systemId: sy.id, patch: { nickname } })}
        onRevertProposal={(p) => updProposal.mutate({ proposalId: p.id, patch: { status: 'pending' } }, { onSuccess: () => toast.success('Reverted to pending', p.nickname) })}
        onEditSystem={(sy) => { setProposal(sy.proposal_id); setSystemId(sy.id); setEditing(sy) }}
        onMoveSystem={(sy) => setTransfer({ system: sy, action: 'move' })}
        onDuplicateSystem={(sy) => setTransfer({ system: sy, action: 'duplicate' })}
        onDeleteSystem={(sy) => { setProposal(sy.proposal_id); setSystemId(sy.id); setConfirmDelete('system') }}
        onDeleteSystemAsCO={(sy) => setCoDelete(sy)}
        onStockAlert={(p) => setStockFor(p)}
        onRefresh={() => qc.invalidateQueries({ queryKey: qk.project(pid) })}
        onAddSystem={() => setAdding(true)}
        onGeneratePdf={() => setPreview(true)}
        onBaseDesign={() => setBaseOpen(true)}
        onMaintenancePlan={() => setMpOpen(true)}
        onCompare={() => setCompareOpen(true)}
        pdfDisabled={systems.filter((s) => s.system_type !== 'other').length === 0}
      />

      <div className="space-y-5">
          {systems.filter((s) => s.system_type !== 'other').length === 0 && allLines.length === 0 ? (
            <Card>
              <CardHeader title="Line items" subtitle="Equipment, labor, permits and incentives for this proposal." />
              <EmptyState icon={<Thermometer className="size-5" />} title="Nothing to show yet">Add a system to this proposal and its line items appear here.</EmptyState>
            </Card>
          ) : (
          /* Line items: everything in the proposal by default; click a system row or a chip to focus one system */
          <Card>
            <CardHeader
              title={<>Line items <span className="font-medium text-ink-3">- {system ? `${system.nickname || system.system_type} (${system.id})` : `${proposal.nickname}, all systems`}</span></>}
              subtitle={system?.system_type === 'other' ? "Permits are calculated from the home's jurisdiction and the other systems in this proposal." : 'Equipment, labor, permits and incentives. Pick a system below, or click a row in the table above, to focus on one.'}
              actions={
                <>
                  <Button size="sm" onClick={() => setIncentivesOpen(true)}>Analyze Incentives</Button>
                  <Button size="sm" icon={<Calculator className="size-4" />} disabled={!canRecalc} loading={recalculate.isPending} onClick={recalc}>{system ? 'Recalculate' : 'Recalculate all'}</Button>
                </>
              }
            />
            <div className="flex flex-wrap gap-1.5 border-b border-line px-5 py-3" role="group" aria-label="Show line items for">
              {[{ id: null as number | null, label: 'All systems', n: allLines.length }, ...ordered.map((sy) => ({ id: sy.id as number | null, label: nameOf(sy.id), n: b.lineItems.filter((l) => l.system_id === sy.id).length }))].map((c) => {
                const on = (system?.id ?? null) === c.id
                return (
                  <button key={String(c.id)} type="button" aria-pressed={on} onClick={() => setSystemId(c.id)}
                    className={clsx('inline-flex max-w-64 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold transition-colors', on ? 'bg-brand-600 text-white' : 'bg-sunken text-ink-2 hover:bg-brand-50 hover:text-brand-700')}>
                    <span className="truncate">{c.label}</span><span className={clsx('num text-xs', on ? 'text-brand-200' : 'text-ink-3')}>{c.n}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas/50 px-5 py-2">
              <p className="text-[13px] text-ink-3">{selected.size > 0 ? `${selected.size} selected` : `${lines.length} line items`}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Switch label="Advanced edit" checked={advanced} onChange={setAdvanced} className="mr-2" />
                <Button size="sm" icon={<Plus className="size-4" />} disabled={systems.every((x) => x.system_type === 'other')} onClick={() => setAddOpen(true)}>Add line items</Button>
                <Button size="sm" variant="danger" icon={<Trash2 className="size-4" />} disabled={deleteDisabled} onClick={() => (b.project.finalized_proposal_id === proposal.id ? setDeleteCO(true) : setConfirmDelete('lines'))}>Delete</Button>
                <ColumnsMenu selected={extraCols} onToggle={(id) => setExtraCols((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n })} />
                <IconButton label="Download line items as CSV" disabled={lines.length === 0} onClick={downloadCsv}><Download className="size-4" /></IconButton>
                <IconButton label="Refresh" onClick={() => qc.invalidateQueries({ queryKey: qk.project(pid) })}><RefreshCw className="size-4" /></IconButton>
              </div>
            </div>
            <DataTable
              dense fixed className="max-h-[560px] overflow-y-auto" data={lines} columns={lineColumns} getRowId={(r) => String(r.id)}
              isRowActive={(r) => selected.has(r.id)}
              empty={<EmptyState icon={<Thermometer className="size-5" />} title="No line items found">{system ? 'Add one manually, or recalculate the system.' : 'Add a system to this proposal and its line items appear here.'}</EmptyState>}
              footer={lines.length > 0 ? (
                <tfoot>
                  <tr className="bg-canvas/60">
                    <td colSpan={priceIdx} className="px-3 py-3 text-right text-[13px] font-semibold uppercase tracking-wide text-ink-3">Sum</td>
                    <td className="num px-4 py-3 text-right text-[15px] font-bold">{money(system ? systemTotals(b, system.id).total : proposalTotals(b, proposal.id).total, { cents: true })}</td>
                    <td colSpan={lineColumns.length - priceIdx - 1} />
                  </tr>
                </tfoot>
              ) : undefined}
            />
          </Card>
          )}
      </div>

      <Drawer open={preview} onOpenChange={setPreview} width="max-w-[1180px]" title="Proposal preview" description={`${proposal.nickname} · what the customer receives`}>
        <ProposalTab bundle={b} />
      </Drawer>

      <AddSystemDrawer
        key={editing?.id ?? 'new'}
        bundle={b}
        proposalId={proposal.id}
        open={adding || !!editing}
        editing={editing}
        onClose={() => { setAdding(false); setEditing(null) }}
      />

      <CompareProposalsDialog open={compareOpen} onClose={() => setCompareOpen(false)} bundle={b} />
      <MaintenancePlanDialog open={mpOpen} onClose={() => setMpOpen(false)} bundle={b} proposal={proposal} />
      <BaseDesignDialog open={baseOpen} onClose={() => setBaseOpen(false)} bundle={b} proposal={proposal} />
      <CircuitDialog line={circuitFor} bundle={b} onClose={() => setCircuitFor(null)} />
      <AddLineItemsDialog open={addOpen} onClose={() => setAddOpen(false)} bundle={b} proposal={proposal} focusedSystem={system} />
      <DeleteLinesCODialog
        open={deleteCO} count={selected.size} onClose={() => setDeleteCO(false)}
        onConfirm={async (co) => { await delLinesCO.mutateAsync({ ids: [...selected], co }); setSelected(new Set()); setDeleteCO(false); toast.success('Change order started', 'The lines stay in place until the change order is approved.') }}
      />
      <LineItemDialog
        projectId={pid} systemId={system?.id ?? 0} state={lineDialog} onClose={() => setLineDialog(null)}
      />

      <TransferDialog state={transfer} onClose={() => setTransfer(null)} bundle={b} projectId={pid} onDone={(pid2) => setProposal(pid2)} />
      <ChangeOrderDeleteDialog system={coDelete} onClose={() => setCoDelete(null)} projectId={pid} />
      <QaDialog
        open={qaOpen} onClose={() => setQaOpen(false)} blockers={blockers}
        onSubmit={async (heating) => {
          const note = `Pre-existing heating has been: ${heating}`
          await saveInfo.mutateAsync({ project: { handoff_notes: [b.project.handoff_notes, note].filter(Boolean).join('\n\n') } })
          await updProposal.mutateAsync({ proposalId: proposal.id, patch: { status: 'under review' } })
          setQaOpen(false)
          toast.success('Submitted for QA review', 'Status is now under review. The ops channel is notified in the live build.')
        }}
      />
      <FinalizeDialog
        open={confirmFinalize} onClose={() => setConfirmFinalize(false)} name={proposal.nickname} blockers={blockers}
        onConfirm={async (handoff) => {
          await finalize.mutateAsync({ proposalId: proposal.id, handoff })
          setConfirmFinalize(false)
          toast.success('Proposal finalized', 'Open the Invoices tab to generate invoices.')
        }}
      />
      <IncentivesDialog open={incentivesOpen} onClose={() => setIncentivesOpen(false)} proposal={proposal} bundle={b} />
      <StockAlertDialog proposal={stockFor} bundle={b} onClose={() => setStockFor(null)} />

      <ConfirmDialog
        open={confirmDelete != null}
        onClose={() => setConfirmDelete(null)}
        title={confirmDelete === 'lines' ? `Delete ${selected.size} line item${selected.size === 1 ? '' : 's'}?` : confirmDelete === 'system' ? 'Delete system?' : `Delete "${proposal.nickname}"?`}
        body={confirmDelete === 'proposal' ? 'All systems and line items in this option are removed too.' : confirmDelete === 'system' ? `Are you sure you want to delete ${system?.nickname || system?.system_type} system? Its line items are removed too.` : 'These lines are removed from the selected system.'}
        onConfirm={async () => {
          if (confirmDelete === 'lines') await delLines.mutateAsync([...selected])
          if (confirmDelete === 'system' && system) await delSystem.mutateAsync(system.id)
          if (confirmDelete === 'proposal') { await delProposal.mutateAsync(proposal.id); setParams((p) => { p.delete('proposal'); return p }, { replace: true }) }
          setSelected(new Set()); setSystemId(null); setConfirmDelete(null)
          toast.success('Deleted')
        }}
      />
    </div>
  )
}

/* ---------- Dialogs ---------- */

export function ConfirmDialog({
  open, onClose, title, body, onConfirm, confirmLabel = 'Delete', primary,
}: { open: boolean; onClose: () => void; title: string; body: string; onConfirm: () => Promise<void> | void; confirmLabel?: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      open={open} onOpenChange={(o) => !o && onClose()} title={title} size="sm"
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" className={primary ? '' : 'bg-bad hover:bg-bad/90'} loading={busy} onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }}>{confirmLabel}</Button>
      </>}
    >
      <p className="text-[14px] text-ink-2">{body}</p>
    </Modal>
  )
}

// The reasons Retool's "Adjust" modal offers (RadioGroup editLineItemReason)
const ADJUST_REASONS = ['Customer not eligible', 'Customer already used this incentive', 'Other']
const MANUAL_TYPES: { value: LineItemType; label: string }[] = [
  { value: 'equipment', label: 'Equipment' }, { value: 'labor', label: 'Labor' }, { value: 'permit', label: 'Permit' },
  { value: 'fee', label: 'Fee' }, { value: 'discount', label: 'Discount' },
]

function LineItemDialog({
  projectId, systemId, state, onClose,
}: { projectId: number; systemId: number; state: { item?: LineItemRec; mode: 'add' | 'adjust' } | null; onClose: () => void }) {
  const upsert = useUpsertLineItem(projectId)
  const open = !!state
  const adjust = state?.mode === 'adjust'
  const [type, setType] = useState<LineItemType>('equipment')
  const [desc, setDesc] = useState('')
  const [qty, setQty] = useState(1)
  const [price, setPrice] = useState(0)
  const [reason, setReason] = useState('')
  const [why, setWhy] = useState('')

  useEffect(() => {
    if (!state) return
    const i = state.item
    setType(i?.line_item_type ?? 'equipment'); setDesc(i?.description ?? ''); setQty(i?.quantity ?? 1)
    setPrice(i?.price_actual ?? 0); setReason(''); setWhy('')
  }, [state])

  const invalid = !desc.trim() || (adjust && (!reason || !why.trim()))

  return (
    <Modal
      open={open} onOpenChange={(o) => !o && onClose()} size="md"
      title={adjust ? `Adjust "${state?.item?.description}"` : 'Add line item'}
      description={adjust ? 'Changes are logged with a reason so the margin review can see why the price moved.' : 'Manual lines are flagged in the proposal and excluded from automatic repricing.'}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary" disabled={invalid} loading={upsert.isPending}
          onClick={async () => {
            const sign = type === 'discount' ? -Math.abs(price) : price
            await upsert.mutateAsync({
              ...(state?.item ?? { system_id: systemId, cost: null }),
              line_item_type: type, description: desc.trim(), quantity: qty, price_actual: sign,
              is_manual: true, ...(adjust ? { adjustment_reason: reason, note: why.trim() } : {}),
            } as Omit<LineItemRec, 'id'> & { id?: number })
            toast.success(adjust ? 'Price adjusted' : 'Line item added')
            onClose()
          }}
        >{adjust ? 'Save adjustment' : 'Add line item'}</Button>
      </>}
    >
      <div className="grid grid-cols-12 gap-4">
        {!adjust && <Select wrapperClassName="col-span-12 sm:col-span-4" label="Type" options={MANUAL_TYPES} value={type} onChange={(e) => setType(e.target.value as LineItemType)} />}
        <Input wrapperClassName={adjust ? 'col-span-12' : 'col-span-12 sm:col-span-8'} label="Description" value={desc} onChange={(e) => setDesc(e.target.value)} readOnly={adjust} />
        {!adjust && <NumberInput wrapperClassName="col-span-6" label="Quantity" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />}
        <div className={adjust ? 'col-span-12 flex items-end gap-2' : 'col-span-6'}>
          <NumberInput wrapperClassName="min-w-0 flex-1" label={type === 'discount' ? 'Discount amount' : adjust ? 'Price' : 'Price each'} prefix="$" step="0.01" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
          {adjust && <Button onClick={() => setPrice(0)}>Set to $0</Button>}
        </div>
        {adjust && (
          <>
            <fieldset className="col-span-12">
              <legend className="mb-1.5 text-[13px] font-semibold text-ink-2">Adjustment reason <span className="text-bad">*</span></legend>
              <div className="space-y-1">
                {ADJUST_REASONS.map((r) => (
                  <label key={r} className="flex cursor-pointer items-center gap-2.5 text-[14px]">
                    <input type="radio" name="adjust-reason" className="size-4 accent-[var(--color-brand-600)]" checked={reason === r} onChange={() => setReason(r)} /> {r}
                  </label>
                ))}
              </div>
            </fieldset>
            <Textarea wrapperClassName="col-span-12" label="Explanation" required rows={2} value={why} onChange={(e) => setWhy(e.target.value)} />
          </>
        )}
      </div>
    </Modal>
  )
}

function TransferDialog({
  state, onClose, bundle, projectId, onDone,
}: {
  state: { system: SystemRec; action: 'move' | 'duplicate' } | null
  onClose: () => void; bundle: ProjectBundle; projectId: number; onDone: (proposalId: number) => void
}) {
  const create = useCreateProposal(projectId)
  const move = useMoveSystem(projectId)
  const dup = useDuplicateSystem(projectId)
  const [target, setTarget] = useState('')
  useEffect(() => setTarget(''), [state])
  const busy = create.isPending || move.isPending || dup.isPending
  const action = state?.action ?? 'move'
  const label = action === 'move' ? 'Move' : 'Duplicate'
  const options = [{ value: 'NEW_SINGLE', label: '✨ Create a new proposal' }, ...bundle.proposals.map((p) => ({ value: p.id, label: p.nickname }))]

  return (
    <Modal
      open={!!state} onOpenChange={(o) => !o && onClose()} size="sm" title={`${label} System`}
      description={state ? `"${state.system.nickname || state.system.system_type}"` : undefined}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary" disabled={!target} loading={busy}
          onClick={async () => {
            if (!state) return
            let proposalId = Number(target)
            if (target === 'NEW_SINGLE') {
              const np = (await create.mutateAsync(state.system.nickname || undefined)) as Proposal
              proposalId = np.id
            }
            if (action === 'move') await move.mutateAsync({ systemId: state.system.id, toProposalId: proposalId })
            else await dup.mutateAsync({ systemId: state.system.id, toProposalId: proposalId })
            toast.success(action === 'move' ? 'System moved' : 'System duplicated', 'Permits were recalculated.')
            onDone(proposalId)
            onClose()
          }}
        >{label}</Button>
      </>}
    >
      <Select label="Choose Proposal:" value={target} onChange={(e) => setTarget(e.target.value)} options={options} placeholder="Select a proposal…" />
      <p className="mt-3 text-[13px] text-ink-3">
        {action === 'duplicate' ? 'The copy keeps all line items and its nickname gets " dup" added.' : 'The system keeps its line items and moves to the chosen proposal.'}
      </p>
    </Modal>
  )
}

/** Retool's circuit-length editor (updateCircuitLengthModal): the length and difficulty of one circuit, repriced from the catalog. */
function CircuitDialog({ line, bundle, onClose }: { line: LineItemRec | null; bundle: ProjectBundle; onClose: () => void }) {
  const upd = useUpdateCircuit(bundle.project.id)
  const [length, setLength] = useState(0)
  const [difficult, setDifficult] = useState(false)
  useEffect(() => {
    if (!line) return
    const c = parseCircuit(line.circuit)
    setLength(c?.length ?? 0); setDifficult(c?.difficult ?? false)
  }, [line])
  const sy = line ? bundle.systems.find((x) => x.id === line.system_id) : undefined
  const pricing = bundle.proposals.find((p) => p.id === sy?.proposal_id)?.pricing_structure ?? 'standard'
  const first = line && bundle.lineItems.find((l) => l.system_id === line.system_id && isCircuitLine(l))?.id === line.id
  const preview = line?.labor_id && length > 0 ? priceCircuit(line.labor_id, length, difficult, !!first, pricing, new Date().toISOString().slice(0, 10)) : null
  return (
    <Modal
      open={!!line} onOpenChange={(o) => !o && onClose()} size="sm" title="Update circuit length"
      description={line ? `${line.description}. Margin, incentives and permits are recalculated.` : undefined}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!preview?.ok} loading={upd.isPending}
          onClick={async () => { if (!line) return; await upd.mutateAsync({ lineId: line.id, length, difficult }); toast.success('Circuit updated', `${length} ft${difficult ? ', difficult' : ''}`); onClose() }}>Save</Button>
      </>}
    >
      <div className="space-y-4">
        <NumberInput label="Circuit length" suffix="ft" min={1} value={length} onChange={(e) => setLength(Number(e.target.value) || 0)} />
        <Checkbox label="Difficult run" hint="Drywall, finished spaces or a long exterior run" checked={difficult} onChange={(e) => setDifficult(e.target.checked)} />
        {preview?.ok && <p className="text-[14px]">New price <strong className="num">{money(preview.price, { cents: true })}</strong></p>}
        {preview && !preview.ok && <p className="text-[13.5px] text-bad">{preview.error}</p>}
      </div>
    </Modal>
  )
}

/** Retool's "Required Fields for Finalization" modal: the warnings must be cleared before the proposal goes to QA. */
const PREEXISTING_HEATING = ['Removed', 'Disconnected from panel', 'Thermostats disconnected', 'Fuel line capped']

function QaDialog({ open, onClose, blockers, onSubmit }: { open: boolean; onClose: () => void; blockers: { id: string; label: string; where: string }[]; onSubmit: (heating: string) => Promise<void> }) {
  const [heating, setHeating] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setHeating('') }, [open])
  return (
    <Modal
      open={open} onOpenChange={(o) => !o && onClose()} size="md" title="Required fields for finalization"
      description="QA reviews the proposal once these are filled in."
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={blockers.length > 0 || !heating} loading={busy} onClick={async () => { setBusy(true); try { await onSubmit(heating) } finally { setBusy(false) } }}>Submit for QA review</Button>
      </>}
    >
      <div className="space-y-4">
        {blockers.length > 0 && (
          <Banner tone="warn" title={`${blockers.length} thing${blockers.length === 1 ? '' : 's'} to fill in first`}>
            <ul className="mt-1 list-disc pl-4 text-[13.5px]">{blockers.map((c) => <li key={c.id}>{c.label}{c.where === 'project' ? ' (Home Info or Project Overview tab)' : ''}</li>)}</ul>
          </Banner>
        )}
        <Select label="Pre-existing heating has been:" required placeholder="Select an option" options={PREEXISTING_HEATING} value={heating} onChange={(e) => setHeating(e.target.value)} />
      </div>
    </Modal>
  )
}

/** Retool's finalize confirmation. The handoff notes it asks for are added to the project's handoff notes. */
function FinalizeDialog({ open, onClose, name, blockers, onConfirm }: { open: boolean; onClose: () => void; name: string; blockers: unknown[]; onConfirm: (h: { majorRisks: string; expectations: string }) => Promise<void> }) {
  const [risks, setRisks] = useState('')
  const [expect, setExpect] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setRisks(''); setExpect('') } }, [open])
  return (
    <Modal
      open={open} onOpenChange={(o) => !o && onClose()} size="md" title={`Are you sure you want to finalize ${name} Proposal?`}
      description="Finalizing locks this proposal. Editing its systems then needs a change order, and the Invoices tab can generate the deposit and final invoices."
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={async () => { setBusy(true); try { await onConfirm({ majorRisks: risks, expectations: expect }) } finally { setBusy(false) } }}>Finalize</Button>
      </>}
    >
      <div className="space-y-4">
        {blockers.length > 0 && <Banner tone="warn" title="Some required fields are still empty">Finalizing is allowed, but QA normally sees these filled in first.</Banner>}
        <Textarea label="Major risks" rows={2} value={risks} onChange={(e) => setRisks(e.target.value)} />
        <Textarea label="Customer expectations" rows={2} value={expect} onChange={(e) => setExpect(e.target.value)} />
        <p className="text-[12.5px] text-ink-3">Both are added to the project's handoff notes. The live system also writes the deal to Salesforce.</p>
      </div>
    </Modal>
  )
}

/** Finalized proposal: deleting lines goes through a change order, like deleting a system. */
function DeleteLinesCODialog({ open, count, onClose, onConfirm }: { open: boolean; count: number; onClose: () => void; onConfirm: (co: ReturnType<typeof blankChangeOrder>) => Promise<void> }) {
  const [f, setF] = useState(blankChangeOrder())
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setF(blankChangeOrder()) }, [open])
  return (
    <Modal
      open={open} onOpenChange={(o) => !o && onClose()} size="lg" title={`Delete ${count} line item${count === 1 ? '' : 's'} as a change order`}
      description="This proposal is finalized. The lines stay in place until the change order is approved."
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" className="bg-bad hover:bg-bad/90" disabled={!changeOrderValid(f)} loading={busy} onClick={async () => { setBusy(true); try { await onConfirm(f) } finally { setBusy(false) } }}>Delete</Button>
      </>}
    >
      <ChangeOrderFields value={f} onChange={setF} />
    </Modal>
  )
}

function ChangeOrderDeleteDialog({ system, onClose, projectId }: { system: SystemRec | null; onClose: () => void; projectId: number }) {
  const mark = useMarkSystemDeletion(projectId)
  const [f, setF] = useState(blankChangeOrder())
  useEffect(() => setF(blankChangeOrder()), [system])
  const valid = changeOrderValid(f)

  return (
    <Modal
      open={!!system} onOpenChange={(o) => !o && onClose()} size="lg" title="Delete system as a change order"
      description="This proposal is finalized, so the system is removed through a change order. It stays in place until the change order is approved."
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" className="bg-bad hover:bg-bad/90" disabled={!valid} loading={mark.isPending}
          onClick={async () => { if (!system) return; await mark.mutateAsync({ systemId: system.id, co: f }); toast.success('Change order started', `${system.nickname || system.system_type} is pending deletion.`); onClose() }}>
          Delete
        </Button>
      </>}
    >
      {system && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Input label="System type" value={system.system_type} readOnly />
            <Input label="System number" value={String(system.id)} readOnly />
            <Input label="Nickname" value={system.nickname} readOnly />
            <Input label="Status" value={system.status ?? 'proposed'} readOnly />
          </div>
          <ChangeOrderFields value={f} onChange={setF} />
        </div>
      )}
    </Modal>
  )
}

function StockAlertDialog({ proposal, bundle, onClose }: { proposal: Proposal | null; bundle: ProjectBundle; onClose: () => void }) {
  const flagged = proposal ? bundle.systems.filter((s) => s.proposal_id === proposal.id && s.stock_alert) : []
  return (
    <Modal open={!!proposal} onOpenChange={(o) => !o && onClose()} size="md" title="Active stock alerts" description={proposal ? `Equipment in ${proposal.nickname} that is low in stock` : undefined} footer={<Button onClick={onClose}>Close</Button>}>
      {flagged.length === 0 ? (
        <p className="text-[14px] text-ink-3">No low-stock equipment in this proposal.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {flagged.map((s) => (
            <li key={s.id} className="p-3.5">
              <p className="text-[14px] font-bold">{s.nickname || s.system_type}</p>
              <ul className="mt-1.5 space-y-1 text-[13.5px] text-ink-2">
                {bundle.lineItems.filter((l) => l.system_id === s.id && l.line_item_type === 'equipment' && l.price_actual > 0).map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-3"><span>{l.description}</span><Badge tone="warn">Low stock</Badge></li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[12.5px] text-ink-3">Sample data. Retool reads stock levels from the Inflow inventory sync.</p>
    </Modal>
  )
}

function IncentivesDialog({ open, onClose, proposal, bundle }: { open: boolean; onClose: () => void; proposal: Proposal; bundle: ProjectBundle }) {
  const designed = bundle.systems.filter((s) => s.proposal_id === proposal.id && s.system_type !== 'other')
  const ids = new Set(bundle.systems.filter((s) => s.proposal_id === proposal.id).map((s) => s.id))
  const rows = bundle.lineItems.filter((l) => ids.has(l.system_id) && l.line_item_type === 'incentive')
  const total = rows.reduce((a, l) => a + l.price_actual * l.quantity, 0)
  const [systemId, setSystemId] = useState<number | ''>('')
  const [incId, setIncId] = useState<number | ''>('')
  useEffect(() => { if (open) { setSystemId(designed[0]?.id ?? ''); setIncId('') } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const system = designed.find((s) => s.id === systemId)
  const options = refData.incentives
    .filter((i) => !system || i.system_type === system.system_type)
    .map((i) => ({ value: i.id, label: `${i.name}${(i as { program?: string }).program ? ` (${(i as { program?: string }).program})` : ''}` }))
    .sort((x, y) => x.label.localeCompare(y.label))
  const why = useMemo(() => {
    if (!open || !system || !incId || !bundle.house) return null
    return explainIncentive({ project: bundle.project, house: bundle.house, existing: bundle.existing, systems: bundle.systems, lineItems: bundle.lineItems, proposalId: proposal.id, systemId: system.id }, system, Number(incId))
  }, [open, system, incId, bundle, proposal.id])
  const mark = (ok: boolean) => <span className={ok ? 'font-bold text-ok' : 'font-bold text-bad'}>{ok ? 'Met' : 'Not met'}</span>

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} size="lg" title="Analyze incentives" description={`${proposal.nickname}: what is applied, and why a rebate does or does not apply`} footer={<Button onClick={onClose}>Close</Button>}>
      <div className="space-y-5">
        {rows.length === 0 ? (
          <p className="text-[14px] text-ink-3">No incentives are applied to this proposal yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {rows.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px]"><span>{l.description}</span><span className="num font-semibold text-ok">{money(l.price_actual * l.quantity, { cents: true })}</span></li>
            ))}
            <li className="flex items-center justify-between bg-canvas/60 px-4 py-2.5 text-[14px] font-bold"><span>Total</span><span className="num">{money(total, { cents: true })}</span></li>
          </ul>
        )}

        <div className="border-t border-line pt-4">
          <p className="mb-2 text-[13px] font-bold uppercase tracking-wide text-ink-3">Inspect a rebate</p>
          {designed.length === 0 ? (
            <p className="text-[14px] text-ink-3">Add a system to inspect rebates against it.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="System" options={designed.map((s) => ({ value: s.id, label: `${s.nickname || s.system_type} (${s.id})` }))} value={systemId} onChange={(e) => { setSystemId(Number(e.target.value)); setIncId('') }} />
              <Select label="Select rebate to inspect" placeholder="Choose a rebate" options={options} value={incId} onChange={(e) => setIncId(e.target.value ? Number(e.target.value) : '')} />
            </div>
          )}
          {why && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
                <Badge tone={why.applied ? 'ok' : 'neutral'}>{why.applied ? 'Applied to this system' : 'Not applied'}</Badge>
                <Badge tone={why.typeMatches ? 'ok' : 'bad'}>{why.typeMatches ? `For ${why.systemType} systems` : `For ${why.systemType} systems, not this one`}</Badge>
                <Badge tone={why.inEffect ? 'ok' : 'bad'}>{why.inEffect ? 'In effect at the install date' : 'Not in effect at the install date'}</Badge>
                <span className="text-ink-3">{why.effective.from ?? 'no start'} to {why.effective.to ?? 'no end'}</span>
              </div>
              {why.options.length === 0 && <p className="text-[14px] text-ink-3">This rebate has no eligibility options.</p>}
              {why.options.map((o) => (
                <div key={o.name} className="rounded-lg border border-line">
                  <div className="flex items-center justify-between gap-3 border-b border-line bg-canvas/60 px-4 py-2">
                    <span className="text-[14px] font-semibold capitalize">{o.name.replace('_', ' ')}{o.maxAmount != null && <span className="ml-2 font-normal text-ink-3">up to {money(o.maxAmount)}</span>}</span>
                    {o.eligible ? <Badge tone="ok">Eligible</Badge> : <Badge tone="neutral">{o.notEligibleByRule ? 'Marked not eligible' : 'Not eligible'}</Badge>}
                  </div>
                  <ul className="divide-y divide-line">
                    {o.groups.length === 0 && <li className="px-4 py-2 text-[13.5px] text-ink-3">No conditions: always eligible.</li>}
                    {o.groups.map((g) => (
                      <li key={g.key} className="flex items-start justify-between gap-4 px-4 py-2 text-[13.5px]">
                        <div className="min-w-0">
                          <p className="font-semibold capitalize">{g.key.replace('_', ' ')}</p>
                          <p className="mt-0.5 break-words font-mono text-[12px] text-ink-3">{JSON.stringify(g.criteria)}</p>
                        </div>
                        {mark(g.ok)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

const OPTIONAL_COLUMNS = [
  { id: 'id', label: 'ID' }, { id: 'qty', label: 'Quantity' }, { id: 'equipment_id', label: 'Equipment ID' },
  { id: 'labor_id', label: 'Labor ID' }, { id: 'provider', label: 'Equipment provider' }, { id: 'manual', label: 'Manually added' },
  { id: 'adjustment', label: 'Adjustment reason' },
]

function ColumnsMenu({ selected, onToggle }: { selected: Set<string>; onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-columns-menu]')) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])
  return (
    <div className="relative" data-columns-menu>
      <Button size="sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Columns{selected.size ? ` (+${selected.size})` : ''}</Button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-line bg-surface p-2 shadow-pop" style={{ animation: 'fade-in .12s' }}>
          <p className="px-2 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-wider text-ink-3">More columns</p>
          {OPTIONAL_COLUMNS.map((c) => (
            <Checkbox key={c.id} className="px-2 py-1" label={c.label} checked={selected.has(c.id)} onChange={() => onToggle(c.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

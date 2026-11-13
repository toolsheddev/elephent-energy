import clsx from 'clsx'
import { Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Banner, Button } from '@/components/ui/core'
import { Checkbox, Input, NumberInput, Select } from '@/components/ui/form'
import { Modal, toast } from '@/components/ui/overlay'
import { money, pct } from '@/lib/calc'
import { priceCatalogLine, refData } from '@/lib/engine'
import { useAddLineItems } from '@/lib/hooks'
import type { LineItemRec, ProjectBundle, Proposal, SystemRec } from '@/lib/types'
import { blankChangeOrder, ChangeOrderFields, changeOrderValid } from './ChangeOrderForm'

type Kind = 'equipment' | 'labor' | 'discount' | 'incentive'
interface Row { key: number; kind: Kind; detail: string; itemId: number | null; qty: number; desc: string; amount: number; recipient: string }

const KINDS: { value: Kind; label: string }[] = [
  { value: 'equipment', label: 'Equipment' }, { value: 'labor', label: 'Labor' }, { value: 'discount', label: 'Discount' }, { value: 'incentive', label: 'Incentive' },
]
const RECIPIENTS = [{ value: 'elephant', label: 'Elephant Energy' }, { value: 'customer', label: 'Customer (paid directly)' }, { value: 'homeowner', label: 'Homeowner' }]

/** Retool's Quick Add list (tabs2), same order, labels and catalog ids. A preset whose item is not in this catalog is shown but disabled. */
const PRESETS: { label: string; kind: 'equipment' | 'labor' | 'discount'; id: number }[] = [
  { label: 'Condensate Pump (HP)', kind: 'labor', id: 34 }, { label: 'Condensate Pump (HPWH)', kind: 'labor', id: 89 },
  { label: 'HPWH Different Location Adder', kind: 'labor', id: 14 }, { label: 'Referral Discount', kind: 'discount', id: 5 },
  { label: "Drywall Hole - 1-3'", kind: 'labor', id: 43 }, { label: 'Drywall Touch-Up', kind: 'labor', id: 42 },
  { label: 'Repair ductwork', kind: 'labor', id: 131 }, { label: 'Lineset difficulty adder', kind: 'labor', id: 132 },
  { label: 'HEAR management', kind: 'labor', id: 133 }, { label: 'GFCI outlet', kind: 'labor', id: 50 },
  { label: 'Attic or crawlspace adder', kind: 'labor', id: 117 }, { label: 'Fan powered humidifier', kind: 'equipment', id: 270 },
  { label: 'Bryant 5kW heat kit', kind: 'equipment', id: 638 }, { label: 'Bryant 8kW heat kit', kind: 'equipment', id: 639 },
  { label: 'Bryant 10kW heat kit', kind: 'equipment', id: 640 }, { label: 'Bryant 15kW heat kit', kind: 'equipment', id: 641 },
  { label: 'Whole home surge protection', kind: 'labor', id: 122 }, { label: 'Single circuit surge protection', kind: 'labor', id: 121 },
  { label: 'Simple Switch', kind: 'equipment', id: 112 }, { label: 'A2L venting', kind: 'labor', id: 127 }, { label: 'PVC venting', kind: 'labor', id: 119 },
]

let rowKey = 1
const blankRow = (): Row => ({ key: rowKey++, kind: 'equipment', detail: '', itemId: null, qty: 1, desc: '', amount: 0, recipient: 'elephant' })

/** Catalog items for a row, grouped by "type detail" (equipment type, or labor category / subcategory). */
function catalog(kind: Kind, systemTypes: string[] = []) {
  if (kind === 'incentive') {
    return refData.incentives.filter((i) => systemTypes.length === 0 || systemTypes.includes(String(i.system_type))).map((i) => ({ id: i.id, detail: String((i as { program?: string }).program ?? 'Other'), label: String(i.name) }))
  }
  if (kind === 'equipment') {
    return refData.equipment.filter((e) => e.active !== false).map((e) => ({ id: e.id, detail: e.equipment_type || 'Other', label: `${e.model_number ?? e.id} · ${e.equipment_name}` }))
  }
  if (kind === 'labor') {
    return refData.labor.map((l) => ({ id: l.id, detail: [l.category, l.subcategory].filter(Boolean).join(' / ') || 'other', label: l.name }))
  }
  return []
}

export function AddLineItemsDialog({
  open, onClose, bundle: b, proposal, focusedSystem,
}: { open: boolean; onClose: () => void; bundle: ProjectBundle; proposal: Proposal; focusedSystem: SystemRec | null }) {
  const add = useAddLineItems(b.project.id)
  const designed = useMemo(() => b.systems.filter((s) => s.system_type !== 'other'), [b.systems])
  const label = (s: SystemRec) => `${s.nickname || s.system_type}-${s.id} (${s.system_type})`

  const [systemIds, setSystemIds] = useState<number[]>([])
  const [include, setInclude] = useState(true)
  const [percents, setPercents] = useState<Record<number, number | null>>({})
  const [rows, setRows] = useState<Row[]>([blankRow()])
  const [preset, setPreset] = useState('')
  const [co, setCo] = useState(blankChangeOrder())

  useEffect(() => {
    if (!open) return
    const mine = designed.filter((s) => s.proposal_id === proposal.id)
    setSystemIds(focusedSystem && focusedSystem.system_type !== 'other' ? [focusedSystem.id] : mine.length === 1 ? [mine[0].id] : [])
    setInclude(true); setPercents({}); setRows([blankRow()]); setPreset(''); setCo(blankChangeOrder())
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const finalizedId = b.project.finalized_proposal_id
  const selected = designed.filter((s) => systemIds.includes(s.id))
  const inCO = !!finalizedId && selected.some((s) => s.proposal_id === finalizedId)
  const pricing = proposal.pricing_structure
  const today = new Date().toISOString().slice(0, 10)

  const priced = rows.map((r) => {
    if (r.kind === 'discount' || r.kind === 'incentive') return null
    return r.itemId ? priceCatalogLine(r.kind, r.itemId, pricing, today) : null
  })
  const rowOk = (r: Row, i: number) => (r.kind === 'discount' ? r.desc.trim() !== '' && r.amount > 0 : r.kind === 'incentive' ? !!r.itemId && r.amount > 0 : priced[i]?.ok === true)
  const valid = selected.length > 0 && rows.length > 0 && rows.every(rowOk) && (!inCO || changeOrderValid(co))
  const total = rows.reduce((a, r, i) => {
    if (r.kind === 'discount' || r.kind === 'incentive') return a - Math.abs(r.amount)
    const p = priced[i]
    return p?.ok ? a + p.price * r.qty : a
  }, 0)

  const setRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const inCatalog = (p: (typeof PRESETS)[number]) => p.kind === 'discount' || catalog(p.kind).some((c) => c.id === p.id)
  const applyPreset = (name: string) => {
    setPreset(name)
    const p = PRESETS.find((x) => x.label === name)
    if (!p) return
    // Fills the first row, as in Retool. Discounts have no catalog here, so the amount is typed in.
    if (p.kind === 'discount') { setRows((rs) => [{ ...rs[0], kind: 'discount', detail: '', itemId: null, qty: 1, desc: p.label, amount: 0 }, ...rs.slice(1)]); return }
    const hit = catalog(p.kind).find((c) => c.id === p.id)
    if (!hit) return
    setRows((rs) => [{ ...rs[0], kind: p.kind, detail: hit.detail, itemId: hit.id, qty: 1 }, ...rs.slice(1)])
  }

  const submit = async () => {
    const lines: Omit<LineItemRec, 'id' | 'system_id'>[] = rows.map((r, i) => {
      if (r.kind === 'discount') return { line_item_type: 'discount' as const, description: r.desc.trim(), quantity: 1, price_actual: -Math.abs(r.amount), cost: null }
      if (r.kind === 'incentive') {
        const inc = refData.incentives.find((x) => x.id === r.itemId)
        return { line_item_type: 'incentive' as const, description: String(inc?.name ?? 'Incentive'), quantity: 1, price_actual: -Math.abs(r.amount), cost: null, incentive_id: r.itemId, incentive_recipient: r.recipient }
      }
      const p = priced[i]
      if (!p?.ok) throw new Error('Price missing')
      return {
        line_item_type: r.kind, description: p.description, quantity: r.qty, price_actual: p.price, cost: null,
        equipment_id: r.kind === 'equipment' ? r.itemId : null, labor_id: r.kind === 'labor' ? r.itemId : null,
      }
    })
    await add.mutateAsync({ systemIds, lines, margin: { include, percents }, ...(inCO ? { changeOrder: co } : {}) })
    toast.success(inCO ? 'Change order lines added' : 'Line items added', `${lines.length} ${lines.length === 1 ? 'line' : 'lines'} on ${selected.length} ${selected.length === 1 ? 'system' : 'systems'}. Margin, incentives and permits were recalculated.`)
    onClose()
  }

  return (
    <Modal
      open={open} onOpenChange={(o) => !o && onClose()} size="lg" title="Add line items"
      description={inCO ? 'This proposal is finalized, so these lines are added through a change order.' : 'Prices come from the catalog. Margin, incentives and permits are recalculated when you add them.'}
      footer={<>
        <span className="mr-auto self-center text-[13.5px] text-ink-2">{total !== 0 && <>Total per system <strong className="num ml-1">{money(total, { cents: true })}</strong></>}</span>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!valid} loading={add.isPending} onClick={submit}>Add line items</Button>
      </>}
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-semibold text-ink-2">Apply to systems</legend>
          {designed.length === 0 ? (
            <Banner tone="warn" title="No systems yet">Add a system to this project first.</Banner>
          ) : (
            <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-line p-1.5">
              {designed.map((s) => (
                <Checkbox
                  key={s.id} className="rounded-md px-2 py-1 hover:bg-sunken" label={<span>{label(s)} <span className="text-ink-3">· {b.proposals.find((p) => p.id === s.proposal_id)?.nickname}</span></span>}
                  checked={systemIds.includes(s.id)} onChange={(e) => setSystemIds((ids) => (e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id)))}
                />
              ))}
            </div>
          )}
        </fieldset>

        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-ink-2">Margin</p>
          <div className="inline-flex rounded-lg border border-line-strong p-0.5" role="group" aria-label="Margin">
            {[{ v: true, l: 'Include' }, { v: false, l: 'Exclude' }].map((o) => (
              <button key={o.l} type="button" aria-pressed={include === o.v} onClick={() => setInclude(o.v)}
                className={clsx('cursor-pointer rounded-md px-4 py-1 text-[13.5px] font-semibold', include === o.v ? 'bg-brand-600 text-white' : 'text-ink-2 hover:bg-sunken')}>{o.l}</button>
            ))}
          </div>
          {include && selected.length > 0 && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {selected.map((s) => (
                <NumberInput key={s.id} label={`${s.nickname || s.system_type} margin`} suffix="%" step="0.5" min={0} max={90}
                  hint={`Target ${pct(s.target_margin ?? 0.25, 0)}`}
                  value={percents[s.id] != null ? Math.round(percents[s.id]! * 1000) / 10 : Math.round((s.target_margin ?? 0.25) * 1000) / 10}
                  onChange={(e) => setPercents((p) => ({ ...p, [s.id]: e.target.value === '' ? null : Number(e.target.value) / 100 }))} />
              ))}
            </div>
          )}
        </div>

        <Select label="Quick Add" placeholder="Other (choose below)" options={[...PRESETS.map((p) => ({ value: p.label, label: inCatalog(p) ? p.label : `${p.label} (not in this catalog)`, disabled: !inCatalog(p) }))]} value={preset} onChange={(e) => applyPreset(e.target.value)} />

        <div className="space-y-3">
          {rows.map((r, i) => {
            const items = catalog(r.kind, selected.map((s) => s.system_type))
            const details = [...new Set(items.map((c) => c.detail))].sort()
            const shown = items.filter((c) => !r.detail || c.detail === r.detail).sort((a, z) => a.label.localeCompare(z.label))
            const p = priced[i]
            return (
              <div key={r.key} className="rounded-lg border border-line p-3">
                <div className="grid grid-cols-12 gap-3">
                  <Select wrapperClassName="col-span-6 sm:col-span-3" label="Type" options={KINDS} value={r.kind} onChange={(e) => setRow(r.key, { kind: e.target.value as Kind, detail: '', itemId: null, amount: 0 })} />
                  {r.kind === 'incentive' ? (
                    <>
                      <Select wrapperClassName="col-span-6 sm:col-span-4" label="Type detail" options={[{ value: '', label: 'All' }, ...details.map((d) => ({ value: d, label: d }))]} value={r.detail} onChange={(e) => setRow(r.key, { detail: e.target.value, itemId: null })} />
                      <Select wrapperClassName="col-span-6 sm:col-span-3" label="Paid to" options={RECIPIENTS} value={r.recipient} onChange={(e) => setRow(r.key, { recipient: e.target.value })} />
                      <NumberInput wrapperClassName="col-span-12 sm:col-span-2" label="Amount" prefix="$" min={0} value={r.amount} onChange={(e) => setRow(r.key, { amount: Number(e.target.value) || 0 })} />
                      <Select wrapperClassName="col-span-12" label="Description" required options={[{ value: '', label: 'Choose…' }, ...shown.map((c) => ({ value: c.id, label: c.label }))]} value={r.itemId ?? ''}
                        onChange={(e) => {
                          const id = e.target.value ? Number(e.target.value) : null
                          const inc = refData.incentives.find((x) => x.id === id) as { incentive_criteria?: Record<string, { amount?: { max_amount?: number } }>; recipient?: string } | undefined
                          const max = Object.values(inc?.incentive_criteria ?? {}).map((o) => o.amount?.max_amount ?? 0).find((n) => n > 0) ?? 0
                          setRow(r.key, { itemId: id, amount: max, recipient: inc?.recipient && RECIPIENTS.some((x) => x.value === inc.recipient) ? inc.recipient : r.recipient })
                        }} />
                      <p className="col-span-12 text-[12.5px] text-ink-3">Added by hand: it keeps this amount and is not re-checked for eligibility when the system is recalculated. The amount starts at the rebate's first non-zero maximum.</p>
                    </>
                  ) : r.kind === 'discount' ? (
                    <>
                      <Input wrapperClassName="col-span-12 sm:col-span-6" label="Description" required value={r.desc} onChange={(e) => setRow(r.key, { desc: e.target.value })} />
                      <NumberInput wrapperClassName="col-span-6 sm:col-span-2" label="Price" prefix="$" min={0} value={r.amount} onChange={(e) => setRow(r.key, { amount: Number(e.target.value) || 0 })} />
                    </>
                  ) : (
                    <>
                      <Select wrapperClassName="col-span-6 sm:col-span-4" label="Type detail" options={[{ value: '', label: 'All' }, ...details.map((d) => ({ value: d, label: d }))]} value={r.detail} onChange={(e) => setRow(r.key, { detail: e.target.value, itemId: null })} />
                      <NumberInput wrapperClassName="col-span-6 sm:col-span-2" label="Quantity" min={1} value={r.qty} onChange={(e) => setRow(r.key, { qty: Math.max(1, Number(e.target.value) || 1) })} />
                      <Select wrapperClassName="col-span-12" label="Description" required options={[{ value: '', label: 'Choose…' }, ...shown.map((c) => ({ value: c.id, label: c.label }))]} value={r.itemId ?? ''} onChange={(e) => setRow(r.key, { itemId: e.target.value ? Number(e.target.value) : null })} />
                    </>
                  )}
                  {rows.length > 1 && (
                    <div className="col-span-12 sm:col-span-1 sm:col-start-12 sm:row-start-1 sm:justify-self-end">
                      <button type="button" aria-label="Remove this line" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="cursor-pointer rounded p-1 text-ink-3 hover:bg-sunken hover:text-bad"><X className="size-4" /></button>
                    </div>
                  )}
                </div>
                {r.kind !== 'discount' && r.kind !== 'incentive' && p?.ok && <p className="mt-2 text-[13.5px] text-ink-2">Price each <strong className="num">{money(p.price, { cents: true })}</strong>{r.qty > 1 && <> · {r.qty} × = <strong className="num">{money(p.price * r.qty, { cents: true })}</strong></>}</p>}
                {r.kind !== 'discount' && r.kind !== 'incentive' && p && !p.ok && <p className="mt-2 text-[13.5px] text-bad">{p.error}</p>}
              </div>
            )
          })}
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setRows((rs) => [...rs, blankRow()])}>Add more</Button>
        </div>

        {inCO && (
          <div>
            <p className="mb-2 text-[13px] font-semibold text-ink-2">Change order</p>
            <ChangeOrderFields value={co} onChange={setCo} />
          </div>
        )}
      </div>
    </Modal>
  )
}

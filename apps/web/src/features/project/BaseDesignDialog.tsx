import { PRICING_STRUCTURES_QUICK_ADD } from '@/lib/options'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { Banner, Button } from '@/components/ui/core'
import { Checkbox, Input, NumberInput, Select } from '@/components/ui/form'
import { Modal, toast } from '@/components/ui/overlay'
import { api } from '@/lib/api'
import { useQuickAddBaseDesigns } from '@/lib/hooks'
import type { ProjectBundle, Proposal } from '@/lib/types'
import { DEFAULT_QUICK_ADD, type QuickAddOptions } from '@sd/domain/baseDesign'

const SURGE = ['Single Circuit', 'Whole Home', 'Opt Out']
type Target = number | 'NEW_EACH' | 'NEW_SINGLE'

/** Retool's "Select a Base Design" modal: pick base designs and proposals, then Generate Systems. */
export function BaseDesignDialog({ open, onClose, bundle: b, proposal }: { open: boolean; onClose: () => void; bundle: ProjectBundle; proposal: Proposal }) {
  const { data: designs = [], isLoading } = useQuery({ queryKey: ['base-designs'], queryFn: api.baseDesigns, enabled: open, staleTime: 60_000 })
  const gen = useQuickAddBaseDesigns(b.project.id)
  const finalizedId = b.project.finalized_proposal_id
  const proposals = b.proposals.filter((p) => p.id !== finalizedId)

  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<number[]>([])
  const [targets, setTargets] = useState<Target[]>([])
  const [showPricing, setShowPricing] = useState(false)
  const [pricing, setPricing] = useState(proposal.pricing_structure)
  const [o, setO] = useState<QuickAddOptions>(DEFAULT_QUICK_ADD)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!open) return
    setQ(''); setPicked([]); setConfirming(false); setO({ ...DEFAULT_QUICK_ADD, priceDate: new Date().toISOString().slice(0, 10) })
    setTargets(proposal.id !== finalizedId ? [proposal.id] : []); setPricing(proposal.pricing_structure)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => designs.filter((d) => !q.trim() || `${d.nickname} ${d.system_type} ${d.odu_model ?? ''} ${d.idu_model ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())), [designs, q])
  const chosen = designs.filter((d) => picked.includes(d.id))
  const types = new Set(chosen.map((d) => d.system_type.toLowerCase()))
  const mixed = types.size > 1
  const hvacOnly = types.has('hvac') && types.size === 1
  const proposalCount = targets.reduce<number>((n, t) => n + (t === 'NEW_EACH' ? chosen.length : 1), 0)
  const total = chosen.length * targets.length // every design into every target (a "new for each" target is one proposal per design)
  const ready = chosen.length > 0 && targets.length > 0 && !mixed

  const toggleTarget = (t: Target, on: boolean) => setTargets((cur) => {
    if (!on) return cur.filter((x) => x !== t)
    if (t === 'NEW_EACH') { toast.success('Exclusive option', 'This creates a separate proposal for each system, so it cannot be combined with others.'); return ['NEW_EACH'] }
    return [...cur.filter((x) => x !== 'NEW_EACH'), t]
  })
  const set = <K extends keyof QuickAddOptions>(k: K, v: QuickAddOptions[K]) => setO((c) => ({ ...c, [k]: v }))

  const generate = async () => {
    await gen.mutateAsync({ designs: chosen, targets, pricingStructure: pricing, options: o })
    toast.success('Systems added', `${total} ${total === 1 ? 'system' : 'systems'} generated.`)
    onClose()
  }

  return (
    <Modal
      open={open} onOpenChange={(v) => !v && onClose()} size="xl" title="Base design"
      description="A base design is a stored outdoor unit, indoor unit and thermostat. Generating it prices a full system, with margin and incentives."
      footer={confirming ? (
        <>
          <Button onClick={() => setConfirming(false)}>Back</Button>
          <Button variant="primary" loading={gen.isPending} onClick={generate}>Generate</Button>
        </>
      ) : (
        <>
          <Button onClick={onClose}>Cancel</Button>
          <span title={!ready ? 'Pick at least one design and one option.' : undefined}>
            <Button variant="primary" disabled={!ready} onClick={() => setConfirming(true)}>Generate</Button>
          </span>
        </>
      )}
    >
      {confirming ? (
        <div className="space-y-3 text-[14px]">
          <p>You are about to generate the following {total} system{total === 1 ? '' : 's'} across {proposalCount} option{proposalCount === 1 ? '' : 's'}:</p>
          <ul className="list-disc space-y-0.5 pl-5 text-ink-2">{chosen.map((d) => <li key={d.id}>{d.nickname}</li>)}</ul>
          <p className="text-ink-2">
            Into: {targets.map((t) => (t === 'NEW_EACH' ? 'a new option for each design' : t === 'NEW_SINGLE' ? 'one new option' : proposals.find((p) => p.id === t)?.nickname)).join(', ')}.
            Pricing {PRICING_STRUCTURES_QUICK_ADD.find((x) => x.value === pricing)?.label ?? pricing}, target margin {Math.round(o.margin * 1000) / 10}%.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <Input aria-label="Search base designs" placeholder="Search base designs" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-line">
              <table className="w-full border-collapse text-[13.5px]">
                <thead className="sticky top-0 bg-canvas">
                  <tr>{['', 'Design', 'Thermostat'].map((h) => <th key={h} className="whitespace-nowrap border-b border-line px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {isLoading && <tr><td colSpan={3} className="px-3 py-6 text-center text-ink-3">Loading…</td></tr>}
                  {!isLoading && shown.length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-ink-3">No rows found</td></tr>}
                  {shown.map((d) => {
                    const on = picked.includes(d.id)
                    return (
                      <tr key={d.id} className={clsx('cursor-pointer border-b border-line last:border-0', on ? 'bg-brand-50' : 'hover:bg-sunken/60')}
                        onClick={() => setPicked((cur) => (cur.includes(d.id) ? cur.filter((x) => x !== d.id) : [...cur, d.id]))}>
                        <td className="w-10 px-3 py-1.5" onClick={(e) => e.stopPropagation()}><Checkbox aria-label={`Select ${d.nickname}`} className="py-0" label="" checked={on} onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, d.id] : cur.filter((x) => x !== d.id)))} /></td>
                        <td className="px-3 py-1.5"><span className="font-medium">{d.nickname}</span> <span className="text-[12px] text-ink-3">· {d.system_type === 'hvac' ? 'Heat pump' : d.system_type}</span></td>
                        <td className="px-3 py-1.5 text-ink-2">{d.thermostat_model ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[12.5px] text-ink-3">{picked.length} selected · sample designs built from the catalog (Retool reads them from its AHRI configurations).</p>
            {mixed && <Banner tone="warn" title="Invalid selection">You cannot mix HVAC and Water Heater systems in the same batch. Select only one system type.</Banner>}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <fieldset>
              <legend className="mb-1.5 text-[12.5px] font-semibold text-ink-2">Add to options</legend>
              <div className="space-y-0.5 rounded-lg border border-line p-1.5">
                {proposals.map((p) => <Checkbox key={p.id} className="rounded-md px-2 py-1 hover:bg-sunken" label={`${p.nickname} (${p.id})`} checked={targets.includes(p.id)} onChange={(e) => toggleTarget(p.id, e.target.checked)} />)}
                <Checkbox className="rounded-md px-2 py-1 hover:bg-sunken" label="One new option for all of them" checked={targets.includes('NEW_SINGLE')} onChange={(e) => toggleTarget('NEW_SINGLE', e.target.checked)} />
                <Checkbox className="rounded-md px-2 py-1 hover:bg-sunken" label="A new option for each design" checked={targets.includes('NEW_EACH')} onChange={(e) => toggleTarget('NEW_EACH', e.target.checked)} />
              </div>
            </fieldset>
            <div className="grid content-start gap-2">
              <Select label="Surge protection" options={SURGE} value={o.surgeProtection} onChange={(e) => set('surgeProtection', e.target.value as QuickAddOptions['surgeProtection'])} />
              <p className="mt-1 text-[12.5px] font-semibold text-ink-2">Also add</p>
              <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
            <Checkbox label="GFCI outlet" checked={o.gfci} onChange={(e) => set('gfci', e.target.checked)} />
            <Checkbox label="Condensate pump" checked={o.condensatePump} onChange={(e) => set('condensatePump', e.target.checked)} />
            {hvacOnly && <Checkbox label="A2L venting" checked={o.a2l} onChange={(e) => set('a2l', e.target.checked)} />}
            {hvacOnly && <Checkbox label="Attic or crawlspace adder" checked={o.attic} onChange={(e) => set('attic', e.target.checked)} />}
            {!hvacOnly && <Checkbox label="Thermostatic mixing valve" checked={o.tmv} onChange={(e) => set('tmv', e.target.checked)} />}
            {!hvacOnly && <Checkbox label="Venting" checked={o.venting} onChange={(e) => set('venting', e.target.checked)} />}
              </div>
            </div>
          </div>

          {/* Pricing defaults rarely change, so they fold into one line */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-canvas px-3 py-2 text-[13px]">
            <span className="text-ink-3">Pricing</span>
            <span className="font-medium">{PRICING_STRUCTURES_QUICK_ADD.find((x) => x.value === pricing)?.label ?? pricing}</span>
            <span className="text-ink-3">·</span><span>target margin {Math.round(o.margin * 1000) / 10}%</span>
            <span className="text-ink-3">·</span><span>prices from {o.priceDate || '—'}</span>
            <span className="text-ink-3">·</span><span>rebate date {o.rebateDate || '—'}</span>
            <button type="button" onClick={() => setShowPricing((v) => !v)} aria-expanded={showPricing} className="ml-auto cursor-pointer font-semibold text-brand-700 hover:underline">{showPricing ? 'Done' : 'Change'}</button>
          </div>
          {showPricing && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Pricing structure" options={PRICING_STRUCTURES_QUICK_ADD} value={pricing} onChange={(e) => setPricing(e.target.value)} />
              <NumberInput label="Target margin" suffix="%" min={0} max={90} step="0.5" value={Math.round(o.margin * 1000) / 10} onChange={(e) => set('margin', (Number(e.target.value) || 0) / 100)} />
              <Input type="date" label="Price date" value={o.priceDate} onChange={(e) => set('priceDate', e.target.value)} />
              <Input type="date" label="Rebate effective date" value={o.rebateDate} onChange={(e) => set('rebateDate', e.target.value)} />
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

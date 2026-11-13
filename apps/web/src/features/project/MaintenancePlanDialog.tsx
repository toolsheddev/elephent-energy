import { useEffect, useMemo, useState } from 'react'
import { Banner, Button } from '@/components/ui/core'
import { Checkbox, NumberInput, Select } from '@/components/ui/form'
import { Modal, toast } from '@/components/ui/overlay'
import { money } from '@/lib/calc'
import { useCreateMaintenancePlan } from '@/lib/hooks'
import type { ProjectBundle, Proposal } from '@/lib/types'
import { MAINTENANCE_LEVELS, specMaintenancePlan, type MaintenanceCounts } from '@sd/domain/maintenancePlan'

const blank: MaintenanceCounts = { condensers: 0, ahus: 0, heads: 0, hpwhs: 0, ervs: 0, smartacs: 0 }
const COUNT_FIELDS: { key: keyof MaintenanceCounts; label: string }[] = [
  { key: 'condensers', label: 'Condensers' }, { key: 'ahus', label: 'Air handlers' }, { key: 'heads', label: 'Heads' },
  { key: 'ervs', label: 'ERVs' }, { key: 'hpwhs', label: 'Heat pump water heaters' }, { key: 'smartacs', label: 'SmartACs' },
]

interface HvacInput { heatPump?: { condenser?: { model?: number | null }; ahu?: { count?: number }; miniSplit?: { count?: number } } }

/** Retool's "Add a Maintenance Plan" modal: pick the systems it covers and the plan level; the unit counts start from those systems. */
export function MaintenancePlanDialog({ open, onClose, bundle: b, proposal }: { open: boolean; onClose: () => void; bundle: ProjectBundle; proposal: Proposal }) {
  const create = useCreateMaintenancePlan(b.project.id)
  const covered = useMemo(() => b.systems.filter((s) => s.proposal_id === proposal.id && (s.system_type === 'hvac' || s.system_type === 'water heater')), [b.systems, proposal.id])
  const levels = useMemo(() => MAINTENANCE_LEVELS(), [])
  const [ids, setIds] = useState<number[]>([])
  const [level, setLevel] = useState('')
  const [smartAc, setSmartAc] = useState(false)
  const [c, setC] = useState<MaintenanceCounts>(blank)
  const [calculated, setCalculated] = useState(false)

  // The counts follow the chosen systems until they are edited by hand
  const fromSystems = (sel: number[], smart: boolean): MaintenanceCounts => {
    const out = { ...blank }
    for (const s of covered.filter((x) => sel.includes(x.id))) {
      if (s.system_type === 'water heater') { out.hpwhs += 1; continue }
      const hp = (s.input as HvacInput).heatPump
      if (hp?.condenser?.model) out.condensers += 1
      out.ahus += hp?.ahu?.count ?? 0
      out.heads += hp?.miniSplit?.count ?? 0
    }
    if (smart) out.smartacs = out.condensers
    return out
  }
  useEffect(() => {
    if (!open) return
    const all = covered.map((s) => s.id)
    setIds(all); setLevel(''); setSmartAc(false); setC(fromSystems(all, false)); setCalculated(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: number, on: boolean) => {
    const next = on ? [...ids, id] : ids.filter((x) => x !== id)
    setIds(next); setC(fromSystems(next, smartAc)); setCalculated(false)
  }
  const set = (k: keyof MaintenanceCounts, v: number) => { setC((cur) => ({ ...cur, [k]: Math.max(0, v) })); setCalculated(false) }

  const today = new Date().toISOString().slice(0, 10)
  const result = useMemo(() => (calculated ? specMaintenancePlan(level, c, proposal.pricing_structure, today) : null), [calculated, level, c, proposal.pricing_structure, today])
  const total = result?.ok ? result.lines.reduce((a, l) => a + l.price_actual * l.quantity, 0) : 0
  const ready = !!level && c.condensers >= 1

  return (
    <Modal
      open={open} onOpenChange={(o) => !o && onClose()} size="lg" title="Add a maintenance plan"
      description="A base plan covers one condenser, one air handler per condenser and three heads per condenser. Anything beyond that is priced as additional units."
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button disabled={!ready} onClick={() => setCalculated(true)}>Calculate</Button>
        <Button variant="primary" disabled={!result?.ok} loading={create.isPending}
          onClick={async () => { await create.mutateAsync({ proposalId: proposal.id, level, counts: c }); toast.success('Maintenance plan added', `${level} plan, ${money(total, { cents: true })} per year`); onClose() }}>Create maintenance plan</Button>
      </>}
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-semibold text-ink-2">Systems to include</legend>
          {covered.length === 0 ? <Banner tone="warn" title="No HVAC or water heater systems in this proposal">Add one first, or set the unit counts by hand.</Banner> : (
            <div className="space-y-0.5 rounded-lg border border-line p-1.5">
              {covered.map((s) => <Checkbox key={s.id} className="rounded-md px-2 py-1 hover:bg-sunken" label={`${s.nickname || s.system_type} (${s.id})`} checked={ids.includes(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />)}
            </div>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Plan level" required placeholder="Select a level" options={levels.map((l) => ({ value: l, label: l[0].toUpperCase() + l.slice(1) }))} value={level} onChange={(e) => { setLevel(e.target.value); setCalculated(false) }} />
          <Checkbox className="sm:mt-7" label="Include SmartAC" hint="One per condenser to start" checked={smartAc} onChange={(e) => { setSmartAc(e.target.checked); setC((cur) => ({ ...cur, smartacs: e.target.checked ? Math.max(cur.condensers, 1) : 0 })); setCalculated(false) }} />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {COUNT_FIELDS.map((f) => <NumberInput key={f.key} label={f.label} min={0} value={c[f.key]} onChange={(e) => set(f.key, Number(e.target.value) || 0)} />)}
        </div>

        {result && !result.ok && <Banner tone="warn" title="Could not calculate the plan">{result.errors[0]}</Banner>}
        {result?.ok && (
          <div className="rounded-lg border border-line">
            <table className="w-full text-[13.5px]">
              <tbody>
                {result.lines.map((l, i) => <tr key={i} className="border-b border-line last:border-0"><td className="px-4 py-2">{l.description}</td><td className="num px-4 py-2 text-right">{money(l.price_actual, { cents: true })}</td></tr>)}
                <tr className="bg-canvas/60 font-bold"><td className="px-4 py-2.5">Per year</td><td className="num px-4 py-2.5 text-right">{money(total, { cents: true })}</td></tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[12.5px] text-ink-3">The additional-unit and add-on options and prices are sample rows. The live system reads Retool's maintenance plan table.</p>
      </div>
    </Modal>
  )
}

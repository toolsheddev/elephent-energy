import { ahuUnit, blankSystemInput, makeSystemInput, miniSplitUnit, type CostSystemType } from '@sd/engine'
import clsx from 'clsx'
import { ArrowLeft, ArrowRight, Plus, RotateCcw, TriangleAlert, Trash2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Badge, Banner, Button, Card, CardBody, CardHeader, FormGrid, IconButton } from '@/components/ui/core'
import { Checkbox, Input, MultiSelect, NumberInput, Select, type Option } from '@/components/ui/form'
import { Drawer, Modal, toast } from '@/components/ui/overlay'
import { money, pct, totalsOf } from '@/lib/calc'
import { priceCatalogLine, recalcDraft, refData, runSpec, toEngineHouse, type NewLine, type RecalcContext, type SpecOutcome, type SystemInput } from '@/lib/engine'
import { useAddSystem, useCreateProposal, useReplaceSystem, useUpdateProposal } from '@/lib/hooks'
import { boxOptionsFor, calculateBranchBoxes, cleanAssignments, fromRetoolAssignments, manualBranchBoxOptions, toRetoolAssignments, withAssignments, type UnitAssignments } from '@sd/domain/branchBoxes'
import { HEATING_LOAD_COVERAGE, MA_REBATE_TYPES, PRICING_STRUCTURES, SYSTEM_TYPES } from '@/lib/options'
import type { LineItemRec, ProjectBundle, Proposal, SystemRec, SystemType } from '@/lib/types'

/* ---------------- catalog options (from the engine's reference data) ---------------- */

const eqOptions = (...types: string[]): Option<number>[] =>
  refData.equipment
    .filter((e) => e.active !== false && types.includes(e.equipment_type))
    .map((e) => ({ value: e.id, label: `${e.model_number ?? e.id} · ${e.equipment_name}` }))
    .sort((a, b) => a.label.localeCompare(b.label))

const laborOptions = (pred: (l: (typeof refData.labor)[number]) => boolean): Option<number>[] =>
  refData.labor.filter(pred).map((l) => ({ value: l.id, label: l.name })).sort((a, b) => a.label.localeCompare(b.label))

const CATALOG = {
  condenser: eqOptions('Condenser'),
  ahu: eqOptions('AHU', 'Dual-Fuel Coil'),
  heads: eqOptions('Wall Head', 'Floor Head', 'Ceiling Cassette', 'Horizontal-Ducted Head'),
  thermostat: eqOptions('Thermostat'),
  heatKit: eqOptions('Heat Kit'),
  humidifier: eqOptions('Humidifier'),
  hpwh: eqOptions('HPWH'),
  ev: eqOptions('EV Charger'),
  electricalEquip: eqOptions('Electrical'),
  circuitLabor: laborOptions((l) => l.category === 'electrical' && l.subcategory === 'circuit'),
  electricalLabor: laborOptions((l) => l.category === 'electrical' && l.subcategory === 'equipment'),
  adderLabor: refData.labor.filter((l) => l.subcategory === 'adder').map((l) => ({ value: l.id, label: `${l.category ?? 'other'}: ${l.name}` })).sort((a, b) => a.label.localeCompare(b.label)),
}

/** Systems the engine can spec today. */
const SUPPORTED: Record<string, CostSystemType> = {
  hvac: 'hvac', 'water heater': 'water heater', ev: 'ev', cooktop: 'cooktop', panel: 'panel',
  'energy efficiency': 'energy efficiency', 'labor warranty': 'labor warranty', adder: 'adder',
}

/* ---------------- tiny immutable path helpers ---------------- */

type Path = (string | number)[]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getIn = (o: any, p: Path) => p.reduce((n, k) => (n == null ? n : n[k]), o)
function setIn<T>(o: T, p: Path, v: unknown): T {
  const c = structuredClone(o) as Record<string | number, unknown>
  let n: Record<string | number, unknown> = c
  for (let i = 0; i < p.length - 1; i++) n = n[p[i]] as Record<string | number, unknown>
  n[p[p.length - 1]] = v
  return c as T
}

/* ---------------- component ---------------- */

export function AddSystemDrawer({
  bundle, proposalId, open, editing, onClose,
}: { bundle: ProjectBundle; proposalId: number; open: boolean; editing: SystemRec | null; onClose: () => void }) {
  const pid = bundle.project.id
  const proposal = bundle.proposals.find((p) => p.id === proposalId)!
  const add = useAddSystem(pid)
  const replace = useReplaceSystem(pid)

  const [type, setType] = useState<SystemType>(editing?.system_type ?? 'hvac')
  const [nickname, setNickname] = useState(editing?.nickname ?? '')
  const [input, setInput] = useState<SystemInput>(() =>
    editing && Object.keys(editing.input).length > 0 ? (editing.input as unknown as SystemInput) : blankSystemInput(),
  )

  const set = (p: Path, v: unknown) => setInput((cur) => setIn(cur, p, v))
  const txt = (p: Path) => ({ value: (getIn(input, p) as string) ?? '', onChange: (e: { target: { value: string } }) => set(p, e.target.value) })
  const num = (p: Path) => ({ value: (getIn(input, p) as number) ?? 0, onChange: (e: { target: { value: string } }) => set(p, Number(e.target.value) || 0) })
  const pick = (p: Path) => ({ value: (getIn(input, p) as number | null) ?? '', onChange: (e: { target: { value: string } }) => set(p, e.target.value === '' ? null : Number(e.target.value)) })
  const chk = (p: Path) => ({ checked: !!getIn(input, p), onChange: (e: { target: { checked: boolean } }) => set(p, e.target.checked) })

  const house = bundle.house

  /* ---- flow state (Retool: System Selection -> Line Items) ---- */
  const [selProposals, setSelProposals] = useState<(number | 'NEW')[]>(editing ? [editing.proposal_id] : [proposalId])
  const [pricing, setPricing] = useState<string>(proposal.pricing_structure)
  // Retool defaults the target margin to 22.5% for Massachusetts homes
  const [margin, setMargin] = useState<number>(editing?.target_margin ?? (house?.state === 'MA' ? 0.225 : proposal.target_margin))
  // Advanced branch boxes (Retool "advanced mode"): off, calculated from the units, or chosen by hand
  const savedBB = (editing?.input as unknown as SystemInput | undefined)?.heatPump?.branchBoxes?.advanced
  const [bbMode, setBbMode] = useState<'off' | 'auto' | 'manual'>(savedBB?.enabled ? (savedBB.isManualOverride ? 'manual' : 'auto') : 'off')
  const [bbManual, setBbManual] = useState<Record<string, number>>(() => {
    const counts: Record<string, number> = {}
    if (savedBB?.isManualOverride) for (const b of savedBB.calculatedBoxes) if (b.type !== 'tee') counts[b.model] = (counts[b.model] ?? 0) + 1
    return counts
  })
  // Which box each head connects to (restored when editing)
  const savedInput = editing?.input as unknown as SystemInput | undefined
  const [bbAssign, setBbAssign] = useState<UnitAssignments>(() =>
    fromRetoolAssignments(savedBB?.assignments, savedInput?.heatPump?.ahu?.units?.length ?? 0, savedInput?.heatPump?.miniSplit?.units?.length ?? 0))
  const setAssign = (kind: 'ahu' | 'ms', index: number, id: string) =>
    setBbAssign((cur) => { const next = { ahu: [...cur.ahu], ms: [...cur.ms] }; next[kind][index] = id || null; return next })
  const [step, setStep] = useState<'setup' | 'lines'>('setup')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [active, setActive] = useState('')
  const [errorsOpen, setErrorsOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const createProposal = useCreateProposal(pid)
  const updProposal = useUpdateProposal(pid)

  const units = input.heatPump.ahu.units.length + input.heatPump.miniSplit.units.length
  const unitIds = useMemo(() => ({ ahu: input.heatPump.ahu.units.map((u) => u.model.id), ms: input.heatPump.miniSplit.units.map((u) => u.model.id) }), [input.heatPump.ahu.units, input.heatPump.miniSplit.units])
  const bb = useMemo(
    () => (type === 'hvac' && bbMode !== 'off' ? calculateBranchBoxes({
      ahuModelIds: input.heatPump.ahu.units.map((u) => u.model.id), msModelIds: input.heatPump.miniSplit.units.map((u) => u.model.id), condenserId: input.heatPump.condenser.model,
      manual: bbMode === 'manual' ? bbManual : undefined,
    }) : null),
    [type, bbMode, bbManual, input.heatPump.ahu.units, input.heatPump.miniSplit.units, input.heatPump.condenser.model],
  )

  /** Head-to-box dropdown, shown when advanced branch boxes produced boxes that take units. */
  const boxPicker = (kind: 'ahu' | 'ms', i: number, cls: string) => {
    if (type !== 'hvac' || bbMode === 'off' || !bb) return null
    const opts = boxOptionsFor(bb.branchBoxes, bbAssign, kind, i)
    if (!opts.length) return null
    return <Select wrapperClassName={cls} label="Connects to" options={opts} placeholder="Not assigned" value={bbAssign[kind][i] ?? ''} onChange={(e) => setAssign(kind, i, e.target.value)} />
  }

  /** What the engine receives for one target proposal: the form plus project context. */
  const makeFull = (key: number | 'NEW'): SystemInput => {
    const base = makeSystemInput({
      ...(input as unknown as Record<string, unknown>),
      cost_system_type: SUPPORTED[type] ?? 'hvac',
      PricingStructure: pricing,
      targetMargin: margin,
      ...(type === 'hvac' && house?.state === 'CO' ? { heatLoadCoverage: (input as unknown as { heatLoadCoverage?: string | null }).heatLoadCoverage ?? null } : {}),
      mode: editing ? 'edit system' : 'add system',
      ...(editing ? { system_id: editing.id } : {}),
    })
    const full = house ? setIn(base, ['specIncentives'], { ...base.specIncentives, proposal_id: [key === 'NEW' ? -1 : key], house: toEngineHouse(house) }) : base
    if (type !== 'hvac' || bbMode === 'off' || !bb) return full
    return setIn(full, ['heatPump', 'branchBoxes', 'advanced'], {
      enabled: true, isManualOverride: bbMode === 'manual', totalUnits: bb.totalUnits, indoorSeries: bb.indoorSeries, outdoorSeries: bb.outdoorSeries, refrigerant: bb.refrigerant,
      calculatedBoxes: withAssignments(bb.branchBoxes, bbAssign, unitIds), assignments: toRetoolAssignments(cleanAssignments(bb.branchBoxes, bbAssign), unitIds),
    })
  }

  /* ---- completeness ---- */
  const missing = useMemo(() => {
    const m: string[] = []
    const hp = input.heatPump
    if (type === 'hvac') {
      if (house?.state === 'CO' && !(input as unknown as { heatLoadCoverage?: string | null }).heatLoadCoverage) m.push('Choose the heating load coverage')
      if (!hp.condenser.model) m.push('Choose a condenser model')
      if (hp.ahu.count + hp.miniSplit.count === 0) m.push('Add at least one air handler or mini-split')
      hp.ahu.units.forEach((u, i) => { if (!u.model.id) m.push(`Choose a model for air handler ${i + 1}`) })
      hp.miniSplit.units.forEach((u, i) => { if (!u.model.id) m.push(`Choose a model for mini-split ${i + 1}`) })
    }
    if (type === 'water heater' && !input.HPWH.equipment.model) m.push('Choose a water heater model')
    if (type === 'ev') {
      if (!input.evCharging.charger.model && !(input.evCharging.electrical.circuitLength ?? 0)) m.push('Choose a charger or enter a circuit length')
      if (!input.evCharging.electrical.plugOrHardwired.value) m.push('Choose plug or hardwired')
    }
    if (type === 'cooktop' && !input.inductionWiring.labor.id) m.push('Choose a circuit amperage')
    if (type === 'panel' && input.electricalUpgrades.labor.items.length + input.electricalUpgrades.equipment.items.length === 0) m.push('Select at least one electrical upgrade')
    if (type === 'energy efficiency') {
      const e = input.energyEfficiency
      if (![e.audit, e.airSealing, e.atticInsulation, e.atticAirSealing, e.blowerTest, e.crawlspace, e.aeroseal, e.vaporGuard].some((x) => x.enabled)) m.push('Select at least one energy efficiency measure')
    }
    if (type === 'adder' && !input.otherData.item.laborId) m.push('Choose the labor item to add')
    return m
  }, [input, type])

  /** What the margin and incentive step needs to know about the rest of the project. */
  const rc = useMemo<RecalcContext | undefined>(
    () => (bundle.house ? { project: bundle.project, house: bundle.house, existing: bundle.existing, systems: bundle.systems, lineItems: bundle.lineItems, proposalId, systemId: editing?.id } : undefined),
    [bundle, proposalId, editing?.id],
  )
  const rcFor = (key: number | 'NEW'): RecalcContext | undefined => (rc ? { ...rc, proposalId: key === 'NEW' ? -1 : key } : undefined)
  const canNext = missing.length === 0 && selProposals.length > 0 && !!SUPPORTED[type]

  /* ---- unit arrays ---- */
  const setAhuCount = (n: number) => {
    const units = [...input.heatPump.ahu.units]
    while (units.length < n) units.push(ahuUnit(null))
    units.length = n
    setInput((c) => setIn(setIn(c, ['heatPump', 'ahu', 'units'], units), ['heatPump', 'ahu', 'count'], n))
  }
  const setMsCount = (n: number) => {
    const units = [...input.heatPump.miniSplit.units]
    while (units.length < n) units.push(miniSplitUnit(null))
    units.length = n
    setInput((c) => setIn(setIn(c, ['heatPump', 'miniSplit', 'units'], units), ['heatPump', 'miniSplit', 'count'], n))
  }

  const labelOf = (key: number | 'NEW') => (key === 'NEW' ? 'New proposal' : bundle.proposals.find((x) => x.id === key)?.nickname ?? `Proposal ${key}`)

  /** "Next": run the calculation once per selected proposal, then show the Line Items step. */
  const compute = () => {
    const ds: Draft[] = selProposals.map((key) => {
      const out = runSpec(makeFull(key), rcFor(key))
      return { key, label: labelOf(key), out, lines: out.ok ? out.lines : [], notes: out.ok ? out.warnings : out.errors }
    })
    setDrafts(ds)
    setActive(String(ds[0].key))
    setStep('lines')
  }

  /** "Add Line Item": append a manual line, then re-run margin and incentives on the whole draft. */
  const addManual = (key: number | 'NEW', line: NewLine) => {
    const d = drafts.find((x) => x.key === key)
    const r = rcFor(key)
    if (!d || !r || !d.out.ok) return
    const lines = [...d.lines, { ...line, is_manual: true }]
    const res = recalcDraft(r, {
      engineSystem: d.out.engineSystem, systemType: SUPPORTED[type] ?? type, targetMargin: margin, rebateEffectiveDate: input.rebateEffectiveDate,
      lines, newIndexes: new Set([lines.length - 1]), mode: editing ? 'edit system' : 'add system',
    })
    setDrafts((cur) => cur.map((x) => (x.key !== key ? x : res.ok ? { ...x, lines: res.lines, notes: [...x.notes.filter((n) => !n.startsWith('Incentives')), ...res.warnings] } : { ...x, notes: [...x.notes, ...res.errors] })))
    if (!res.ok) toast.error('Could not add the line', res.errors[0])
  }

  const removeManual = (key: number | 'NEW', index: number) => {
    const d = drafts.find((x) => x.key === key)
    const r = rcFor(key)
    if (!d || !r || !d.out.ok) return
    const lines = d.lines.filter((_, i) => i !== index)
    const res = recalcDraft(r, { engineSystem: d.out.engineSystem, systemType: SUPPORTED[type] ?? type, targetMargin: margin, rebateEffectiveDate: input.rebateEffectiveDate, lines, newIndexes: new Set(), mode: editing ? 'edit system' : 'add system' })
    if (res.ok) setDrafts((cur) => cur.map((x) => (x.key === key ? { ...x, lines: res.lines } : x)))
  }

  /** "Finish Adding System": save the system (and its lines) into every selected proposal. */
  const finish = async () => {
    setSaving(true)
    try {
      for (const d of drafts) {
        if (!d.out.ok) continue
        let target = d.key === 'NEW' ? 0 : d.key
        if (d.key === 'NEW') {
          const created = (await createProposal.mutateAsync(nickname.trim() || defaultName(type))) as Proposal
          target = created.id
          await updProposal.mutateAsync({ proposalId: target, patch: { pricing_structure: pricing, target_margin: margin } })
        } else if (pricing !== (bundle.proposals.find((x) => x.id === d.key)?.pricing_structure ?? pricing)) {
          await updProposal.mutateAsync({ proposalId: target, patch: { pricing_structure: pricing } })
        }
        const rec = {
          proposal_id: target, system_type: type, nickname: nickname.trim() || defaultName(type), scope: 'base' as const, input: makeFull(d.key) as unknown as Record<string, unknown>, engine: d.out.engineSystem, target_margin: d.out.targetMargin,
          rebate_eligibility_type: input.rebateEligibilityType || 'none', heating_load_coverage: type === 'hvac' && house?.state === 'CO' ? (input as unknown as { heatLoadCoverage?: string | null }).heatLoadCoverage ?? null : null,
        }
        if (editing && d.key === editing.proposal_id) await replace.mutateAsync({ systemId: editing.id, patch: rec, lineItems: d.lines })
        else await add.mutateAsync({ system: rec, lineItems: d.lines })
      }
      toast.success(editing ? 'System updated' : 'System added', drafts.length > 1 ? `Added to ${drafts.length} proposals` : undefined)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const startOver = () => {
    setType(editing?.system_type ?? 'hvac')
    setNickname(editing?.nickname ?? '')
    setInput(editing && Object.keys(editing.input).length > 0 ? (editing.input as unknown as SystemInput) : blankSystemInput())
    setSelProposals(editing ? [editing.proposal_id] : [proposalId])
    setPricing(proposal.pricing_structure)
    setMargin(editing?.target_margin ?? (house?.state === 'MA' ? 0.225 : proposal.target_margin))
    setDrafts([]); setStep('setup')
  }

  const allOk = drafts.length > 0 && drafts.every((d) => d.out.ok)
  const errorCount = drafts.reduce((n, d) => n + d.notes.length, 0)

  const typeLabel = SYSTEM_TYPES.find((t) => t.value === type)?.label ?? type

  return (
    <Drawer
      open={open} onOpenChange={(o) => !o && onClose()} width="max-w-[1100px]"
      title={editing ? `Edit ${editing.nickname}` : 'Add a system'}
      description={step === 'setup' ? 'Step 1 of 2: choose the system and its equipment.' : 'Step 2 of 2: review the line items, then finish.'}
      footer={
        step === 'setup' ? (
          <>
            <p className="mr-auto text-[13px] text-ink-3">{canNext ? 'Next calculates the line items for each selected proposal.' : missing[0] ?? (selProposals.length === 0 ? 'Select at least one proposal' : 'Not available yet.')}</p>
            <Button icon={<RotateCcw className="size-4" />} onClick={startOver}>Start over</Button>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!canNext} onClick={compute}>Next <ArrowRight className="size-4" /></Button>
          </>
        ) : (
          <>
            <Button icon={<ArrowLeft className="size-4" />} onClick={() => setStep('setup')}>Previous</Button>
            <p className="mr-auto text-[13px] text-ink-3">{allOk ? `${drafts.length} ${drafts.length === 1 ? 'proposal' : 'proposals'} ready` : 'Fix the errors, then go back and try again.'}</p>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!allOk} loading={saving} onClick={finish}>Finish adding system</Button>
          </>
        )
      }
    >
      <StepBar step={step} typeLabel={typeLabel} />

      {step === 'setup' ? (
        <div className="min-w-0 space-y-5">
          {/* System type */}
          {!editing && (
            <div>
              <h3 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-ink-3">What are you adding?</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SYSTEM_TYPES.map((t) => {
                  const on = type === t.value
                  const ok = !!SUPPORTED[t.value]
                  return (
                    <button
                      key={t.value} type="button" disabled={!ok} aria-pressed={on}
                      onClick={() => { setType(t.value as SystemType); setNickname('') }}
                      className={clsx('cursor-pointer rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50', on ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100' : 'border-line bg-surface hover:border-brand-300')}
                    >
                      <span className="block text-[13.5px] font-bold leading-tight">{t.label}</span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">{ok ? t.hint : 'Coming soon'}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <Card>
            <CardHeader title="Project setup" subtitle="Applies to pricing and rebate eligibility." />
            <CardBody>
              <FormGrid>
                {editing ? (
                  <Input wrapperClassName="col-span-12 sm:col-span-6" label="Proposal" readOnly value={proposal.nickname} />
                ) : (
                  <MultiSelect
                    className="col-span-12 sm:col-span-6" label="Select proposal" hint="Pick several to add the system to all of them."
                    options={[{ value: 'NEW', label: '✨ Create a new proposal' }, ...bundle.proposals.map((x) => ({ value: String(x.id), label: x.nickname }))]}
                    value={selProposals.map(String)} onChange={(v) => setSelProposals(v.map((x) => (x === 'NEW' ? ('NEW' as const) : Number(x))))}
                  />
                )}
                <Input wrapperClassName="col-span-12 sm:col-span-6" label="System nickname" placeholder={defaultName(type)} value={nickname} onChange={(e) => setNickname(e.target.value)} />
                <Select wrapperClassName="col-span-12 sm:col-span-4" label="Pricing structure" options={PRICING_STRUCTURES} value={pricing} onChange={(e) => setPricing(e.target.value)} />
                <Input wrapperClassName="col-span-6 sm:col-span-4" label="Pricing effective date" type="date" value={(input.PricingEffectiveDate ?? '').slice(0, 10)} onChange={(e) => set(['PricingEffectiveDate'], e.target.value)} />
                <NumberInput wrapperClassName="col-span-6 sm:col-span-4" label="Target margin" suffix="%" step="0.5" min={0} max={90} value={Math.round(margin * 1000) / 10} onChange={(e) => setMargin((Number(e.target.value) || 0) / 100)} />
                <Input wrapperClassName="col-span-6 sm:col-span-4" label="Approx install date" type="date" value={(input.rebateEffectiveDate ?? '').slice(0, 10)} onChange={(e) => set(['rebateEffectiveDate'], e.target.value)} />
                {type === 'hvac' && house?.state === 'CO' && (
                  <Select
                    wrapperClassName="col-span-12 sm:col-span-4" label="Heating load coverage" required placeholder="Select an option" options={HEATING_LOAD_COVERAGE}
                    value={(input as unknown as { heatLoadCoverage?: string | null }).heatLoadCoverage ?? ''} onChange={(e) => set(['heatLoadCoverage'], e.target.value || null)}
                  />
                )}
                {type === 'hvac' && house?.state === 'MA' && (
                  <Select
                    wrapperClassName="col-span-12 sm:col-span-4" label="Rebate type" placeholder="Select an option" options={MA_REBATE_TYPES}
                    value={input.rebateEligibilityType && input.rebateEligibilityType !== 'none' ? input.rebateEligibilityType : ''} onChange={(e) => set(['rebateEligibilityType'], e.target.value || 'none')}
                  />
                )}
                {(type === 'hvac' || type === 'water heater' || type === 'panel') && (
                  <Select
                    wrapperClassName="col-span-12 sm:col-span-4" label="Surge protection" placeholder="None"
                    options={['Whole Home', 'Single Circuit']} value={input.surgeProtection ?? ''} onChange={(e) => set(['surgeProtection'], e.target.value || null)}
                  />
                )}
              </FormGrid>
            </CardBody>
          </Card>

          {type === 'hvac' && (
            <>
              <Section title="Condenser" subtitle="The outdoor unit.">
                <Select wrapperClassName="col-span-12 sm:col-span-8" label="Model" required options={CATALOG.condenser} {...pick(['heatPump', 'condenser', 'model'])} />
                <Input wrapperClassName="col-span-12 sm:col-span-4" label="Location" placeholder="e.g. North side yard" {...txt(['heatPump', 'condenser', 'location'])} />
                <NumberInput wrapperClassName="col-span-6 sm:col-span-4" label="Circuit length" suffix="ft" min={0} {...num(['heatPump', 'condenser', 'electrical', 'circuitLength'])} />
                <Checkbox className="col-span-6 sm:col-span-4 sm:mt-6" label="Difficult circuit" {...chk(['heatPump', 'condenser', 'electrical', 'difficult'])} />
                <Checkbox className="col-span-12 sm:col-span-4 sm:mt-6" label="GFI outlet" {...chk(['heatPump', 'condenser', 'serviceOutlet', 'enabled'])} />
              </Section>

              <Section title="Indoor units" subtitle="Ducted air handlers and ductless heads.">
                <NumberInput wrapperClassName="col-span-6 sm:col-span-3" label="Air handlers" min={0} max={6} value={input.heatPump.ahu.count} onChange={(e) => setAhuCount(Math.max(0, Math.min(6, Number(e.target.value) || 0)))} />
                <NumberInput wrapperClassName="col-span-6 sm:col-span-3" label="Mini-splits" min={0} max={8} value={input.heatPump.miniSplit.count} onChange={(e) => setMsCount(Math.max(0, Math.min(8, Number(e.target.value) || 0)))} />
              </Section>

              {units >= 2 && (
                <Section title="Branch boxes" subtitle="Multi-unit systems connect through branch boxes or joints.">
                  <div className="col-span-12 flex flex-wrap items-center gap-x-6 gap-y-2">
                    <Checkbox label="Advanced branch boxes" hint="Calculate the boxes for these units instead of the default" checked={bbMode !== 'off'} onChange={(e) => setBbMode(e.target.checked ? 'auto' : 'off')} />
                    {bbMode !== 'off' && <Checkbox label="Choose the boxes myself" checked={bbMode === 'manual'} onChange={(e) => setBbMode(e.target.checked ? 'manual' : 'auto')} />}
                  </div>
                  {bb && bb.needsSeriesSelection && bbMode === 'auto' && (
                    <p className="col-span-12 text-[13.5px] text-warn">Pick the condenser and indoor unit models so their series can be read.</p>
                  )}
                  {bb && bbMode === 'manual' && manualBranchBoxOptions().filter((o) => !bb.refrigerant || o.refrigerant === bb.refrigerant).map((o) => (
                    <NumberInput key={o.id} wrapperClassName="col-span-6 sm:col-span-4" label={String(o.model_number)} min={0} max={4} value={bbManual[String(o.model_number)] ?? 0}
                      onChange={(e) => setBbManual((cur) => ({ ...cur, [String(o.model_number)]: Math.max(0, Number(e.target.value) || 0) }))} />
                  ))}
                  {bb && (
                    <div className="col-span-12 rounded-lg border border-line bg-canvas/50 px-4 py-3 text-[13.5px]">
                      <p className="font-semibold">{bb.totalUnits} indoor units, {bb.indoorSeries ?? '?'}-series indoor with {bb.outdoorSeries ?? '?'}-series outdoor{bb.refrigerant ? `, ${bb.refrigerant}` : ''}</p>
                      {bb.branchBoxes.length === 0 ? <p className="mt-1 text-ink-3">No branch boxes needed.</p> : <ul className="mt-1 list-disc pl-5 text-ink-2">{bb.branchBoxes.map((x) => <li key={String(x.id)}>{x.name}</li>)}</ul>}
                    </div>
                  )}
                </Section>
              )}

              {input.heatPump.ahu.units.map((u, i) => {
                const base: Path = ['heatPump', 'ahu', 'units', i]
                return (
                  <Section key={`ahu${i}`} title={`Air handler ${i + 1}`}>
                    <Select wrapperClassName="col-span-12 sm:col-span-8" label="Model" required options={CATALOG.ahu} {...pick([...base, 'model', 'id'])} />
                    <Input wrapperClassName="col-span-12 sm:col-span-4" label="Location" {...txt([...base, 'location'])} />
                    {boxPicker('ahu', i, 'col-span-12')}
                    <NumberInput wrapperClassName="col-span-6 sm:col-span-4" label="Circuit length" suffix="ft" min={0} {...num([...base, 'electrical', 'circuit_length'])} />
                    <Select
                      wrapperClassName="col-span-6 sm:col-span-8" label="Thermostat" options={CATALOG.thermostat} value={u.thermostat.id ?? ''}
                      onChange={(e) => {
                        const id = e.target.value === '' ? null : Number(e.target.value)
                        const eq = refData.equipment.find((x) => x.id === id)
                        set([...base, 'thermostat'], { ...u.thermostat, id, model_number: eq?.model_number ?? null })
                      }}
                    />
                    <Checkbox className="col-span-12 sm:col-span-4" label="New condensate pump" checked={!!u.complications.condensatePump.installed}
                      onChange={(e) => set([...base, 'complications', 'condensatePump'], { installed: e.target.checked, circuit: e.target.checked })} />
                    <Checkbox className="col-span-12 sm:col-span-4" label="Heat kit" checked={u.heatKit.enabled}
                      onChange={(e) => set([...base, 'heatKit'], { ...u.heatKit, enabled: e.target.checked, id: e.target.checked ? u.heatKit.id : null })} />
                    <Checkbox className="col-span-12 sm:col-span-4" label="Humidifier" checked={!!u.humidifier.enabled}
                      onChange={(e) => set([...base, 'humidifier'], { ...u.humidifier, enabled: e.target.checked, id: e.target.checked ? u.humidifier.id : null })} />
                    {u.heatKit.enabled && <Select wrapperClassName="col-span-12 sm:col-span-6" label="Heat kit model" options={CATALOG.heatKit} {...pick([...base, 'heatKit', 'id'])} />}
                    {u.humidifier.enabled && <Select wrapperClassName="col-span-12 sm:col-span-6" label="Humidifier model" options={CATALOG.humidifier} {...pick([...base, 'humidifier', 'id'])} />}
                  </Section>
                )
              })}

              {input.heatPump.miniSplit.units.length > 0 && (
                <Section title="Mini-split heads">
                  {input.heatPump.miniSplit.units.map((_, i) => (
                    <div key={i} className="col-span-12 grid grid-cols-12 gap-4">
                      <Select wrapperClassName="col-span-12 sm:col-span-8" label={`Head ${i + 1} model`} required options={CATALOG.heads} {...pick(['heatPump', 'miniSplit', 'units', i, 'model', 'id'])} />
                      <Input wrapperClassName="col-span-12 sm:col-span-4" label="Location" {...txt(['heatPump', 'miniSplit', 'units', i, 'location'])} />
                      {boxPicker('ms', i, 'col-span-12 sm:col-span-8')}
                    </div>
                  ))}
                </Section>
              )}
            </>
          )}

          {type === 'water heater' && (
            <Section title="Heat pump water heater">
              <Select wrapperClassName="col-span-12 sm:col-span-8" label="Model" required options={CATALOG.hpwh} {...pick(['HPWH', 'equipment', 'model'])} />
              <Input wrapperClassName="col-span-12 sm:col-span-4" label="Location" {...txt(['HPWH', 'equipment', 'location'])} />
              <NumberInput wrapperClassName="col-span-6 sm:col-span-4" label="Circuit length" suffix="ft" min={0} {...num(['HPWH', 'electrical', 'circuitLength'])} />
              <Checkbox className="col-span-6 sm:col-span-4 sm:mt-6" label="Difficult circuit" {...chk(['HPWH', 'electrical', 'difficult'])} />
              <Checkbox className="col-span-12 sm:col-span-4 sm:mt-6" label="GFI outlet" {...chk(['HPWH', 'components', 'serviceOutlet'])} />
              <Checkbox className="col-span-6 sm:col-span-4" label="Thermostatic mixing valve" {...chk(['HPWH', 'components', 'tmv'])} />
              <Checkbox className="col-span-6 sm:col-span-4" label="Venting adder" {...chk(['HPWH', 'components', 'venting'])} />
              <Checkbox className="col-span-6 sm:col-span-4" label="Location adder" {...chk(['HPWH', 'components', 'locationAdder'])} />
              <Checkbox className="col-span-6 sm:col-span-4" label="Condensate pump" {...chk(['HPWH', 'components', 'condensatePump', 'installed'])} />
            </Section>
          )}

          {type === 'ev' && (
            <Section title="EV charger">
              <Select wrapperClassName="col-span-12 sm:col-span-8" label="Charger (optional)" options={CATALOG.ev} placeholder="Circuit only, customer supplies charger" {...pick(['evCharging', 'charger', 'model'])} />
              <Input wrapperClassName="col-span-12 sm:col-span-4" label="Location" {...txt(['evCharging', 'charger', 'location'])} />
              <NumberInput wrapperClassName="col-span-6 sm:col-span-4" label="Circuit length" suffix="ft" min={0} {...num(['evCharging', 'electrical', 'circuitLength'])} />
              <Select wrapperClassName="col-span-6 sm:col-span-4" label="Connection" required options={['Plug', 'Hardwired']} value={input.evCharging.electrical.plugOrHardwired.value ?? ''} onChange={(e) => set(['evCharging', 'electrical', 'plugOrHardwired'], { value: e.target.value || null })} />
              <Checkbox className="col-span-12 sm:col-span-4 sm:mt-6" label="Difficult circuit" {...chk(['evCharging', 'electrical', 'difficult'])} />
            </Section>
          )}

          {type === 'cooktop' && (
            <Section title="Induction wiring">
              <Select wrapperClassName="col-span-12 sm:col-span-6" label="Circuit amperage" required options={CATALOG.circuitLabor} {...pick(['inductionWiring', 'labor', 'id'])} />
              <NumberInput wrapperClassName="col-span-6 sm:col-span-3" label="Circuit length" suffix="ft" min={0} {...num(['inductionWiring', 'electrical', 'circuitLength'])} />
              <Checkbox className="col-span-6 sm:col-span-3 sm:mt-6" label="Difficult circuit" {...chk(['inductionWiring', 'electrical', 'difficult'])} />
            </Section>
          )}

          {type === 'panel' && (
            <Section title="Electrical upgrades">
              <MultiSelect className="col-span-12 sm:col-span-7" label="Labor" options={CATALOG.electricalLabor.map((o) => ({ value: String(o.value), label: o.label }))}
                value={input.electricalUpgrades.labor.items.map(String)} onChange={(v) => set(['electricalUpgrades', 'labor', 'items'], v.map(Number))} />
              <MultiSelect className="col-span-12 sm:col-span-5" label="Equipment" options={CATALOG.electricalEquip.map((o) => ({ value: String(o.value), label: o.label }))}
                value={input.electricalUpgrades.equipment.items.map(String)} onChange={(v) => set(['electricalUpgrades', 'equipment', 'items'], v.map(Number))} />
            </Section>
          )}

          {type === 'energy efficiency' && (
            <Section title="Energy efficiency measures">
              <Checkbox className="col-span-12 sm:col-span-6" label="Energy audit" {...chk(['energyEfficiency', 'audit', 'enabled'])} />
              <Checkbox className="col-span-12 sm:col-span-6" label="Blower door test" {...chk(['energyEfficiency', 'blowerTest', 'enabled'])} />
              <Checkbox className="col-span-12 sm:col-span-6" label="Blower door directed air sealing" {...chk(['energyEfficiency', 'airSealing', 'enabled'])} />
              <Checkbox className="col-span-12 sm:col-span-6" label="Attic insulation" {...chk(['energyEfficiency', 'atticInsulation', 'enabled'])} />
              {input.energyEfficiency.atticInsulation.enabled && <NumberInput wrapperClassName="col-span-6 sm:col-span-4" label="Attic sq ft" min={0} {...num(['energyEfficiency', 'atticInsulation', 'squareFeet'])} />}
              <Checkbox className="col-span-12 sm:col-span-6" label="Attic and floor air sealing" {...chk(['energyEfficiency', 'atticAirSealing', 'enabled'])} />
              {input.energyEfficiency.atticAirSealing.enabled && <NumberInput wrapperClassName="col-span-6 sm:col-span-4" label="Air sealing sq ft" min={0} {...num(['energyEfficiency', 'atticAirSealing', 'squareFeet'])} />}
              <Checkbox className="col-span-12 sm:col-span-6" label="Crawlspace insulation" {...chk(['energyEfficiency', 'crawlspace', 'enabled'])} />
              {input.energyEfficiency.crawlspace.enabled && <NumberInput wrapperClassName="col-span-6 sm:col-span-4" label="Crawlspace sq ft" min={0} {...num(['energyEfficiency', 'crawlspace', 'squareFeet'])} />}
              <Checkbox className="col-span-12 sm:col-span-6" label="Aeroseal" {...chk(['energyEfficiency', 'aeroseal', 'enabled'])} />
              {input.energyEfficiency.aeroseal.enabled && <NumberInput wrapperClassName="col-span-6 sm:col-span-4" label="Air handlers" min={0} {...num(['energyEfficiency', 'aeroseal', 'ahuCount'])} />}
              <Checkbox className="col-span-12 sm:col-span-6" label="Vapor guard" {...chk(['energyEfficiency', 'vaporGuard', 'enabled'])} />
              {input.energyEfficiency.vaporGuard.enabled && <NumberInput wrapperClassName="col-span-6 sm:col-span-4" label="Vapor guard sq ft" min={0} {...num(['energyEfficiency', 'vaporGuard', 'squareFeet'])} />}
            </Section>
          )}

          {type === 'labor warranty' && (
            <Section title="Labor warranty">
              <Select wrapperClassName="col-span-6 sm:col-span-4" label="Heat pump term" options={[{ value: 5, label: '5 years' }, { value: 10, label: '10 years' }]} {...pick(['laborWarranty', 'warranty', 'hp_term'])} />
              <Input wrapperClassName="col-span-6 sm:col-span-4" label="Manufacturer" {...txt(['laborWarranty', 'manufacturer'])} />
            </Section>
          )}

          {type === 'adder' && (
            <Section title="Other adder" subtitle="A single labor line from the catalog.">
              <Select
                wrapperClassName="col-span-12" label="Labor item" required options={CATALOG.adderLabor} value={input.otherData.item.laborId ?? ''}
                onChange={(e) => {
                  const id = e.target.value === '' ? null : Number(e.target.value)
                  const l = refData.labor.find((x) => x.id === id)
                  set(['otherData', 'item'], { name: l?.name ?? '', type: 'labor', laborId: id, equipmentId: null })
                }}
              />
            </Section>
          )}
        </div>
      ) : (
        <LinesStep
          drafts={drafts} active={active} onActive={setActive} editing={!!editing} errorCount={errorCount}
          onReviewErrors={() => setErrorsOpen(true)} onAdd={() => setManualOpen(true)} onRemove={removeManual}
        />
      )}

      <ManualLineDialog
        open={manualOpen} onClose={() => setManualOpen(false)} pricing={pricing} date={input.PricingEffectiveDate}
        onAdd={(line) => { addManual(drafts.find((d) => String(d.key) === active)?.key ?? drafts[0].key, line); setManualOpen(false) }}
      />
      <Modal open={errorsOpen} onOpenChange={setErrorsOpen} size="md" title="Review errors" description="Notes and errors from the calculation, per proposal." footer={<Button onClick={() => setErrorsOpen(false)}>Close</Button>}>
        <div className="space-y-4">
          {drafts.filter((d) => d.notes.length > 0).map((d) => (
            <section key={String(d.key)}>
              <h4 className="text-[13px] font-bold uppercase tracking-wider text-ink-3">{d.label}</h4>
              <ul className="mt-1.5 space-y-1.5 text-[14px]">{d.notes.map((n, i) => <li key={i} className="flex items-start gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />{n}</li>)}</ul>
            </section>
          ))}
          {errorCount === 0 && <p className="text-[14px] text-ink-3">Nothing to review.</p>}
        </div>
      </Modal>
    </Drawer>
  )
}

function defaultName(type: SystemType) {
  return `New ${SYSTEM_TYPES.find((t) => t.value === type)?.label.toLowerCase() ?? 'system'}`
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <CardBody><FormGrid>{children}</FormGrid></CardBody>
    </Card>
  )
}

interface Draft {
  key: number | 'NEW'
  label: string
  out: SpecOutcome
  lines: NewLine[]
  notes: string[]
}

function StepBar({ step, typeLabel }: { step: 'setup' | 'lines'; typeLabel: string }) {
  const steps = [{ id: 'setup', label: 'System selection', sub: typeLabel }, { id: 'lines', label: 'Line items', sub: 'Review and finish' }]
  return (
    <ol className="mb-5 flex gap-3" aria-label="Steps">
      {steps.map((x, i) => {
        const on = x.id === step
        return (
          <li key={x.id} className={clsx('flex flex-1 items-center gap-3 rounded-lg border px-4 py-2.5', on ? 'border-brand-600 bg-brand-50' : 'border-line bg-surface')} aria-current={on ? 'step' : undefined}>
            <span className={clsx('flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold', on ? 'bg-brand-600 text-white' : 'bg-sunken text-ink-3')}>{i + 1}</span>
            <span className="leading-tight"><span className={clsx('block text-[14px] font-bold', !on && 'text-ink-3')}>{x.label}</span><span className="block text-[12px] text-ink-3">{x.sub}</span></span>
          </li>
        )
      })}
    </ol>
  )
}

const asRec = (l: NewLine, i: number): LineItemRec => ({ ...l, id: i + 1, system_id: 0 })

function LinesStep({
  drafts, active, onActive, editing, errorCount, onReviewErrors, onAdd, onRemove,
}: {
  drafts: Draft[]; active: string; onActive: (k: string) => void; editing: boolean; errorCount: number
  onReviewErrors: () => void; onAdd: () => void; onRemove: (key: number | 'NEW', index: number) => void
}) {
  const d = drafts.find((x) => String(x.key) === active) ?? drafts[0]
  if (!d) return null
  const t = totalsOf(d.lines.map(asRec))
  return (
    <div className="space-y-4">
      {editing && <Banner tone="warn" title="Selected system line items will be replaced by the line items below." />}

      {drafts.length > 1 && (
        <div role="tablist" aria-label="Proposals" className="flex flex-wrap gap-1.5">
          {drafts.map((x) => (
            <button key={String(x.key)} type="button" role="tab" aria-selected={String(x.key) === String(d.key)} onClick={() => onActive(String(x.key))}
              className={clsx('cursor-pointer rounded-full px-4 py-1.5 text-[13.5px] font-semibold transition-colors', String(x.key) === String(d.key) ? 'bg-brand-600 text-white' : 'bg-sunken text-ink-2 hover:bg-brand-50 hover:text-brand-700')}>
              {x.label} <span className={clsx('num ml-1 text-xs', String(x.key) === String(d.key) ? 'text-brand-200' : 'text-ink-3')}>{x.lines.length}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {errorCount > 0 && <Button size="sm" icon={<TriangleAlert className="size-4 text-warn" />} onClick={onReviewErrors}>Review errors ({errorCount})</Button>}
        <Button size="sm" className="ml-auto" icon={<Plus className="size-4" />} disabled={!d.out.ok} onClick={onAdd}>Add line item</Button>
      </div>

      {!d.out.ok ? (
        <Banner tone="bad" title={`Could not price this system for ${d.label}`}>
          <ul className="mt-1 list-disc pl-4 text-[13.5px]">{d.out.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </Banner>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[14px]">
              <thead className="bg-canvas/70">
                <tr>{['Type', 'Description', 'Location', 'Price', 'Margin amount', ''].map((h, i) => <th key={i} className={clsx('border-b border-line px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-3', (h === 'Price' || h === 'Margin amount') && 'text-right')}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {d.lines.map((l, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-3 py-2"><Badge tone={l.line_item_type === 'incentive' ? 'ok' : l.line_item_type === 'margin' ? 'warn' : l.line_item_type === 'equipment' ? 'brand' : 'neutral'}>{l.line_item_type}</Badge></td>
                    <td className="px-3 py-2">{l.description}{l.is_manual && <Badge className="ml-2" tone="info">manual</Badge>}</td>
                    <td className="px-3 py-2 text-ink-2">{l.location}</td>
                    <td className={clsx('num px-3 py-2 text-right font-semibold', l.price_actual < 0 && 'text-ok')}>{money(l.price_actual * l.quantity, { cents: true })}</td>
                    <td className="num px-3 py-2 text-right text-ink-2">{l.margin_amount ? money(l.margin_amount, { cents: true }) : <span className="text-ink-3">—</span>}</td>
                    <td className="px-2 py-1 text-right">{l.is_manual && <IconButton label="Remove this line" onClick={() => onRemove(d.key, i)}><Trash2 className="size-4" /></IconButton>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line bg-canvas/60">
                  <td colSpan={3} className="px-3 py-3 text-right text-[13px] font-semibold uppercase tracking-wide text-ink-3">
                    Total{t.margin != null && <span className="ml-3 normal-case tracking-normal">margin {pct(t.margin, 1)}</span>}
                  </td>
                  <td className="num px-3 py-3 text-right text-[16px] font-extrabold">{money(t.total, { cents: true })}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

/** Retool's "Add Line Item" modal: pick equipment or labor from the catalog (priced by the engine), or add a discount. */
function ManualLineDialog({ open, onClose, onAdd, pricing, date }: { open: boolean; onClose: () => void; onAdd: (l: NewLine) => void; pricing: string; date?: string }) {
  const [kind, setKind] = useState<'equipment' | 'labor' | 'discount'>('equipment')
  const [itemId, setItemId] = useState<number | null>(null)
  const [qty, setQty] = useState(1)
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState(0)

  const options = useMemo(
    () => (kind === 'equipment'
      ? refData.equipment.filter((e) => e.active !== false).map((e) => ({ value: e.id, label: `${e.model_number ?? e.id} · ${e.equipment_name}` }))
      : refData.labor.map((l) => ({ value: l.id, label: l.name }))).sort((a, b) => a.label.localeCompare(b.label)),
    [kind],
  )
  const priced = useMemo(() => (kind !== 'discount' && itemId ? priceCatalogLine(kind, itemId, pricing, date) : null), [kind, itemId, pricing, date])
  const valid = kind === 'discount' ? desc.trim() && amount > 0 : priced?.ok === true

  const submit = () => {
    if (kind === 'discount') onAdd({ line_item_type: 'discount', description: desc.trim(), quantity: 1, price_actual: -Math.abs(amount), cost: null })
    else if (priced?.ok) onAdd({ line_item_type: kind, description: priced.description, quantity: qty, price_actual: priced.price, cost: null, equipment_id: kind === 'equipment' ? itemId : null, labor_id: kind === 'labor' ? itemId : null })
    setItemId(null); setQty(1); setDesc(''); setAmount(0)
  }

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} size="md" title="Add line item" description="Margin and incentives are recalculated after you add it."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} onClick={submit}>Add line item</Button></>}>
      <div className="grid grid-cols-12 gap-4">
        <Select wrapperClassName="col-span-12 sm:col-span-4" label="Type" options={[{ value: 'equipment', label: 'Equipment' }, { value: 'labor', label: 'Labor' }, { value: 'discount', label: 'Discount' }]} value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setItemId(null) }} />
        {kind === 'discount' ? (
          <>
            <Input wrapperClassName="col-span-12 sm:col-span-5" label="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <NumberInput wrapperClassName="col-span-12 sm:col-span-3" label="Amount" prefix="$" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
          </>
        ) : (
          <>
            <Select wrapperClassName="col-span-12 sm:col-span-8" label={kind === 'equipment' ? 'Equipment' : 'Labor item'} options={options} value={itemId ?? ''} onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : null)} />
            <NumberInput wrapperClassName="col-span-6 sm:col-span-4" label="Quantity" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
            <div className="col-span-12 sm:col-span-8 sm:pt-6">
              {priced?.ok && <p className="text-[14px]">Price each: <strong className="num">{money(priced.price, { cents: true })}</strong></p>}
              {priced && !priced.ok && <p className="text-[13.5px] text-bad">{priced.error}</p>}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

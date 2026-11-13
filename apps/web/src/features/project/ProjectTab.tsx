import clsx from 'clsx'
import { ClipboardList, Flame, Home, Landmark, Save, Thermometer, Undo2, UserRound, Activity } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import {
  Controller, FormProvider, useFieldArray, useForm, useFormContext, useWatch,
} from 'react-hook-form'
import { Banner, Button, Card, CardBody, CardHeader, FormGrid, StatusPill } from '@/components/ui/core'
import { Checkbox, Input, MultiSelect, NumberInput, Segmented, Select, Switch, Textarea } from '@/components/ui/form'
import { toast } from '@/components/ui/overlay'
import { invoiceStatuses, rollupProposalStatus } from '@/lib/calc'
import { useSaveProjectInfo } from '@/lib/hooks'
import * as O from '@/lib/options'
import type { ExistingSystems, House, Project, ProjectBundle } from '@/lib/types'

interface Values { project: Project; house: House; existing: ExistingSystems }

const numOrNull = { setValueAs: (v: unknown) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v)) }

const emptyHouse = (projectId: number): House => ({
  project_id: projectId, address: '', city: '', county: '', state: '', zipcode: '', home_type: '', units: 1, num_ppl: 0,
  sq_footage: null, year_built: '', move_in_year: '', utility_customer_name: '', gas_utility: '', electric_utility: '',
  paperless_billing: false, special_considerations: [], home_features: [], notes: '', manual_j_complete: false,
  ma: { primary_residence: false, energy_audit: '', recommendations_complete: '', certificate_of_completion: '', heat_loan_status: '', whole_home_verification: '' },
  co: { efficiency: '', xcel_whole_home: false }, nwco: { hear_amount: '', energy_smart: false },
})

/** One react-hook-form instance shared by the Project Overview and Home Info tabs, plus the save bar. */
export function ProjectForm({ bundle, children }: { bundle: ProjectBundle; children: ReactNode }) {
  const save = useSaveProjectInfo(bundle.project.id)

  const defaults: Values = {
    project: bundle.project,
    house: bundle.house ?? emptyHouse(bundle.project.id),
    existing: bundle.existing,
  }
  const form = useForm<Values>({ defaultValues: defaults })
  const { handleSubmit, reset, formState: { isDirty, isSubmitting, errors } } = form

  // Re-sync when the server record changes (after save, or switching projects)
  useEffect(() => { reset(defaults) }, [bundle.project.updated_at, bundle.project.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = handleSubmit(async (v) => {
    await save.mutateAsync({ project: v.project, house: v.house, existing: v.existing })
    toast.success('Project saved', `${v.project.first_name} ${v.project.last_name}`)
  }, () => toast.error('Fix the highlighted fields', 'Some values need attention before saving.'))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (isDirty) void onSubmit() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="pb-24">
        {children}

        {/* Unsaved changes bar */}
        <div
          className={clsx('fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur transition-transform', isDirty ? 'translate-y-0' : 'invisible translate-y-full')}
          aria-hidden={!isDirty}
        >
          <div className="mx-auto flex max-w-[1560px] items-center justify-between gap-4 px-6 py-3">
            <p className="text-[14px] font-medium">
              {Object.keys(errors).length ? 'Some fields need attention.' : 'You have unsaved changes.'}
              <span className="ml-2 hidden text-ink-3 sm:inline">Press Ctrl+S to save.</span>
            </p>
            <div className="flex gap-2">
              <Button icon={<Undo2 className="size-4" />} onClick={() => reset(defaults)} disabled={!isDirty}>Discard</Button>
              <Button variant="primary" type="submit" icon={<Save className="size-4" />} loading={isSubmitting} disabled={!isDirty}>Save changes</Button>
            </div>
          </div>
        </div>
      </form>
    </FormProvider>
  )
}

export function CustomerSection() {
  const { register, control, formState: { errors } } = useFormContext<Values>()
  const source = useWatch({ control, name: 'project.source' })
  const balance = useWatch({ control, name: 'project.referral_balance' })
  return (
    <Card id="sec-customer" className="scroll-mt-32">
      <CardHeader
        icon={<UserRound />}
        title="Customer Information"
        actions={<span className="text-[15px] font-bold text-brand-600">Referral Balance: ${balance ?? 0}</span>}
      />
      <CardBody>
        <FormGrid>
          <Input wrapperClassName="col-span-12 sm:col-span-6 lg:col-span-3" label="First name" required error={errors.project?.first_name?.message} {...register('project.first_name', { required: 'Required' })} />
          <Input wrapperClassName="col-span-12 sm:col-span-6 lg:col-span-3" label="Last name" required error={errors.project?.last_name?.message} {...register('project.last_name', { required: 'Required' })} />
          <Select wrapperClassName="col-span-12 sm:col-span-6 lg:col-span-3" label="Source" placeholder="Source" options={O.SOURCES} {...register('project.source')} />
          {O.REFERRAL_SOURCES.includes(source) ? (
            <Input wrapperClassName="col-span-12 sm:col-span-6 lg:col-span-3" label="Referred by" {...register('project.referrer')} />
          ) : (
            <Select wrapperClassName="col-span-12 sm:col-span-6 lg:col-span-3" label="Source detail" placeholder="Source detail" options={O.SOURCE_DETAILS} {...register('project.source_detail')} />
          )}
          <Input wrapperClassName="col-span-12 sm:col-span-6 lg:col-span-3" label="Email" type="email" placeholder="you@example.com" error={errors.project?.email?.message} {...register('project.email', { pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' } })} />
          <Input wrapperClassName="col-span-12 sm:col-span-6 lg:col-span-3" label="Phone" type="tel" placeholder="+1 555 555 5555" {...register('project.phone')} />
          <Controller
            control={control}
            name="project.systems_interest"
            render={({ field }) => (
              <MultiSelect className="col-span-12 sm:col-span-6 lg:col-span-3" label="Prospective systems" placeholder="Prospective systems" options={O.SYSTEMS_INTEREST} value={field.value} onChange={field.onChange} />
            )}
          />
          <Select wrapperClassName="col-span-12 sm:col-span-6 lg:col-span-3" label="Interest in maintenance" options={O.MAINTENANCE_INTEREST} {...register('project.maintenance_interest', { setValueAs: (v) => v || 'Unknown' })} />
          <div className="col-span-12 lg:col-span-3">
            <Button type="button" variant="primary" disabled title="Opens the customer's Google Drive folder. The folder link comes from Salesforce, which is not connected yet.">Open Project Folder</Button>
          </div>
        </FormGrid>
      </CardBody>
    </Card>
  )
}

export function HomeSection() {
  const { register, control, setValue, formState: { errors } } = useFormContext<Values>()
  const state = useWatch({ control, name: 'house.state' })
  const counties = O.COUNTIES_BY_STATE[state] ?? []
  return (
    <Card id="sec-home" className="scroll-mt-32">
      <CardHeader icon={<Home />} title="Home" subtitle="Address, utilities and building details used for pricing and rebates." />
      <CardBody>
        <FormGrid>
          <Input wrapperClassName="col-span-12 lg:col-span-5" label="Street address" required error={errors.house?.address?.message} {...register('house.address', { required: 'Required' })} />
          <Input wrapperClassName="col-span-6 lg:col-span-3" label="City" {...register('house.city')} />
          <Select
            wrapperClassName="col-span-6 lg:col-span-2" label="State" options={O.US_STATES}
            {...register('house.state', { onChange: () => setValue('house.county', '', { shouldDirty: true }) })}
          />
          <Input wrapperClassName="col-span-6 lg:col-span-2" label="Zip" inputMode="numeric" error={errors.house?.zipcode?.message} {...register('house.zipcode', { pattern: { value: /^\d{5}$/, message: '5 digits' } })} />
          <Select wrapperClassName="col-span-6 lg:col-span-4" label="County" options={counties} disabled={!state} placeholder={state ? 'Select…' : 'Pick a state first'} {...register('house.county')} />
          <Select wrapperClassName="col-span-6 lg:col-span-4" label="Home type" options={O.HOME_TYPES} {...register('house.home_type')} />
          <NumberInput wrapperClassName="col-span-3 lg:col-span-2" label="Units" min={1} {...register('house.units', numOrNull)} />
          <NumberInput wrapperClassName="col-span-3 lg:col-span-2" label="People" min={0} {...register('house.num_ppl', numOrNull)} />

          <NumberInput wrapperClassName="col-span-6 lg:col-span-3" label="Square footage" suffix="sq ft" {...register('house.sq_footage', numOrNull)} />
          <Input wrapperClassName="col-span-6 lg:col-span-3" label="Year built" inputMode="numeric" error={errors.house?.year_built?.message} {...register('house.year_built', { pattern: { value: /^(\d{4})?$/, message: '4-digit year' } })} />
          <Select wrapperClassName="col-span-6 lg:col-span-3" label="Move-in year" options={O.MOVE_IN_YEARS} {...register('house.move_in_year')} />
          <Input wrapperClassName="col-span-6 lg:col-span-3" label="Utility account name" {...register('house.utility_customer_name')} />

          <Select wrapperClassName="col-span-6 lg:col-span-3" label="Gas utility" options={O.GAS_UTILITIES} {...register('house.gas_utility')} />
          <Select wrapperClassName="col-span-6 lg:col-span-3" label="Electric utility" options={O.ELECTRIC_UTILITIES} {...register('house.electric_utility')} />
          <Controller control={control} name="house.special_considerations" render={({ field }) => (
            <MultiSelect className="col-span-12 sm:col-span-6 lg:col-span-3" label="Special considerations" options={O.SPECIAL_CONSIDERATIONS} value={field.value} onChange={field.onChange} />
          )} />
          <Controller control={control} name="house.home_features" render={({ field }) => (
            <MultiSelect className="col-span-12 sm:col-span-6 lg:col-span-3" label="Home features" options={O.HOME_FEATURES} value={field.value} onChange={field.onChange} />
          )} />

          <Checkbox className="col-span-12" label="Paperless billing" {...register('house.paperless_billing')} />
          <Textarea wrapperClassName="col-span-12" label="Home notes" rows={3} {...register('house.notes')} />
        </FormGrid>
      </CardBody>
    </Card>
  )
}

function ExistingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-12 items-start gap-x-4 gap-y-3 border-b border-line py-4 first:pt-0 last:border-0 last:pb-0">
      <p className="col-span-12 text-[13px] font-bold uppercase tracking-wide text-brand-700 lg:col-span-2 lg:pt-7">{label}</p>
      <div className="col-span-12 grid grid-cols-12 gap-x-4 gap-y-3 lg:col-span-10">{children}</div>
    </div>
  )
}

export function ExistingSection() {
  const { register, control } = useFormContext<Values>()
  const subs = useFieldArray({ control, name: 'existing.subpanels' })
  return (
    <Card id="sec-existing" className="scroll-mt-32">
      <CardHeader icon={<Thermometer />} title="Existing systems" subtitle="What is in the home today. Drives the replacement scope and rebate eligibility." />
      <CardBody>
        <ExistingRow label="Heating">
          <Select wrapperClassName="col-span-12 sm:col-span-8" label="Type" options={O.HEATING_TYPES} {...register('existing.heating.type')} />
          <NumberInput wrapperClassName="col-span-12 sm:col-span-4" label="Age" suffix="years old" min={0} {...register('existing.heating.age')} />
        </ExistingRow>
        <ExistingRow label="Cooling">
          <Select wrapperClassName="col-span-12 sm:col-span-5" label="Type" options={O.COOLING_TYPES} {...register('existing.cooling.type')} />
          <NumberInput wrapperClassName="col-span-6 sm:col-span-3" label="Age" suffix="years old" min={0} {...register('existing.cooling.age')} />
          <NumberInput wrapperClassName="col-span-6 sm:col-span-4" label="Capacity" suffix="BTU/hr" min={0} {...register('existing.cooling.capacity', numOrNull)} />
        </ExistingRow>
        <ExistingRow label="Water heater">
          <Select wrapperClassName="col-span-12 sm:col-span-5" label="Type" options={O.WATER_HEATER_TYPES} {...register('existing.water_heater.type')} />
          <NumberInput wrapperClassName="col-span-6 sm:col-span-3" label="Age" suffix="years old" min={0} {...register('existing.water_heater.age')} />
          <NumberInput wrapperClassName="col-span-6 sm:col-span-4" label="Capacity" suffix="gal" min={0} {...register('existing.water_heater.capacity', numOrNull)} />
        </ExistingRow>
        <ExistingRow label="Panel">
          <Input wrapperClassName="col-span-12 sm:col-span-5" label="Location" placeholder="e.g. Garage" {...register('existing.panel.location')} />
          <NumberInput wrapperClassName="col-span-6 sm:col-span-3" label="Amperage" suffix="amps" min={0} {...register('existing.panel.amp', numOrNull)} />
          <NumberInput wrapperClassName="col-span-6 sm:col-span-4" label="Open breaker spaces" suffix="open brkrs" min={0} {...register('existing.panel.open_spaces', numOrNull)} />
        </ExistingRow>
        <ExistingRow label="Subpanels">
          <NumberInput wrapperClassName="col-span-6 sm:col-span-3" label="Number of subpanels" suffix="ct" min={0} max={10} value={subs.fields.length}
            onChange={(e) => {
              const want = Math.max(0, Math.min(10, Number(e.target.value) || 0))
              if (want > subs.fields.length) subs.append(Array.from({ length: want - subs.fields.length }, () => ({ location: '', amp: null, open_spaces: null })))
              else if (want < subs.fields.length) subs.remove(Array.from({ length: subs.fields.length - want }, (_, i) => want + i))
            }} />
          {subs.fields.map((f, i) => (
            <div key={f.id} className="col-span-12 grid grid-cols-12 items-end gap-x-4 gap-y-3">
              <Input wrapperClassName="col-span-12 sm:col-span-5" label={`Subpanel ${i + 1} location`} {...register(`existing.subpanels.${i}.location`)} />
              <NumberInput wrapperClassName="col-span-6 sm:col-span-3" label="Amperage" suffix="amps" min={0} {...register(`existing.subpanels.${i}.amp`, numOrNull)} />
              <NumberInput wrapperClassName="col-span-6 sm:col-span-4" label="Open breaker spaces" suffix="open brkrs" min={0} {...register(`existing.subpanels.${i}.open_spaces`, numOrNull)} />
            </div>
          ))}
        </ExistingRow>
        <ExistingRow label="Other">
          <Controller control={control} name="existing.other" render={({ field }) => (
            <MultiSelect className="col-span-12" label="Other existing equipment" placeholder="Select options" options={O.EXISTING_OTHER} value={field.value} onChange={field.onChange} />
          )} />
          <Textarea wrapperClassName="col-span-12" label="Notes" rows={2} {...register('existing.notes')} />
        </ExistingRow>
      </CardBody>
    </Card>
  )
}

export function FinancingSection() {
  const { register, control, setValue } = useFormContext<Values>()
  const state = useWatch({ control, name: 'house.state' })
  const county = useWatch({ control, name: 'house.county' })
  const financing = useWatch({ control, name: 'project.financing' })
  const lender = useWatch({ control, name: 'project.lender' })
  const amounts = useWatch({ control, name: 'project.financing_amounts' })
  const routt = county?.startsWith('Routt')

  return (
    <Card id="sec-financing" className="scroll-mt-32">
      <CardHeader icon={<Landmark />} title="Financing and rebates" subtitle="Income, lenders and state rebate programs." />
      <CardBody className="space-y-6">
        <FormGrid>
          <Input wrapperClassName="col-span-12 sm:col-span-4" label="Project budget" placeholder="$" {...register('project.budget')} />
          <Select wrapperClassName="col-span-12 sm:col-span-4" label="Income verification" hint="For rebates" placeholder="Select an option" options={O.INCOME_VERIFICATION} {...register('project.income_verification')} />
          <NumberInput wrapperClassName="col-span-12 sm:col-span-4" label="Annual gross income" prefix="$" {...register('project.income', numOrNull)} />
          <Controller control={control} name="project.financing" render={({ field }) => (
            <Segmented
              className="col-span-12 sm:col-span-4" label="Financing"
              value={(field.value || '') as 'yes' | 'no'}
              onChange={(v) => { field.onChange(v); if (v === 'no') { setValue('project.lender', [], { shouldDirty: true }); setValue('project.financing_amounts', [], { shouldDirty: true }) } }}
              options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] as { value: 'yes' | 'no'; label: string }[]}
            />
          )} />
          {financing === 'yes' && (
            <Controller control={control} name="project.lender" render={({ field }) => (
              <MultiSelect
                className="col-span-12 sm:col-span-8" label="Lender(s)" placeholder="Select lender" options={O.LENDERS} value={field.value}
                onChange={(v) => { field.onChange(v); setValue('project.financing_amounts', v.map((_, i) => amounts?.[i] ?? 0), { shouldDirty: true }) }}
              />
            )} />
          )}
          {financing === 'yes' && lender.map((l, i) => (
            <NumberInput key={l} wrapperClassName="col-span-12 sm:col-span-4" label={`Amount: ${l}`} prefix="$" {...register(`project.financing_amounts.${i}` as const, { valueAsNumber: true })} />
          ))}
          <Textarea wrapperClassName="col-span-12" label="Incentive notes" placeholder="Has the customer already used incentives?" rows={2} {...register('project.incentive_notes')} />
        </FormGrid>

        {state === 'MA' && (
          <section className="rounded-md border border-brand-100 bg-brand-50/50 p-4">
            <h4 className="mb-3 text-[14px] font-bold text-brand-700">Massachusetts</h4>
            <FormGrid>
              <Checkbox className="col-span-12" label="Primary residence" {...register('house.ma.primary_residence')} />
              <Select wrapperClassName="col-span-12 sm:col-span-6" label="Have they completed a MA Save Energy Audit?" options={O.MA_AUDIT} {...register('house.ma.energy_audit')} />
              <Select wrapperClassName="col-span-12 sm:col-span-6" label="Have they completed the recommendations?" options={O.MA_RECS} {...register('house.ma.recommendations_complete')} />
              <Select wrapperClassName="col-span-12 sm:col-span-6" label="Do they have the Certificate of Completion?" options={O.MA_COC} {...register('house.ma.certificate_of_completion')} />
              <Select wrapperClassName="col-span-12 sm:col-span-6" label="HEAT Loan Status" options={O.MA_HEAT_LOAN} {...register('house.ma.heat_loan_status')} />
              <Select wrapperClassName="col-span-12 sm:col-span-6" label="Whole Home Verification Status" options={O.MA_WHV} {...register('house.ma.whole_home_verification')} />
            </FormGrid>
          </section>
        )}
        {state === 'CO' && !routt && (
          <section className="rounded-md border border-brand-100 bg-brand-50/50 p-4">
            <h4 className="mb-3 text-[14px] font-bold text-brand-700">Colorado</h4>
            <FormGrid>
              <Select wrapperClassName="col-span-12 sm:col-span-8" label="Have they completed insulation or air sealing in the last 2 years?" options={O.CO_EFFICIENCY} {...register('house.co.efficiency')} />
              <Controller control={control} name="house.co.xcel_whole_home" render={({ field }) => (
                <Switch className="col-span-12 sm:col-span-4 sm:mt-6" label="Xcel Whole Home Efficiency" checked={!!field.value} onChange={field.onChange} />
              )} />
            </FormGrid>
          </section>
        )}
        {state === 'CO' && routt && (
          <section className="rounded-md border border-brand-100 bg-brand-50/50 p-4">
            <h4 className="mb-3 text-[14px] font-bold text-brand-700">Northwest Colorado (Routt County)</h4>
            <FormGrid>
              <Select wrapperClassName="col-span-12 sm:col-span-6" label="HEAR rebate" options={O.HEAR_AMOUNTS} {...register('house.nwco.hear_amount')} />
              <Controller control={control} name="house.nwco.energy_smart" render={({ field }) => (
                <Switch className="col-span-12 sm:col-span-6 sm:mt-6" label="Energy Smart Colorado qualified" checked={!!field.value} onChange={field.onChange} />
              )} />
            </FormGrid>
          </section>
        )}
      </CardBody>
    </Card>
  )
}

export function HandoffSection() {
  const { register } = useFormContext<Values>()
  return (
    <Card id="sec-handoff" className="scroll-mt-32">
      <CardHeader icon={<ClipboardList />} title="Handoff" subtitle="What the install team needs to know. Required to finalize." />
      <CardBody>
        <FormGrid>
          <Textarea wrapperClassName="col-span-12 lg:col-span-8" label="Handoff notes" rows={4} {...register('project.handoff_notes')} />
          <Input wrapperClassName="col-span-12 lg:col-span-4" label="Timeline" placeholder="e.g. Install before Jan 15" {...register('project.timeline')} />
        </FormGrid>
      </CardBody>
    </Card>
  )
}

/* ---------- Right rail ---------- */

export function StatusCard({ bundle }: { bundle: ProjectBundle }) {
  const { register, control } = useFormContext<Values>()
  const blocker = useWatch({ control, name: 'project.blocker' })
  const st = bundle.project.statuses
  const inv = invoiceStatuses(bundle)
  const proposalStatus = rollupProposalStatus(bundle.proposals.map((x) => x.status)) ?? 'not created'
  const rows: [string, string][] = [
    ['Proposal', proposalStatus], ['Equipment', st.equipment], ['First Deposit', inv.deposit1],
    ['Second Deposit', inv.deposit2], ['Final Invoice', inv.deposit_final], ['Retrospective', st.retrospective],
  ]
  return (
    <Card>
      <CardHeader icon={<Activity />} title="Project Status" />
      <CardBody>
        <FormGrid>
          <Select wrapperClassName="col-span-12" label="Status" options={[...O.PROJECT_STATUSES]} {...register('project.project_status')} />
          <Input wrapperClassName="col-span-6" label="Install start" type="date" {...register('project.install_start')} />
          <Input wrapperClassName="col-span-6" label="Install end" type="date" {...register('project.install_end')} />
          <Select wrapperClassName="col-span-6" label="HCA" options={O.HCAS} {...register('project.hca')} />
          <Select wrapperClassName="col-span-6" label="PM" options={O.PMS} {...register('project.pm')} />
          <Input wrapperClassName="col-span-12" label="Project blocker" placeholder="Nothing blocking" hint={blocker ? 'Shown as a red flag on the project list.' : undefined} {...register('project.blocker')} />
        </FormGrid>
      </CardBody>
      <dl className="divide-y divide-line border-t border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-5 py-2.5">
            <dt className="text-[14px] text-ink-2">{k}</dt>
            <dd><StatusPill value={v} /></dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

const HDD: Record<string, { design: number; max: number }> = {
  CO: { design: 6850, max: 8120 }, MA: { design: 5630, max: 6900 }, NY: { design: 6200, max: 7350 },
  WA: { design: 4600, max: 5400 }, IL: { design: 6100, max: 7600 }, MN: { design: 7900, max: 9900 },
  CT: { design: 5500, max: 6600 }, NJ: { design: 4900, max: 5900 },
}
const MANUAL_J = new Set(['Boulder County', 'Denver County', 'Eagle County'])

export function SizingCard() {
  const { control, register } = useFormContext<Values>()
  const state = useWatch({ control, name: 'house.state' })
  const county = useWatch({ control, name: 'house.county' })
  const hdd = HDD[state]
  const needsJ = state === 'CO' && MANUAL_J.has(county)
  return (
    <Card>
      <CardHeader title="Heat pump sizing" actions={<Flame className="size-4 text-warn" />} />
      <CardBody className="space-y-4">
        {hdd ? (
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Design HDD</p><p className="num text-[18px] font-bold">{hdd.design.toLocaleString()}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Max HDD</p><p className="num text-[18px] font-bold">{hdd.max.toLocaleString()}</p></div>
          </div>
        ) : (
          <p className="text-[13px] text-ink-3">Choose a state to see heating degree days for the home.</p>
        )}
        {needsJ && (
          <Banner tone="warn" title="Manual J required">This jurisdiction requires a Manual J load calculation before permit.</Banner>
        )}
        {needsJ && <Checkbox label="Manual J completed" {...register('house.manual_j_complete')} />}
      </CardBody>
    </Card>
  )
}

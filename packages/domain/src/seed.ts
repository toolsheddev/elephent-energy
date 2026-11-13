/* Demo data. SAMPLE ONLY: invented customers, addresses and prices (equipment ids/models/prices
   reuse the examples that appear in the Retool workflow payloads). */
import { makeSystemInput, sampleSystemInputs, type SystemInput } from '@sd/engine'
import { recalcLines, runSpec, toEngineHouse } from './engine'
import { buildInvoices } from './invoicing'
import { recomputePermits } from './permits'
import type {
  ExistingSystems, House, LineItemRec, Project, ProjectBundle, Proposal, SystemRec, SystemType,
} from './types'

let liId = 1000

const blankHouse = (project_id: number): Omit<House, 'address' | 'city' | 'county' | 'state' | 'zipcode'> => ({
  project_id,
  home_type: 'Single family',
  units: 1,
  num_ppl: 3,
  sq_footage: 1800,
  year_built: '1985',
  move_in_year: '2018',
  move_in_month: '06',
  utility_customer_name: '',
  gas_utility: 'Xcel Energy',
  electric_utility: 'Xcel Energy',
  paperless_billing: true,
  special_considerations: [],
  home_features: ['Attic', 'Garage'],
  notes: '',
  manual_j_complete: false,
  ma: { primary_residence: true, energy_audit: '', recommendations_complete: '', certificate_of_completion: '', heat_loan_status: 'Unknown', whole_home_verification: '' },
  co: { efficiency: '', xcel_whole_home: false },
  nwco: { hear_amount: '', energy_smart: false },
})

const blankExisting = (project_id: number): ExistingSystems => ({
  project_id,
  heating: { type: 'furnace-gas-', age: '15' },
  cooling: { type: 'central_A/C-electric', age: '12', capacity: 36000 },
  water_heater: { type: 'tank-gas', age: '9', capacity: 50 },
  panel: { location: 'Garage', amp: 100, open_spaces: 2 },
  subpanels: [],
  other: ['Gas range'],
  notes: '',
})

function project(p: Partial<Project> & Pick<Project, 'id' | 'first_name' | 'last_name'>): Project {
  return {
    deal_title: `${p.first_name} ${p.last_name} - Unknown Solution`,
    email: `${p.first_name}.${p.last_name}@example.com`.toLowerCase(),
    phone: '(303) 555-0142',
    salesforce_opportunity_id: `006Hs00000${p.id}XyZ`,
    project_status: 'open',
    closed_at: '',
    statuses: { proposal: '', deposit1: 'not created', deposit2: 'not created', deposit_final: 'not created', retrospective: 'not complete', equipment: 'not ordered' },
    hca: 'Allison Toth',
    pm: 'Lena Ortiz',
    source: 'Web Direct',
    source_detail: '',
    referrer: '',
    referral_balance: 0,
    maintenance_interest: 'Unknown',
    systems_interest: ['Ducted HP'],
    timeline: '',
    handoff_notes: '',
    project_summary: '',
    budget: '',
    incentive_notes: '',
    income_verification: 'Not required',
    income: 120000,
    financing: '',
    lender: [],
    financing_amounts: [],
    blocker: '',
    install_start: '',
    install_end: '',
    finalized_proposal_id: null,
    updated_at: new Date(Date.now() - ((p.id * 7919) % 9) * 86_400_000 - 3_600_000).toISOString(),
    ...p,
  }
}

/** Spec + price one system with the real engine. Falls back to no lines if the engine rejects the input. */
function engineSystem(
  id: number, proposal_id: number, type: SystemType, nickname: string, input: SystemInput, house: Omit<House, 'project_id'>, structure: SystemInput['PricingStructure'],
): { system: SystemRec; lines: LineItemRec[] } {
  const full = makeSystemInput({
    ...(input as unknown as Record<string, unknown>),
    PricingStructure: structure,
    specIncentives: { proposal_id: [proposal_id], house: toEngineHouse({ ...house, project_id: 0 } as House) },
  })
  const out = runSpec(full)
  if (!out.ok) console.warn('seed: engine rejected', nickname, out.errors)
  const lines: LineItemRec[] = out.ok ? out.lines.map((l) => ({ ...l, id: liId++, system_id: id })) : []
  const system: SystemRec = {
    id, proposal_id, system_type: type, nickname, scope: 'base', input: full as unknown as Record<string, unknown>,
    engine: out.ok ? out.engineSystem : undefined,
    status: 'proposed', target_margin: out.ok ? out.targetMargin : 0.25, rebate_eligibility_type: full.rebateEligibilityType ?? 'none',
    rebate_effective_date: (full.rebateEffectiveDate ?? '').slice(0, 10), created_at: '2026-10-20', stock_alert: false,
  }
  return { system, lines }
}

/** Demo invoices for a project that already has a finalized proposal: 50% deposit paid, final invoice not sent. */
function seedInvoices(b: ProjectBundle) {
  const opts = { firstDepositPct: 0.5, firstDepositCustom: 0, firstCardFee: false, finalCardFee: false, upfrontDiscount: false }
  const build = buildInvoices(b, opts)
  b.depositConfig = { first_deposit_pct: 0.5, first_deposit_amount_custom: 0, first_card_fees: false, final_card_fees: false, upfront_discount: false }
  for (const d of build.drafts) {
    const id = liId++
    b.invoices.push({
      id, project_id: b.project.id, invoice_type: d.invoice_type, invoice_amount: d.invoice_amount, footer: d.footer, memo: '', notes: '',
      invoice_status: d.invoice_type === 'First Deposit' ? 'paid' : 'not sent', payment_type: 'ACH', finalizing_method: 'customer', evergreen: false,
      created_at: '2026-10-02T15:00:00Z', ...(d.invoice_type === 'First Deposit' ? { approved_at: '2026-10-02T16:00:00Z', sent_at: '2026-10-02T16:05:00Z', paid_at: '2026-10-04T12:00:00Z', stripe_invoice_id: 'in_demo_deposit' } : {}),
    })
    for (const l of d.lines) b.invoiceLines.push({ ...l, id: liId++, invoice_id: id })
  }
}

export function buildSeed(): Record<number, ProjectBundle> {
  const out: Record<number, ProjectBundle> = {}

  const add = (
    p: Project,
    h: Omit<House, 'project_id'> | null,
    opts: {
      proposals?: Proposal[]
      systems?: SystemRec[]
      lineItems?: LineItemRec[]
      existing?: Partial<ExistingSystems>
    } = {},
  ) => {
    out[p.id] = {
      project: p,
      house: h ? { ...h, project_id: p.id } : null,
      existing: { ...blankExisting(p.id), ...opts.existing },
      proposals: opts.proposals ?? [],
      systems: opts.systems ?? [],
      lineItems: opts.lineItems ?? [],
      invoices: [],
      invoiceLines: [],
      depositConfig: null,
    }
    const bun = out[p.id]
    for (const prop of bun.proposals) recomputePermits(bun, prop.id, () => liId++)
    // Margin and incentives, run the way the Recalculate button does, on each designed system
    if (bun.house) {
      for (const sy of bun.systems.filter((x) => x.system_type !== 'other')) {
        const r = recalcLines({ project: bun.project, house: bun.house, existing: bun.existing, systems: bun.systems, lineItems: bun.lineItems, proposalId: sy.proposal_id, systemId: sy.id }, sy)
        if (!r.ok) { console.warn('seed: recalculate failed for', sy.nickname, r.errors); continue }
        bun.lineItems = bun.lineItems.filter((l) => l.system_id !== sy.id).concat(r.lines.map((l) => ({ ...l, id: liId++, system_id: sy.id })))
      }
      for (const prop of bun.proposals) recomputePermits(bun, prop.id, () => liId++)
    }
    if (p.finalized_proposal_id) seedInvoices(bun)
  }

  const H = (id: number, address: string, city: string, county: string, state: string, zipcode: string, extra: Partial<House> = {}) => ({
    ...blankHouse(id), address, city, county, state, zipcode, ...extra,
  })

  /* 1. Fully designed: three proposal options */
  {
    const id = 12522
    const proposals: Proposal[] = [
      { id: 9101, project_id: id, nickname: 'Option A: Whole-home', pricing_structure: 'standard', status: 'out for signature', target_margin: 0.25, created_at: '2026-10-20' },
      { id: 9102, project_id: id, nickname: 'Option B: HVAC + HPWH', pricing_structure: 'standard', status: 'pending', target_margin: 0.25, created_at: '2026-10-20' },
      { id: 9103, project_id: id, nickname: 'Option C: HVAC only', pricing_structure: 'standard', status: 'pending', target_margin: 0.22, created_at: '2026-10-21' },
    ]
    const house = H(id, '924 Grouse Circle', 'Fort Collins', 'Larimer County', 'CO', '80524', { sq_footage: 2150, year_built: '1992', home_type: 'Single family', special_considerations: ['Limited attic access'], notes: 'Finished basement, ducts run through the crawlspace.' })
    const S = (sid: number, pid: number, type: SystemType, nick: string, input: SystemInput) => engineSystem(sid, pid, type, nick, input, house, 'standard')
    const built = [
      S(7001, 9101, 'hvac', 'Whole-home ducted, 2 air handlers', sampleSystemInputs.hvacDuctedTwoAhu),
      { ...S(7002, 9101, 'water heater', 'Basement heat pump water heater', sampleSystemInputs.waterHeater), flag: true },
      S(7003, 9101, 'panel', 'Panel upgrade', sampleSystemInputs.panel),
      S(7004, 9102, 'hvac', 'Whole-home ducted, 2 air handlers', sampleSystemInputs.hvacDuctedTwoAhu),
      S(7005, 9102, 'water heater', 'Basement heat pump water heater', sampleSystemInputs.waterHeater),
      S(7006, 9103, 'hvac', 'Single mini-split, family room', sampleSystemInputs.hvacSingleMiniSplit),
    ]
    const systems = built.map((x) => ({ ...x.system, stock_alert: 'flag' in x ? true : x.system.stock_alert }))
    const lineItems = built.flatMap((x) => x.lines)
    add(
      project({
        id, first_name: 'Joe', last_name: 'Herrick', deal_title: 'Joe Herrick - HP (Ducted) + HPWH',
        email: 'joecubs@gmail.com', phone: '(970) 555-0188', project_status: 'open',
        statuses: { proposal: '', deposit1: 'not created', deposit2: 'not created', deposit_final: 'not created', retrospective: 'not complete', equipment: 'not ordered' },
        source: 'Ambassador', referrer: 'Tamara Ellis', referral_balance: 250, maintenance_interest: 'Interested',
        systems_interest: ['Ducted HP', 'HPWH', 'Panel Upgrade'],
        timeline: 'Install before Jan 15', handoff_notes: 'Customer works from home, prefers morning installs. Dog in backyard.',
        budget: '$28,000', financing: 'yes', lender: ['Elephant Financing'], financing_amounts: [12000],
        income_verification: 'Verified — 80–150% AMI',
        project_summary: 'Replace 15-year gas furnace and 50-gal gas water heater. Upgrade panel to 200A to support heat pump and a future EV.',
      }),
      house,
      { proposals, systems, lineItems, existing: { panel: { location: 'Garage', amp: 100, open_spaces: 0 } } },
    )
  }

  /* 2. Two proposals, MA project (exercises the Massachusetts-specific section) */
  {
    const id = 12611
    const proposals: Proposal[] = [
      { id: 9201, project_id: id, nickname: 'Heat pump retrofit', pricing_structure: 'ma_laminar', status: 'out for review', target_margin: 0.2, created_at: '2026-10-28' },
    ]
    const house = H(id, '47 Linden Street', 'Somerville', 'Middlesex County', 'MA', '02143', {
        gas_utility: 'National Grid', electric_utility: 'Eversource', year_built: '1928', home_type: 'Duplex', units: 2,
        ma: { primary_residence: true, energy_audit: 'Completed', recommendations_complete: 'In progress', certificate_of_completion: 'No', heat_loan_status: 'Applied', whole_home_verification: 'Requested' },
      })
    const built = [
      engineSystem(7101, 9201, 'hvac', 'Six-zone mini-split', sampleSystemInputs.hvacMiniSplitSixHeads, house, 'ma_laminar'),
      engineSystem(7102, 9201, 'ev', 'Driveway EV charger', sampleSystemInputs.ev, house, 'ma_laminar'),
    ]
    const systems = built.map((x) => x.system)
    const lineItems = built.flatMap((x) => x.lines)
    add(
      project({
        id, first_name: 'Maya', last_name: 'Fernandez', project_status: 'open',
        statuses: { proposal: '', deposit1: 'not created', deposit2: 'not created', deposit_final: 'not created', retrospective: 'not complete', equipment: 'not ordered' },
        hca: 'Marcus Reed', pm: 'Chris Bell', source: 'Program Implementer', timeline: 'Spring', handoff_notes: '',
        financing: 'yes', lender: ['HEAT Loan'], financing_amounts: [15000],
      }),
      house,
      { proposals, systems, lineItems },
    )
  }

  /* 3. Finalized, ready for install */
  {
    const id = 12390
    const proposals: Proposal[] = [
      { id: 9301, project_id: id, nickname: 'Signed design', pricing_structure: 'standard', status: 'finalized', target_margin: 0.25, created_at: '2026-09-10' },
    ]
    const house = H(id, '3120 Walnut Street', 'Boulder', 'Boulder County', 'CO', '80301', { year_built: '1974', sq_footage: 1540 })
    const built = [
      engineSystem(7201, 9301, 'hvac', 'Single mini-split, living room', sampleSystemInputs.hvacSingleMiniSplit, house, 'standard'),
      engineSystem(7202, 9301, 'water heater', 'Basement heat pump water heater', sampleSystemInputs.waterHeater, house, 'standard'),
    ]
    const systems = built.map((x) => x.system)
    const lineItems = built.flatMap((x) => x.lines)
    add(
      project({
        id, first_name: 'Elena', last_name: 'Ruiz', project_status: 'Scheduled', deal_title: 'Elena Ruiz - HP (Mini-split) + HPWH',
        statuses: { proposal: '', deposit1: '', deposit2: '', deposit_final: '', retrospective: 'not complete', equipment: 'ordered' },
        hca: 'Priya Nair', pm: 'Sam Whitfield', source: 'Event', timeline: 'Install week of Nov 17',
        handoff_notes: 'Gate code 4471. Panel is in the basement near the stairs.', finalized_proposal_id: 9301,
        install_start: '2026-11-17', install_end: '2026-11-19', budget: '$19,500',
      }),
      house,
      { proposals, systems, lineItems },
    )
  }

  /* 4. Mid-design, one HVAC only */
  {
    const id = 12708
    const house = H(id, '88 Alder Lane', 'Longmont', 'Boulder County', 'CO', '80501', { sq_footage: 2400, year_built: '2004' })
    const built = [engineSystem(7301, 9401, 'hvac', 'Whole-home dual fuel', sampleSystemInputs.hvacDualFuel, house, 'standard')]
    add(
      project({ id, first_name: 'Owen', last_name: 'Pratt', source: 'Web Direct', hca: 'Dan Okafor' }),
      house,
      {
        proposals: [{ id: 9401, project_id: id, nickname: 'Proposal 1', pricing_structure: 'standard', status: 'pending', target_margin: 0.25, created_at: '2026-11-03' }],
        systems: built.map((x) => x.system),
        lineItems: built.flatMap((x) => x.lines),
      },
    )
  }

  /* Leads and early-stage projects */
  const early: [number, string, string, string, string, string, string, string, string, string, string, string][] = [
    // id, first, last, address, city, county, state, zip, status, closed_at, hca, solution
    [12790, 'Grace', 'Nakamura', '215 Maple Ave', 'Denver', 'Denver County', 'CO', '80206', 'open', '', 'Michelle Cho', 'Unknown Solution'],
    [12801, 'Theo', 'Whitaker', '19 Orchard Rd', 'Arlington', 'Middlesex County', 'MA', '02474', 'open', '', 'Allison Toth', 'ASHP'],
    [12815, 'Priyanka', 'Shah', '502 Pine Court', 'Steamboat Springs', 'Routt County', 'CO', '80487', 'open', '', 'Allison Toth', '2X HP (ducted)'],
    [12822, 'Marcus', 'Lindqvist', '77 Harbor View', 'Ithaca', 'Tompkins County', 'NY', '14850', 'open', '', 'Michelle Cho', 'HPWH'],
    [12830, 'Hannah', 'Bergstrom', '1340 Aspen Way', 'Golden', 'Jefferson County', 'CO', '80401', 'won', '', 'Brice Turner', 'HP (Ducted) + HPWH'],
    [12844, 'Carlos', 'Medina', '61 Willow Street', 'Medford', 'Middlesex County', 'MA', '02155', 'Needs Dispatching', '', 'Louis Park', '2-head MSHP'],
    [12851, 'Leslie', 'Woodruff', '25221 Westridge Road', 'Golden', 'Jefferson County', 'CO', '80401', 'lost', '2026-09-26', 'Luke Hart', 'October 23, 2025'],
    [12852, 'Paul', 'McLean', '2531 Birch Street', 'Denver', 'Denver County', 'CO', '80207', 'lost', '2026-09-18', 'Brice Turner', 'Nurture'],
    [12853, 'Briana', 'Jones', '1249 Ceres Drive', 'Lafayette', 'Boulder County', 'CO', '80026', 'lost', '2026-09-12', 'Louis Park', 'ASHP'],
    [12854, 'Trevor', 'Stone', '5283 Euclid Avenue', 'Boulder', 'Boulder County', 'CO', '80303', 'Installed', '', 'Allison Toth', '2X HP (ducted)'],
    [12855, 'Orry', 'Shamash', '73 Bow Street', 'Medford', 'Middlesex County', 'MA', '02155', 'Scheduling in Progress', '', 'Michelle Cho', 'MSHP/ASHP'],
    [12856, 'Doug', 'Schnurrenberger', '7373 Olde Stage Road', 'Boulder', 'Boulder County', 'CO', '80302', 'Installation in Progress', '', 'Louis Park', '2-head MSHP (Upsell)'],
  ]
  for (const [id, fn, ln, addr, city, county, st, zip, status, closed, hca, solution] of early) {
    add(
      project({
        id, first_name: fn, last_name: ln, project_status: status, closed_at: closed, hca, deal_title: `${fn} ${ln} - ${solution}`,
        install_start: status === 'Installation in Progress' || status === 'Installed' ? '2026-11-03' : '',
        blocker: id === 12844 ? 'Waiting on customer for panel photos' : '',
      }),
      H(id, addr, city, county, st, zip),
    )
  }

  return out
}

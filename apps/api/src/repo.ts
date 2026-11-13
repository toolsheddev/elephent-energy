/* Persistence for the project "bundle": everything the UI needs for one project, in the domain model's shape.
   The tables follow the Retool database (see db/schema.sql); this file maps between the two.
   Reads join the tables. Writes upsert what the bundle holds and delete what it no longer holds, inside one transaction. */
import type {
  DepositConfig, ExistingSystems, House, Invoice, InvoiceLine, LineItemRec, Project, ProjectBundle, ProjectListItem, Proposal, SystemRec,
} from '@sd/domain/types'
import { normalizeCO, normalizeIncomeVerification, normalizeLenders, normalizeMA, normalizeExisting, normalizeMaintenanceInterest, normalizeSource, normalizeSystemsInterest } from '@sd/domain/options'
import { pool, type Db } from './db'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const s = (v: string | null | undefined) => v ?? ''
const day = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '')
const opt = <T,>(v: T | null | undefined) => (v === null || v === undefined ? undefined : v)
const jb = (v: unknown) => JSON.stringify(v ?? null)
const nullIfEmpty = (v: string | null | undefined) => (v ? v : null)
const list = (v: string | null | undefined): string[] => (v ? v.split(';').map((x) => x.trim()).filter(Boolean) : [])
const joinList = (v: string[] | undefined) => (v && v.length ? v.join('; ') : null)
const numOrNull = (v: string | number | null | undefined) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v))

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export async function loadBundle(id: number, c: Db = pool): Promise<ProjectBundle | null> {
  const p = (await c.query<Row>(
    `select p.*, to_char(p.closed_at, 'YYYY-MM-DD') as closed_day, to_char(p.install_date, 'YYYY-MM-DD') as install_day, to_char(p.end_install_date, 'YYYY-MM-DD') as end_day,
            c.first_name, c.last_name, c.annual_gross_income, c.incentive_notes, c.income_verification,
            u.name as pm_name, pp.email, pp.phone, pp.source, pp.source_detail, pp.referrer, pp.referral_balance, pp.maintenance_interest,
            pp.systems_interest, pp.statuses, pp.nwco_details, pp.updated_at as profile_updated_at
       from projects_new p
       left join customers_new c on c.id = p.customer_id
       left join users u on u.id = p.project_manager
       left join project_profile pp on pp.project_id = p.id
      where p.id = $1`, [id])).rows[0]
  if (!p) return null

  // One at a time: a transaction client runs a single query at once
  const q = <T extends Row = Row>(sql: string, params: unknown[]) => c.query<T>(sql, params)
  const house = await q('select * from houses_new where id = $1', [p.house_id])
  const existing = await q('select * from existing_systems where project_id = $1', [id])
  const proposals = await q('select * from proposals_new where project_id = $1 order by id', [id])
  const systems = await q('select s.* from systems_new s join proposals_new pr on pr.id = s.proposal_id where pr.project_id = $1 order by s.id', [id])
  const lines = await q('select li.* from line_items_new li join systems_new s on s.id = li.system_id join proposals_new pr on pr.id = s.proposal_id where pr.project_id = $1 order by li.line_order, li.id', [id])
  const invoices = await q('select * from invoices_new where project_id = $1 order by id', [id])
  const invLines = await q('select l.* from invoice_line_items_new l join invoices_new i on i.id = l.invoice_id where i.project_id = $1 order by l.id', [id])
  const deposit = await q('select * from deposit_config where project_id = $1', [id])

  const lender: string[] = Array.isArray(p.lender) ? p.lender : []
  const amounts: number[] = (Array.isArray(p.financing_amounts) ? p.financing_amounts : []).map((x: { amount: number }) => x.amount)
  const project: Project = {
    id: p.id, deal_title: s(p.pipedrive_deal_title), first_name: s(p.first_name), last_name: s(p.last_name), email: s(p.email), phone: s(p.phone),
    salesforce_opportunity_id: s(p.salesforce_opportunity_id), project_status: p.project_status, closed_at: s(p.closed_day),
    statuses: { proposal: '', deposit1: '', deposit2: '', deposit_final: '', retrospective: 'not complete', equipment: 'not ordered', ...p.statuses },
    hca: s(p.hca), pm: s(p.pm_name), source: normalizeSource(s(p.source)), source_detail: s(p.source_detail), referrer: s(p.referrer), referral_balance: p.referral_balance ?? 0,
    maintenance_interest: normalizeMaintenanceInterest(s(p.maintenance_interest)), systems_interest: normalizeSystemsInterest(p.systems_interest), timeline: s(p.timeline),
    handoff_notes: s(p.handoff_notes?.handoff_notes), project_summary: s(p.project_summary), budget: s(p.budget), incentive_notes: s(p.incentive_notes),
    income_verification: normalizeIncomeVerification(s(p.income_verification)), income: p.annual_gross_income ?? 0, financing: p.financing ?? '', lender: normalizeLenders(lender), financing_amounts: amounts,
    blocker: s(p.project_blocker), install_start: s(p.install_day), install_end: s(p.end_day), finalized_proposal_id: p.finalized_proposal_id ?? null,
    updated_at: p.profile_updated_at ?? p.created_at,
  }

  const h = house.rows[0]
  const houseOut: House | null = h && {
    project_id: id, address: s(h.address), city: s(h.city), county: s(h.county), state: s(h.state), zipcode: s(h.zipcode), home_type: s(h.home_type),
    units: h.units ?? 1, num_ppl: h.num_ppl ?? 0, sq_footage: h.sq_footage, year_built: h.year_built === null ? '' : String(h.year_built),
    move_in_year: h.move_in_year === null ? '' : String(h.move_in_year), move_in_month: typeof h.move_in_date === 'string' ? h.move_in_date.slice(5, 7) : '', utility_customer_name: s(h.utility_customer_name), gas_utility: s(h.gas_utility),
    electric_utility: s(h.electric_utility), paperless_billing: h.has_paperless_billing ?? false, special_considerations: list(h.special_considerations),
    home_features: list(h.home_features), notes: s(h.addtl_notes), manual_j_complete: h.manual_j === 'complete',
    ma: normalizeMA(h.massachusetts_details ?? {}), co: normalizeCO(h.colorado_details ?? {}), nwco: p.nwco_details ?? {},
  }

  const e = existing.rows[0]
  const existingOut: ExistingSystems = e
    ? normalizeExisting({ project_id: id, heating: e.heating, cooling: e.cooling, water_heater: e.water_heater, panel: e.panel, subpanels: e.subpanels, other: e.other, notes: e.notes })
    : { project_id: id, heating: { type: '', age: '' }, cooling: { type: '', age: '', capacity: null }, water_heater: { type: '', age: '', capacity: null }, panel: { location: '', amp: null, open_spaces: null }, subpanels: [], other: [], notes: '' }

  const proposalsOut: Proposal[] = proposals.rows.map((r) => ({
    id: r.id, project_id: r.project_id, nickname: s(r.nickname), pricing_structure: p.pricing_structure || 'standard', status: r.proposal_status,
    target_margin: r.target_margin ?? 0.25, created_at: day(r.proposal_created_at),
  }))

  const systemsOut: SystemRec[] = systems.rows.map((r) => {
    const { _app = {}, ...engineData } = r.additional_data ?? {}
    const engine: Record<string, unknown> = {}
    if (r.system_type_detail !== null) engine.system_type_detail = r.system_type_detail
    if (r.ahri_id !== null) engine.ahri_id = r.ahri_id
    if (Object.keys(engineData).length) engine.additional_data = engineData
    return {
      id: r.id, proposal_id: r.proposal_id, system_type: r.system_type, nickname: s(r.system_nickname), scope: _app.scope ?? 'base', input: _app.input ?? {},
      ...(Object.keys(engine).length ? { engine } : {}), status: r.system_status, target_margin: r.target_margin,
      rebate_eligibility_type: s(r.rebate_eligibility_type), heating_load_coverage: r.heating_load_coverage ?? null, rebate_effective_date: day(r.rebate_effective_date), created_at: day(r.system_created_at),
      stock_alert: _app.stock_alert ?? false, ...(_app.change_order ? { change_order: _app.change_order } : {}),
    }
  })

  const linesOut: LineItemRec[] = lines.rows.map((r) => {
    const x = r.additional_data ?? {}
    return {
      id: r.id, system_id: r.system_id, line_item_type: r.line_item_type, description: s(r.description), quantity: r.quantity ?? 1, price_actual: r.price_actual ?? 0,
      cost: x.cost ?? null, equipment_provider: opt(r.equipment_provider), location: opt(r.location), is_manual: r.manually_added || undefined, note: opt(x.note),
      equipment_id: r.equipment_id, labor_id: r.labor_id, permit_id: r.permit_id, circuit: opt(x.circuit), assigned_units: opt(x.assigned_units),
      branch_box: opt(x.branch_box), show_in_proposal: opt(r.show_in_proposal), margin_amount: opt(r.margin_amount), margin_percent: r.margin_percent,
      margin_to_include: opt(r.margin_to_include), incentive_id: r.incentive_id, incentive_recipient: opt(r.incentive_recipient), adjustment_reason: opt(r.adjustment_reason),
      status: opt(r.status), change_order_details: opt(r.change_order_details), maintenance_plan_id: opt(r.maintenance_plan_id),
    }
  })

  const invoicesOut: Invoice[] = invoices.rows.map((r) => ({
    id: r.id, project_id: r.project_id, invoice_type: r.invoice_type, invoice_status: r.invoice_status ?? 'not sent', invoice_amount: r.invoice_amount ?? 0,
    payment_type: r.payment_type ?? 'ACH', finalizing_method: r.finalizing_method ?? 'customer', memo: s(r.memo), footer: s(r.footer), notes: s(r.notes), evergreen: !!r.evergreen,
    ...(r.stripe_invoice_id ? { stripe_invoice_id: r.stripe_invoice_id } : {}), created_at: r.invoice_created_at,
    ...(r.approved_at ? { approved_at: r.approved_at } : {}), ...(r.sent_at ? { sent_at: r.sent_at } : {}), ...(r.paid_at ? { paid_at: r.paid_at } : {}),
  }))
  const invLinesOut: InvoiceLine[] = invLines.rows.map((r) => ({
    id: r.id, invoice_id: r.invoice_id, line_item_type: s(r.line_item_type), name: s(r.name), amount: r.amount ?? 0, system_id: r.system_id,
  }))
  const dep = deposit.rows[0]
  const depositOut: DepositConfig | null = dep && {
    first_deposit_pct: dep.first_deposit_pct, first_deposit_amount_custom: dep.first_deposit_amount_custom, first_card_fees: dep.first_card_fees,
    final_card_fees: dep.final_card_fees, upfront_discount: dep.upfront_discount,
  }

  return {
    project, house: houseOut ?? null, existing: existingOut, proposals: proposalsOut, systems: systemsOut, lineItems: linesOut,
    invoices: invoicesOut, invoiceLines: invLinesOut, depositConfig: depositOut ?? null,
  }
}

/** One row per project for the All Projects table, computed in SQL. */
export async function listProjects(c: Db = pool): Promise<ProjectListItem[]> {
  const { rows } = await c.query<Row>(`
    select p.id, cu.first_name, cu.last_name, p.pipedrive_deal_title as deal_title, to_char(p.install_date,'YYYY-MM-DD') as install_start,
           to_char(p.closed_at,'YYYY-MM-DD') as closed_at, h.address, h.city, h.state, p.project_status, p.hca, u.name as pm, p.project_blocker as blocker,
           coalesce(pp.updated_at, p.created_at) as updated_at,
           (select pr.proposal_status from proposals_new pr where pr.project_id = p.id
             order by coalesce(array_position(array['finalized','out for signature','out for review','pending','rejected'], pr.proposal_status), 99) limit 1) as proposal_status,
           (select sum(li.price_actual * li.quantity) from line_items_new li join systems_new s on s.id = li.system_id
             where s.proposal_id = (select min(id) from proposals_new where project_id = p.id)) as proposal_total
      from projects_new p
      left join customers_new cu on cu.id = p.customer_id
      left join houses_new h on h.id = p.house_id
      left join users u on u.id = p.project_manager
      left join project_profile pp on pp.project_id = p.id
     order by coalesce(pp.updated_at, p.created_at) desc, p.id`)
  return rows.map((r) => ({
    id: r.id, first_name: s(r.first_name), last_name: s(r.last_name), customer: `${s(r.first_name)} ${s(r.last_name)}`.trim(), deal_title: s(r.deal_title),
    install_start: s(r.install_start), closed_at: s(r.closed_at), address: s(r.address), city: r.city ? `${r.city}, ${r.state}` : '', state: s(r.state),
    status: r.project_status, proposal_status: r.proposal_status ?? null, hca: s(r.hca), pm: s(r.pm),
    proposal_total: r.proposal_total && r.proposal_total > 0 ? r.proposal_total : null, updated_at: r.updated_at, blocker: s(r.blocker),
  }))
}

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

export interface SaveParts { info?: boolean; design?: boolean; invoices?: boolean }
const ALL: SaveParts = { info: true, design: true, invoices: true }

/** Find or create the users row for a project manager's name. Ids come from the same block the request reserved. */
async function userId(c: Db, name: string, nextId: () => number): Promise<number | null> {
  if (!name) return null
  const found = await c.query('select id from users where name = $1', [name])
  if (found.rowCount) return found.rows[0].id
  const id = nextId()
  await c.query('insert into users(id, name) values ($1, $2)', [id, name])
  return id
}

/** Write the bundle back. `parts` limits the work to what changed; the default writes everything. */
export async function saveBundle(c: Db, b: ProjectBundle, nextId: () => number, parts: SaveParts = ALL) {
  const p = b.project
  const cur = (await c.query<{ customer_id: number | null; house_id: number | null }>('select customer_id, house_id from projects_new where id = $1', [p.id])).rows[0]
  const customerId = cur?.customer_id ?? p.id // demo convention for new rows: customer and house ids equal the project id
  const houseId = cur?.house_id ?? p.id

  if (parts.info) {
    await c.query(
      `insert into customers_new(id, first_name, last_name, annual_gross_income, income_verification, incentive_notes) values ($1,$2,$3,$4,$5,$6)
       on conflict (id) do update set first_name=excluded.first_name, last_name=excluded.last_name, annual_gross_income=excluded.annual_gross_income,
         income_verification=excluded.income_verification, incentive_notes=excluded.incentive_notes`,
      [customerId, p.first_name, p.last_name, p.income, nullIfEmpty(p.income_verification), nullIfEmpty(p.incentive_notes)])
    if (b.house) {
      const h = b.house
      await c.query(
        `insert into houses_new(id, customer_id, address, city, county, state, zipcode, home_type, units, num_ppl, sq_footage, year_built, move_in_year, utility_customer_name,
           gas_utility, electric_utility, has_paperless_billing, special_considerations, home_features, addtl_notes, manual_j, massachusetts_details, colorado_details, move_in_date)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
         on conflict (id) do update set address=excluded.address, city=excluded.city, county=excluded.county, state=excluded.state, zipcode=excluded.zipcode,
           home_type=excluded.home_type, units=excluded.units, num_ppl=excluded.num_ppl, sq_footage=excluded.sq_footage, year_built=excluded.year_built,
           move_in_year=excluded.move_in_year, utility_customer_name=excluded.utility_customer_name, gas_utility=excluded.gas_utility, electric_utility=excluded.electric_utility,
           has_paperless_billing=excluded.has_paperless_billing, special_considerations=excluded.special_considerations, home_features=excluded.home_features,
           addtl_notes=excluded.addtl_notes, manual_j=excluded.manual_j, massachusetts_details=excluded.massachusetts_details, colorado_details=excluded.colorado_details, move_in_date=excluded.move_in_date`,
        [houseId, customerId, h.address, h.city, h.county, h.state, h.zipcode, h.home_type, h.units, h.num_ppl, h.sq_footage ?? null, numOrNull(h.year_built), numOrNull(h.move_in_year),
          h.utility_customer_name, h.gas_utility, h.electric_utility, h.paperless_billing, joinList(h.special_considerations), joinList(h.home_features), nullIfEmpty(h.notes),
          h.manual_j_complete ? 'complete' : null, jb(h.ma), jb(h.co),
          h.move_in_year && h.move_in_month ? `${h.move_in_year}-${h.move_in_month}-01` : null])
    }
  }

  // The project row is also written with the design part, because finalizing changes finalized_proposal_id
  if (parts.info || parts.design) {
    const pm = await userId(c, p.pm, nextId)
    const amounts = p.financing_amounts.map((amount, i) => ({ amount, lender: p.lender[i] ?? p.lender[0] ?? null }))
    await c.query(
      `insert into projects_new(id, customer_id, house_id, pipedrive_deal_title, salesforce_opportunity_id, project_status, closed_at, hca, project_manager, timeline, handoff_notes,
         project_summary, budget, financing, lender, financing_amounts, project_blocker, install_date, end_install_date, finalized_proposal_id, pricing_structure)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       on conflict (id) do update set pipedrive_deal_title=excluded.pipedrive_deal_title, salesforce_opportunity_id=excluded.salesforce_opportunity_id,
         project_status=excluded.project_status, closed_at=excluded.closed_at, hca=excluded.hca, project_manager=excluded.project_manager, timeline=excluded.timeline,
         handoff_notes=excluded.handoff_notes, project_summary=excluded.project_summary, budget=excluded.budget, financing=excluded.financing, lender=excluded.lender,
         financing_amounts=excluded.financing_amounts, project_blocker=excluded.project_blocker, install_date=excluded.install_date, end_install_date=excluded.end_install_date,
         finalized_proposal_id=excluded.finalized_proposal_id, pricing_structure=coalesce(excluded.pricing_structure, projects_new.pricing_structure)`,
      [p.id, customerId, houseId, p.deal_title, p.salesforce_opportunity_id, p.project_status, nullIfEmpty(p.closed_at), p.hca, pm, p.timeline, jb({ handoff_notes: p.handoff_notes }),
        p.project_summary, p.budget, p.financing, jb(p.lender), jb(amounts), p.blocker, nullIfEmpty(p.install_start), nullIfEmpty(p.install_end), p.finalized_proposal_id,
        b.proposals[0]?.pricing_structure ?? null])
    await c.query(
      `insert into project_profile(project_id, email, phone, source, source_detail, referrer, referral_balance, maintenance_interest, systems_interest, statuses, nwco_details, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       on conflict (project_id) do update set email=excluded.email, phone=excluded.phone, source=excluded.source, source_detail=excluded.source_detail, referrer=excluded.referrer,
         referral_balance=excluded.referral_balance, maintenance_interest=excluded.maintenance_interest, systems_interest=excluded.systems_interest,
         statuses=excluded.statuses, nwco_details=excluded.nwco_details, updated_at=excluded.updated_at`,
      [p.id, p.email, p.phone, p.source, p.source_detail, p.referrer, p.referral_balance, p.maintenance_interest, jb(p.systems_interest), jb(p.statuses), jb(b.house?.nwco ?? {}), p.updated_at])
  }

  if (parts.info) {
    const e = b.existing
    await c.query(
      `insert into existing_systems(project_id, heating, cooling, water_heater, panel, subpanels, other, notes) values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (project_id) do update set heating=excluded.heating, cooling=excluded.cooling, water_heater=excluded.water_heater, panel=excluded.panel,
         subpanels=excluded.subpanels, other=excluded.other, notes=excluded.notes`,
      [p.id, jb(e.heating), jb(e.cooling), jb(e.water_heater), jb(e.panel), jb(e.subpanels), jb(e.other), e.notes])
  }

  if (parts.design) {
    // Remove what the bundle no longer has (children go with their parent), then upsert the rest so columns this app does not map are kept.
    const ids = (xs: { id: number }[]) => xs.map((x) => x.id)
    await c.query('delete from proposals_new where project_id = $1 and id <> all($2::int[])', [p.id, ids(b.proposals)])
    await c.query(
      `delete from systems_new where proposal_id in (select id from proposals_new where project_id = $1) and id <> all($2::int[])`, [p.id, ids(b.systems)])
    await c.query(
      `delete from line_items_new where system_id in (select s.id from systems_new s join proposals_new pr on pr.id = s.proposal_id where pr.project_id = $1) and id <> all($2::int[])`,
      [p.id, ids(b.lineItems)])

    if (b.proposals.length) {
      await c.query(
        `insert into proposals_new(id, project_id, house_id, nickname, proposal_status, target_margin, proposal_created_at)
         select x.id, $2, $3, x.nickname, x.status, x.target_margin, coalesce(nullif(x.created_at,'')::timestamptz, now())
           from jsonb_to_recordset($1::jsonb) as x(id int, nickname text, status text, target_margin numeric, created_at text)
         on conflict (id) do update set nickname=excluded.nickname, proposal_status=excluded.proposal_status, target_margin=excluded.target_margin`,
        [jb(b.proposals), p.id, houseId])
    }
    if (b.systems.length) {
      const rows = b.systems.map((sy) => {
        const eng = (sy.engine ?? {}) as { system_type_detail?: unknown; ahri_id?: number | null; additional_data?: Record<string, unknown> }
        return {
          id: sy.id, proposal_id: sy.proposal_id, system_type: sy.system_type, status: sy.status ?? 'proposed', nickname: sy.nickname, target_margin: sy.target_margin ?? null,
          rebate_eligibility_type: sy.rebate_eligibility_type ?? null, heating_load_coverage: sy.heating_load_coverage ?? null, rebate_effective_date: nullIfEmpty(sy.rebate_effective_date), created_at: nullIfEmpty(sy.created_at),
          system_type_detail: eng.system_type_detail ?? null, ahri_id: eng.ahri_id ?? null,
          additional_data: { ...(eng.additional_data ?? {}), _app: { scope: sy.scope, input: sy.input, change_order: sy.change_order ?? null, stock_alert: sy.stock_alert ?? false } },
        }
      })
      await c.query(
        `insert into systems_new(id, proposal_id, house_id, system_type, system_status, system_nickname, target_margin, rebate_eligibility_type, rebate_effective_date,
           system_created_at, system_type_detail, ahri_id, additional_data, heating_load_coverage, updated_at)
         select x.id, x.proposal_id, $2, x.system_type, x.status, x.nickname, x.target_margin, x.rebate_eligibility_type, nullif(x.rebate_effective_date,'')::date,
                coalesce(nullif(x.created_at,'')::timestamptz, now()), x.system_type_detail, x.ahri_id, x.additional_data, x.heating_load_coverage, now()
           from jsonb_to_recordset($1::jsonb) as x(id int, proposal_id int, system_type text, status text, nickname text, target_margin numeric, rebate_eligibility_type text,
                rebate_effective_date text, created_at text, system_type_detail json, ahri_id int, additional_data json, heating_load_coverage text)
         on conflict (id) do update set proposal_id=excluded.proposal_id, system_type=excluded.system_type, system_status=excluded.system_status,
           system_nickname=excluded.system_nickname, target_margin=excluded.target_margin, rebate_eligibility_type=excluded.rebate_eligibility_type,
           rebate_effective_date=excluded.rebate_effective_date, system_type_detail=excluded.system_type_detail, ahri_id=excluded.ahri_id,
           additional_data=excluded.additional_data, heating_load_coverage=excluded.heating_load_coverage, updated_at=now()`,
        [jb(rows), houseId])
    }
    if (b.lineItems.length) {
      const ordered = b.lineItems.map((l, i) => ({
        id: l.id, system_id: l.system_id, line_order: i, line_item_type: l.line_item_type, description: l.description, quantity: l.quantity, price_actual: l.price_actual,
        additional_data: { cost: l.cost ?? null, note: l.note ?? null, circuit: l.circuit ?? null, assigned_units: l.assigned_units ?? null, branch_box: l.branch_box ?? null },
        equipment_provider: l.equipment_provider ?? null, location: l.location ?? null, manually_added: l.is_manual ?? false, equipment_id: l.equipment_id ?? null,
        labor_id: l.labor_id ?? null, permit_id: l.permit_id ?? null, maintenance_plan_id: l.maintenance_plan_id ?? null, show_in_proposal: l.show_in_proposal ?? null, margin_amount: l.margin_amount ?? null,
        margin_percent: l.margin_percent ?? null, margin_to_include: l.margin_to_include ?? null, incentive_id: l.incentive_id ?? null,
        incentive_recipient: l.incentive_recipient ?? null, adjustment_reason: l.adjustment_reason ?? null, status: l.status ?? null, change_order_details: l.change_order_details ?? null,
      }))
      await c.query(
        `insert into line_items_new(id, system_id, line_order, line_item_type, description, quantity, price_actual, additional_data, equipment_provider, location, manually_added,
           equipment_id, labor_id, permit_id, maintenance_plan_id, show_in_proposal, margin_amount, margin_percent, margin_to_include, incentive_id, incentive_recipient, adjustment_reason, status, change_order_details)
         select x.id, x.system_id, x.line_order, x.line_item_type, coalesce(x.description,''), x.quantity, x.price_actual, x.additional_data, x.equipment_provider, x.location,
                x.manually_added, x.equipment_id, x.labor_id, x.permit_id, x.maintenance_plan_id, x.show_in_proposal, x.margin_amount, x.margin_percent, x.margin_to_include, x.incentive_id,
                x.incentive_recipient, x.adjustment_reason, x.status, x.change_order_details
           from jsonb_to_recordset($1::jsonb) as x(id int, system_id int, line_order int, line_item_type text, description text, quantity int, price_actual double precision,
                additional_data json, equipment_provider text, location text, manually_added boolean, equipment_id int, labor_id int, permit_id int, maintenance_plan_id int, show_in_proposal boolean,
                margin_amount double precision, margin_percent numeric, margin_to_include boolean, incentive_id int, incentive_recipient text, adjustment_reason text, status text, change_order_details json)
         on conflict (id) do update set system_id=excluded.system_id, line_order=excluded.line_order, line_item_type=excluded.line_item_type, description=excluded.description,
           quantity=excluded.quantity, price_actual=excluded.price_actual, additional_data=excluded.additional_data, equipment_provider=excluded.equipment_provider,
           location=excluded.location, manually_added=excluded.manually_added, equipment_id=excluded.equipment_id, labor_id=excluded.labor_id, permit_id=excluded.permit_id, maintenance_plan_id=excluded.maintenance_plan_id,
           show_in_proposal=excluded.show_in_proposal, margin_amount=excluded.margin_amount, margin_percent=excluded.margin_percent,
           margin_to_include=excluded.margin_to_include, incentive_id=excluded.incentive_id, incentive_recipient=excluded.incentive_recipient,
           adjustment_reason=excluded.adjustment_reason, status=excluded.status, change_order_details=excluded.change_order_details`,
        [jb(ordered)])
    }
  }

  if (parts.invoices) {
    await c.query('delete from invoices_new where project_id = $1', [p.id])
    if (b.invoices.length) {
      await c.query(
        `insert into invoices_new(id, project_id, invoice_type, invoice_status, invoice_amount, payment_type, finalizing_method, memo, footer, notes, evergreen,
           stripe_invoice_id, invoice_created_at, approved_at, sent_at, paid_at)
         select x.id, $2, x.invoice_type, x.invoice_status, x.invoice_amount, x.payment_type, x.finalizing_method, coalesce(x.memo,''), coalesce(x.footer,''),
                coalesce(x.notes,''), coalesce(x.evergreen,false), x.stripe_invoice_id, coalesce(x.created_at, now()), x.approved_at, x.sent_at, x.paid_at
           from jsonb_to_recordset($1::jsonb) as x(id int, invoice_type text, invoice_status text, invoice_amount numeric, payment_type text, finalizing_method text,
                memo text, footer text, notes text, evergreen boolean, stripe_invoice_id text, created_at timestamptz, approved_at timestamptz, sent_at timestamptz, paid_at timestamptz)`,
        [jb(b.invoices), p.id])
    }
    if (b.invoiceLines.length) {
      await c.query(
        `insert into invoice_line_items_new(id, invoice_id, line_item_type, name, amount, system_id)
         select x.id, x.invoice_id, x.line_item_type, x.name, x.amount, x.system_id
           from jsonb_to_recordset($1::jsonb) as x(id int, invoice_id int, line_item_type text, name text, amount double precision, system_id int)`,
        [jb(b.invoiceLines)])
    }
    await c.query('delete from deposit_config where project_id = $1', [p.id])
    if (b.depositConfig) {
      const d = b.depositConfig
      await c.query(
        `insert into deposit_config(project_id, first_deposit_pct, first_deposit_amount_custom, first_card_fees, final_card_fees, upfront_discount) values ($1,$2,$3,$4,$5,$6)`,
        [p.id, d.first_deposit_pct ?? 0, d.first_deposit_amount_custom ?? 0, d.first_card_fees, d.final_card_fees, d.upfront_discount])
    }
  }
}

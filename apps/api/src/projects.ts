/* Creating and deleting whole projects. In Retool projects arrive from Salesforce and Pipedrive; here a project is created by hand. */
import type { Proposal, ProjectBundle } from '@sd/domain/types'
import { ensureCatchAll } from '@sd/domain/permits'
import { reserveIds, tx } from './db'
import { saveBundle } from './repo'

export interface NewProjectInput {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  address: string
  city: string
  state: string
  zipcode?: string
  county?: string
  hca?: string
  dealTitle?: string
}

const required = (v: string | undefined, what: string) => {
  if (!v || !v.trim()) throw new Error(`${what} is required`)
  return v.trim()
}

export async function createProject(input: NewProjectInput): Promise<number> {
  const first = required(input.firstName, 'First name')
  const last = required(input.lastName, 'Last name')
  const address = required(input.address, 'Street address')
  const city = required(input.city, 'City')
  const state = required(input.state, 'State').toUpperCase()
  const now = new Date().toISOString()

  return tx(async (c) => {
    const nextId = await reserveIds(c)
    const id = nextId()
    const pricing = state === 'MA' ? 'ma_forge' : state === 'CA' ? 'la_standard' : 'standard'
    const proposal: Proposal = {
      id: nextId(), project_id: id, nickname: 'Proposal 1', pricing_structure: pricing, status: 'pending',
      target_margin: state === 'MA' ? 0.225 : 0.25, created_at: now.slice(0, 10),
    }
    const b: ProjectBundle = {
      project: {
        id, deal_title: input.dealTitle?.trim() || `${first} ${last} - New project`, first_name: first, last_name: last, email: input.email?.trim() ?? '', phone: input.phone?.trim() ?? '',
        salesforce_opportunity_id: '', project_status: 'open', closed_at: '',
        statuses: { proposal: '', deposit1: '', deposit2: '', deposit_final: '', retrospective: 'not complete', equipment: 'not ordered' },
        hca: input.hca?.trim() ?? '', pm: '', source: '', source_detail: '', referrer: '', referral_balance: 0, maintenance_interest: '', systems_interest: [],
        timeline: '', handoff_notes: '', project_summary: '', budget: '', incentive_notes: '', income_verification: '', income: 0, financing: '', lender: [], financing_amounts: [],
        blocker: '', install_start: '', install_end: '', finalized_proposal_id: null, updated_at: now,
      },
      house: {
        project_id: id, address, city, county: input.county?.trim() ?? '', state, zipcode: input.zipcode?.trim() ?? '', home_type: '', units: 1, num_ppl: 0, sq_footage: null,
        year_built: '', move_in_year: '', utility_customer_name: '', gas_utility: '', electric_utility: '', paperless_billing: false, special_considerations: [], home_features: [],
        notes: '', manual_j_complete: false,
        ma: { primary_residence: false, energy_audit: '', recommendations_complete: '', certificate_of_completion: '', heat_loan_status: '', whole_home_verification: '' },
        co: { efficiency: '', xcel_whole_home: false }, nwco: { hear_amount: '', energy_smart: false },
      },
      existing: {
        project_id: id, heating: { type: '', age: '' }, cooling: { type: '', age: '', capacity: null }, water_heater: { type: '', age: '', capacity: null },
        panel: { location: '', amp: null, open_spaces: null }, subpanels: [], other: [], notes: '',
      },
      proposals: [proposal], systems: [], lineItems: [], invoices: [], invoiceLines: [], depositConfig: null,
    }
    ensureCatchAll(b, proposal.id, nextId)
    await saveBundle(c, b, nextId)
    return id
  })
}

export async function deleteProject(id: number): Promise<boolean> {
  return tx(async (c) => {
    const row = (await c.query<{ customer_id: number | null; house_id: number | null }>('select customer_id, house_id from projects_new where id = $1 for update', [id])).rows[0]
    if (!row) return false
    await c.query('delete from projects_new where id = $1', [id]) // proposals, systems, lines and invoices go with it
    if (row.house_id) await c.query('delete from houses_new h where h.id = $1 and not exists (select 1 from projects_new p where p.house_id = h.id)', [row.house_id])
    if (row.customer_id) await c.query('delete from customers_new cu where cu.id = $1 and not exists (select 1 from projects_new p where p.customer_id = cu.id) and not exists (select 1 from houses_new h where h.customer_id = cu.id)', [row.customer_id])
    return true
  })
}

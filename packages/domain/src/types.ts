/* Domain model for the web app. Mirrors the Retool tables (projects_new, customers_new, houses_new,
   proposals_new, systems_new, line_items_new) in the shape the UI needs. */

/** Postgres enum `project_status*` (see PROJECT_STATUSES in options.ts). */
export type ProjectStatusName = string

/** Invoice: paid | open | not sent | void | draft | not created. Retro: completed | not complete. Equipment: ordered | not ordered. */
export type StatusValue = string

export interface ProjectStatuses {
  proposal: StatusValue | string
  deposit1: StatusValue | string
  deposit2: StatusValue | string
  deposit_final: StatusValue | string
  retrospective: StatusValue | string
  equipment: StatusValue | string
  /** The last "Request bills & photos" sent for this project (nothing is actually emailed in this build). */
  utility_request?: { kind: string; via: 'bayou' | 'email' | 'companycam'; photos: string[]; at: string }
}

export interface Project {
  id: number
  deal_title: string
  first_name: string
  last_name: string
  email: string
  phone: string
  salesforce_opportunity_id: string
  project_status: ProjectStatusName
  closed_at: string
  statuses: ProjectStatuses
  hca: string
  pm: string
  source: string
  source_detail: string
  referrer: string
  referral_balance: number
  maintenance_interest: string
  systems_interest: string[]
  timeline: string
  handoff_notes: string
  project_summary: string
  budget: string
  incentive_notes: string
  income_verification: string
  income: number
  financing: '' | 'yes' | 'no'
  lender: string[]
  financing_amounts: number[]
  blocker: string
  install_start: string
  install_end: string
  finalized_proposal_id: number | null
  updated_at: string
}

export interface House {
  project_id: number
  address: string
  city: string
  county: string
  state: string
  zipcode: string
  home_type: string
  units: number
  num_ppl: number
  sq_footage: number | null
  year_built: string
  move_in_year: string
  /** '01'..'12' or ''. Retool builds the move-in date from the month and the year. */
  move_in_month: string
  utility_customer_name: string
  gas_utility: string
  electric_utility: string
  paperless_billing: boolean
  special_considerations: string[]
  home_features: string[]
  notes: string
  manual_j_complete: boolean
  ma: {
    primary_residence: boolean
    energy_audit: string
    recommendations_complete: string
    certificate_of_completion: string
    heat_loan_status: string
    whole_home_verification: string
  }
  co: { efficiency: string; xcel_whole_home: boolean }
  nwco: { hear_amount: string; energy_smart: boolean }
}

export interface ExistingSystems {
  project_id: number
  heating: { type: string; age: string }
  cooling: { type: string; age: string; capacity: number | null }
  water_heater: { type: string; age: string; capacity: number | null }
  panel: { location: string; amp: number | null; open_spaces: number | null }
  subpanels: { location: string; amp: number | null; open_spaces: number | null }[]
  other: string[]
  notes: string
}

/** proposals_new.proposal_status, as used by the Retool `statuses` function. */
export type ProposalStatus = 'pending' | 'under review' | 'out for review' | 'out for signature' | 'finalized' | 'rejected'

export interface Proposal {
  id: number
  project_id: number
  nickname: string
  pricing_structure: string
  status: ProposalStatus
  target_margin: number
  created_at: string
}

export type SystemType =
  | 'hvac' | 'water heater' | 'ev' | 'cooktop' | 'panel' | 'energy efficiency' | 'maintenance' | 'labor warranty' | 'adder'
  /** Catch-all system every proposal has; permits and other proposal-level lines live here. */
  | 'other'

/** Details captured when a system on a finalized proposal is deleted through a change order. */
export interface ChangeOrderDetails {
  description: string
  reason: string
  impact: string
  timeline: string
  requester: string
  responsible: string
  customerConsent: boolean
  installerConsent: boolean
}

export interface SystemRec {
  id: number
  proposal_id: number
  system_type: SystemType
  nickname: string
  scope: 'base' | 'co_system'
  /** systems_new.system_status. 'proposed' is the value seen in Retool. */
  status?: string
  target_margin?: number | null
  rebate_eligibility_type?: string
  /** systems_new.heating_load_coverage: '<50%' | '50%-80%' | '80%+' (HVAC in Colorado). */
  heating_load_coverage?: string | null
  rebate_effective_date?: string
  created_at?: string
  /** Engine-side system fields kept so Recalculate can run later (system_type_detail, ahri_id...). */
  engine?: Record<string, unknown>
  /** True when equipment in this system is low in stock. */
  stock_alert?: boolean
  /** Set when the system is waiting to be deleted through a change order. */
  change_order?: ChangeOrderDetails
  /** Payload sent to the spec engine; kept so the system can be edited and re-specced. */
  input: Record<string, unknown>
}

export type LineItemType = 'equipment' | 'labor' | 'permit' | 'incentive' | 'discount' | 'fee' | 'maintenance' | 'margin' | 'financing fees'

export interface LineItemRec {
  id: number
  system_id: number
  line_item_type: LineItemType
  description: string
  quantity: number
  /** Customer price for the line (per unit). Negative for incentives and discounts. */
  price_actual: number
  /** Internal cost per unit, when known. */
  cost: number | null
  equipment_provider?: string
  location?: string
  is_manual?: boolean
  note?: string
  /** Catalog references kept from the engine so later steps (permits, repricing) can use them. */
  equipment_id?: number | null
  labor_id?: number | null
  permit_id?: number | null
  /** Retool 'Circuit detail' column, e.g. "50 ft, difficult". */
  circuit?: string
  /** Retool 'Margin amount' column: this line's share of the Elephant Margin line. */
  margin_amount?: number
  /** Per-line margin override; falls back to the system target margin. */
  margin_percent?: number | null
  /** False when the line is excluded from margin. */
  margin_to_include?: boolean
  incentive_id?: number | null
  /** 'elephant' | 'customer' | 'homeowner'. Customer incentives are paid directly and appear in the invoice footer. */
  incentive_recipient?: string
  adjustment_reason?: string
  /** Retool 'Assigned Units' / 'Branch Box Assigned' columns (HVAC lines). */
  assigned_units?: string
  branch_box?: string
  /** Retool 'Show in proposal?' column. Undefined means shown. */
  show_in_proposal?: boolean
  maintenance_plan_id?: number | null
  /** line_items_new.status: 'proposed - from change order', 'active - from finalized proposal' or 'pending deletion'. */
  status?: string
  /** line_items_new.change_order_details, set when the line was added or is being removed through a change order. */
  change_order_details?: ChangeOrderDetails
}

export type InvoiceType = 'First Deposit' | 'Second Deposit' | 'Final Invoice'
/** invoices_new.invoice_status values used by the Retool `statuses` function. */
export type InvoiceStatus = 'not sent' | 'open' | 'paid' | 'void' | 'draft'

export interface Invoice {
  id: number
  project_id: number
  invoice_type: InvoiceType
  invoice_status: InvoiceStatus
  invoice_amount: number
  payment_type: 'ACH' | 'Card'
  /** 'customer' = send to customer, 'finalize' = finalize without sending. */
  finalizing_method: 'customer' | 'finalize'
  memo: string
  footer: string
  notes: string
  evergreen: boolean
  stripe_invoice_id?: string
  created_at: string
  approved_at?: string
  sent_at?: string
  paid_at?: string
}

export interface InvoiceLine {
  id: number
  invoice_id: number
  line_item_type: string
  name: string
  amount: number
  system_id?: number | null
}

/** deposit_config: what was chosen when the invoices were generated, so later regeneration keeps the deposit. */
export interface DepositConfig {
  first_deposit_pct: number
  first_deposit_amount_custom: number
  first_card_fees: boolean
  final_card_fees: boolean
  upfront_discount: boolean
}

export interface ProjectBundle {
  project: Project
  house: House | null
  existing: ExistingSystems
  proposals: Proposal[]
  systems: SystemRec[]
  lineItems: LineItemRec[]
  invoices: Invoice[]
  invoiceLines: InvoiceLine[]
  depositConfig: DepositConfig | null
}

export interface ProjectListItem {
  id: number
  first_name: string
  last_name: string
  customer: string
  deal_title: string
  install_start: string
  closed_at: string
  address: string
  city: string
  state: string
  status: ProjectStatusName
  proposal_status: ProposalStatus | null
  hca: string
  pm: string
  proposal_total: number | null
  updated_at: string
  blocker: string
}

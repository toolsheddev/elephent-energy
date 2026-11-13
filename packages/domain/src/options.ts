/* Dropdown values. In Retool these come from the `dropdowns` query folder and Postgres enums;
   until the API serves them they are defined here. */

export const US_STATES = ['CO', 'MA', 'NY', 'WA', 'IL', 'MN', 'CT', 'NJ']

export const COUNTIES_BY_STATE: Record<string, string[]> = {
  CO: ['Boulder County', 'Denver County', 'Larimer County', 'Jefferson County', 'Routt County', 'Eagle County'],
  MA: ['Middlesex County', 'Suffolk County', 'Norfolk County', 'Essex County', 'Worcester County'],
  NY: ['Westchester County', 'Albany County', 'Tompkins County'],
  WA: ['King County', 'Pierce County'],
  IL: ['Cook County', 'DuPage County'],
  MN: ['Hennepin County', 'Ramsey County'],
  CT: ['Fairfield County', 'Hartford County'],
  NJ: ['Bergen County', 'Essex County'],
}

export const HOME_TYPES = ['Single family', 'Townhome', 'Duplex', 'Condo', 'Multifamily (2–4 units)', 'Mobile home']
export const GAS_UTILITIES = ['Xcel Energy', 'Black Hills Energy', 'Eversource', 'National Grid', 'Columbia Gas', 'None / propane']
export const ELECTRIC_UTILITIES = ['Xcel Energy', 'Eversource', 'National Grid', 'Holy Cross Energy', 'Yampa Valley Electric', 'Platte River Power']
export const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((value, i) => ({ value, label: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][i]! }))
export const MOVE_IN_YEARS = Array.from({ length: 40 }, (_, i) => String(2026 - i))
export const SPECIAL_CONSIDERATIONS = ['Historic district', 'HOA approval', 'Limited attic access', 'Slab foundation', 'Knob-and-tube wiring', 'Aluminum wiring', 'Septic']
export const HOME_FEATURES = ['Finished basement', 'Crawlspace', 'Attic', 'Garage', 'Solar PV', 'Pool', 'Radiant floors', 'Ductwork present']

/** Postgres enum `project_status*`, as shown in the Retool status dropdown. The dropdown scrolls, so values after
 *  'Project Complete' may exist; this is the part visible in the screenshot. */
export const PROJECT_STATUSES = [
  'open', 'lost', 'won', 'Needs Dispatching', 'Dispatched', 'Scheduling in Progress', 'Scheduled',
  'Installation in Progress', 'Installed', 'Needs Inspection', 'Project Complete',
] as const
export const PROPOSAL_STATUS_ORDER = ['finalized', 'out for signature', 'out for review', 'pending', 'rejected'] as const

/* Customer fields, copied from the Retool page. Source values are Salesforce PersonLeadSource values; where Retool shows a different label it is given here
   ("Ambassador" is shown as "Referral"). */
const SOURCE_LABELS: Record<string, string> = {
  Ambassador: 'Referral', ContractorList: 'Contractor List', DirectMail: 'Direct Mail', NewsPress: 'News / Press', WordOfMouth: 'Word of Mouth', YardSign: 'Yard Sign',
}
export const SOURCES = [
  'Ambassador', 'Blog', 'Bulk Buys', 'Community/Non Profit', 'Community Stipend', 'ContractorList', 'DirectMail', 'Email', 'Event', 'Google Ads', 'Lead Partners', 'NewsPress',
  'Newsletter', 'OOH', 'Organic Search', 'Organic Social', 'Paid Social', 'Phone', 'Print Ad', 'Program Implementer', 'Solar Partners', 'Sponsored Articles', 'Sponsorship',
  'Van/Car Wrap', 'Web Direct', 'Webinars', 'WordOfMouth', 'YardSign',
].map((value) => ({ value, label: SOURCE_LABELS[value] ?? value }))
/** The source that asks "Referred by" instead of a source detail (Retool hides Source Detail when the label is Referral). */
export const REFERRAL_SOURCES = ['Ambassador']
export const SOURCE_DETAILS = [
  'Abode', 'Billboard', 'Bing', 'Boston Globe', 'Boston Moms', 'Boulder County EnergySmart', 'Bus', 'Carbon Free Homes', 'Central Park United Neighbors', 'CJCA', 'Clean Earth',
  'CLEAR Result', 'Colorado Energy Office', 'Colorado Sun', 'DuckDuckGo', 'Electrify Brookline', 'EnergySage', 'EOC', 'Evergreen Referral', 'Evergreen Solar',
  'External Event/Webinar/Sponsorship', 'Facebook', 'Friend/Family/Colleague', 'Going for a Drive', 'Google', 'Great Sky Solar', 'Green Newton', 'Groundwork Denver', 'IChoosr',
  'Inbound Call', 'Instagram', 'Internal Event/Webinar/Sponsorship', 'Laminar', 'LinkedIn', 'Mailchimp', 'Mass Save', 'Meta', 'Mitsubishi', 'Namaste', 'Nexis', 'Nextdoor',
  'Outbound Call', 'Palmetto', 'Pardot (Marketing Cloud Account Engagement)', 'QuitCarbon', 'Radio', 'Reddit', 'Referral Code', 'Rewiring America', 'Rocky Mountain Institute',
  'Sierra Club', 'SmartWave', 'Sun Day', 'SWEEP', 'The Cool Down', 'TikTok', 'Xcel', 'Yahoo',
]
export const MAINTENANCE_INTEREST = [
  { value: 'Unknown', label: 'Unknown Interest in Maintenance' }, { value: 'Not Interested', label: 'Not Interested in Maintenance' },
  { value: 'Interested', label: 'Interested in Maintenance' }, { value: 'Scheduled', label: 'Scheduled for Maintenance' },
]
/** Retool's "Prospective systems" (Salesforce products). */
export const SYSTEMS_INTEREST = [
  'Ducted HP', 'Ductless HP', 'Aeroseal', 'Electrical Service Upgrade', 'EV Charging', 'HPWH', 'Induction Stove', 'Mixed HP', 'Other Electrical Upgrade', 'Panel Upgrade', 'Other', 'Maintenance',
]

export const INCOME_VERIFICATION = ['N/a', 'Processing', 'Qualified', 'Not qualified']
// The lenders on Retool's "Select lender" list
export const LENDERS = ['Synchrony', 'RENU - Westerra', 'RENU - Elevations', 'Xcel On-Bill', 'MassSave', 'Concert', 'GoGreen', 'Other']

/** Retool's Heating Load Coverage select (required for HVAC in Colorado) and the Massachusetts Rebate Type select (HVAC only). */
export const HEATING_LOAD_COVERAGE = ['<50%', '50%-80%', '80%+']
export const MA_REBATE_TYPES = [
  { value: 'whole', label: 'Whole Home' }, { value: 'partial', label: 'Partial Home, Partial Heating Load' },
  { value: 'partial_full_heating', label: 'Partial Home, Full Heating Load' }, { value: 'base', label: 'Base' }, { value: 'none', label: 'None' },
]

const YES_NO_NA = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'na', label: 'N/A' }]
export const MA_AUDIT = [
  { value: 'notComplete', label: 'Not complete, will NOT complete' }, { value: 'notScheduled', label: 'Not complete, not yet scheduled' }, { value: 'scheduled', label: 'Not complete, scheduled' },
  { value: 'exemptAge', label: 'Exempt, home built 2000+' }, { value: 'exemptWeath', label: 'Exempt, weatherization completed 2013+' }, { value: 'na', label: 'N/A' }, { value: 'Completed', label: 'Completed' },
]
export const MA_RECS = [
  { value: 'notComplete', label: 'Not complete, will NOT complete' }, { value: 'notScheduled', label: 'Not complete, not yet scheduled' }, { value: 'scheduled', label: 'Not complete, scheduled' },
  { value: 'exemptAge', label: 'Exempt, home built 2000+' }, { value: 'exemptAmt', label: 'Exempt, recommendations <$1000' }, { value: 'completed', label: 'Completed' }, { value: 'na', label: 'N/A' },
]
export const MA_COC = YES_NO_NA
export const MA_HEAT_LOAN = ['Unknown', 'Not Applying', 'Applying, Not Submitted', 'Application Submitted', 'Application Approved', 'Payment Received', 'Rejected']
export const MA_WHV = YES_NO_NA
export const CO_EFFICIENCY = [
  { value: 'notComplete', label: 'Not complete, will NOT complete' }, { value: 'scheduled', label: 'Not complete, will complete' }, { value: 'Completed', label: 'Completed' }, { value: 'na', label: 'N/A' },
]
export const HEAR_AMOUNTS = ['None', 'Up to $8,000', 'Up to $14,000']

/* Existing-system types, copied from Retool's cascading "type" pickers. The stored value is Retool's combined string (e.g. "furnace-gas-condensing");
   the label is the path through the cascade. */
type Leaf = { value: string; label: string; group: string }
const leaves = (top: string, rows: [value: string, ...path: string[]][]): Leaf[] =>
  rows.map(([value, ...path]) => ({ value, label: [top, ...path].filter(Boolean).join(' › '), group: top }))
const FUELS = ['gas', 'electric', 'oil', 'propane']
const COND: [string, string][] = [['condensing', 'condensing'], ['non_condensing', 'non-condensing'], ['unknown', 'unknown']]
const fuelLabel = (f: string) => (f === 'electric' ? 'electric resistance' : f)
export const HEATING_TYPES: Leaf[] = [
  ...FUELS.flatMap((f) => leaves('Furnace', [
    ...COND.map(([v, l]) => [`furnace-${f}-${v}`, fuelLabel(f), l] as [string, ...string[]]),
    [`furnace-${f}-`, fuelLabel(f)] as [string, ...string[]],
  ])),
  ...leaves('Boiler', [['boiler-gas', 'gas'], ['boiler-electric', 'electric resistance'], ['boiler-oil', 'oil'], ['boiler-propane', 'propane']]),
  ...leaves('Heat pump', [['heat_pump-electric', 'electric']]),
  ...leaves('Baseboard', [['baseboard-electric', 'electric resistance']]),
  ...leaves('Unknown', [['unknown-gas', 'gas'], ['unknown-electric', 'electric resistance'], ['unknown-oil', 'oil'], ['unknown-propane', 'propane'], ['unknown-unknown', 'unknown'], ['unknown-', '']]),
  { value: 'none', label: 'None', group: 'None' },
]
export const COOLING_TYPES: Leaf[] = [
  ...leaves('Central A/C', [['central_A/C-electric', 'electric']]),
  ...leaves('Swamp cooler', [['swamp_cooler-electric', 'electric']]),
  ...leaves('Window units', [['window_units-electric', 'electric']]),
  ...leaves('Heat pump', [['heat_pump-electric', 'electric']]),
  ...leaves('Unknown', [['unknown-electric', 'electric'], ['unknown-unknown', 'unknown'], ['unknown-', '']]),
  { value: 'none-', label: 'None', group: 'None' },
]
export const WATER_HEATER_TYPES: Leaf[] = [
  ...leaves('Tank', [['tank-electric', 'electric resistance'], ['tank-heat_pump', 'heat pump'], ['tank-gas', 'gas'], ['tank-propane', 'propane'], ['tank-other', 'other'], ['tank-unknown', 'unknown']]),
  ...leaves('Tankless', [['tankless-electric', 'electric resistance'], ['tankless-gas', 'gas'], ['tankless-propane', 'propane'], ['tankless-other', 'other'], ['tankless-unknown', 'unknown']]),
  ...leaves('Indirect', [['indirect-gas', 'gas'], ['indirect-oil', 'oil'], ['indirect-unknown', 'unknown']]),
  ...leaves('Unknown', [['unknown-electric', 'electric resistance'], ['unknown-gas', 'gas'], ['unknown-propane', 'propane'], ['unknown-other', 'other'], ['unknown-unknown', 'unknown'], ['unknown-', '']]),
]
export const EXISTING_OTHER = [
  { value: 'gasStove', label: 'Gas Stove' }, { value: 'gasDryer', label: 'Gas Dryer' }, { value: 'otherAppliances', label: 'Other Gas Appliances' },
  { value: 'evChargerInterest', label: 'Interested in EV Charger' }, { value: 'solarInterest', label: 'Interested in Solar' }, { value: 'hasSolar', label: 'Has Solar Already' },
]

/** Existing-system values saved before the lists matched Retool, mapped to Retool's. */
const LEGACY_HEATING: Record<string, string> = {
  'Natural gas furnace': 'furnace-gas-', 'Natural gas boiler': 'boiler-gas', 'Propane furnace': 'furnace-propane-', 'Oil boiler': 'boiler-oil', 'Electric baseboard': 'baseboard-electric',
  'Heat pump': 'heat_pump-electric', 'Wood stove': 'unknown-', Other: 'unknown-',
}
const LEGACY_COOLING: Record<string, string> = { None: 'none-', 'Central AC': 'central_A/C-electric', 'Window units': 'window_units-electric', 'Mini-split': 'heat_pump-electric', 'Evaporative cooler': 'swamp_cooler-electric' }
const LEGACY_WH: Record<string, string> = {
  'Natural gas tank': 'tank-gas', 'Natural gas tankless': 'tankless-gas', 'Electric tank': 'tank-electric', 'Heat pump water heater': 'tank-heat_pump', 'Propane tank': 'tank-propane', Oil: 'indirect-oil',
}
const LEGACY_OTHER: Record<string, string> = {
  'Gas range': 'gasStove', 'Gas dryer': 'gasDryer', 'Gas fireplace': 'otherAppliances', 'Pool heater': 'otherAppliances', 'EV charger': 'evChargerInterest', 'Solar PV': 'hasSolar', 'Battery storage': 'hasSolar',
}
export function normalizeExisting<E extends { heating: { type: string }; cooling: { type: string; capacity: number | null }; water_heater: { type: string }; other: string[] }>(e: E): E {
  const cap = e.cooling.capacity
  return {
    ...e,
    heating: { ...e.heating, type: LEGACY_HEATING[e.heating.type] ?? e.heating.type },
    // Retool records cooling capacity in BTU/hr; older values were tons
    cooling: { ...e.cooling, type: LEGACY_COOLING[e.cooling.type] ?? e.cooling.type, capacity: cap != null && cap > 0 && cap <= 20 ? cap * 12000 : cap },
    water_heater: { ...e.water_heater, type: LEGACY_WH[e.water_heater.type] ?? e.water_heater.type },
    other: [...new Set((e.other ?? []).map((x) => LEGACY_OTHER[x] ?? x))],
  }
}

export const PRICING_STRUCTURES = [
  { value: 'standard', label: 'Standard' },
  { value: 'ma_laminar', label: 'MA Laminar' },
  { value: 'ma_forge', label: 'MA Forge' },
  { value: 'la_standard', label: 'LA Standard' },
  { value: 'ichoosr_2026', label: 'iChoosr 2026' },
]

export const SYSTEM_TYPES: { value: string; label: string; hint: string }[] = [
  { value: 'hvac', label: 'Heat pump HVAC', hint: 'Condenser, air handlers, wall heads' },
  { value: 'water heater', label: 'Heat pump water heater', hint: 'HPWH with TMV and venting options' },
  { value: 'panel', label: 'Electrical upgrades', hint: 'Panel, subpanel, service' },
  { value: 'ev', label: 'EV charger', hint: 'Level 2 charger and circuit' },
  { value: 'cooktop', label: 'Induction wiring', hint: 'Circuit for induction cooktop' },
  { value: 'energy efficiency', label: 'Energy efficiency', hint: 'Audit, air sealing, insulation' },
  { value: 'maintenance', label: 'Maintenance plan', hint: 'Annual service plan' },
  { value: 'labor warranty', label: 'Labor warranty', hint: 'Extended labor coverage' },
  { value: 'adder', label: 'Other adder', hint: 'One-off labor or equipment line' },
]

export const HCAS = ['Allison Toth', 'Marcus Reed', 'Priya Nair', 'Dan Okafor', 'Michelle Cho', 'Brice Turner', 'Louis Park', 'Luke Hart']
export const PMS = ['Lena Ortiz', 'Chris Bell', 'Sam Whitfield']

export const FINALIZED_RULES_NOTE = 'These checks come from the "Must fill out…" warnings in the Retool app.'

/* Values saved before the lists matched Retool, mapped to the Retool ones so older projects still show their choices. */
const LEGACY_SYSTEMS: Record<string, string> = {
  'Heat pump HVAC': 'Ducted HP', 'Heat pump water heater': 'HPWH', 'Panel upgrade': 'Panel Upgrade', 'EV charger': 'EV Charging', 'Induction cooktop': 'Induction Stove', Weatherization: 'Other',
}
const LEGACY_SOURCE: Record<string, string> = { Web: 'Web Direct', Referral: 'Ambassador', 'Utility partner': 'Program Implementer', Contractor: 'ContractorList', Social: 'Organic Social', Other: 'Phone' }
const LEGACY_INTEREST: Record<string, string> = { Yes: 'Interested', Maybe: 'Unknown', No: 'Not Interested' }
export const normalizeSystemsInterest = (v: string[] | null | undefined) => [...new Set((v ?? []).map((x) => LEGACY_SYSTEMS[x] ?? x))]
export const normalizeSource = (v: string) => LEGACY_SOURCE[v] ?? v
export const normalizeMaintenanceInterest = (v: string) => LEGACY_INTEREST[v] ?? (v || 'Unknown')

/** Financing and rebate values saved before the lists matched Retool, mapped to Retool's. */
const L = (m: Record<string, string>) => (v: string) => m[v] ?? v
export const normalizeIncomeVerification = L({ 'Not required': 'N/a', Pending: 'Processing', 'Verified — under 80% AMI': 'Qualified', 'Verified — 80–150% AMI': 'Qualified', 'Verified — over 150% AMI': 'Not qualified', '': 'N/a' })
export const normalizeLenders = (v: string[]) => v.map(L({ RENU: 'RENU - Westerra' }))
const maAudit = L({ Scheduled: 'scheduled', 'Not started': 'notScheduled', 'Not applicable': 'na' })
const maRecs = L({ Yes: 'completed', 'In progress': 'scheduled', No: 'notComplete', 'Not applicable': 'na' })
const yesNoNa = L({ Yes: 'yes', No: 'no', 'Not applicable': 'na', Received: 'yes', Requested: 'no', 'Not started': 'no' })
const heatLoan = L({ 'Not applying': 'Not Applying', Applied: 'Application Submitted', Approved: 'Application Approved', Funded: 'Payment Received' })
const coEff = L({ Yes: 'Completed', No: 'notComplete', Unsure: 'na' })
export function normalizeMA<T extends Record<string, unknown>>(ma: T): T {
  const o: Record<string, unknown> = { ...ma }
  const f = (k: string, fn: (v: string) => string) => { if (typeof o[k] === 'string') o[k] = fn(o[k] as string) }
  f('energy_audit', maAudit); f('recommendations_complete', maRecs); f('certificate_of_completion', yesNoNa); f('heat_loan_status', heatLoan); f('whole_home_verification', yesNoNa)
  return o as T
}
export function normalizeCO<T extends Record<string, unknown>>(co: T): T {
  return typeof co.efficiency === 'string' ? { ...co, efficiency: coEff(co.efficiency) } : co
}

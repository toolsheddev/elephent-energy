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

// Retool HomeType
export const HOME_TYPES = ['Single Family', 'Multi Family', 'Townhouse', 'Condo']
export const GAS_UTILITIES = ['Xcel Energy', 'Black Hills Energy', 'Eversource', 'National Grid', 'Columbia Gas', 'None / propane']
export const ELECTRIC_UTILITIES = ['Xcel Energy', 'Eversource', 'National Grid', 'Holy Cross Energy', 'Yampa Valley Electric', 'Platte River Power']
export const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((value, i) => ({ value, label: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][i]! }))
// Retool moveInYear: _.range(1900, this year + 1). Newest first here so the common years are at the top.
export const MOVE_IN_YEARS = Array.from({ length: new Date().getFullYear() - 1899 }, (_, i) => String(new Date().getFullYear() - i))
// Retool specialConsiderations
export const SPECIAL_CONSIDERATIONS = [{ value: 'hoa', label: 'HOA' }, { value: 'historicalDistrict', label: 'Historical District' }, { value: 'none', label: 'None' }]
// Retool homeFeatures
export const HOME_FEATURES = [{ value: 'attic', label: 'Attic' }, { value: 'unfinishedBasement', label: 'Unfinished basement' }, { value: 'finishedBasement', label: 'Finished basement' }, { value: 'crawlspace', label: 'Crawlspace' }]

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
// Retool HEARAmount
export const HEAR_AMOUNTS = [{ value: 'none', label: 'None' }, { value: '50', label: '50%' }, { value: '100', label: '100%' }]

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

// Retool PricingStructure (Add a system)
export const PRICING_STRUCTURES = [
  { value: 'standard', label: 'CO (Standard) Pricing' }, { value: 'ma_forge', label: 'MA (Forge) Pricing' }, { value: 'ma_laminar', label: 'MA (Laminar) Pricing' },
  { value: 'la_standard', label: 'LA (Standard) Pricing' }, { value: 'ichoosr_2026', label: 'iChoosr2026' }, { value: 'la_redeemer', label: 'LA Redeemer 2026' },
]
// Retool PricingStructure3 (Base Design quick add): five structures, shorter labels
export const PRICING_STRUCTURES_QUICK_ADD = [
  { value: 'standard', label: 'CO' }, { value: 'ma_forge', label: 'MA' }, { value: 'ma_laminar', label: 'MA (Laminar) Pricing' }, { value: 'la_standard', label: 'CA' }, { value: 'ichoosr_2026', label: 'iChoosr2026' },
]

/** Retool costSystemType, same order and labels (Retool spells "Energy Efficency"; corrected here). The maintenance plan has its own dialog in Retool too. */
export const SYSTEM_TYPES: { value: string; label: string; hint: string }[] = [
  { value: 'hvac', label: 'Heat Pump', hint: 'Condenser, air handlers, wall heads' },
  { value: 'water heater', label: 'Water Heater', hint: 'HPWH with TMV and venting options' },
  { value: 'ev', label: 'EV Charger', hint: 'Level 2 charger and circuit' },
  { value: 'energy efficiency', label: 'Energy Efficiency', hint: 'Audit, air sealing, insulation' },
  { value: 'cooktop', label: 'Induction Wiring', hint: 'Circuit for induction cooktop' },
  { value: 'panel', label: 'Electrical Upgrades', hint: 'Panel, subpanel, service' },
  { value: 'labor warranty', label: 'Labor Warranty', hint: 'Extended labor coverage' },
  { value: 'adder', label: 'Other', hint: 'One-off labor or equipment line' },
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

/* ---- Add a system: Retool's fixed lists ---- */
export const FINANCING_OPTIONS = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unsure', label: 'Unsure' }]
export const SURGE_OPTIONS = ['Single Circuit', 'Whole Home', 'Opt Out']
/** Retool AHULocationType3 / WHLocation4 */
export const EQUIPMENT_LOCATIONS = ['Mechanical Room', 'Attic', 'Basement', 'Crawlspace', 'Garage', 'Closet']
/** Retool CircuitLengthCondenser3 / CircuitLengthAHU3: the value is the length the pricing uses */
export const CIRCUIT_LENGTH_HP = [{ value: 15, label: 'Less than 15 feet' }, { value: 25, label: '15 to 40 feet' }, { value: 40, label: 'Over 40 feet' }]
/** Retool CircuitLengthHPWH3 */
export const CIRCUIT_LENGTH_HPWH = [{ value: 10, label: 'Less than 10 feet' }, { value: 15, label: '10 to 25 feet' }, { value: 25, label: 'Over 25 feet' }]
/** Retool PlugOrHardwiredEV3 */
export const EV_CONNECTION = [{ value: 'NEMA 14-50', label: 'NEMA 14-50 Plug' }, { value: 'Disconnect', label: 'Hardwired w/Disconnect' }]
/** Retool laborWarrantyLength / laborWarrantyLength2 */
export const LABOR_WARRANTY_HP = [{ value: 2, label: '2 Years' }, { value: 5, label: '5 Years' }, { value: 10, label: '10 Years' }, { value: 12, label: '12 Years' }]
export const LABOR_WARRANTY_HPWH = [{ value: 10, label: '10 Years' }]
/** Retool change order selects (requester2, responsible2, impact2, timeline2) */
export const CO_PARTIES = ['Elephant', 'Homeowner', 'HVAC Installer', 'Plumbing Installer', 'Electrical Installer', 'Other']
export const CO_IMPACT = [
  { value: '1', label: 'No noticeable impact' }, { value: '2', label: 'Minor inconvenience or aesthetic impact' }, { value: '3', label: 'Some comfort impact' },
  { value: '4', label: 'Customer dissatisfaction' }, { value: '5', label: 'Project feasibility in question' },
]
export const CO_TIMELINE = [
  { value: '1', label: 'Negligible delay' }, { value: '2', label: 'Less than 1 day delay' }, { value: '3', label: '1-3 day delay' }, { value: '4', label: '4-7 day delay' }, { value: '5', label: 'Greater than 1 week delay' },
]

/** Home values saved before the lists matched Retool. Values with no Retool equivalent are kept as they are. */
const LEGACY_HOME_TYPE: Record<string, string> = { 'Single family': 'Single Family', Townhome: 'Townhouse', Duplex: 'Multi Family', 'Multifamily (2–4 units)': 'Multi Family' }
const LEGACY_FEATURE: Record<string, string> = { 'Finished basement': 'finishedBasement', Crawlspace: 'crawlspace', Attic: 'attic' }
const LEGACY_SPECIAL: Record<string, string> = { 'Historic district': 'historicalDistrict', 'HOA approval': 'hoa' }
export function normalizeHouseLists<H extends { home_type: string; home_features: string[]; special_considerations: string[] }>(h: H): H {
  return {
    ...h,
    home_type: LEGACY_HOME_TYPE[h.home_type] ?? h.home_type,
    home_features: [...new Set(h.home_features.map((x) => LEGACY_FEATURE[x] ?? x))],
    special_considerations: [...new Set(h.special_considerations.map((x) => LEGACY_SPECIAL[x] ?? x))],
  }
}
export const normalizeHear = (v: string) => (v === 'None' ? 'none' : v)

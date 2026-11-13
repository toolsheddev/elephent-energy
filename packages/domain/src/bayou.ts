/* Bayou eligibility and the "Request bills & photos" wording. Port of Retool's bayou_eligibility.sql and the text widgets in the utility request modal.
   Bayou pulls the customer's utility bills directly; a customer is only eligible when the rules below hold, otherwise they are asked for PDF bills or photos. */
import type { ExistingSystems, House } from './types'

export interface UtilityLookup { utility_name: string; bayou_utility_name: string | null }

export interface BayouResult {
  is_eligible_for_bayou: boolean
  sizing_method: 'heating' | 'cooling'
  days_in_home: number | null
  bayou_gas_utility_name: string | null
  bayou_electric_utility_name: string | null
  /** why the customer is not (or not simply) eligible; null when nothing is wrong */
  bayou_rejection_reason: string | null
  /** the label of the alternative button Retool shows */
  alternative_option: 'Request PDF bills' | "I'll do a Manual J" | 'Send Bayou anyways' | null
}

/** The fuel of an existing system from its combined type ("furnace-gas-condensing" -> "gas"). Empty when unknown. */
export function existingFuel(type: string): string {
  const t = type.toLowerCase().replace(/_/g, ' ')
  if (t.includes('heat pump')) return 'heat pump'
  if (t.includes('gas')) return 'gas'
  if (t.includes('oil')) return 'oil'
  if (t.includes('propane')) return 'propane'
  if (t.includes('electric') || t.includes('baseboard')) return 'electric'
  return ''
}

const DAY = 86_400_000

export function bayouEligibility(args: { house: Pick<House, 'state' | 'move_in_year' | 'move_in_month' | 'paperless_billing' | 'gas_utility' | 'electric_utility'>; existing: ExistingSystems; utilities: UtilityLookup[]; now?: Date }): BayouResult {
  const { house, existing, utilities } = args
  const bayouName = (name: string) => utilities.find((u) => u.utility_name === name)?.bayou_utility_name ?? null
  const gas = house.gas_utility ? bayouName(house.gas_utility) : null
  const electric = house.electric_utility ? bayouName(house.electric_utility) : null
  const heatingFuel = existingFuel(existing.heating.type)
  const coolingFuel = existing.cooling.type.toLowerCase().includes('electric') ? 'electric' : ''
  // Retool: California homes with electric cooling are sized on cooling, everything else on heating
  const sizing: 'heating' | 'cooling' = house.state === 'CA' && coolingFuel === 'electric' ? 'cooling' : 'heating'

  const moveIn = house.move_in_year && house.move_in_month ? new Date(`${house.move_in_year}-${house.move_in_month}-01T00:00:00Z`) : null
  const now = args.now ?? new Date()
  // DATE_PART('day', now() - move_in_date) is the whole days of the interval
  const days = moveIn ? Math.floor((now.getTime() - moveIn.getTime()) / DAY) : null
  const longEnough = days !== null && days >= 270
  const paperless = !!house.paperless_billing

  const eligible = (longEnough && paperless && sizing === 'heating' && gas !== null) || (longEnough && paperless && sizing === 'cooling' && electric !== null)

  // The CASE branches run in this order and the first match wins (a null comparison counts as no match)
  const unsupported = (sizing === 'heating' && gas === null) || (sizing === 'cooling' && electric === null)
  let reason: string | null = null
  let alt: BayouResult['alternative_option'] = null
  if (!paperless) { reason = 'Does not have paperless billing'; alt = 'Request PDF bills' }
  else if (sizing === 'heating' && heatingFuel !== '' && heatingFuel !== 'gas') { reason = 'Existing heating is not gas'; alt = "I'll do a Manual J" }
  else if (unsupported) { reason = 'Utility not supported'; alt = 'Request PDF bills' }
  else if (days !== null && days < 270) { reason = 'Not in home long enough (9+ months)'; alt = "I'll do a Manual J" }
  else if (days === null) { reason = 'Provide a move in month and year to ensure customer has been in home long enough (9+ months)'; alt = 'Send Bayou anyways' }

  return { is_eligible_for_bayou: eligible, sizing_method: sizing, days_in_home: days, bayou_gas_utility_name: gas, bayou_electric_utility_name: electric, bayou_rejection_reason: reason, alternative_option: alt }
}

/** What the customer is asked to photograph (Retool text widget in the request modal). */
export function requestedPhotos(args: { subpanels: number; prospectiveSystems: string[]; heatingType: string; coolingType: string }): string[] {
  const has = (s: string) => args.prospectiveSystems.some((x) => x.includes(s))
  const ducted = has('Duct') || has('Mixed HP')
  const top = (t: string) => (t.split('-', 3)[0] ?? '').replaceAll('_', ' ')
  const out = ['panel']
  if (args.subpanels > 0) out.push('subpanel')
  if (has('HPWH')) out.push('water heater')
  if (ducted && args.heatingType && top(args.heatingType)) out.push(top(args.heatingType))
  if (ducted && args.coolingType && top(args.coolingType) === 'central A/C') out.push('A/C')
  return out
}

export const REQUEST_KINDS = [
  { value: 'bills', label: 'Request bills ONLY' }, { value: 'photos', label: 'Request photos ONLY' },
  { value: 'both', label: 'Request both bills + photos' }, { value: 'companycam', label: 'Send CompanyCam guest link' },
] as const
export type RequestKind = (typeof REQUEST_KINDS)[number]['value']

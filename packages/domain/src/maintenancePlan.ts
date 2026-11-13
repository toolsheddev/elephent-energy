/* Maintenance plan system. Port of Retool's specMaintPlan.js: a base plan, extra condensers, air handlers and heads beyond what the base
   covers, and add-ons, each priced from the maintenance plan rows. */
import { priceLineItems, type LineItem as EngineLineItem } from '@sd/engine'
import { fromEngineLine, refData, type NewLine } from './engine'

export interface MaintenanceCounts { condensers: number; ahus: number; heads: number; hpwhs: number; ervs: number; smartacs: number }

export const MAINTENANCE_LEVELS = (): string[] => [...new Set(refData.maintenancePlans.map((p) => p.plan_level as string | null | undefined).filter((l): l is string => !!l))]

export type MaintenancePlanOutcome = { ok: true; lines: NewLine[] } | { ok: false; errors: string[] }

function option(level: string | null, type: string) {
  const hits = refData.maintenancePlans.filter((o) => ((o.plan_level as string | null | undefined) ?? null) === level && o.type === type)
  if (hits.length === 0) throw new Error(`Did not find a maintenance plan option for plan level ${level} and type ${type}`)
  if (hits.length > 1) throw new Error(`Found multiple maintenance plan options for plan level ${level} and type ${type}`)
  return hits[0]
}

export function specMaintenancePlan(level: string, c: MaintenanceCounts, pricingStructure: string, date: string): MaintenancePlanOutcome {
  try {
    if (!level) throw new Error('You must specify a plan level to create a maintenance plan')
    if (!c.condensers || c.condensers < 1) throw new Error('Cannot create a maintenance plan without at least 1 HVAC system')
    if (!pricingStructure) throw new Error('No pricing structure found. Create a new system and select a pricing structure first.')
    const lines: EngineLineItem[] = []
    const add = (o: { id: number; name: string }, qty: number) => {
      for (let i = 0; i < Math.max(qty, 0); i++) lines.push({ maintenance_plan_id: o.id, line_item_type: 'maintenance plan', description: o.name } as unknown as EngineLineItem)
    }
    add(option(level, 'base'), 1)
    add(option(level, 'additional_condenser'), c.condensers - 1)
    add(option(level, 'additional_ahu'), c.ahus - c.condensers) // one air handler is included per condenser
    add(option(level, 'additional_head'), c.heads - (c.condensers - c.ahus) * 3) // three heads are included per condenser, after the air handlers
    add(option(null, 'addon_smartac'), c.smartacs)
    add(option(null, 'addon_hpwh'), c.hpwhs)
    add(option(null, 'addon_erv'), c.ervs)
    const priced = priceLineItems(lines, refData, { pricingStructure, pricingEffectiveDate: date })
    if (!priced.ok) return { ok: false, errors: priced.errors.map((e) => e.message) }
    if (priced.errors.length) return { ok: false, errors: priced.errors.map((e) => e.message) }
    return { ok: true, lines: priced.result.map(fromEngineLine) }
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] }
  }
}

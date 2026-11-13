/* Base Designs ("Quick Add"): a stored outdoor unit + indoor unit + thermostat that becomes a full system in one step.
   Mirrors Retool's run_quick_add_flow / specSystemDetailsWorkflow_QuickAdd: the system input is built from the base design row
   and a few switches, then runs through the same spec -> price -> margin and incentives chain as the Add System wizard. */
import { ahuUnit, makeSystemInput, type SystemInput } from '@sd/engine'
import { runSpec, toEngineHouse, type RecalcContext, type SpecOutcome } from './engine'

/** ahri_configurations, plus integrated_tmv from the indoor unit's equipment row. */
export interface BaseDesignRow {
  id: number
  nickname: string
  system_type: string
  pricing_structure: string
  ahri_number: string | null
  odu: number | null
  idu: number | null
  thermostat: number | null
  integrated_tmv?: boolean | null
}

export interface QuickAddOptions {
  /** target margin; Retool defaults the quick add margin to 30% */
  margin: number
  surgeProtection: 'Single Circuit' | 'Whole Home' | 'Opt Out'
  gfci: boolean
  condensatePump: boolean
  a2l: boolean
  attic: boolean
  tmv: boolean
  venting: boolean
  priceDate: string
  rebateDate: string
}

export const DEFAULT_QUICK_ADD: QuickAddOptions = {
  margin: 0.3, surgeProtection: 'Single Circuit', gfci: false, condensatePump: false, a2l: false, attic: false, tmv: false, venting: false, priceDate: '', rebateDate: '',
}

/** Retool maps the base design's pricing structure name onto the project's (CO -> standard, iChoosr -> ichoosr_2026, ...). */
export function mapPricingStructure(name: string | null | undefined): string {
  const p = name || 'standard'
  if (p.includes('CO')) return 'standard'
  if (p.includes('iChoosr')) return 'ichoosr_2026'
  if (p.includes('MA')) return 'ma_forge'
  if (p.includes('CA') || p.includes('LA')) return 'la_standard'
  return p
}

/** The system input the quick add workflow sends to the spec engine. */
export function baseDesignInput(row: BaseDesignRow, o: QuickAddOptions, pricing: string, proposalId: number, house: Parameters<typeof toEngineHouse>[0] | null): SystemInput {
  const type = row.system_type.toLowerCase()
  const circuit = pricing === 'ichoosr_2026' ? 15 : 25
  const hvac = type === 'hvac' && !!row.idu
  const base = makeSystemInput({
    mode: 'add system',
    targetMargin: o.margin,
    rebateEligibilityType: 'none',
    rebateEffectiveDate: o.rebateDate || undefined,
    system_status: 'proposed',
    cost_system_type: type,
    PricingStructure: pricing,
    PricingEffectiveDate: o.priceDate || new Date().toISOString().slice(0, 10),
    surgeProtection: o.surgeProtection === 'Opt Out' ? null : o.surgeProtection,
    heatPump: {
      condenser: {
        model: row.odu ?? null, location: null,
        electrical: { circuitLength: circuit, difficult: false, treehouseScoped: false }, serviceOutlet: { enabled: o.gfci },
      },
      kumoSetup: { spec: false, indoorUnitCount: row.idu ? 1 : 0 },
      ahu: {
        count: hvac ? 1 : 0,
        units: hvac ? [ahuUnit(row.idu, {
          location: (o.attic ? 'Attic' : null) as never,
          thermostat: { id: row.thermostat ?? null, model_number: null, accessory: { selected_index: null, id: null } },
          electrical: { circuit_length: circuit, difficult: false },
          complications: { complicated: false, condensatePump: { installed: o.condensatePump, circuit: false }, a2lVentilation: o.a2l },
        })] : [],
      },
      miniSplit: { units: [], count: 0, complications: { enabled: false } },
    },
    HPWH: {
      equipment: { model: type === 'water heater' ? row.idu ?? null : null, location: null },
      electrical: { circuitLength: 15, difficult: false, treehouseScoped: false },
      components: { locationAdder: false, complicationAdder: false, condensatePump: { installed: o.condensatePump, circuit: false }, tmv: o.tmv && !row.integrated_tmv, venting: o.venting, serviceOutlet: o.gfci },
    },
  })
  return house ? { ...base, specIncentives: { ...base.specIncentives, proposal_id: [proposalId], house: toEngineHouse(house) } } : base
}

/** Run one base design through the engine for one proposal. */
export function generateBaseDesign(rc: RecalcContext, row: BaseDesignRow, o: QuickAddOptions, pricing: string): { input: SystemInput; outcome: SpecOutcome } {
  const input = baseDesignInput(row, o, pricing, rc.proposalId, rc.house)
  return { input, outcome: runSpec(input, rc) }
}

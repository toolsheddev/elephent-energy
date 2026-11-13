import { refData } from '@sd/domain/engine'
import { DEFAULT_QUICK_ADD, generateBaseDesign, type BaseDesignRow } from '@sd/domain/baseDesign'
import type { ProjectBundle } from '@sd/domain/types'
import { pool, type Db } from './db'

export interface BaseDesignListRow extends BaseDesignRow {
  odu_model: string | null
  idu_model: string | null
  thermostat_model: string | null
}

/** Active base designs (ahri_configurations), with the model numbers behind the equipment ids. */
export async function listBaseDesigns(c: Db = pool): Promise<BaseDesignListRow[]> {
  const { rows } = await c.query(`
    select ac.id, ac.nickname, ac.system_type, ac.pricing_structure, ac.ahri_number, ac.odu, ac.idu, ac.thermostat, eq.integrated_tmv,
           odu.model_number as odu_model, idu.model_number as idu_model, th.model_number as thermostat_model
      from ahri_configurations ac
      left join equipment_new eq on eq.id = ac.idu
      left join equipment_new odu on odu.id = ac.odu
      left join equipment_new idu on idu.id = ac.idu
      left join equipment_new th on th.id = ac.thermostat
     where ac.active = true
     order by ac.system_type, ac.nickname`)
  return rows
}

const like = (pattern: string) => new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i')

/** SAMPLE base designs: pairs the AHRI certificates already in the catalog, plus the heat pump water heaters. Only combinations the engine can price are kept. */
export async function seedBaseDesigns(c: Db, sample: ProjectBundle) {
  if (!sample.house) return 0
  const rc = { project: sample.project, house: sample.house, existing: sample.existing, systems: [], lineItems: [], proposalId: -1 }
  const candidates: Omit<BaseDesignRow, 'id'>[] = []
  const seen = new Set<string>()

  for (const cert of refData.ahri) {
    if (cert.certification_type !== 'system' || !cert.fuzzy_parent_id_opt || !cert.fuzzy_child_id_opt || cert.fuzzy_child_id_opt === '%') continue
    const odu = refData.equipment.find((e) => e.equipment_type === 'Condenser' && e.active !== false && like(cert.fuzzy_parent_id_opt!).test(e.model_number ?? ''))
    const idu = refData.equipment.find((e) => e.equipment_type === 'AHU' && e.active !== false && like(cert.fuzzy_child_id_opt!).test(e.model_number ?? ''))
    if (!odu || !idu || seen.has(`${odu.id}-${idu.id}`)) continue
    seen.add(`${odu.id}-${idu.id}`)
    const mitsubishi = /^(SVZ|PVA|PVFY|MXZ|MUZ)/.test(idu.model_number ?? '')
    candidates.push({ nickname: `${odu.model_number} + ${idu.model_number}`, system_type: 'hvac', pricing_structure: 'standard', ahri_number: (cert.ahri_number as string | null) ?? null, odu: odu.id, idu: idu.id, thermostat: mitsubishi ? 173 : 170 })
  }
  for (const wh of refData.equipment.filter((e) => e.equipment_type === 'HPWH' && e.active !== false)) {
    candidates.push({ nickname: String(wh.model_number ?? wh.equipment_name).trim(), system_type: 'water heater', pricing_structure: 'standard', ahri_number: null, odu: null, idu: wh.id, thermostat: null })
  }

  let id = 1
  let hvac = 0
  for (const cand of candidates) {
    if (cand.system_type === 'hvac' && hvac >= 10) continue
    const { outcome } = generateBaseDesign(rc, { ...cand, id: 0 }, { ...DEFAULT_QUICK_ADD, priceDate: new Date().toISOString().slice(0, 10) }, 'standard')
    if (!outcome.ok) continue
    if (cand.system_type === 'hvac') hvac++
    await c.query('insert into ahri_configurations(id, active, ahri_number, idu, nickname, odu, pricing_structure, system_type, thermostat) values ($1,true,$2,$3,$4,$5,$6,$7,$8)',
      [id++, cand.ahri_number, cand.idu, cand.nickname, cand.odu, cand.pricing_structure, cand.system_type, cand.thermostat])
  }
  return id - 1
}

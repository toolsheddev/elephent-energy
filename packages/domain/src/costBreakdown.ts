/* Project cost breakdown: the table of costs, rebates and net cost, one column per proposal, that goes on the proposal.
   Port of Retool's projectCostBreakdown workflow (formProjectCostBreakDownTable.js). */
import { refData } from './engine'
import type { LineItemRec, ProjectBundle, SystemRec } from './types'

export interface CostBreakdownRow {
  label: string
  bold?: boolean
  italic?: boolean
  typeIndex?: number
  /** one entry per proposal, null where the proposal has no such line */
  values: (number | null)[]
}
export interface CostBreakdown { proposalIds: number[]; rows: CostBreakdownRow[] }

const SYSTEM_TYPE_DISPLAY: Record<string, string> = {
  hvac: 'Heat Pump', 'water heater': 'Heat Pump Water Heater', ev: 'EV Charger', solar: 'Solar Panels', panel: 'Electrical Upgrade',
  induction: 'Induction Wiring', cooktop: 'Induction Wiring', 'maintenance plan': 'Maintenance Plan', maintenance: 'Maintenance Plan', other: 'Permits',
  'energy efficiency': 'Energy Efficiency', 'labor warranty': 'Labor Warranty',
}
const SYSTEM_SORT = ['hvac', 'water heater', 'adder', 'maintenance plan', 'maintenance', 'labor warranty', 'other']
const KEY_LABELS = [
  { label: 'Total Cost', bold: true },
  { label: 'Total Point of Sale Rebates', bold: true, italic: true },
  { label: 'Out-of-Pocket Cost (Amount paid to Elephant or Financed)', bold: true },
  { label: 'Total Direct to Customer Incentives', bold: true, italic: true },
  { label: 'Net Cost', bold: true },
]
const KEY_ORDER = KEY_LABELS.map((k) => k.label)
const VISIBLE_SYSTEM_STATUSES = ['active - from change order', 'proposed', 'active']
const HIDDEN_LINE_STATUSES = ['proposed - from change order', 'deleted - from change order']

const round = (n: number) => Math.round(n)

function warrantyLabel(items: LineItemRec[], fallback: string): string {
  const names = items.filter((i) => i.line_item_type === 'labor' || (i.line_item_type as string) === 'labor warranty').map((i) => refData.labor.find((l) => l.id === i.labor_id)?.name ?? '')
  const has = (term: string) => names.some((n) => n.includes(term))
  if (!has('12 Years') && has('2 Years')) return '2 Years Extended Heat Pump Labor Warranty'
  if (has('5 Years')) return '5 Years Extended Heat Pump Labor Warranty'
  if (has('10 Years Extended')) return '10 Years Extended Heat Pump Labor Warranty'
  if (has('12 Years')) return '12 Years Extended Heat Pump Labor Warranty'
  return fallback || 'Labor Warranty'
}

interface Cost { label: string; value: number; typeIndex?: number; item?: LineItemRec }

function proposalCosts(b: ProjectBundle, proposalId: number, electricalBreakout: boolean): Cost[] {
  const equipmentById = new Map(refData.equipment.map((e) => [e.id, e]))
  const laborById = new Map(refData.labor.map((l) => [l.id, l]))
  const orderOf = (t: string) => { const i = SYSTEM_SORT.indexOf(t); return i === -1 ? SYSTEM_SORT.indexOf('adder') : i }
  const systems = b.systems.filter((s) => s.proposal_id === proposalId && VISIBLE_SYSTEM_STATUSES.includes(s.status ?? 'proposed')).sort((x, y) => orderOf(x.system_type) - orderOf(y.system_type))
  const lines = b.lineItems.filter((l) => (l.line_item_type as string) !== 'financing fees' && !(l.status && HIDDEN_LINE_STATUSES.includes(l.status)))

  const discounts: Cost[] = []
  let incentives: Cost[] = []
  let customerIncentives: Cost[] = []
  const typeIndex: Record<string, number> = {}
  let electricalCost = 0

  let costs: Cost[] = systems.flatMap((system: SystemRec): Cost[] => {
    const items = lines.filter((l) => l.system_id === system.id && l.line_item_type !== 'margin')
    let breakouts: Cost[] = []
    let totalSystemCost = 0
    const display = SYSTEM_TYPE_DISPLAY[system.system_type] ?? system.system_type
    const resolved = (system.system_type as string) === 'labor warranty' ? warrantyLabel(items, SYSTEM_TYPE_DISPLAY['labor warranty']) : null
    const priceOf = (i: LineItemRec) => round(i.price_actual * i.quantity + (i.margin_amount ?? 0)) // margin_amount is for the whole line
    const isElectrical = (i: LineItemRec) => electricalBreakout && i.line_item_type === 'labor' && laborById.get(i.labor_id ?? -1)?.category?.toLowerCase() === 'electrical'

    if (system.system_type === 'adder') {
      for (const item of items) {
        const price = priceOf(item)
        if (isElectrical(item)) electricalCost += price
        else {
          breakouts.push({ label: item.description, value: price, typeIndex: typeIndex[item.description] || 0, item })
          typeIndex[item.description] = (typeIndex[item.description] || 0) + 1
        }
      }
    } else {
      for (const item of items) {
        const price = priceOf(item)
        if (isElectrical(item)) electricalCost += price
        else if (item.line_item_type === 'incentive' && price <= 0 && item.incentive_recipient === 'elephant' && item.incentive_id !== 268) incentives.push({ label: `${item.description} (point of sale)`, value: price })
        else if (item.line_item_type === 'incentive' && price <= 0 && item.incentive_id !== 268) customerIncentives.push({ label: `${item.description} (direct to customer)`, value: price })
        else if (item.line_item_type === 'discount') discounts.push({ label: item.description, value: price })
        else if (item.show_in_proposal === true || (system.system_type as string) === 'labor warranty') { // Retool: only lines flagged for the proposal are broken out
          const label = resolved || item.description
          typeIndex[label] = (typeIndex[label] || 0) + 1
          breakouts.push({ label, value: price, typeIndex: 0, item }) // 0 so matching warranties line up across proposals
        } else totalSystemCost += price
      }

      // Consolidate: an accessory joins its parent equipment, repeated equipment and labor merge
      const merged = new Map<string, Cost>()
      for (const cur of breakouts) {
        const item = cur.item!
        const equip = equipmentById.get(item.equipment_id ?? -1)
        const effectiveLaborId = item.labor_id ?? equip?.labor_id ?? null
        const laborRef = laborById.get(effectiveLaborId ?? -1)
        const parent = refData.equipment.find((e) => Array.isArray(e.additional_equipment_ids) && e.additional_equipment_ids.includes(item.equipment_id ?? -1))
        const isWarranty = (system.system_type as string) === 'labor warranty' || (item.line_item_type as string) === 'labor warranty'
        let key: string
        let label = cur.label
        if (isWarranty) {
          if (String(effectiveLaborId) === '181') { key = 'labor-warranty-181'; label = item.description || resolved || SYSTEM_TYPE_DISPLAY['labor warranty'] }
          else { label = resolved || SYSTEM_TYPE_DISPLAY['labor warranty'] || 'Labor Warranty'; key = `labor-warranty-${label}` }
        } else if (parent) key = `equip-${parent.id}`
        else if (item.equipment_id) key = `equip-${item.equipment_id}`
        else if (item.labor_id) key = `labor-${item.labor_id}-${item.description}`
        else key = `line-${item.id}`
        if (!isWarranty && item.line_item_type === 'labor' && laborRef?.category === 'hvac') label = item.description
        if (label === 'Wall Head' && equip) label = `${label} (${equip.model_number || item.description?.split('|')[0]?.trim() || item.equipment_id})`
        const got = merged.get(key)
        if (got) got.value += round(cur.value)
        else merged.set(key, { label, value: round(cur.value), typeIndex: cur.typeIndex, item })
      }
      breakouts = [...merged.values()]
    }

    if ((system.system_type as string) === 'labor warranty' || totalSystemCost === 0) return breakouts
    const ti = typeIndex[system.system_type] || 0
    typeIndex[system.system_type] = ti + 1
    let label = system.nickname ? system.nickname : display
    if (ti > 0) label = `${label} ${ti + 1}`
    return [{ label, typeIndex: ti, value: totalSystemCost }, ...breakouts]
  })

  if (electricalBreakout && electricalCost > 0) costs.push({ label: 'Electrical Upgrades', value: electricalCost, typeIndex: 0 })
  costs = costs.concat(discounts)
  incentives = incentives.sort((a, z) => a.label.localeCompare(z.label))
  customerIncentives = customerIncentives.sort((a, z) => a.label.localeCompare(z.label))

  const totalCost = costs.reduce((t, c) => t + c.value, 0)
  costs.push({ label: 'Total Cost', value: totalCost })

  const rebate = 'Denver Cares Electrical Rebate'
  const consolidated = incentives.filter((i) => i.label.includes(rebate)).reduce((t, i) => t + i.value, 0)
  incentives = incentives.filter((i) => !i.label.includes(rebate))
  if (consolidated !== 0) incentives.push({ label: `${rebate} (point of sale)`, value: consolidated })

  costs = costs.concat(incentives)
  const totalIncentives = incentives.reduce((t, i) => t + i.value, 0)
  costs.push({ label: 'Total Point of Sale Rebates', value: totalIncentives })
  const outOfPocket = totalCost + totalIncentives
  costs.push({ label: 'Out-of-Pocket Cost (Amount paid to Elephant or Financed)', value: outOfPocket })
  costs = costs.concat(customerIncentives)
  const totalCustomer = customerIncentives.reduce((t, i) => t + i.value, 0)
  costs.push({ label: 'Total Direct to Customer Incentives', value: totalCustomer })
  costs.push({ label: 'Net Cost', value: outOfPocket + totalCustomer })

  return costs.filter((c) => c.value !== 0 || c.label === '10-Year Heat Pump Performance Guarantee' || c.label === 'Net Cost' || c.label === 'Out-of-Pocket Cost (Amount paid to Elephant or Financed)'
    || /promo|discount|warranty/i.test(c.label))
}

/** The breakdown across the given proposals, one column each. Rows that several proposals share line up; the five summary rows keep their order. */
export function projectCostBreakdown(b: ProjectBundle, proposalIds: number[], opts: { electricalBreakout?: boolean } = {}): CostBreakdown {
  const perProposal = proposalIds.map((id) => proposalCosts(b, id, !!opts.electricalBreakout))
  const rows: CostBreakdownRow[] = KEY_LABELS
    .filter((k) => perProposal.some((p) => p.some((l) => l.label === k.label)))
    .map((k) => ({ label: k.label, bold: k.bold, italic: (k as { italic?: boolean }).italic, typeIndex: 0, values: [] }))

  const insertIndex = (line: Cost, proposal: Cost[]): number => {
    let next: string | null = null
    for (let i = Math.max(0, proposal.findIndex((x) => x.label === line.label && x.typeIndex === line.typeIndex)); i < proposal.length; i++) {
      if (KEY_ORDER.includes(proposal[i].label)) { next = proposal[i].label; break }
    }
    if (next) { const at = rows.findIndex((r) => r.label === next); if (at !== -1) return at }
    return rows.length
  }

  perProposal.forEach((proposal, pi) => {
    for (const r of rows) r.values[pi] = null
    for (const line of proposal) {
      const key = KEY_LABELS.find((k) => k.label === line.label)
      const at = rows.findIndex((r) => r.label === line.label && (key ? true : r.typeIndex === line.typeIndex))
      if (at !== -1) rows[at].values[pi] = (rows[at].values[pi] ?? 0) + line.value
      else {
        const row: CostBreakdownRow = { label: line.label, bold: key?.bold, italic: (key as { italic?: boolean } | undefined)?.italic, typeIndex: line.typeIndex, values: Array(proposalIds.length).fill(null) }
        row.values[pi] = line.value
        rows.splice(insertIndex(line, proposal), 0, row)
      }
    }
  })
  return { proposalIds, rows }
}

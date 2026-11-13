import { useSearchParams } from 'react-router-dom'

/** The project is split into focused views; only one is on screen at a time. The current one lives in the URL (?view=), so it survives a refresh and can be linked. */
export const VIEWS = [
  ['overview', 'Overview'],
  ['customer', 'Customer and home'],
  ['existing', 'Existing systems'],
  ['design', 'Options and pricing'],
  ['financing', 'Financing'],
  ['invoices', 'Invoices'],
  ['handoff', 'Handoff and status'],
] as const
export type ViewId = (typeof VIEWS)[number][0]

/** Where each "before signing" check is filled in. */
export const VIEW_OF_CHECK: Record<string, ViewId> = {
  timeline: 'handoff', handoff: 'handoff', financing: 'financing', ma: 'financing',
  address: 'customer', panel: 'existing', heating: 'existing', wh: 'existing', systems: 'design',
}

export function useView() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('view')
  const view: ViewId = VIEWS.some(([id]) => id === raw) ? (raw as ViewId) : 'overview'
  const go = (v: ViewId, extra?: Record<string, string>) => {
    setParams((p) => { p.set('view', v); for (const [k, val] of Object.entries(extra ?? {})) p.set(k, val); return p })
    window.scrollTo({ top: 0 })
  }
  return { view, go }
}

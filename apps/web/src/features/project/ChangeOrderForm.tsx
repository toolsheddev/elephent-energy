import { Checkbox, Input, Select } from '@/components/ui/form'
import type { ChangeOrderDetails } from '@/lib/types'

/* NOTE: the option lists below are placeholders. In Retool they come from dropdown queries that are not in the export. */
export { CO_IMPACT, CO_PARTIES, CO_TIMELINE } from '@/lib/options'
import { CO_IMPACT, CO_PARTIES, CO_TIMELINE } from '@/lib/options'

export const blankChangeOrder = (): ChangeOrderDetails => ({
  description: '', reason: '', impact: '', timeline: '', requester: '', responsible: '', customerConsent: false, installerConsent: false,
})

export const changeOrderValid = (f: ChangeOrderDetails) => !!f.description.trim() && !!f.reason.trim()

/** The change-order fields Retool shows when a finalized proposal is edited. */
export function ChangeOrderFields({ value: f, onChange }: { value: ChangeOrderDetails; onChange: (v: ChangeOrderDetails) => void }) {
  const set = <K extends keyof ChangeOrderDetails>(k: K, v: ChangeOrderDetails[K]) => onChange({ ...f, [k]: v })
  return (
    <div className="grid grid-cols-12 gap-4">
      <Input wrapperClassName="col-span-12 sm:col-span-5" label="Description of changes" required value={f.description} onChange={(e) => set('description', e.target.value)} />
      <Input wrapperClassName="col-span-12 sm:col-span-4" label="Reason for changes" required value={f.reason} onChange={(e) => set('reason', e.target.value)} />
      <Select wrapperClassName="col-span-12 sm:col-span-3" label="Impact to customer" options={CO_IMPACT} value={f.impact} onChange={(e) => set('impact', e.target.value)} />
      <Select wrapperClassName="col-span-12 sm:col-span-4" label="Impact to timeline" options={CO_TIMELINE} value={f.timeline} onChange={(e) => set('timeline', e.target.value)} />
      <Select wrapperClassName="col-span-12 sm:col-span-4" label="Requester" options={CO_PARTIES} value={f.requester} onChange={(e) => set('requester', e.target.value)} />
      <Select wrapperClassName="col-span-12 sm:col-span-4" label="Responsible party ($)" options={CO_PARTIES} value={f.responsible} onChange={(e) => set('responsible', e.target.value)} />
      <Checkbox className="col-span-12 sm:col-span-6" label="Written installer consent" checked={f.installerConsent} onChange={(e) => set('installerConsent', e.target.checked)} />
      <Checkbox className="col-span-12 sm:col-span-6" label="Written customer consent" checked={f.customerConsent} onChange={(e) => set('customerConsent', e.target.checked)} />
    </div>
  )
}

import { useState } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { Banner, Button } from '@/components/ui/core'
import { Select } from '@/components/ui/form'
import { Modal, toast } from '@/components/ui/overlay'
import { useRequestUtilityData, useSaveProjectInfo, useUtilities } from '@/lib/hooks'
import type { ExistingSystems, House, Project } from '@/lib/types'
import { bayouEligibility, REQUEST_KINDS, requestedPhotos, type RequestKind } from '@sd/domain/bayou'

interface Values { project: Project; house: House; existing: ExistingSystems }

/** Retool's "Request bills & photos" modal: Bayou eligibility, what photos are asked for, and what to send. Uses the values on screen, and saves them first like Retool does.
 *  Nothing is emailed in this build; the request is recorded on the project. */
export function UtilityRequestDialog({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: number }) {
  const { control, getValues } = useFormContext<Values>()
  const house = useWatch({ control, name: 'house' })
  const existing = useWatch({ control, name: 'existing' })
  const systems = useWatch({ control, name: 'project.systems_interest' }) ?? []
  const { data: utilities = [] } = useUtilities()
  const save = useSaveProjectInfo(projectId)
  const request = useRequestUtilityData(projectId)
  const [kind, setKind] = useState<RequestKind | ''>('')
  const [busy, setBusy] = useState(false)

  const r = bayouEligibility({ house, existing, utilities })
  const photos = requestedPhotos({ subpanels: existing.subpanels.length, prospectiveSystems: systems, heatingType: existing.heating.type, coolingType: existing.cooling.type })

  const send = async (k: RequestKind, via: 'bayou' | 'email' | 'companycam') => {
    setBusy(true)
    try {
      // Retool saves the project before it sends anything
      await save.mutateAsync({ project: getValues('project'), house: getValues('house'), existing: getValues('existing') })
      await request.mutateAsync({ kind: k, via, photos: k === 'bills' ? [] : photos })
      toast.success('Request recorded', via === 'bayou' ? 'Bayou customer would be created (not connected in this build)' : via === 'companycam' ? 'CompanyCam guest link would be sent (not connected)' : 'The customer email would be sent (not connected)')
      setKind('')
      onClose()
    } finally { setBusy(false) }
  }
  const submit = () => {
    if (!kind) return
    // Retool: photos only, or a customer Bayou cannot serve, goes by email; CompanyCam sends the guest link; otherwise Bayou
    void send(kind, kind === 'photos' || !r.is_eligible_for_bayou ? 'email' : kind === 'companycam' ? 'companycam' : 'bayou')
  }
  const alt = r.alternative_option
  const altClick = () => {
    if (alt === 'Request PDF bills') void send('bills', 'email')
    else if (alt === 'Send Bayou anyways') void send('bills', 'bayou')
    else onClose() // "I'll do a Manual J": nothing is sent
  }

  return (
    <Modal
      open={open} onOpenChange={(o) => !o && onClose()} title="Request bills and photos" description="Ask the customer for what is needed to size the system." size="md"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!kind} loading={busy} onClick={submit}>Submit Request</Button></>}
    >
      <div className="space-y-4">
        <ul className="list-disc space-y-1.5 pl-5 text-[14px] text-ink-2">
          <li>Photos included in the request are {photos.join(', ')}.</li>
          <li>{r.is_eligible_for_bayou ? 'Customer is eligible for Bayou so can choose between that and uploading bills.' : `Customer will be asked for PDF bills: ${r.bayou_rejection_reason ?? 'not eligible'}.`}</li>
        </ul>
        {r.bayou_rejection_reason && alt && (
          <Banner tone="warn" title={r.bayou_rejection_reason} action={<Button size="sm" onClick={altClick} loading={busy}>{alt}</Button>}>
            {alt === "I'll do a Manual J" ? 'Close this and size the home with a Manual J instead.' : alt === 'Send Bayou anyways' ? 'Send Bayou anyway and check the bills once they arrive.' : 'Ask for PDF bills instead of connecting Bayou.'}
          </Banner>
        )}
        <Select label="What should we request?" options={[...REQUEST_KINDS]} value={kind} onChange={(e) => setKind(e.target.value as RequestKind | '')} placeholder="Select an option" />
        <p className="text-[12.5px] text-ink-3">The request is saved on the project. Email, Bayou and CompanyCam are not connected in this build.</p>
      </div>
    </Modal>
  )
}

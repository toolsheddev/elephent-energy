import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/core'
import { Input, Select } from '@/components/ui/form'
import { Modal, toast } from '@/components/ui/overlay'
import { api } from '@/lib/api'
import { HCAS, US_STATES } from '@/lib/options'

const blank = { firstName: '', lastName: '', email: '', phone: '', address: '', city: '', state: 'CO', zipcode: '', county: '', hca: '', dealTitle: '' }

/** Projects normally arrive from Salesforce. This creates one by hand with the minimum Retool needs: a customer, a home and a first proposal. */
export function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [f, setF] = useState(blank)
  useEffect(() => { if (open) setF(blank) }, [open])
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF((c) => ({ ...c, [k]: e.target.value }))
  const create = useMutation({
    mutationFn: () => api.createProject(f),
    onSuccess: async ({ id }) => {
      await qc.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Project created', `${f.firstName} ${f.lastName}`)
      onClose()
      nav(`/projects/${id}`)
    },
  })
  const valid = f.firstName.trim() && f.lastName.trim() && f.address.trim() && f.city.trim() && f.state

  return (
    <Modal
      open={open} onOpenChange={(o) => !o && onClose()} size="lg" title="New project"
      description="Creates the customer, the home and a first proposal. You can fill in the rest on the project."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} loading={create.isPending} onClick={() => create.mutate()}>Create project</Button></>}
    >
      <div className="grid grid-cols-12 gap-4">
        <Input wrapperClassName="col-span-12 sm:col-span-6" label="First name" required value={f.firstName} onChange={set('firstName')} />
        <Input wrapperClassName="col-span-12 sm:col-span-6" label="Last name" required value={f.lastName} onChange={set('lastName')} />
        <Input wrapperClassName="col-span-12 sm:col-span-6" label="Email" type="email" value={f.email} onChange={set('email')} />
        <Input wrapperClassName="col-span-12 sm:col-span-6" label="Phone" value={f.phone} onChange={set('phone')} />
        <Input wrapperClassName="col-span-12" label="Street address" required value={f.address} onChange={set('address')} />
        <Input wrapperClassName="col-span-12 sm:col-span-5" label="City" required value={f.city} onChange={set('city')} />
        <Select wrapperClassName="col-span-6 sm:col-span-3" label="State" required options={US_STATES} value={f.state} onChange={set('state')} />
        <Input wrapperClassName="col-span-6 sm:col-span-4" label="Zip" value={f.zipcode} onChange={set('zipcode')} />
        <Input wrapperClassName="col-span-12 sm:col-span-6" label="County" value={f.county} onChange={set('county')} />
        <Select wrapperClassName="col-span-12 sm:col-span-6" label="HCA" placeholder="Select…" options={HCAS} value={f.hca} onChange={set('hca')} />
        <Input wrapperClassName="col-span-12" label="Deal title" hint="Defaults to the customer's name." value={f.dealTitle} onChange={set('dealTitle')} />
      </div>
    </Modal>
  )
}

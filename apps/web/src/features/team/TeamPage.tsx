import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Banner, Button, Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/core'
import { Input, Select } from '@/components/ui/form'
import { MoreMenu } from '@/components/ui/menu'
import { Modal, toast } from '@/components/ui/overlay'
import { api, type Role, type SessionUser, type TeamMember } from '@/lib/api'
import { ConfirmDialog } from '../project/DesignTab'

const STATUS: Record<TeamMember['status'], { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-ok-bg text-ok' },
  invited: { label: 'Invited', cls: 'bg-info-bg text-info' },
  pending: { label: 'Waiting for approval', cls: 'bg-warn-bg text-warn' },
  blocked: { label: 'Blocked', cls: 'bg-bad-bg text-bad' },
}
const ROLES = [{ value: 'user', label: 'User' }, { value: 'admin', label: 'Admin' }]
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')

/** Admins: who has access, invite people, change their role, block or remove them. */
export function TeamPage() {
  const qc = useQueryClient()
  const me = qc.getQueryData<SessionUser>(['me'])
  const { data, isLoading, error } = useQuery({ queryKey: ['team'], queryFn: api.team, enabled: me?.role === 'admin' })
  const refresh = () => qc.invalidateQueries({ queryKey: ['team'] })
  const update = useMutation({ mutationFn: (a: { id: number; patch: { role?: Role; active?: boolean } }) => api.updateMember(a.id, a.patch), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (id: number) => api.removeMember(id), onSuccess: refresh })
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState<TeamMember | null>(null)

  if (me?.role !== 'admin') return <Navigate to="/" replace />

  return (
    <div className="space-y-4" style={{ animation: 'fade-in .2s' }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold leading-tight tracking-tight">Team</h1>
          <p className="text-[13px] text-ink-3">Everyone with a sign-in account is listed here. Invited people get a sign-in email; people who sign up on their own wait for approval. Removing someone takes their access away at once.</p>
        </div>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setInviting(true)}>Invite</Button>
      </div>

      {error && <Banner tone="bad" title="Could not load the team">{(error as Error).message}</Banner>}

      <Card>
        <CardHeader title="People" subtitle={data ? `${data.people.length} ${data.people.length === 1 ? 'person' : 'people'}` : undefined} />
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : !data?.people.length ? (
          <EmptyState title="Nobody yet" action={<Button variant="primary" onClick={() => setInviting(true)}>Invite</Button>}>Invite the first person by email.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13.5px]">
              <thead className="bg-canvas">
                <tr>{['Name', 'Email', 'Role', 'Status', 'Last sign-in', ''].map((h) => <th key={h} className="border-b border-line px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.people.map((p) => (
                  <tr key={p.email} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 font-medium">{p.name}{p.me && <span className="ml-2 text-[12px] font-normal text-ink-3">(you)</span>}</td>
                    <td className="px-4 py-2 text-ink-2">{p.email}</td>
                    <td className="px-4 py-1.5">
                      {p.me ? <span className="capitalize">{p.role}</span> : (
                        <Select aria-label={`Role of ${p.name}`} className="h-8 w-28" options={ROLES} value={p.role}
                          onChange={(e) => update.mutate({ id: p.id, patch: { role: e.target.value as Role } }, { onSuccess: () => toast.success('Role changed', `${p.name} is now ${e.target.value}`) })} />
                      )}
                    </td>
                    <td className="px-4 py-2"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold leading-none ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span></td>
                    <td className="px-4 py-2 text-ink-2">{fmt(p.lastSignIn)}</td>
                    <td className="px-3 py-1.5 text-right">
                      {!p.me && (
                        <MoreMenu label={`Actions for ${p.name}`} items={[
                          p.status === 'invited' && { label: 'Resend invite', onSelect: () => api.invite({ email: p.email, name: p.name, role: p.role }).then(() => toast.success('Invite sent', p.email), (e) => toast.error('Could not send', (e as Error).message)) },
                          p.status === 'pending' && { label: 'Approve', onSelect: () => update.mutate({ id: p.id, patch: { active: true } }, { onSuccess: () => toast.success('Approved', p.name) }) },
                          p.status === 'pending' ? false : p.status === 'blocked'
                            ? { label: 'Unblock', onSelect: () => update.mutate({ id: p.id, patch: { active: true } }, { onSuccess: () => toast.success('Unblocked', p.name) }) }
                            : { label: 'Block', onSelect: () => update.mutate({ id: p.id, patch: { active: false } }, { onSuccess: () => toast.success('Blocked', p.name) }) },
                          { kind: 'separator' },
                          { label: 'Remove', danger: true, onSelect: () => setRemoving(p) },
                        ]} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <InviteDialog open={inviting} onClose={() => setInviting(false)} onDone={refresh} />
      <ConfirmDialog
        open={!!removing} onClose={() => setRemoving(null)} title={`Remove ${removing?.name ?? ''}`}
        body="They lose access to System Design straight away. Projects that name them as project manager keep their name."
        confirmLabel="Remove"
        onConfirm={async () => { if (!removing) return; await remove.mutateAsync(removing.id); toast.success('Removed', removing.email); setRemoving(null) }}
      />
    </div>
  )
}

function InviteDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('user')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const close = () => { setEmail(''); setName(''); setRole('user'); setError(''); onClose() }
  const send = async () => {
    setBusy(true); setError('')
    try { await api.invite({ email, name, role }); toast.success('Invite sent', email); onDone(); close() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onOpenChange={(o) => !o && close()} title="Invite" description="They get a sign-in email. The first time, they choose a password." size="sm"
      footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" loading={busy} disabled={!email.trim()} onClick={send}>Send invite</Button></>}>
      <div className="space-y-3">
        <Input label="Email" type="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        <Select label="Role" options={[ROLES[0]!, { value: 'admin', label: 'Admin (can manage the team)' }]} value={role} onChange={(e) => setRole(e.target.value as Role)} />
        {error && <p role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-[13px] text-bad">{error}</p>}
      </div>
    </Modal>
  )
}

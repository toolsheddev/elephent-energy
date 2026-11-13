import clsx from 'clsx'
import { ArrowRight, Check, CheckCircle2, Circle, Trash2, TriangleAlert } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, CardHeader, EmptyState, Skeleton, StatusPill } from '@/components/ui/core'
import { toast } from '@/components/ui/overlay'
import { api } from '@/lib/api'
import { money, pct, readiness } from '@/lib/calc'
import { useProject } from '@/lib/hooks'
import type { ProjectBundle } from '@/lib/types'
import { ProjectStatusPill } from '../projects/ProjectsPage'
import { ConfirmDialog, DesignTab } from './DesignTab'
import { HearDialog } from './HearDialog'
import { InvoicesTab } from './InvoicesTab'
import { CustomerSection, ExistingSection, FinancingSection, HandoffSection, HomeSection, ProjectForm, SizingCard, StatusCard } from './ProjectTab'
import { QuotePanel } from './QuotePanel'
import { StageLine } from './StageLine'
import { isComplete, STAGES, stageOf, summarizeProposal } from './quote'
import { useView, VIEW_OF_CHECK, VIEWS, type ViewId } from './views'

function DealHeader({ b, onDelete }: { b: ProjectBundle; onDelete: () => void }) {
  const p = b.project
  return (
    <section className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-100 text-[13px] font-extrabold text-brand-700">{p.first_name[0]}{p.last_name[0]}</div>
        <div className="min-w-0 flex-1 basis-72">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[19px] font-extrabold leading-tight tracking-tight">{p.first_name} {p.last_name}</h1>
            <ProjectStatusPill status={p.project_status} />
            {p.blocker && <span className="inline-flex items-center gap-1.5 rounded-full bg-bad-bg px-2.5 py-1 text-[12.5px] font-semibold leading-none text-bad"><TriangleAlert className="size-3.5" /> Blocked: {p.blocker}</span>}
            <button type="button" aria-label="Delete project" title="Delete project" onClick={onDelete} className="cursor-pointer rounded-md p-1.5 text-ink-3 hover:bg-bad-bg hover:text-bad"><Trash2 className="size-4" /></button>
          </div>
          <p className="text-[13px] text-ink-3">{p.deal_title} · #{p.id}{b.house ? ` · ${b.house.city}, ${b.house.state}` : ''} · HCA {p.hca || '—'} · PM {p.pm || '—'}</p>
        </div>
        <div className="w-full sm:w-64">
          <p className="mb-1.5 text-right text-[12.5px] text-ink-3 max-sm:text-left">
            {isComplete(p.project_status) ? 'Complete' : <>Step {stageOf(b) + 1} of {STAGES.length} · <span className="font-semibold text-ink">{STAGES[stageOf(b)]}</span></>}
          </p>
          <StageLine current={stageOf(b)} complete={isComplete(p.project_status)} compact />
        </div>
      </div>
    </section>
  )
}

/** Left list of views, with a tick when the area is complete and an amber ring when something there is still missing. */
function ViewNav({ b, view, go }: { b: ProjectBundle; view: ViewId; go: (v: ViewId) => void }) {
  const open = useMemo(() => {
    const s = new Set<ViewId>()
    for (const c of readiness(b, b.proposals[0]?.id)) if (!c.ok) s.add(VIEW_OF_CHECK[c.id] ?? 'customer')
    if (b.project.blocker) s.add('handoff')
    return s
  }, [b])
  return (
    <nav aria-label="Project" className="flex gap-1 overflow-x-auto pb-1 lg:sticky lg:top-[84px] lg:grid lg:gap-0.5 lg:overflow-visible lg:pb-0">
      {VIEWS.map(([id, label]) => {
        const warn = open.has(id)
        const on = view === id
        const marker = id !== 'overview' && id !== 'invoices'
        return (
          <button
            key={id} type="button" onClick={() => go(id)} aria-current={on ? 'page' : undefined}
            className={clsx('flex min-h-9 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-[13.5px] leading-none transition-colors', on ? 'bg-brand-600 font-semibold text-white' : 'font-medium text-ink-2 hover:bg-sunken hover:text-ink')}
          >
            {marker ? (
              <span className={clsx('flex size-4 shrink-0 items-center justify-center rounded-full border-2', warn ? (on ? 'border-amber-300' : 'border-warn') : on ? 'border-white bg-white text-brand-600' : 'border-ok bg-ok text-white')} aria-label={warn ? 'Needs attention' : 'Done'}>
                {!warn && <Check className="size-2.5" strokeWidth={4} />}
              </span>
            ) : <span className="size-4 shrink-0" />}
            <span className="whitespace-nowrap">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

/** Overview: what needs doing, the options at a glance, and the key facts. Nothing to edit here, so it reads quickly. */
function OverviewView({ b, go }: { b: ProjectBundle; go: (v: ViewId, extra?: Record<string, string>) => void }) {
  const p = b.project, h = b.house
  const open = readiness(b, b.proposals[0]?.id).filter((c) => !c.ok)
  const facts: [string, string][] = [
    ['Phone', p.phone], ['Email', p.email], ['Address', h ? `${h.address}, ${h.city}, ${h.state} ${h.zipcode}` : ''],
    ['Advisor', p.hca], ['Project manager', p.pm], ['Prospective systems', p.systems_interest.join(', ')],
    ['Install', p.install_start ? `${p.install_start}${p.install_end ? ` to ${p.install_end}` : ''}` : ''],
  ]
  const req = p.statuses.utility_request
  const viewName = (id: string) => VIEWS.find(([v]) => v === (VIEW_OF_CHECK[id] ?? 'customer'))?.[1]
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <Card>
          <CardHeader title={open.length ? `Next steps (${open.length})` : 'Ready to finalize'} subtitle={open.length ? 'What is still missing before the proposal can be signed.' : 'Everything required is filled in.'} />
          {open.length ? (
            <ul className="divide-y divide-line">
              {open.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => go(VIEW_OF_CHECK[c.id] ?? 'customer')} className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-[13.5px] hover:bg-sunken">
                    <Circle className="size-4 shrink-0 text-warn" />
                    <span className="flex-1">{c.label}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold text-brand-700">{viewName(c.id)} <ArrowRight className="size-3.5" /></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="inline-flex items-center gap-2 text-[13.5px] text-ok"><CheckCircle2 className="size-4" /> Nothing missing</span>
              <Button size="sm" variant="primary" onClick={() => go('design')}>Options and pricing</Button>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Options" subtitle="Click one to open it." actions={<Button size="sm" onClick={() => go('design')}>Options and pricing</Button>} />
          {b.proposals.length === 0 ? <p className="px-4 py-3 text-[13.5px] text-ink-3">No options yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-[13.5px]">
                <tbody className="divide-y divide-line">
                  {b.proposals.map((pr) => {
                    const s = summarizeProposal(b, pr)
                    return (
                      <tr key={pr.id} onClick={() => go('design', { proposal: String(pr.id) })} className="cursor-pointer hover:bg-sunken">
                        <td className="px-4 py-2.5 font-medium">{pr.nickname || `Proposal ${pr.id}`}{p.finalized_proposal_id === pr.id && <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-[11.5px] font-semibold text-brand-700">Signed</span>}</td>
                        <td className="px-2 py-2.5"><StatusPill value={pr.status} /></td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-ink-3">{s.designed.length} {s.designed.length === 1 ? 'system' : 'systems'}</td>
                        <td className="num px-2 py-2.5 text-right text-ink-3">{s.designed.length ? pct(s.t.margin) : ''}</td>
                        <td className="num px-4 py-2.5 text-right font-semibold">{s.designed.length ? money(s.customer) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Key facts" actions={<Button size="sm" onClick={() => go('customer')}>Edit</Button>} />
        <dl className="divide-y divide-line text-[13.5px]">
          {facts.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-4 py-2">
              <dt className="text-ink-3">{k}</dt><dd className="min-w-0 break-words">{v || <span className="text-ink-3">—</span>}</dd>
            </div>
          ))}
          {req && (
            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-4 py-2">
              <dt className="text-ink-3">Bills and photos</dt>
              <dd>Requested {new Date(req.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ({req.kind}, by {req.via})</dd>
            </div>
          )}
        </dl>
      </Card>
    </div>
  )
}

export function ProjectPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [hearOpen, setHearOpen] = useState(false)
  const id = Number(useParams().projectId)
  const { data: b, isLoading, error } = useProject(id)
  const { view, go } = useView()

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-20 w-full rounded-lg" /><Skeleton className="h-96 w-full rounded-lg" /></div>
  }
  if (error || !b) {
    return <EmptyState title="Project not found" action={<Link to="/" className="font-semibold text-brand-600 underline">Back to projects</Link>}>We could not load project {id}.</EmptyState>
  }

  return (
    <div className="space-y-4" style={{ animation: 'fade-in .2s' }}>
      <ConfirmDialog
        open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete ${b.project.first_name} ${b.project.last_name}?`}
        body="The customer, home, proposals, systems, line items and invoices of this project are all removed. This cannot be undone."
        onConfirm={async () => {
          await api.deleteProject(b.project.id)
          await qc.invalidateQueries({ queryKey: ['projects'] })
          setConfirmDelete(false)
          toast.success('Project deleted')
          nav('/')
        }}
      />
      {b.proposals.length > 0 && <HearDialog open={hearOpen} onClose={() => setHearOpen(false)} bundle={b} proposalId={b.project.finalized_proposal_id ?? b.proposals[0]!.id} />}
      <ProjectForm bundle={b}>
        <div className="space-y-4">
          <DealHeader b={b} onDelete={() => setConfirmDelete(true)} />
          <div className="grid items-start gap-4 lg:grid-cols-[188px_minmax(0,1fr)]">
            <ViewNav b={b} view={view} go={go} />
            <div className="min-w-0" role="region" aria-label={VIEWS.find(([v]) => v === view)?.[1]}>
              {!b.house && view !== 'overview' && (
                <div className="mb-4"><EmptyState title="This project has no home record">Fill in the address under Customer and home to create it.</EmptyState></div>
              )}
              {view === 'overview' && <OverviewView b={b} go={go} />}
              {view === 'customer' && <div className="space-y-4"><CustomerSection /><HomeSection /><SizingCard /></div>}
              {view === 'existing' && <ExistingSection />}
              {view === 'design' && (
                <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_288px]">
                  <div className="min-w-0"><DesignTab bundle={b} /></div>
                  <QuotePanel bundle={b} />
                </div>
              )}
              {view === 'financing' && <FinancingSection />}
              {view === 'invoices' && (
                <InvoicesTab bundle={b} onHearInfo={() => setHearOpen(true)} />
              )}
              {view === 'handoff' && <div className="space-y-4"><HandoffSection /><StatusCard bundle={b} /></div>}
            </div>
          </div>
        </div>
      </ProjectForm>
    </div>
  )
}

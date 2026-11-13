import clsx from 'clsx'
import { Check, ChevronLeft, Mail, MapPin, Phone, Trash2, TriangleAlert } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState, Skeleton } from '@/components/ui/core'
import { toast } from '@/components/ui/overlay'
import { api } from '@/lib/api'
import { readiness } from '@/lib/calc'
import { useProject } from '@/lib/hooks'
import type { ProjectBundle } from '@/lib/types'
import { ProjectStatusPill } from '../projects/ProjectsPage'
import { ConfirmDialog, DesignTab } from './DesignTab'
import { InvoicesTab } from './InvoicesTab'
import { OptionCards } from './OptionCards'
import { CustomerSection, ExistingSection, FinancingSection, HandoffSection, HomeSection, ProjectForm, SizingCard, StatusCard } from './ProjectTab'
import { QuotePanel, jumpTo } from './QuotePanel'
import { StageLine } from './StageLine'
import { isComplete, stageOf } from './quote'

const SECTIONS = [
  ['sec-customer', 'Customer'], ['sec-home', 'Home'], ['sec-existing', 'Existing systems'], ['sec-design', 'Options and pricing'],
  ['sec-financing', 'Financing'], ['sec-invoices', 'Invoices'], ['sec-handoff', 'Handoff'], ['sec-status', 'Status and people'],
] as const

/** Which section each unmet "before signing" check belongs to. */
const SECTION_OF: Record<string, string> = {
  timeline: 'sec-handoff', handoff: 'sec-handoff', financing: 'sec-financing', ma: 'sec-financing',
  address: 'sec-home', panel: 'sec-existing', heating: 'sec-existing', wh: 'sec-existing', systems: 'sec-design',
}

function DealHeader({ b, onDelete }: { b: ProjectBundle; onDelete: () => void }) {
  const p = b.project
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-[16px] font-extrabold text-brand-700">{p.first_name[0]}{p.last_name[0]}</div>
        <div className="min-w-0 flex-1 basis-72">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[24px] font-extrabold leading-tight tracking-tight">{p.first_name} {p.last_name}</h1>
            <ProjectStatusPill status={p.project_status} />
            {p.blocker && <span className="inline-flex items-center gap-1.5 rounded-full bg-bad-bg px-2.5 py-1 text-[12.5px] font-semibold leading-none text-bad"><TriangleAlert className="size-3.5" /> Blocked: {p.blocker}</span>}
            <button type="button" aria-label="Delete project" title="Delete project" onClick={onDelete} className="cursor-pointer rounded-md p-1.5 text-ink-3 hover:bg-bad-bg hover:text-bad"><Trash2 className="size-4" /></button>
          </div>
          <p className="mt-0.5 text-[14px] text-ink-3">{p.deal_title} · #{p.id}</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13.5px] text-ink-2">
            {b.house && <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5 text-ink-3" />{b.house.address}, {b.house.city}, {b.house.state}</span>}
            {p.phone && <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5 text-ink-3" />{p.phone}</span>}
            {p.email && <span className="inline-flex items-center gap-1.5"><Mail className="size-3.5 text-ink-3" />{p.email}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full bg-sunken px-3 py-1.5 text-[13px] font-medium leading-none">HCA · {p.hca || 'unassigned'}</span>
          <span className="inline-flex items-center rounded-full bg-sunken px-3 py-1.5 text-[13px] font-medium leading-none">PM · {p.pm || 'unassigned'}</span>
        </div>
      </div>
      <div className="mt-5"><StageLine current={stageOf(b)} complete={isComplete(p.project_status)} /></div>
    </section>
  )
}

/** Left rail: every step of the deal, with a tick when it is done and a ring when something is still missing. Highlights the one in view. */
function JourneyRail({ b }: { b: ProjectBundle }) {
  const [active, setActive] = useState<string>(SECTIONS[0][0])
  const open = useMemo(() => {
    const s = new Set<string>()
    for (const c of readiness(b, b.proposals[0]?.id)) if (!c.ok) s.add(SECTION_OF[c.id] ?? 'sec-home')
    if (b.project.blocker) s.add('sec-status')
    return s
  }, [b])

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => { const v = entries.filter((e) => e.isIntersecting).sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top)[0]; if (v) setActive(v.target.id) },
      { rootMargin: '-90px 0px -60% 0px' },
    )
    SECTIONS.forEach(([id]) => { const el = document.getElementById(id); if (el) obs.observe(el) })
    return () => obs.disconnect()
  }, [])

  return (
    <nav aria-label="Sections" className="flex gap-1 overflow-x-auto pb-1 lg:sticky lg:top-[84px] lg:grid lg:gap-0.5 lg:overflow-visible lg:pb-0">
      {SECTIONS.map(([id, label]) => {
        const warn = open.has(id)
        return (
          <button
            key={id} type="button" onClick={() => jumpTo(id)} aria-current={active === id ? 'location' : undefined}
            className={clsx('flex min-h-10 shrink-0 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-left text-[14px] leading-none transition-colors', active === id ? 'bg-brand-50 font-semibold text-brand-700' : 'font-medium text-ink-3 hover:bg-sunken hover:text-ink')}
          >
            <span className={clsx('flex size-[18px] shrink-0 items-center justify-center rounded-full border-2', warn ? 'border-warn' : 'border-ok bg-ok text-white')} aria-label={warn ? 'Needs attention' : 'Done'}>
              {!warn && <Check className="size-3" strokeWidth={3.5} />}
            </span>
            <span className="whitespace-nowrap">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

/** `bare` sections hold cards that already carry their own heading, so the title is only there for screen readers and the rail. */
function Section({ id, title, hint, bare, children }: { id: string; title: string; hint?: string; bare?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-[84px] space-y-4">
      <div className={bare ? 'sr-only' : undefined}>
        <h2 id={`${id}-h`} className="text-[18px] font-extrabold tracking-tight">{title}</h2>
        {hint && <p className="text-[13.5px] text-ink-3">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

export function ProjectPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const id = Number(useParams().projectId)
  const { data: b, isLoading, error } = useProject(id)

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-40 w-full rounded-2xl" /><Skeleton className="h-96 w-full rounded-2xl" /></div>
  }
  if (error || !b) {
    return <EmptyState title="Project not found" action={<Link to="/" className="font-semibold text-brand-600 underline">Back to projects</Link>}>We could not load project {id}.</EmptyState>
  }

  return (
    <div className="space-y-5" style={{ animation: 'fade-in .2s' }}>
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
      <Link to="/" className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-ink-3 hover:text-brand-700"><ChevronLeft className="size-4" /> All projects</Link>
      <ProjectForm bundle={b}>
        <div className="space-y-5">
          <DealHeader b={b} onDelete={() => setConfirmDelete(true)} />
          <div className="grid items-start gap-5 lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_320px]">
            <JourneyRail b={b} />
            <div className="min-w-0 space-y-10">
              {!b.house && (
                <EmptyState title="This project has no home record">Fill in the address in the Home section to create it.</EmptyState>
              )}
              <Section id="sec-customer" bare title="Customer"><CustomerSection /></Section>
              <Section id="sec-home" bare title="Home"><HomeSection /><SizingCard /></Section>
              <Section id="sec-existing" bare title="Existing systems"><ExistingSection /></Section>
              <Section id="sec-design" title="Options and pricing" hint="Pick an option to work on its systems. The quote updates as you go.">
                <OptionCards bundle={b} />
                <DesignTab bundle={b} />
              </Section>
              <Section id="sec-financing" bare title="Financing and rebates"><FinancingSection /></Section>
              <Section id="sec-invoices" bare title="Invoices"><InvoicesTab bundle={b} /></Section>
              <Section id="sec-handoff" bare title="Handoff"><HandoffSection /></Section>
              <Section id="sec-status" bare title="Status and people"><StatusCard bundle={b} /></Section>
            </div>
            <QuotePanel bundle={b} className="lg:col-span-2 xl:col-span-1 xl:col-start-3 xl:row-start-1" />
          </div>
        </div>
      </ProjectForm>
    </div>
  )
}

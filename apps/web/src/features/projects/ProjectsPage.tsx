import type { ColumnDef } from '@tanstack/react-table'
import clsx from 'clsx'
import { AlertCircle, CalendarDays, LayoutGrid, MapPin, Plus, Rows3, Search, SearchX, User } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, EmptyState, Skeleton, StatusPill } from '@/components/ui/core'
import { DataTable } from '@/components/ui/table'
import { money } from '@/lib/calc'
import { useProjects } from '@/lib/hooks'
import type { ProjectListItem } from '@/lib/types'
import { StageLine } from '../project/StageLine'
import { isComplete, listStageOf } from '../project/quote'
import { NewProjectDialog } from './NewProjectDialog'

/** Status pill colours, so the stage is scannable. */
export function projectStatusClass(status: string) {
  const s = status.toLowerCase()
  if (s === 'lost') return 'bg-sunken text-ink-3'
  if (s === 'won' || s === 'installed' || s === 'project complete') return 'bg-ok-bg text-ok'
  if (s.startsWith('needs')) return 'bg-warn-bg text-warn'
  if (s === 'open') return 'bg-brand-100 text-brand-700'
  return 'bg-info-bg text-info'
}

export function ProjectStatusPill({ status }: { status: string }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold leading-none ${projectStatusClass(status)}`}>{status}</span>
}

const fmtDate = (iso: string) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')

type Filter = 'all' | 'blocked' | 'proposal' | 'signed' | 'install'
const FILTERS: { id: Filter; label: string; test: (r: ProjectListItem) => boolean; tone: string }[] = [
  { id: 'all', label: 'All projects', test: () => true, tone: 'text-ink' },
  { id: 'blocked', label: 'Needs attention', test: (r) => !!r.blocker, tone: 'text-bad' },
  { id: 'proposal', label: 'Proposal out', test: (r) => r.proposal_status === 'out for signature' || r.proposal_status === 'out for review', tone: 'text-brand-700' },
  { id: 'signed', label: 'Signed', test: (r) => listStageOf(r) === 3, tone: 'text-ok' },
  { id: 'install', label: 'In install', test: (r) => listStageOf(r) === 4 && !isComplete(r.status), tone: 'text-info' },
]

/** City and state, without repeating the state when the city already ends with it. */
const place = (r: ProjectListItem) => (r.state && !r.city.trim().toUpperCase().endsWith(r.state.toUpperCase()) ? `${r.city}, ${r.state}` : r.city)

function ProjectCard({ r, onOpen }: { r: ProjectListItem; onOpen: () => void }) {
  return (
    <button
      type="button" onClick={onOpen}
      className="flex min-w-0 cursor-pointer flex-col gap-3.5 rounded-2xl border border-line bg-surface p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-pop"
    >
      <span className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-[14px] font-extrabold text-brand-700">{r.first_name[0]}{r.last_name[0]}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-bold leading-tight">{r.first_name} {r.last_name}</span>
          <span className="block truncate text-[13px] text-ink-3">{r.deal_title}</span>
        </span>
        <ProjectStatusPill status={r.status} />
      </span>

      <StageLine current={listStageOf(r)} complete={isComplete(r.status)} compact />

      <span className="flex items-end justify-between gap-3">
        <span className="min-w-0 space-y-1 text-[13px] text-ink-2">
          <span className="flex items-center gap-1.5 truncate"><MapPin className="size-3.5 shrink-0 text-ink-3" /><span className="truncate">{place(r)}</span></span>
          <span className="flex items-center gap-1.5 truncate"><User className="size-3.5 shrink-0 text-ink-3" /><span className="truncate">{r.hca || 'No advisor yet'}</span></span>
          {r.install_start && <span className="flex items-center gap-1.5 truncate"><CalendarDays className="size-3.5 shrink-0 text-ink-3" />Install {fmtDate(r.install_start)}</span>}
        </span>
        <span className="shrink-0 text-right">
          <span className="num block text-[20px] font-extrabold leading-none tracking-tight">{r.proposal_total != null ? money(r.proposal_total) : '—'}</span>
          <span className="mt-1.5 block">{r.proposal_status ? <StatusPill value={r.proposal_status} /> : <span className="text-[12px] text-ink-3">No proposal</span>}</span>
        </span>
      </span>

      {r.blocker && (
        <span className="flex items-start gap-2 rounded-lg bg-bad-bg px-3 py-2 text-[13px] leading-snug text-bad">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 break-words">{r.blocker}</span>
        </span>
      )}
    </button>
  )
}

export function ProjectsPage() {
  const nav = useNavigate()
  const { data, isLoading } = useProjects()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [advisor, setAdvisor] = useState('')
  const [creating, setCreating] = useState(false)
  const [view, setView] = useState<'cards' | 'table'>(() => {
    try { return localStorage.getItem('sd-projects-view') === 'table' ? 'table' : 'cards' } catch { return 'cards' }
  })
  const setViewSaved = (v: 'cards' | 'table') => { setView(v); try { localStorage.setItem('sd-projects-view', v) } catch { /* ignore */ } }

  const rows = useMemo(() => data ?? [], [data])
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, rows.filter(f.test).length])) as Record<Filter, number>, [rows])
  const advisors = useMemo(() => [...new Set(rows.map((r) => r.hca).filter(Boolean))].sort(), [rows])
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const f = FILTERS.find((x) => x.id === filter)!
    return rows
      .filter((r) => f.test(r) && (!advisor || r.hca === advisor) && (!needle || `${r.id} ${r.deal_title} ${r.first_name} ${r.last_name} ${r.hca} ${r.status} ${r.address} ${r.city}`.toLowerCase().includes(needle)))
      .sort((a, b) => Number(!!b.blocker) - Number(!!a.blocker) || (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
  }, [rows, q, filter, advisor])

  const columns = useMemo<ColumnDef<ProjectListItem>[]>(() => [
    { accessorKey: 'id', header: 'ID', size: 80, meta: { align: 'right' }, cell: ({ getValue }) => <span className="font-semibold">{getValue<number>().toLocaleString()}</span> },
    {
      accessorKey: 'deal_title', header: 'Title',
      cell: ({ row: { original: r } }) => (
        <span className="inline-flex min-w-72 items-center gap-2 font-semibold text-ink">
          {r.deal_title}
          {r.blocker && <span title={r.blocker}><AlertCircle className="size-4 text-bad" aria-label={`Blocked: ${r.blocker}`} /></span>}
        </span>
      ),
    },
    { accessorKey: 'first_name', header: 'First' },
    { accessorKey: 'last_name', header: 'Last' },
    { accessorKey: 'hca', header: 'HCA' },
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <ProjectStatusPill status={getValue<string>()} /> },
    { accessorKey: 'proposal_total', header: 'Proposal', meta: { align: 'right' }, cell: ({ getValue }) => <span className="num font-semibold">{getValue<number | null>() != null ? money(getValue<number>()) : '—'}</span> },
    { accessorKey: 'install_start', header: 'Install date', cell: ({ getValue }) => <span className="text-ink-2">{fmtDate(getValue<string>())}</span> },
    {
      id: 'address', header: 'Address', accessorFn: (r) => `${r.address}, ${r.city}`,
      cell: ({ getValue }) => <span className="block max-w-[320px] truncate text-ink-2" title={getValue<string>()}>{getValue<string>()}</span>,
    },
  ], [])

  return (
    <div className="space-y-6" style={{ animation: 'fade-in .2s' }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-extrabold leading-tight tracking-tight">Projects</h1>
          <p className="mt-1 text-[14px] text-ink-3">
            <span className="num font-semibold text-ink-2">{filtered.length.toLocaleString()}</span> {filtered.length === 1 ? 'project' : 'projects'}
            {q && <> matching “{q}”</>}
          </p>
        </div>
        <Button variant="primary" size="lg" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New project</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5" role="tablist" aria-label="Filter by stage">
        {FILTERS.map((f) => (
          <button
            key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
            className={clsx('cursor-pointer rounded-xl border-2 px-4 py-3 text-left transition-colors', filter === f.id ? 'border-brand-600 bg-brand-50' : 'border-line bg-surface hover:border-brand-300')}
          >
            <span className={clsx('num block text-[26px] font-extrabold leading-none tracking-tight', f.tone)}>{isLoading ? '–' : counts[f.id]}</span>
            <span className="mt-1.5 block text-[13px] font-medium text-ink-2">{f.label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input
            type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, address, deal title…" aria-label="Search projects"
            className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-[14px] placeholder:text-ink-3 hover:border-brand-300 focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-100"
          />
        </div>
        <select
          value={advisor} onChange={(e) => setAdvisor(e.target.value)} aria-label="Filter by advisor"
          className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-[14px] hover:border-brand-300 focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-100"
        >
          <option value="">All advisors</option>
          {advisors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <div className="ml-auto inline-flex rounded-lg border border-line-strong bg-surface p-0.5" role="group" aria-label="View">
          {([['cards', LayoutGrid, 'Cards'], ['table', Rows3, 'Table']] as const).map(([v, Icon, label]) => (
            <button
              key={v} type="button" aria-pressed={view === v} onClick={() => setViewSaved(v)}
              className={clsx('inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold leading-none', view === v ? 'bg-brand-600 text-white' : 'text-ink-2 hover:bg-sunken')}
            ><Icon className="size-4" />{label}</button>
          ))}
        </div>
      </div>

      <NewProjectDialog open={creating} onClose={() => setCreating(false)} />

      {view === 'cards' ? (
        isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
        ) : filtered.length === 0 ? (
          <Card><EmptyState icon={<SearchX className="size-5" />} title="No projects match" action={<Button onClick={() => { setQ(''); setFilter('all'); setAdvisor('') }}>Clear filters</Button>}>Try a different name, address or filter.</EmptyState></Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r) => <ProjectCard key={r.id} r={r} onOpen={() => nav(`/projects/${r.id}`)} />)}
          </div>
        )
      ) : (
        <Card>
          <DataTable
            dense data={filtered} columns={columns} loading={isLoading} getRowId={(r) => String(r.id)}
            onRowClick={(r) => nav(`/projects/${r.id}`)}
            empty={<EmptyState icon={<SearchX className="size-5" />} title="No projects match" action={<Button onClick={() => { setQ(''); setFilter('all'); setAdvisor('') }}>Clear filters</Button>}>Try a different name, address or filter.</EmptyState>}
          />
        </Card>
      )}
    </div>
  )
}

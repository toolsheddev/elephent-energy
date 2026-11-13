import clsx from 'clsx'
import { ArrowLeft, ChevronsLeft, ChevronsRight, Mail, MapPin, Phone, RefreshCw, Search, Trash2, TriangleAlert, User } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, EmptyState, Skeleton } from '@/components/ui/core'
import { Tab, TabList, TabPanel, Tabs } from '@/components/ui/tabs'
import { toast } from '@/components/ui/overlay'
import { api } from '@/lib/api'
import { useProject, useProjects } from '@/lib/hooks'
import { ProjectStatusPill } from '../projects/ProjectsPage'
import { ConfirmDialog, DesignTab } from './DesignTab'
import { InvoicesTab } from './InvoicesTab'
import { HomeInfoTab, OverviewTab, ProjectForm } from './ProjectTab'

/** Left rail: the Retool "Search Projects" list, so you can hop between projects without going back. */
function ProjectSwitcher({ activeId, collapsed, onToggle }: { activeId: number; collapsed: boolean; onToggle: () => void }) {
  const nav = useNavigate()
  const { data, isLoading, isFetching, refetch } = useProjects()
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    return (data ?? []).filter((r) => !n || `${r.first_name} ${r.last_name} ${r.deal_title} ${r.id}`.toLowerCase().includes(n))
  }, [data, q])

  if (collapsed) {
    return (
      <aside className="hidden lg:block" aria-label="Projects">
        <button type="button" onClick={onToggle} aria-label="Show project list" title="Show project list"
          className="sticky top-[88px] flex size-10 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface text-ink-2 shadow-card hover:border-brand-300 hover:text-brand-700">
          <ChevronsRight className="size-4" />
        </button>
      </aside>
    )
  }

  return (
    <aside className="hidden lg:block" aria-label="Projects">
      <div className="sticky top-[88px] flex max-h-[calc(100vh-110px)] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="space-y-3 border-b border-line p-3">
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" icon={<ArrowLeft className="size-4" />} onClick={() => nav('/')}>Go Back</Button>
            <button type="button" onClick={onToggle} aria-label="Hide project list" title="Hide project list" className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line-strong text-ink-2 hover:bg-sunken"><ChevronsLeft className="size-4" /></button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Deal title, name, etc." aria-label="Search projects"
              className="h-9 w-full rounded-md border border-line-strong bg-surface pl-9 pr-3 text-[13px] placeholder:text-ink-3 focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-100"
            />
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && Array.from({ length: 6 }).map((_, i) => <li key={i} className="p-3"><Skeleton className="h-9 w-full" /></li>)}
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button" onClick={() => nav(`/projects/${r.id}`)} aria-current={r.id === activeId ? 'true' : undefined}
                className={clsx('block w-full cursor-pointer border-b border-line px-3.5 py-2.5 text-left transition-colors', r.id === activeId ? 'bg-brand-50 shadow-[inset_3px_0_0_var(--color-brand-600)]' : 'hover:bg-sunken')}
              >
                <span className="block truncate text-[13.5px] font-semibold">{r.first_name} {r.last_name}</span>
                <span className="block truncate text-[12px] text-ink-3">{r.deal_title}</span>
              </button>
            </li>
          ))}
          {!isLoading && rows.length === 0 && <li className="p-6 text-center text-[13px] text-ink-3">No project matches.</li>}
        </ul>
        <div className="flex items-center justify-between border-t border-line px-3.5 py-2 text-[12px] text-ink-3">
          <span><span className="num font-semibold text-ink-2">{rows.length.toLocaleString()}</span> results</span>
          <button type="button" aria-label="Refresh list" onClick={() => refetch()} className="cursor-pointer rounded p-1 hover:bg-sunken hover:text-ink"><RefreshCw className={clsx('size-3.5', isFetching && 'animate-spin')} /></button>
        </div>
      </div>
    </aside>
  )
}

export function ProjectPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const id = Number(useParams().projectId)
  const { data: b, isLoading, error } = useProject(id)
  const [params, setParams] = useSearchParams()
  const [collapsed, setCollapsed] = useState(() => {
    // Remember the choice; with no choice yet, start collapsed on narrower screens so the tables get the room.
    try { const v = localStorage.getItem('sd-sidebar-collapsed'); if (v !== null) return v === '1' } catch { /* ignore */ }
    return window.innerWidth < 1400
  })
  const toggleSidebar = () => setCollapsed((c) => { try { localStorage.setItem('sd-sidebar-collapsed', c ? '0' : '1') } catch { /* ignore */ } return !c })
  const tab = params.get('tab') ?? 'overview'
  const setTab = (t: string) => setParams((p) => { p.set('tab', t); return p }, { replace: true })

  return (
    <div className={clsx('grid items-start gap-5', collapsed ? 'lg:grid-cols-[40px_minmax(0,1fr)]' : 'lg:grid-cols-[280px_minmax(0,1fr)]')} style={{ animation: 'fade-in .2s' }}>
      <ProjectSwitcher activeId={id} collapsed={collapsed} onToggle={toggleSidebar} />

      <div className="min-w-0">
        {isLoading ? (
          <div className="space-y-4"><Skeleton className="h-28 w-full rounded-xl" /><Skeleton className="h-96 w-full rounded-xl" /></div>
        ) : error || !b ? (
          <EmptyState title="Project not found" action={<Link to="/" className="font-semibold text-brand-600 underline">Back to projects</Link>}>We could not load project {id}.</EmptyState>
        ) : (
          <>
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
          <ProjectForm bundle={b}>
            <div className="space-y-5">
              <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                {/* Header */}
                <div className="relative overflow-hidden bg-linear-to-br from-brand-700 via-brand-800 to-brand-900 px-6 py-5 text-white">
                  <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-brand-400/25 blur-3xl" />
                  <div className="relative flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/12 text-[17px] font-extrabold ring-1 ring-white/25">{b.project.first_name[0]}{b.project.last_name[0]}</div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h1 className="text-[22px] font-extrabold leading-tight tracking-tight">{b.project.first_name} {b.project.last_name}</h1>
                          <ProjectStatusPill status={b.project.project_status} />
                          {b.project.blocker && <span className="inline-flex items-center gap-1.5 rounded-full bg-bad px-2.5 py-0.5 text-[12px] font-bold"><TriangleAlert className="size-3.5" /> Blocked</span>}
                          <button type="button" aria-label="Delete project" title="Delete project" onClick={() => setConfirmDelete(true)}
                            className="ml-1 cursor-pointer rounded-md p-1.5 text-brand-200 hover:bg-white/10 hover:text-white"><Trash2 className="size-4" /></button>
                        </div>
                        <p className="mt-0.5 text-[13.5px] text-brand-200">{b.project.deal_title} · #{b.project.id}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-brand-100">
                      {b.house && <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5 text-brand-300" />{b.house.address}, {b.house.city}, {b.house.state}</span>}
                      <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5 text-brand-300" />{b.project.phone}</span>
                      <span className="inline-flex items-center gap-1.5"><Mail className="size-3.5 text-brand-300" />{b.project.email}</span>
                      <span className="inline-flex items-center gap-1.5"><User className="size-3.5 text-brand-300" />HCA {b.project.hca} · PM {b.project.pm}</span>
                    </div>
                  </div>
                </div>

                <Tabs value={tab} onValueChange={setTab}>
                  <TabList className="px-3">
                    <Tab value="overview">Project Overview</Tab>
                    <Tab value="home">Home Info</Tab>
                    <Tab value="design" count={b.systems.length}>System Design</Tab>
                    <Tab value="invoices" count={b.invoices?.length || undefined}>Invoices</Tab>
                  </TabList>
                </Tabs>
              </div>

              <Tabs value={tab} onValueChange={setTab}>
                <TabPanel value="overview"><OverviewTab bundle={b} /></TabPanel>
                <TabPanel value="home"><HomeInfoTab bundle={b} /></TabPanel>
                <TabPanel value="design"><DesignTab bundle={b} /></TabPanel>
                <TabPanel value="invoices"><InvoicesTab bundle={b} /></TabPanel>
              </Tabs>
            </div>
          </ProjectForm>
          </>
        )}
      </div>
    </div>
  )
}

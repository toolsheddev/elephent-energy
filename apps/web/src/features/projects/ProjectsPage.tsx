import type { ColumnDef } from '@tanstack/react-table'
import { AlertCircle, Plus, Search, SearchX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, EmptyState } from '@/components/ui/core'
import { DataTable } from '@/components/ui/table'
import { useProjects } from '@/lib/hooks'
import type { ProjectListItem } from '@/lib/types'
import { NewProjectDialog } from './NewProjectDialog'

/** Status pill colours. Retool shows every status in one lilac pill; colour here just makes the stage scannable. */
export function projectStatusClass(status: string) {
  const s = status.toLowerCase()
  if (s === 'lost') return 'bg-sunken text-ink-3'
  if (s === 'won' || s === 'installed' || s === 'project complete') return 'bg-ok-bg text-ok'
  if (s.startsWith('needs')) return 'bg-warn-bg text-warn'
  if (s === 'open') return 'bg-brand-100 text-brand-700'
  return 'bg-info-bg text-info'
}

export function ProjectStatusPill({ status }: { status: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${projectStatusClass(status)}`}>{status}</span>
}

const fmtDate = (iso: string) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')

export function ProjectsPage() {
  const nav = useNavigate()
  const { data, isLoading } = useProjects()
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)

  const rows = useMemo(() => data ?? [], [data])
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) => `${r.id} ${r.deal_title} ${r.first_name} ${r.last_name} ${r.hca} ${r.status} ${r.address} ${r.city}`.toLowerCase().includes(needle))
  }, [rows, q])

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
    { accessorKey: 'install_start', header: 'Install date', cell: ({ getValue }) => <span className="text-ink-2">{fmtDate(getValue<string>())}</span> },
    { accessorKey: 'closed_at', header: 'Closed at', cell: ({ getValue }) => <span className="text-ink-2">{fmtDate(getValue<string>())}</span> },
    {
      id: 'address', header: 'Address', accessorFn: (r) => `${r.address}, ${r.city}`,
      cell: ({ getValue }) => <span className="block max-w-[320px] truncate text-ink-2" title={getValue<string>()}>{getValue<string>()}</span>,
    },
  ], [])

  return (
    <div className="space-y-4" style={{ animation: 'fade-in .2s' }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">All Projects</h1>
          <p className="mt-1 text-[14px] text-ink-3">
            <span className="num font-semibold text-ink-2">{filtered.length.toLocaleString()}</span> {filtered.length === 1 ? 'project' : 'projects'}
            {q && <> matching “{q}”</>}. Click a row to open it.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New project</Button>
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input
            type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by any value" aria-label="Search projects"
            className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-[14px] shadow-card placeholder:text-ink-3 hover:border-brand-300 focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-100"
          />
        </div>
        </div>
      </div>

      <NewProjectDialog open={creating} onClose={() => setCreating(false)} />

      <Card>
        <DataTable
          dense data={filtered} columns={columns} loading={isLoading} getRowId={(r) => String(r.id)}
          onRowClick={(r) => nav(`/projects/${r.id}`)}
          empty={
            <EmptyState icon={<SearchX className="size-5" />} title="No projects match" action={<Button onClick={() => setQ('')}>Clear search</Button>}>
              Try a different name, address or project id.
            </EmptyState>
          }
        />
      </Card>
    </div>
  )
}

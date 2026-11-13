import { useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Check, ChevronDown, ChevronRight, LayoutGrid, RotateCcw, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useMatch } from 'react-router-dom'
import { Toaster, toast } from '@/components/ui/overlay'
import { QuickJump } from './QuickJump'
import { api } from '@/lib/api'
import { useProject } from '@/lib/hooks'

/* Same menus as the Retool navigation bar (parent/child structure read from the Navigation Bar module). */
const APP_GROUPS: { group: string; apps: string[] }[] = [
  { group: 'Apps', apps: ['Landing Page', 'System Design', 'Reporting', 'Docs'] },
  { group: 'Project Ops', apps: ['Project Ops', 'Project Ops Dashboard', 'MA Readiness Tracker', 'Dispatching', 'SOWs', 'Change Orders', 'Call Backs', 'Inspections', 'Retros'] },
  { group: 'Project Coordinators', apps: ['Project Coordinators', 'Rebate Processing', 'Project Costs & Rebates', 'Invoice Management'] },
  { group: 'Supply Chain & Inventory', apps: ['Supply Chain & Inventory', 'Inventory Used Report', 'SKU Forecast', 'Supply Chain A/P', 'Mitsubishi Equip Avail', 'Mitsubishi Spiff Processing', 'Pricing Dashboard'] },
]
const CURRENT = 'System Design'

function AppSwitcher() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])

  const groups = useMemo(() => {
    const n = q.trim().toLowerCase()
    return APP_GROUPS.map((g) => ({ ...g, apps: g.apps.filter((a) => !n || a.toLowerCase().includes(n)) })).filter((g) => g.apps.length)
  }, [q])

  return (
    <div ref={root} className="relative">
      <button
        type="button" aria-haspopup="dialog" aria-expanded={open}
        onClick={() => { setOpen((o) => !o); setQ('') }}
        className={clsx(
          'flex h-10 cursor-pointer items-center gap-2.5 rounded-lg border px-3 transition-colors',
          open ? 'border-brand-500 bg-brand-50 ring-3 ring-brand-100' : 'border-brand-200 bg-brand-50/70 hover:border-brand-400 hover:bg-brand-50',
        )}
      >
        <span className="flex size-6 items-center justify-center rounded-md bg-brand-600 text-white"><LayoutGrid className="size-3.5" /></span>
        <span className="text-left leading-tight">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-brand-600">You are in</span>
          <span className="block text-[14px] font-extrabold tracking-tight text-brand-800">{CURRENT}</span>
        </span>
        <ChevronDown className={clsx('size-4 text-brand-600 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div role="dialog" aria-label="Switch app" className="absolute left-0 top-12 z-50 w-[560px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-surface shadow-pop" style={{ animation: 'fade-in .12s' }}>
          <div className="border-b border-line p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an app" aria-label="Find an app"
                className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-[14px] placeholder:text-ink-3 focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-100"
              />
            </div>
          </div>
          <div className="grid max-h-[60vh] gap-x-6 gap-y-5 overflow-y-auto p-4 sm:grid-cols-2">
            {groups.map((g) => (
              <section key={g.group}>
                <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-3">{g.group}</h3>
                <ul>
                  {g.apps.map((a) =>
                    a === CURRENT ? (
                      <li key={a}>
                        <Link to="/" onClick={() => setOpen(false)} className="flex items-center justify-between rounded-md bg-brand-50 px-2.5 py-2 text-[13.5px] font-bold text-brand-700">
                          {a}<Check className="size-4" strokeWidth={3} />
                        </Link>
                      </li>
                    ) : (
                      <li key={a}>
                        <button type="button" disabled title="Not part of this build yet" className="flex w-full cursor-not-allowed items-center justify-between rounded-md px-2.5 py-2 text-left text-[13.5px] text-ink-3">
                          {a}<span className="rounded bg-sunken px-1.5 text-[10px] font-semibold uppercase tracking-wide">Later</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
            {groups.length === 0 && <p className="col-span-full py-6 text-center text-[13.5px] text-ink-3">No app matches “{q}”.</p>}
          </div>
          <div className="flex items-center justify-between border-t border-line bg-canvas/70 px-4 py-2 text-[12px] text-ink-3">
            <span>Only System Design is part of this build.</span>
            <span />
          </div>
        </div>
      )}
    </div>
  )
}

function Breadcrumbs() {
  const match = useMatch('/projects/:projectId')
  const id = Number(match?.params.projectId)
  const { data } = useProject(id)
  const name = data ? `${data.project.first_name} ${data.project.last_name}` : 'Project'

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[14px]">
      {match ? (
        <>
          <Link to="/" className="rounded-md px-2 py-1 font-semibold text-ink-3 hover:bg-sunken hover:text-brand-700">Projects</Link>
          <ChevronRight className="size-4 text-ink-3" aria-hidden />
          <span aria-current="page" className="rounded-md px-2 py-1 font-bold text-ink">{name}</span>
        </>
      ) : (
        <span aria-current="page" className="rounded-md px-2 py-1 font-bold text-ink">Projects</span>
      )}
    </nav>
  )
}

export function AppShell() {
  const qc = useQueryClient()
  const [jump, setJump] = useState(false)
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setJump((o) => !o) } }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line/80 bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1560px] items-center gap-4 px-5">
          <Link to="/" aria-label="Elephant Energy home" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-brand-500 to-brand-800 text-[12px] font-extrabold tracking-tight text-white shadow-card">EE</Link>
          <AppSwitcher />
          <div className="mx-1 hidden h-6 w-px bg-line md:block" />
          <div className="hidden md:block"><Breadcrumbs /></div>

          <div className="flex-1" />

          <button
            type="button" aria-label="Search projects"
            onClick={() => setJump(true)}
            className="hidden h-10 w-72 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[13px] leading-none text-ink-3 hover:border-brand-300 lg:flex"
          >
            <Search className="size-4" /> Jump to a project <kbd className="ml-auto rounded border border-line px-1.5 py-0.5 text-[11px] font-semibold">Ctrl K</kbd>
          </button>
          <button
            type="button" title="Restore the sample data set" aria-label="Reset demo data"
            onClick={async () => { await api.resetDemo(); await qc.invalidateQueries(); toast.success('Demo data reset') }}
            className="flex size-10 cursor-pointer items-center justify-center rounded-lg text-ink-3 hover:bg-sunken hover:text-ink"
          >
            <RotateCcw className="size-4" />
          </button>
          <div className="flex items-center gap-2.5 border-l border-line pl-4">
            <div className="flex size-9 items-center justify-center rounded-full bg-brand-100 text-[12px] font-bold text-brand-700">AT</div>
            <div className="hidden leading-tight xl:block">
              <p className="text-[13px] font-semibold">Allison Toth</p>
              <p className="text-[11px] text-ink-3">Home Comfort Advisor</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1560px] flex-1 px-5 py-6">
        <Outlet />
      </main>
      <QuickJump open={jump} onClose={() => setJump(false)} />
      <Toaster />
    </div>
  )
}

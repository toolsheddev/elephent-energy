import clsx from 'clsx'
import { CornerDownLeft, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useProjects } from '@/lib/hooks'

/** Ctrl+K: jump to any project by name, deal title, address or id. */
export function QuickJump({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const { data } = useProjects()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) { setQ(''); setI(0); setTimeout(() => input.current?.focus(), 0) } }, [open])
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    const all = data ?? []
    return (n ? all.filter((r) => `${r.first_name} ${r.last_name} ${r.deal_title} ${r.address} ${r.city} ${r.id}`.toLowerCase().includes(n)) : all).slice(0, 8)
  }, [data, q])
  useEffect(() => setI(0), [q])
  if (!open) return null

  const go = (id: number) => { onClose(); nav(`/projects/${id}`) }
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/40 px-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ animation: 'fade-in .12s' }}>
      <div role="dialog" aria-label="Jump to a project" className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-ink-3" />
          <input
            ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to a project" aria-label="Jump to a project"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              else if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(rows.length - 1, x + 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)) }
              else if (e.key === 'Enter' && rows[i]) go(rows[i].id)
            }}
            className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-ink-3"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px] font-semibold text-ink-3">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
          {rows.map((r, idx) => (
            <li key={r.id} role="option" aria-selected={idx === i}>
              <button
                type="button" onClick={() => go(r.id)} onMouseEnter={() => setI(idx)}
                className={clsx('flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left', idx === i ? 'bg-brand-50' : 'hover:bg-sunken')}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-[12px] font-bold text-brand-700">{r.first_name[0]}{r.last_name[0]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{r.first_name} {r.last_name}</span>
                  <span className="block truncate text-[12.5px] text-ink-3">{r.deal_title} · {r.city}{r.state ? `, ${r.state}` : ''}</span>
                </span>
                {idx === i && <CornerDownLeft className="size-4 shrink-0 text-ink-3" />}
              </button>
            </li>
          ))}
          {rows.length === 0 && <li className="px-4 py-8 text-center text-[14px] text-ink-3">No project matches “{q}”.</li>}
        </ul>
      </div>
    </div>,
    document.body,
  )
}

import * as DM from '@radix-ui/react-dropdown-menu'
import clsx from 'clsx'
import { Check, MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'

export type MenuItem =
  | { kind?: 'action'; label: string; onSelect: () => void; disabled?: boolean; danger?: boolean; hint?: string }
  | { kind: 'check'; label: string; checked: boolean; onChange: (v: boolean) => void }
  | { kind: 'label'; label: string }
  | { kind: 'separator' }

/** A "⋯" button that opens a short list of actions. Keeps rarely used actions out of the way. */
export function MoreMenu({ items, label = 'More actions', trigger, align = 'end' }: { items: (MenuItem | false | null | undefined)[]; label?: string; trigger?: ReactNode; align?: 'start' | 'end' }) {
  const shown = items.filter(Boolean) as MenuItem[]
  return (
    <DM.Root modal={false}>
      <DM.Trigger asChild>
        {trigger ?? (
          <button type="button" aria-label={label} title={label} onClick={(e) => e.stopPropagation()}
            className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line bg-surface text-ink-2 hover:border-brand-300 hover:text-ink data-[state=open]:border-brand-500">
            <MoreHorizontal className="size-4" />
          </button>
        )}
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align={align} sideOffset={4} onClick={(e) => e.stopPropagation()}
          className="z-50 min-w-52 rounded-lg border border-line bg-surface p-1 shadow-pop" style={{ animation: 'fade-in .12s' }}>
          {shown.map((it, i) => {
            if (it.kind === 'separator') return <DM.Separator key={i} className="my-1 h-px bg-line" />
            if (it.kind === 'label') return <DM.Label key={i} className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-3">{it.label}</DM.Label>
            if (it.kind === 'check') {
              return (
                <DM.CheckboxItem key={i} checked={it.checked} onCheckedChange={(v) => it.onChange(!!v)} onSelect={(e) => e.preventDefault()}
                  className="flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-[13.5px] outline-none data-[highlighted]:bg-sunken">
                  <span className={clsx('flex size-4 shrink-0 items-center justify-center rounded-xs border', it.checked ? 'border-brand-600 bg-brand-600 text-white' : 'border-line-strong')}>
                    {it.checked && <Check className="size-3" strokeWidth={3.5} />}
                  </span>
                  {it.label}
                </DM.CheckboxItem>
              )
            }
            return (
              <DM.Item key={i} disabled={it.disabled} onSelect={() => it.onSelect()} title={it.hint}
                className={clsx('flex cursor-pointer select-none items-center rounded-md px-2.5 py-1.5 text-[13.5px] outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 data-[highlighted]:bg-sunken', it.danger && 'text-bad')}>
                {it.label}
              </DM.Item>
            )
          })}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  )
}

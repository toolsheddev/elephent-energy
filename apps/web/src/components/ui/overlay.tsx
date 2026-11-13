import * as Dialog from '@radix-ui/react-dialog'
import * as Tooltip from '@radix-ui/react-tooltip'
import clsx from 'clsx'
import { CheckCircle2, X, XCircle } from 'lucide-react'
import { create } from 'zustand'
import type { ReactNode } from 'react'
import { IconButton } from './core'

/* ---------- Modal dialog ---------- */

export function Modal({
  open, onOpenChange, title, description, children, footer, size = 'md',
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size]
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px]" style={{ animation: 'fade-in .15s' }} />
        <Dialog.Content
          className={clsx('fixed left-1/2 top-[8vh] z-50 flex max-h-[84vh] w-[calc(100vw-2rem)] -translate-x-1/2 flex-col overflow-hidden rounded-lg bg-surface shadow-pop focus:outline-none', width)}
          style={{ animation: 'slide-up .18s ease-out' }}
        >
          <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              <Dialog.Title className="text-[15px] font-bold">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-[13px] text-ink-3">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <IconButton label="Close"><X className="size-4" /></IconButton>
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <footer className="flex items-center justify-end gap-2 border-t border-line bg-canvas/60 px-6 py-3">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/* ---------- Side drawer (replaces most Retool modal frames) ---------- */

export function Drawer({
  open, onOpenChange, title, description, children, footer, width = 'max-w-2xl',
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/35" style={{ animation: 'fade-in .15s' }} />
        <Dialog.Content
          className={clsx('fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-surface shadow-pop focus:outline-none', width)}
          style={{ animation: 'slide-in-right .2s ease-out' }}
        >
          <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              <Dialog.Title className="text-[15px] font-bold">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-[13px] text-ink-3">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{typeof title === 'string' ? title : 'Panel'}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <IconButton label="Close"><X className="size-4" /></IconButton>
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <footer className="flex items-center justify-end gap-2 border-t border-line bg-canvas/60 px-6 py-3">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/* ---------- Tooltip ---------- */

export function Tip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content sideOffset={6} className="z-60 max-w-xs rounded-md bg-ink px-2.5 py-1.5 text-xs text-white shadow-pop">
            {content}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}

/* ---------- Toasts ---------- */

interface ToastItem { id: number; tone: 'ok' | 'bad'; title: string; body?: string }
interface ToastStore { items: ToastItem[]; push: (t: Omit<ToastItem, 'id'>) => void; dismiss: (id: number) => void }

let nextId = 1
const useToastStore = create<ToastStore>((set, get) => ({
  items: [],
  push: (t) => {
    const id = nextId++
    set({ items: [...get().items, { ...t, id }] })
    setTimeout(() => get().dismiss(id), 4500)
  },
  dismiss: (id) => set({ items: get().items.filter((i) => i.id !== id) }),
}))

export const toast = {
  success: (title: string, body?: string) => useToastStore.getState().push({ tone: 'ok', title, body }),
  error: (title: string, body?: string) => useToastStore.getState().push({ tone: 'bad', title, body }),
}

export function Toaster() {
  const items = useToastStore((s) => s.items)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-70 flex w-80 flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-surface p-3.5 shadow-pop" style={{ animation: 'slide-up .2s ease-out' }}>
          {t.tone === 'ok' ? <CheckCircle2 className="mt-0.5 size-5 text-ok" /> : <XCircle className="mt-0.5 size-5 text-bad" />}
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold">{t.title}</p>
            {t.body && <p className="mt-0.5 text-[13px] text-ink-3">{t.body}</p>}
          </div>
          <IconButton label="Dismiss" className="-mr-1 -mt-1 size-6" onClick={() => dismiss(t.id)}><X className="size-3.5" /></IconButton>
        </div>
      ))}
    </div>
  )
}

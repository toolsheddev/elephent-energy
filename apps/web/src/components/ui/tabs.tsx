import * as RT from '@radix-ui/react-tabs'
import clsx from 'clsx'
import type { ReactNode } from 'react'

export const Tabs = RT.Root

export function TabList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <RT.List className={clsx('flex gap-1 overflow-x-auto border-b border-line', className)}>{children}</RT.List>
  )
}

export function Tab({
  value, children, count,
}: { value: string; children: ReactNode; count?: number }) {
  return (
    <RT.Trigger
      value={value}
      className="relative -mb-px flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-[14px] font-semibold text-ink-3 transition-colors hover:text-ink data-[state=active]:border-brand-600 data-[state=active]:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300"
    >
      {children}
      {count != null && (
        <span className="num rounded-full bg-sunken px-1.5 text-xs font-semibold text-ink-2">{count}</span>
      )}
    </RT.Trigger>
  )
}

export const TabPanel = ({ value, children, className }: { value: string; children: ReactNode; className?: string }) => (
  <RT.Content value={value} className={clsx('focus:outline-none', className)} style={{ animation: 'fade-in .15s' }}>
    {children}
  </RT.Content>
)

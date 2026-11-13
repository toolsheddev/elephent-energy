import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

/* ---------- Button ---------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-card hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300',
  secondary: 'border border-line-strong bg-surface text-ink hover:border-brand-300 hover:bg-brand-50 disabled:text-ink-3',
  ghost: 'text-ink-2 hover:bg-sunken hover:text-ink disabled:text-ink-3',
  subtle: 'bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:text-brand-300',
  danger: 'border border-bad/30 bg-surface text-bad hover:bg-bad-bg disabled:text-ink-3',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[13px]',
  md: 'h-9 gap-2 px-3.5 text-[14px]',
  lg: 'h-11 gap-2 px-5 text-[15px]',
}

export function Button({
  variant = 'secondary', size = 'md', loading, icon, children, className, disabled, ...rest
}: {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
} & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={clsx(
        'inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-md font-semibold leading-none transition-colors disabled:cursor-not-allowed',
        variants[variant], sizes[size], className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

export function IconButton({
  label, children, className, ...rest
}: { label: string } & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx('inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-50', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ---------- Card & sections ---------- */

export function Card({ className, children, ...rest }: ComponentProps<'section'>) {
  return (
    <section className={clsx('rounded-xl border border-line bg-surface shadow-card', className)} {...rest}>
      {children}
    </section>
  )
}

export function CardHeader({
  title, subtitle, actions, icon, className,
}: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <header className={clsx('flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-line px-5 py-3.5', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 [&>svg]:size-[18px]">{icon}</span>}
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold leading-tight tracking-tight text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('p-5', className)}>{children}</div>
}

/** 12-column form grid; children choose their span with col-span-* classes. */
export function FormGrid({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('grid grid-cols-12 gap-x-4 gap-y-4', className)}>{children}</div>
}

/* ---------- Badges ---------- */

type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'bad' | 'info'
const tones: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-2',
  brand: 'bg-brand-50 text-brand-700',
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  info: 'bg-info-bg text-info',
}
const dots: Record<Tone, string> = {
  neutral: 'bg-ink-3', brand: 'bg-brand-500', ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', info: 'bg-info',
}

export function Badge({
  tone = 'neutral', dot, children, className,
}: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>
      {dot && <span className={clsx('size-1.5 rounded-full', dots[tone])} />}
      {children}
    </span>
  )
}

const statusTone: Record<string, Tone> = {
  // proposals
  finalized: 'ok', 'out for signature': 'info', 'out for review': 'warn', pending: 'neutral', rejected: 'bad',
  // invoices
  paid: 'ok', open: 'info', 'not sent': 'neutral', void: 'bad', draft: 'neutral', 'not created': 'neutral',
  // retro, equipment
  completed: 'ok', 'not complete': 'neutral', ordered: 'ok', 'not ordered': 'neutral',
}
export function StatusPill({ value }: { value?: string | null }) {
  if (!value) return <Badge>—</Badge>
  return <Badge tone={statusTone[value.toLowerCase()] ?? 'neutral'} dot><span className="first-letter:uppercase">{value}</span></Badge>
}

/* ---------- Banner ---------- */

const bannerIcon = { info: Info, ok: CheckCircle2, warn: AlertTriangle, bad: XCircle, neutral: Info, brand: Info } as const
export function Banner({
  tone = 'info', title, children, action, className,
}: { tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const Icon = bannerIcon[tone]
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={clsx('flex items-start gap-3 rounded-md px-4 py-3 text-[14px]', tones[tone], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={clsx(title && 'mt-0.5', 'text-ink-2')}>{children}</div>}
      </div>
      {action}
    </div>
  )
}

/* ---------- Stat ---------- */

export function Stat({
  label, value, sub, tone,
}: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className={clsx('num mt-0.5 text-[18px] font-bold leading-tight', tone === 'ok' && 'text-ok', tone === 'warn' && 'text-warn', tone === 'bad' && 'text-bad')}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}
    </div>
  )
}

/* ---------- Skeleton / empty ---------- */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx('relative overflow-hidden rounded-md bg-sunken', className)}>
      <div className="skeleton-sheen absolute inset-y-0 left-0 w-1/3 bg-linear-to-r from-transparent via-white/40 to-transparent" />
    </div>
  )
}

export function EmptyState({
  icon, title, children, action,
}: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && <div className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">{icon}</div>}
      <div>
        <p className="text-[15px] font-bold">{title}</p>
        {children && <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-3">{children}</p>}
      </div>
      {action}
    </div>
  )
}

/** Key/value row for read-only detail lists. */
export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className="text-right text-[14px] font-medium">{children}</dd>
    </div>
  )
}

import { Check, ChevronDown, X } from 'lucide-react'
import clsx from 'clsx'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'

/* ---------- Field wrapper ---------- */

export interface FieldShellProps {
  label?: ReactNode
  hint?: ReactNode
  error?: string
  required?: boolean
  className?: string
  id: string
  children: ReactNode
}

export function FieldShell({ label, hint, error, required, className, id, children }: FieldShellProps) {
  return (
    <div className={clsx('flex min-w-0 flex-col gap-1', className)}>
      {label != null && (
        <label htmlFor={id} className="text-[12.5px] font-semibold text-ink-2">
          {label}
          {required && <span className="ml-0.5 text-bad">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-bad" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  )
}

const control =
  'h-8 w-full rounded-md border border-line-strong bg-surface px-2.5 text-[13.5px] text-ink placeholder:text-ink-3 ' +
  'transition-[border-color,box-shadow] hover:border-brand-300 focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-100 ' +
  'disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-3 aria-[invalid=true]:border-bad'

type FieldProps = {
  label?: ReactNode
  hint?: ReactNode
  error?: string
  wrapperClassName?: string
}

/* ---------- Text input ---------- */

export function Input({
  label, hint, error, wrapperClassName, className, id, required, ...rest
}: FieldProps & ComponentProps<'input'>) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      <input id={fid} required={required} aria-invalid={!!error} className={clsx(control, className)} {...rest} />
    </FieldShell>
  )
}

/* ---------- Input with a grey unit cell on the right (Retool: "years old", "BTU/hr", "amps") ---------- */

const addonShell =
  'flex h-9 w-full overflow-hidden rounded-md border border-line-strong bg-surface transition-[border-color,box-shadow] hover:border-brand-300 ' +
  'focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-100'

export function AddonInput({
  suffix, className, wrapperClassName, ...rest
}: ComponentProps<'input'> & { suffix: string; wrapperClassName?: string }) {
  return (
    <div className={clsx(addonShell, wrapperClassName)}>
      <input className={clsx('num min-w-0 flex-1 bg-transparent px-3 text-[14px] text-ink outline-none placeholder:text-ink-3', className)} {...rest} />
      <span className="flex shrink-0 items-center whitespace-nowrap border-l border-line bg-sunken px-3 text-xs font-semibold text-ink-3">{suffix}</span>
    </div>
  )
}

/** Retool's cascading "type" picker: shows the chosen path with a grey "type" cell. The list is a native select grouped by the first level. */
export function TypePicker({
  options, value, onChange, label, className,
}: {
  options: { value: string; label: string; group: string }[]
  value: string
  onChange: (v: string) => void
  label: string
  className?: string
}) {
  const groups = [...new Set(options.map((o) => o.group))]
  const current = options.find((o) => o.value === value)
  return (
    <div className={clsx(addonShell, 'relative', className)}>
      <span className={clsx('min-w-0 flex-1 truncate px-3 py-[7px] text-[14px]', current ? 'text-ink' : 'text-ink-3')}>{current?.label ?? (value || '')}</span>
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap border-l border-line bg-sunken px-3 text-xs font-semibold text-ink-3">
        type <ChevronDown className="size-3.5" />
      </span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
        <option value="">None selected</option>
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {options.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </optgroup>
        ))}
      </select>
    </div>
  )
}

/* ---------- Number input (with optional prefix / suffix) ---------- */

export function NumberInput({
  label, hint, error, wrapperClassName, className, id, prefix, suffix, ...rest
}: FieldProps & Omit<ComponentProps<'input'>, 'prefix'> & { prefix?: string; suffix?: string }) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} className={wrapperClassName}>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-3">{prefix}</span>
        )}
        <input
          id={fid}
          type="number"
          inputMode="decimal"
          aria-invalid={!!error}
          className={clsx(control, 'num [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none', prefix && 'pl-7', suffix && (suffix.length > 4 ? 'pr-20' : 'pr-9'), className)}
          {...rest}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-3">{suffix}</span>
        )}
      </div>
    </FieldShell>
  )
}

/* ---------- Textarea ---------- */

export function Textarea({
  label, hint, error, wrapperClassName, className, id, ...rest
}: FieldProps & ComponentProps<'textarea'>) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} className={wrapperClassName}>
      <textarea
        id={fid}
        aria-invalid={!!error}
        className={clsx(control, 'min-h-20 py-2 leading-snug', className)}
        {...rest}
      />
    </FieldShell>
  )
}

/* ---------- Native select (styled) ---------- */

export interface Option<V extends string | number = string> {
  value: V
  label: string
  disabled?: boolean
}

export function Select({
  label, hint, error, wrapperClassName, className, id, options, placeholder, ...rest
}: FieldProps & ComponentProps<'select'> & { options: (Option<string | number> | string)[]; placeholder?: string }) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} className={wrapperClassName}>
      <div className="relative">
        <select
          id={fid}
          aria-invalid={!!error}
          className={clsx(control, 'appearance-none text-ellipsis pr-9', className)}
          {...rest}
        >
          <option value="">{placeholder ?? 'Select…'}</option>
          {options.map((o) => {
            const opt = typeof o === 'string' ? { value: o, label: o } : o
            return (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            )
          })}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
      </div>
    </FieldShell>
  )
}

/* ---------- Checkbox ---------- */

export function Checkbox({
  label, hint, className, id, ...rest
}: { label: ReactNode; hint?: ReactNode } & Omit<ComponentProps<'input'>, 'type'>) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <label htmlFor={fid} className={clsx('group flex cursor-pointer items-start gap-2.5 py-1.5', className)}>
      <span className="relative mt-0.5 flex size-[18px] shrink-0 items-center justify-center">
        <input id={fid} type="checkbox" className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-xs border border-line-strong bg-surface transition-colors checked:border-brand-600 checked:bg-brand-600 hover:border-brand-400 disabled:cursor-not-allowed disabled:opacity-50" {...rest} />
        <Check className="pointer-events-none relative size-3 text-white opacity-0 peer-checked:opacity-100" strokeWidth={3.5} />
      </span>
      <span className="min-w-0">
        <span className="text-[14px] leading-snug text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
    </label>
  )
}

/* ---------- Switch ---------- */

export function Switch({
  label, checked, onChange, disabled, className,
}: {
  label: ReactNode
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx('flex cursor-pointer items-center gap-2.5 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-50', className)}
    >
      <span className={clsx('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-line-strong')}>
        <span className={clsx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]', checked ? 'left-[1.125rem]' : 'left-0.5')} />
      </span>
      <span className="text-[14px] text-ink">{label}</span>
    </button>
  )
}

/* ---------- Segmented control ---------- */

export function Segmented<V extends string>({
  label, value, onChange, options, className,
}: {
  label?: ReactNode
  value: V
  onChange: (v: V) => void
  options: { value: V; label: string }[]
  className?: string
}) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {label && <span className="text-[13px] font-semibold text-ink-2">{label}</span>}
      <div role="radiogroup" className="inline-flex w-fit rounded-md bg-sunken p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={clsx(
              'h-8 rounded-sm px-3 text-[13px] font-medium transition-colors',
              value === o.value ? 'bg-surface text-brand-700 shadow-card' : 'text-ink-2 hover:text-ink',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------- Multi-select (chips + popover list) ---------- */

export function MultiSelect({
  label, hint, options, value, onChange, placeholder, className,
}: {
  label?: ReactNode
  hint?: ReactNode
  options: (Option | string)[]
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  className?: string
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])

  return (
    <FieldShell id={id} label={label} hint={hint} className={className}>
      <div ref={root} className="relative">
        <button
          id={id}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          title={value.map((v) => opts.find((o) => o.value === v)?.label ?? v).join(', ') || undefined}
          className={clsx(control, 'flex items-center gap-1 overflow-hidden whitespace-nowrap py-1 pr-9 text-left')}
        >
          {value.length === 0 && <span className="text-ink-3">{placeholder ?? 'Select…'}</span>}
          {value.slice(0, 1).map((v) => (
            <span key={v} className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap rounded-xs bg-brand-50 px-1.5 py-0.5 text-[13px] font-medium text-brand-700">
              <span className="truncate">{opts.find((o) => o.value === v)?.label ?? v}</span>
              <span
                role="button"
                aria-label={`Remove ${v}`}
                onClick={(e) => { e.stopPropagation(); toggle(v) }}
                className="cursor-pointer rounded-xs hover:bg-brand-100"
              >
                <X className="size-3" />
              </span>
            </span>
          ))}
          {value.length > 1 && <span className="shrink-0 whitespace-nowrap rounded-xs bg-sunken px-1.5 py-0.5 text-[13px] font-medium text-ink-2">+{value.length - 1}</span>}
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        </button>
        {open && (
          <ul className="absolute z-30 mt-1 max-h-60 w-full min-w-[15rem] overflow-auto rounded-md border border-line bg-surface p-1 shadow-pop" style={{ animation: 'fade-in .12s' }}>
            {opts.map((o) => {
              const on = value.includes(o.value)
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => toggle(o.value)}
                    className="flex w-full items-center gap-2 whitespace-nowrap rounded-sm px-2 py-1.5 text-left text-[14px] hover:bg-brand-50"
                  >
                    <span className={clsx('flex size-4 shrink-0 items-center justify-center rounded-xs border', on ? 'border-brand-600 bg-brand-600' : 'border-line-strong')}>
                      {on && <Check className="size-3 text-white" strokeWidth={3.5} />}
                    </span>
                    {o.label}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </FieldShell>
  )
}

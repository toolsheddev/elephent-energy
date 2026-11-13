import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Skeleton } from './core'

export interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T, any>[]
  loading?: boolean
  empty?: ReactNode
  onRowClick?: (row: T) => void
  isRowActive?: (row: T) => boolean
  getRowId?: (row: T) => string
  dense?: boolean
  className?: string
  footer?: ReactNode
  /** Respect column sizes and truncate cell content instead of widening the table. */
  fixed?: boolean
}

export function DataTable<T>({
  data, columns, loading, empty, onRowClick, isRowActive, getRowId, dense, className, footer, fixed,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
  })

  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className={clsx('w-full border-collapse text-[14px]', fixed && 'table-fixed')}>
        <thead className="sticky top-0 z-10 bg-canvas">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const sortable = h.column.getCanSort()
                const dir = h.column.getIsSorted()
                const align = (h.column.columnDef.meta as { align?: 'right' } | undefined)?.align
                return (
                  <th
                    key={h.id}
                    scope="col"
                    style={{ width: h.column.columnDef.size ? h.column.columnDef.size : undefined }}
                    aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                    className={clsx(
                      'border-b border-line py-2.5 text-left align-bottom text-xs font-semibold uppercase leading-tight tracking-wide text-ink-3', dense ? 'px-3' : 'px-4 whitespace-nowrap',
                      align === 'right' && 'text-right',
                    )}
                  >
                    {h.isPlaceholder ? null : sortable ? (
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-ink"
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {dir === 'asc' ? <ArrowUp className="size-3" /> : dir === 'desc' ? <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {columns.map((_, j) => (
                  <td key={j} className="border-b border-line px-4 py-3"><Skeleton className="h-4 w-full max-w-32" /></td>
                ))}
              </tr>
            ))}
          {!loading &&
            table.getRowModel().rows.map((row) => {
              const active = isRowActive?.(row.original)
              return (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={onRowClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onRowClick(row.original)) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={clsx(
                    'transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-brand-50/60 focus-visible:bg-brand-50/60',
                    active && 'bg-brand-50',
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const align = (cell.column.columnDef.meta as { align?: 'right' } | undefined)?.align
                    return (
                      <td
                        key={cell.id}
                        className={clsx(
                          'border-b border-line align-middle',
                          dense ? 'px-3 py-2' : 'px-4 py-3',
                          align === 'right' && 'num text-right',
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
        </tbody>
        {footer}
      </table>
      {!loading && data.length === 0 && empty}
    </div>
  )
}

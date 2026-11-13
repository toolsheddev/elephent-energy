import clsx from 'clsx'
import { BadgeCheck, CheckCircle2, ExternalLink, FileText, Pencil, ReceiptText, Send, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { jumpTo } from './QuotePanel'
import { Banner, Button, Card, CardBody, CardHeader, EmptyState, StatusPill } from '@/components/ui/core'
import { NumberInput, Segmented, Switch, Textarea } from '@/components/ui/form'
import { Modal, toast } from '@/components/ui/overlay'
import { money } from '@/lib/calc'
import {
  useApplyInvoiceSettings, useCreditCardFee, useDeleteInvoices, useEditDeposit, useGenerateInvoices, useInvoiceStatus, useUpdateInvoice,
} from '@/lib/hooks'
import { buildInvoices, DEFAULT_INVOICE_OPTIONS, type InvoiceOptions } from '@/lib/invoicing'
import type { Invoice, InvoiceLine, ProjectBundle } from '@/lib/types'

/** First deposit choices exactly as listed in Retool. */
const DEPOSIT_CHOICES: { value: string; label: string; sub?: string }[] = [
  { value: '0', label: '0%' },
  { value: '0.25', label: '25%' },
  { value: '0.33', label: '33%', sub: 'of total cost' },
  { value: '0.5', label: '50%' },
  { value: '1', label: '100%', sub: 'upfront payment' },
  { value: 'custom', label: 'Custom amount' },
]

export function InvoicesTab({ bundle: b }: { bundle: ProjectBundle }) {
  const invoices = b.invoices ?? []

  if (!b.project.finalized_proposal_id) {
    const designed = b.systems.some((x) => x.system_type !== 'other')
    const pending = b.proposals.some((p) => p.status === 'pending' || p.status === 'out for review' || p.status === 'out for signature')
    return (
      <Card>
        <EmptyState
          icon={<ReceiptText className="size-5" />} title={designed ? 'Finalize a proposal first' : 'Design a system first'}
          action={<Button variant="primary" onClick={() => jumpTo('sec-design')}>Go to Options and pricing</Button>}
        >
          {designed
            ? `Invoices are built from the finalized proposal. ${pending ? 'Pick the option you want under Options and pricing and press Finalize in the panel on the right.' : 'Create an option under Options and pricing and press Finalize.'}`
            : 'This project has no systems yet. Add a system under Options and pricing, finalize the proposal, then come back here to generate the deposit and final invoices.'}
        </EmptyState>
      </Card>
    )
  }
  if (invoices.length === 0) return <GenerateInvoices bundle={b} />
  return <InvoiceViewer bundle={b} />
}

/* ------------------------------------------------------------------ */
/* Generate                                                            */
/* ------------------------------------------------------------------ */

function GenerateInvoices({ bundle: b }: { bundle: ProjectBundle }) {
  const generate = useGenerateInvoices(b.project.id)
  const [choice, setChoice] = useState('0.5')
  const [custom, setCustom] = useState(0)
  const [firstCard, setFirstCard] = useState(false)
  const [finalCard, setFinalCard] = useState(false)
  const [upfront, setUpfront] = useState(false)

  const opts: InvoiceOptions = {
    ...DEFAULT_INVOICE_OPTIONS,
    firstDepositPct: choice === 'custom' ? 0 : Number(choice),
    firstDepositCustom: choice === 'custom' ? custom : 0,
    firstCardFee: firstCard, finalCardFee: finalCard, upfrontDiscount: upfront,
  }
  const preview = useMemo(() => {
    try { return { ok: true as const, build: buildInvoices(b, opts) } } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : String(e) } }
  }, [b, choice, custom, firstCard, finalCard, upfront]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasDeposit = opts.firstDepositPct > 0 || opts.firstDepositCustom > 0
  const finalPct = choice === 'custom' ? null : Math.round((1 - Number(choice)) * 100)

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card>
        <CardHeader icon={<ReceiptText />} title="Generate invoices" subtitle="Built from the finalized proposal. You can change the settings on each invoice afterwards." />
        <CardBody className="space-y-7">
          <section>
            <h3 className="mb-2.5 text-[13px] font-bold uppercase tracking-wider text-ink-3">First deposit amount</h3>
            <div role="radiogroup" aria-label="First deposit amount" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DEPOSIT_CHOICES.map((c) => (
                <button
                  key={c.value} type="button" role="radio" aria-checked={choice === c.value} onClick={() => setChoice(c.value)}
                  className={clsx('cursor-pointer rounded-lg border px-4 py-3 text-left transition-colors', choice === c.value ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100' : 'border-line bg-surface hover:border-brand-300')}
                >
                  <span className="block text-[15px] font-bold">{c.label}</span>
                  {c.sub && <span className="block text-[12.5px] text-ink-3">{c.sub}</span>}
                </button>
              ))}
            </div>
            {choice === 'custom' && <NumberInput wrapperClassName="mt-3 max-w-60" label="Deposit amount" prefix="$" min={0} value={custom} onChange={(e) => setCustom(Number(e.target.value) || 0)} />}
            <div className="mt-3"><Switch label="Paying with credit card (adds a 3% fee to the deposit)" checked={firstCard} onChange={setFirstCard} disabled={!hasDeposit} /></div>
          </section>

          <section className="border-t border-line pt-6">
            <h3 className="mb-1 text-[13px] font-bold uppercase tracking-wider text-ink-3">Final invoice</h3>
            <p className="mb-3 text-[14px] text-ink-2">{finalPct == null ? 'The final invoice is the total minus the custom deposit.' : <>Final invoice amount: <strong>{finalPct}%</strong> of total</>}</p>
            <div className="space-y-1">
              <Switch label="Paying with credit card (adds a 3% fee)" checked={finalCard} onChange={setFinalCard} />
              <Switch label="Paying upfront (3% discount)" checked={upfront} onChange={setUpfront} />
              <span title="This rule lives in Retool's unexported invoicing workflow, so it is not built yet.">
                <Switch label="Final invoice 90/10 split" checked={false} onChange={() => undefined} disabled />
              </span>
            </div>
          </section>
        </CardBody>
      </Card>

      <Card className="xl:sticky xl:top-24">
        <CardHeader title="Preview" subtitle="Updates as you change the settings" />
        <CardBody className="space-y-4">
          {!preview.ok ? (
            <Banner tone="bad" title="Cannot generate invoices">{preview.error}</Banner>
          ) : (
            <>
              <dl className="space-y-2 text-[14px]">
                <div className="flex justify-between"><dt className="text-ink-3">Project total</dt><dd className="num font-bold">{money(preview.build.projectTotal)}</dd></div>
                {hasDeposit && preview.build.drafts[0] && <div className="flex justify-between"><dt className="text-ink-3">First deposit</dt><dd className="num font-semibold">{money(preview.build.drafts[0].invoice_amount)}</dd></div>}
                <div className="flex justify-between border-t border-line pt-2"><dt className="text-ink-3">Final invoice</dt><dd className="num font-bold">{money(preview.build.drafts[preview.build.drafts.length - 1].invoice_amount)}</dd></div>
                {preview.build.netCost !== preview.build.projectTotal && <div className="flex justify-between"><dt className="text-ink-3">Net cost after direct incentives</dt><dd className="num">{money(preview.build.netCost)}</dd></div>}
              </dl>
              <p className="text-[13px] text-ink-3">{preview.build.drafts.map((d) => `${d.invoice_type}: ${d.lines.length} ${d.lines.length === 1 ? 'line' : 'lines'}`).join(' · ')}</p>
            </>
          )}
          <Button
            variant="primary" className="w-full" size="lg" icon={<FileText className="size-4" />} loading={generate.isPending} disabled={!preview.ok || (choice === 'custom' && custom <= 0)}
            onClick={async () => { await generate.mutateAsync(opts); toast.success('Invoices generated', 'Review them, then approve and send.') }}
          >
            Generate
          </Button>
        </CardBody>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

const INVOICE_ORDER = ['First Deposit', 'Second Deposit', 'Final Invoice']

function InvoiceViewer({ bundle: b }: { bundle: ProjectBundle }) {
  const del = useDeleteInvoices(b.project.id)
  const invoices = [...b.invoices].sort((x, y) => INVOICE_ORDER.indexOf(x.invoice_type) - INVOICE_ORDER.indexOf(y.invoice_type))
  const [sel, setSel] = useState<number>(invoices[0]?.id)
  const invoice = invoices.find((i) => i.id === sel) ?? invoices[0]
  const [confirm, setConfirm] = useState(false)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Invoices" className="flex flex-wrap gap-1.5">
          {invoices.map((i) => (
            <button
              key={i.id} type="button" role="tab" aria-selected={i.id === invoice.id} onClick={() => setSel(i.id)}
              className={clsx('flex cursor-pointer items-center gap-2.5 rounded-lg border px-4 py-2 text-left transition-colors', i.id === invoice.id ? 'border-brand-600 bg-brand-600 text-white shadow-card' : 'border-line bg-surface hover:border-brand-300')}
            >
              <span>
                <span className="block text-[14px] font-bold leading-tight">{i.invoice_type}</span>
                <span className={clsx('num block text-xs', i.id === invoice.id ? 'text-brand-200' : 'text-ink-3')}>{money(i.invoice_amount)}</span>
              </span>
              <StatusPill value={i.invoice_status} />
            </button>
          ))}
        </div>
        <Button size="sm" variant="danger" className="ml-auto" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)}>Delete invoices</Button>
      </div>

      <InvoiceView key={invoice.id} bundle={b} invoice={invoice} />

      <Modal
        open={confirm} onOpenChange={setConfirm} size="sm" title="Delete all invoices?" description="This removes the deposit and final invoices so you can generate them again."
        footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="primary" className="bg-bad hover:bg-bad/90" loading={del.isPending} onClick={async () => { await del.mutateAsync(undefined); setConfirm(false); toast.success('Invoices deleted') }}>Delete</Button></>}
      >
        <p className="text-[14px] text-ink-2">Invoices that were already sent to Stripe stay there in the live system and must be voided separately.</p>
      </Modal>
    </div>
  )
}

const typeLabel: Record<string, string> = { deposit: 'Deposit', 'credit card fee': 'Card fee', labor: 'Labor', equipment: 'Equipment', permit: 'Permits', discount: 'Discount', incentive: 'Incentive', 'financing fees': 'Fee', maintenance: 'Maintenance', 'change order': 'Change order' }

function InvoiceView({ bundle: b, invoice }: { bundle: ProjectBundle; invoice: Invoice }) {
  const pid = b.project.id
  const update = useUpdateInvoice(pid)
  const status = useInvoiceStatus(pid)
  const apply = useApplyInvoiceSettings(pid)
  const cardFee = useCreditCardFee(pid)
  const editDeposit = useEditDeposit(pid)
  const lines = b.invoiceLines.filter((l) => l.invoice_id === invoice.id)

  const locked = invoice.invoice_status === 'open' || invoice.invoice_status === 'paid'
  const isFinal = invoice.invoice_type === 'Final Invoice'
  const hasCardFee = lines.some((l) => l.line_item_type === 'credit card fee')
  const amountDue = lines.reduce((a, l) => a + l.amount, 0)

  const [memo, setMemo] = useState(invoice.memo)
  const [footer, setFooter] = useState(invoice.footer)
  const [notes, setNotes] = useState(invoice.notes)
  useEffect(() => { setMemo(invoice.memo); setFooter(invoice.footer); setNotes(invoice.notes) }, [invoice.memo, invoice.footer, invoice.notes])
  const dirty = memo !== invoice.memo || footer !== invoice.footer || notes !== invoice.notes

  const [upfront, setUpfront] = useState(b.depositConfig?.upfront_discount ?? false)
  const [approveOpen, setApproveOpen] = useState(false)
  const [depositOpen, setDepositOpen] = useState(false)
  const [depositAmount, setDepositAmount] = useState(invoice.invoice_amount)
  useEffect(() => setDepositAmount(invoice.invoice_amount), [invoice.invoice_amount])

  const customer = `${b.project.first_name} ${b.project.last_name}`
  const approved = !!invoice.approved_at
  // The live app limits Approve and Send to people in the "Approver" group. The demo user is one.
  const isApprover = true

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      {/* Document */}
      <Card>
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-lg bg-brand-700 text-[14px] font-extrabold text-white">EE</span>
            <div>
              <h2 className="text-[20px] font-extrabold leading-tight tracking-tight">Customer Invoice</h2>
              <p className="text-[13px] text-ink-3">{invoice.invoice_type} · #{invoice.id} · created {new Date(invoice.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            </div>
          </div>
          <StatusPill value={invoice.invoice_status} />
        </div>

        <div className="grid gap-6 px-6 py-5 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-3">Bill to</p>
            <p className="mt-1 text-[15px] font-semibold">{customer}</p>
            <p className="text-[14px] text-ink-2">{b.project.email}</p>
            {b.house && <p className="text-[14px] text-ink-2">{b.house.address}<br />{b.house.city}, {b.house.state} {b.house.zipcode}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-3">Amount due</p>
            <p className="num mt-1 text-[30px] font-extrabold leading-none tracking-tight">{money(amountDue, { cents: true })}</p>
          </div>
        </div>

        <div className="overflow-x-auto border-y border-line">
          <table className="w-full min-w-[520px] border-collapse text-[14px]">
            <thead className="bg-canvas/70">
              <tr>
                <th className="px-6 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">Description</th>
                <th className="w-32 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">Type</th>
                <th className="w-36 px-6 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-ink-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l: InvoiceLine) => (
                <tr key={l.id} className="border-t border-line align-top">
                  <td className="whitespace-pre-line px-6 py-2.5">{l.name.trim()}</td>
                  <td className="px-3 py-2.5 text-[13px] text-ink-3">{typeLabel[l.line_item_type] ?? l.line_item_type}</td>
                  <td className={clsx('num px-6 py-2.5 text-right font-medium', l.amount < 0 && 'text-ok')}>{money(l.amount, { cents: true })}</td>
                </tr>
              ))}
              {lines.length === 0 && <tr><td colSpan={3} className="px-6 py-8 text-center text-ink-3">No lines on this invoice.</td></tr>}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line bg-canvas/60">
                <td colSpan={2} className="px-6 py-3 text-right text-[13px] font-semibold uppercase tracking-wide text-ink-3">Amount due</td>
                <td className="num px-6 py-3 text-right text-[16px] font-extrabold">{money(amountDue, { cents: true })}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <CardBody className="space-y-4">
          <Textarea label="Footer" rows={4} value={footer} onChange={(e) => setFooter(e.target.value)} hint="Printed at the bottom of the invoice, for example incentives paid directly to the customer." />
          <Textarea label="Memo" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
          <Textarea label="Internal notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} hint="Never shown to the customer." />
          <div className="flex justify-end">
            <Button variant="primary" disabled={!dirty} loading={update.isPending} onClick={async () => { await update.mutateAsync({ invoiceId: invoice.id, patch: { memo, footer, notes } }); toast.success('Invoice saved') }}>Save changes</Button>
          </div>
        </CardBody>
      </Card>

      {/* Settings and actions */}
      <div className="space-y-5 xl:sticky xl:top-24">
        <Card>
          <CardHeader title="Invoice settings" subtitle={locked ? 'Locked: this invoice was already sent.' : undefined} />
          <CardBody className="space-y-5">
            <Segmented<'ACH' | 'Card'> label="Payment method" value={invoice.payment_type} options={[{ value: 'ACH', label: 'ACH' }, { value: 'Card', label: 'Card' }]}
              onChange={(v) => !locked && update.mutate({ invoiceId: invoice.id, patch: { payment_type: v } })} />
            <div>
              <p className="mb-1.5 text-[12.5px] font-semibold text-ink-2">Delivery method</p>
              {([['customer', 'Send to customer'], ['finalize', 'Finalize without sending to customer']] as const).map(([v, label]) => (
                <label key={v} className="flex cursor-pointer items-center gap-2.5 py-1 text-[14px]">
                  <input type="radio" name={`delivery-${invoice.id}`} className="size-4 accent-brand-600" checked={invoice.finalizing_method === v} disabled={locked} onChange={() => update.mutate({ invoiceId: invoice.id, patch: { finalizing_method: v } })} />
                  {label}
                </label>
              ))}
            </div>
            <div className="space-y-0.5 border-t border-line pt-4">
              {invoice.invoice_type !== 'Second Deposit' && (
                <Switch label="Paying with credit card" checked={hasCardFee} disabled={locked} onChange={(v) => cardFee.mutate({ invoiceId: invoice.id, on: v })} />
              )}
              <Switch label="Invoice to Evergreen" checked={invoice.evergreen} disabled={locked} onChange={(v) => update.mutate({ invoiceId: invoice.id, patch: { evergreen: v } })} />
              {isFinal && <Switch label="Upfront payment (3% discount)" checked={upfront} disabled={locked} onChange={setUpfront} />}
              {isFinal && (
                <span title="This rule lives in Retool's unexported invoicing workflow, so it is not built yet.">
                  <Switch label="Final invoice 90/10 split" checked={false} onChange={() => undefined} disabled />
                </span>
              )}
            </div>
            {invoice.invoice_type !== 'Second Deposit' && (
              <Button
                className="w-full" disabled={locked} loading={apply.isPending}
                onClick={async () => { await apply.mutateAsync({ invoiceId: invoice.id, ccFee: hasCardFee, upfrontDiscount: upfront }); toast.success('Settings applied', 'Lines were rebuilt from the finalized proposal.') }}
              >
                Apply settings
              </Button>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Send" subtitle="Approve first, then send to Stripe." />
          <CardBody className="space-y-3">
            <dl className="space-y-1.5 text-[14px]">
              <div className="flex items-center justify-between"><dt className="text-ink-3">Invoice status</dt><dd><StatusPill value={invoice.invoice_status} /></dd></div>
              <div className="flex items-center justify-between"><dt className="text-ink-3">Approved</dt><dd className="font-medium">{approved ? new Date(invoice.approved_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Not yet'}</dd></div>
              {invoice.stripe_invoice_id && <div className="flex items-center justify-between"><dt className="text-ink-3">Stripe invoice</dt><dd className="mono text-[12.5px]">{invoice.stripe_invoice_id}</dd></div>}
            </dl>

            {invoice.invoice_status === 'not sent' && !approved && (
              <Button className="w-full" icon={<BadgeCheck className="size-4" />} onClick={() => setApproveOpen(true)}>Approve invoice</Button>
            )}
            {invoice.invoice_status === 'not sent' && (
              <span className="block" title={!approved ? 'Approve the invoice first' : !isApprover ? 'Only the Approver group can send' : undefined}>
                <Button variant="primary" className="w-full" icon={<Send className="size-4" />} disabled={!approved || !isApprover} loading={status.isPending}
                  onClick={async () => { await status.mutateAsync({ invoiceId: invoice.id, status: 'open' }); toast.success('Sent to Stripe', 'Sample: the live system creates the Stripe and QuickBooks invoices.') }}>
                  Send invoice to Stripe
                </Button>
              </span>
            )}
            {invoice.invoice_status === 'open' && (
              <>
                <Button className="w-full" icon={<ExternalLink className="size-4" />} onClick={() => toast.success('Stripe invoice link', 'Sample link; the live system opens the hosted invoice page.')}>Stripe invoice link</Button>
                <Button className="w-full" icon={<CheckCircle2 className="size-4" />} onClick={async () => { await status.mutateAsync({ invoiceId: invoice.id, status: 'paid' }); toast.success('Marked paid (demo)') }}>Mark paid (demo)</Button>
                <Button className="w-full" variant="danger" onClick={async () => { await status.mutateAsync({ invoiceId: invoice.id, status: 'void' }); toast.success('Invoice voided in Stripe') }}>Void invoice in Stripe</Button>
              </>
            )}
            {invoice.invoice_status === 'paid' && <Banner tone="ok" title="Paid">Paid {invoice.paid_at ? new Date(invoice.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}.</Banner>}
            {invoice.invoice_status === 'void' && <Banner tone="warn" title="Voided">Apply settings to rebuild it, or generate new invoices.</Banner>}
            {invoice.invoice_type === 'First Deposit' && (
              <Button className="w-full" icon={<Pencil className="size-4" />} onClick={() => setDepositOpen(true)}>Edit deposit amount</Button>
            )}
          </CardBody>
        </Card>
      </div>

      <Modal
        open={approveOpen} onOpenChange={setApproveOpen} size="sm" title="Approve invoice" description={`${invoice.invoice_type} · ${money(amountDue, { cents: true })}`}
        footer={<><Button onClick={() => setApproveOpen(false)}>Cancel</Button><Button variant="primary" onClick={async () => { await status.mutateAsync({ invoiceId: invoice.id, status: 'approved' }); setApproveOpen(false); toast.success('Invoice approved') }}>Approve</Button></>}
      >
        <Segmented<'ACH' | 'Card'> label="Payment method" value={invoice.payment_type} options={[{ value: 'ACH', label: 'ACH' }, { value: 'Card', label: 'Card' }]} onChange={(v) => update.mutate({ invoiceId: invoice.id, patch: { payment_type: v } })} />
      </Modal>

      <Modal
        open={depositOpen} onOpenChange={setDepositOpen} size="sm" title="Edit First Deposit amount" description={`Invoice #${invoice.id}`}
        footer={<><Button onClick={() => setDepositOpen(false)}>Cancel</Button><Button variant="primary" disabled={depositAmount <= 0} loading={editDeposit.isPending} onClick={async () => { await editDeposit.mutateAsync({ invoiceId: invoice.id, amount: depositAmount }); setDepositOpen(false); toast.success('Deposit updated', 'The final invoice was adjusted.') }}>Save</Button></>}
      >
        <NumberInput label="First Deposit amount" prefix="$" min={0} value={depositAmount} onChange={(e) => setDepositAmount(Number(e.target.value) || 0)} />
        <p className="mt-3 text-[13px] text-ink-3">Editing the deposit amount cancels any outstanding invoices and recreates them. The final invoice takes the difference.</p>
      </Modal>
    </div>
  )
}

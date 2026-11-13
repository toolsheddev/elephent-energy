/* HTTP client for the System Design API. Same method names the screens already use. */
import type {
  ChangeOrderDetails, ExistingSystems, House, Invoice, InvoiceStatus, LineItemRec, Project, ProjectBundle, ProjectListItem, Proposal, SystemRec,
} from './types'
import type { InvoiceOptions } from './invoicing'

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { ...init, headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers } })
  } catch {
    throw new Error('Cannot reach the server. Is the API running?')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body as T
}

const act = async <T = true>(projectId: number, action: string, ...args: unknown[]) =>
  (await http<{ value: T }>(`/api/projects/${projectId}/${action}`, { method: 'POST', body: JSON.stringify({ args }) })).value

export const api = {
  refData: () => http<import('@sd/engine').RefData>('/api/refdata'),
  baseDesigns: () => http<(import('@sd/domain/baseDesign').BaseDesignRow & { odu_model: string | null; idu_model: string | null; thermostat_model: string | null })[]>('/api/base-designs'),
  resetDemo: () => http('/api/admin/reset', { method: 'POST', body: '{}' }),

  createProject: (p: { firstName: string; lastName: string; email?: string; phone?: string; address: string; city: string; state: string; zipcode?: string; county?: string; hca?: string; dealTitle?: string }) =>
    http<{ id: number }>('/api/projects', { method: 'POST', body: JSON.stringify(p) }),
  deleteProject: (id: number) => http<{ value: true }>(`/api/projects/${id}`, { method: 'DELETE' }),
  listProjects: () => http<ProjectListItem[]>('/api/projects'),
  getProject: (id: number) => http<ProjectBundle>(`/api/projects/${id}`),
  saveProjectInfo: (id: number, patch: { project?: Partial<Project>; house?: Partial<House>; existing?: Partial<ExistingSystems> }) =>
    act<ProjectBundle>(id, 'saveProjectInfo', patch),

  /* ---- invoices ---- */
  generateInvoices: (projectId: number, o: InvoiceOptions) => act(projectId, 'generateInvoices', o),
  applyInvoiceSettings: (projectId: number, invoiceId: number, s: { ccFee: boolean; upfrontDiscount: boolean }) => act(projectId, 'applyInvoiceSettings', invoiceId, s),
  updateInvoice: (projectId: number, invoiceId: number, patch: Partial<Invoice>) => act(projectId, 'updateInvoice', invoiceId, patch),
  setInvoiceStatus: (projectId: number, invoiceId: number, status: InvoiceStatus | 'approved') => act(projectId, 'setInvoiceStatus', invoiceId, status),
  editDepositAmount: (projectId: number, invoiceId: number, amount: number) => act<boolean>(projectId, 'editDepositAmount', invoiceId, amount),
  setCreditCardFee: (projectId: number, invoiceId: number, on: boolean) => act(projectId, 'setCreditCardFee', invoiceId, on),
  deleteInvoices: (projectId: number) => act(projectId, 'deleteInvoices'),

  /* ---- proposals ---- */
  createProposal: (projectId: number, nickname?: string) => act<Proposal>(projectId, 'createProposal', nickname),
  updateProposal: (projectId: number, proposalId: number, patch: Partial<Proposal>) => act(projectId, 'updateProposal', proposalId, patch),
  finalizeProposal: (projectId: number, proposalId: number, handoff?: { majorRisks?: string; expectations?: string }) => act(projectId, 'finalizeProposal', proposalId, handoff),
  deleteProposal: (projectId: number, proposalId: number) => act(projectId, 'deleteProposal', proposalId),
  duplicateProposal: (projectId: number, proposalId: number) => act<Proposal>(projectId, 'duplicateProposal', proposalId),

  /* ---- systems and line items ---- */
  addSystem: (projectId: number, system: Omit<SystemRec, 'id'>, lineItems: Omit<LineItemRec, 'id' | 'system_id'>[]) => act<SystemRec>(projectId, 'addSystem', system, lineItems),
  replaceSystemLines: (projectId: number, systemId: number, patch: Partial<SystemRec>, lineItems: Omit<LineItemRec, 'id' | 'system_id'>[]) =>
    act(projectId, 'replaceSystemLines', systemId, patch, lineItems),
  updateSystem: (projectId: number, systemId: number, patch: Partial<SystemRec>) => act(projectId, 'updateSystem', systemId, patch),
  markSystemForDeletion: (projectId: number, systemId: number, co: ChangeOrderDetails) => act(projectId, 'markSystemForDeletion', systemId, co),
  deleteSystem: (projectId: number, systemId: number) => act(projectId, 'deleteSystem', systemId),
  duplicateSystem: (projectId: number, systemId: number, toProposalId?: number) => act<SystemRec>(projectId, 'duplicateSystem', systemId, toProposalId),
  moveSystem: (projectId: number, systemId: number, toProposalId: number) => act(projectId, 'moveSystem', systemId, toProposalId),
  upsertLineItem: (projectId: number, item: Omit<LineItemRec, 'id'> & { id?: number }) => act(projectId, 'upsertLineItem', item),
  deleteLineItems: (projectId: number, ids: number[]) => act(projectId, 'deleteLineItems', ids),
  deleteLineItemsAsCO: (projectId: number, ids: number[], co: ChangeOrderDetails) => act(projectId, 'deleteLineItemsAsCO', ids, co),
  quickAddBaseDesigns: (projectId: number, payload: { designs: import('@sd/domain/baseDesign').BaseDesignRow[]; targets: (number | 'NEW_EACH' | 'NEW_SINGLE')[]; pricingStructure: string; options: import('@sd/domain/baseDesign').QuickAddOptions }) =>
    act<number>(projectId, 'quickAddBaseDesigns', payload),
  updateCircuitLength: (projectId: number, lineId: number, length: number, difficult: boolean) => act(projectId, 'updateCircuitLength', lineId, length, difficult),
  createMaintenancePlan: (projectId: number, p: { proposalId: number; level: string; counts: import('@sd/domain/maintenancePlan').MaintenanceCounts }) => act<SystemRec>(projectId, 'createMaintenancePlan', p),
  recalculateSystems: (projectId: number, systemIds: number[]) => act<{ systems: number; lines: number; notes: string[] }>(projectId, 'recalculateSystems', systemIds),
  addLineItems: (projectId: number, payload: { systemIds: number[]; lines: Omit<LineItemRec, 'id' | 'system_id'>[]; margin: { include: boolean; percents: Record<number, number | null> }; changeOrder?: ChangeOrderDetails }) =>
    act(projectId, 'addLineItems', payload),
}

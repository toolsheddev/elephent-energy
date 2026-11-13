import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { InvoiceOptions } from './invoicing'
import type { Invoice, InvoiceStatus, ChangeOrderDetails, ExistingSystems, House, LineItemRec, Project, Proposal, SystemRec } from './types'

export const qk = {
  projects: ['projects'] as const,
  project: (id: number) => ['project', id] as const,
}

export const useProjects = () => useQuery({ queryKey: qk.projects, queryFn: api.listProjects })

export const useProject = (id: number) =>
  useQuery({ queryKey: qk.project(id), queryFn: () => api.getProject(id), enabled: Number.isFinite(id) })

/** Run a mutation and refresh the project bundle (and list) afterwards. */
function useProjectMutation<A>(projectId: number, fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.project(projectId) })
      qc.invalidateQueries({ queryKey: qk.projects })
    },
  })
}

export const useSaveProjectInfo = (id: number) =>
  useProjectMutation(id, (patch: { project?: Partial<Project>; house?: Partial<House>; existing?: Partial<ExistingSystems> }) =>
    api.saveProjectInfo(id, patch))

export const useCreateProposal = (id: number) =>
  useProjectMutation(id, (nickname?: string) => api.createProposal(id, nickname))
export const useUpdateProposal = (id: number) =>
  useProjectMutation(id, (a: { proposalId: number; patch: Partial<Proposal> }) => api.updateProposal(id, a.proposalId, a.patch))
export const useFinalizeProposal = (id: number) =>
  useProjectMutation(id, (a: { proposalId: number; handoff?: { majorRisks?: string; expectations?: string } }) => api.finalizeProposal(id, a.proposalId, a.handoff))
export const useDeleteProposal = (id: number) =>
  useProjectMutation(id, (proposalId: number) => api.deleteProposal(id, proposalId))
export const useDuplicateProposal = (id: number) =>
  useProjectMutation(id, (proposalId: number) => api.duplicateProposal(id, proposalId))

export const useAddSystem = (id: number) =>
  useProjectMutation(id, (a: { system: Omit<SystemRec, 'id'>; lineItems: Omit<LineItemRec, 'id' | 'system_id'>[] }) =>
    api.addSystem(id, a.system, a.lineItems))
export const useReplaceSystem = (id: number) =>
  useProjectMutation(id, (a: { systemId: number; patch: Partial<SystemRec>; lineItems: Omit<LineItemRec, 'id' | 'system_id'>[] }) =>
    api.replaceSystemLines(id, a.systemId, a.patch, a.lineItems))
export const useUpdateSystem = (id: number) =>
  useProjectMutation(id, (a: { systemId: number; patch: Partial<SystemRec> }) => api.updateSystem(id, a.systemId, a.patch))
export const useMarkSystemDeletion = (id: number) =>
  useProjectMutation(id, (a: { systemId: number; co: ChangeOrderDetails }) => api.markSystemForDeletion(id, a.systemId, a.co))
export const useDeleteSystem = (id: number) =>
  useProjectMutation(id, (systemId: number) => api.deleteSystem(id, systemId))
export const useDuplicateSystem = (id: number) =>
  useProjectMutation(id, (a: { systemId: number; toProposalId?: number }) => api.duplicateSystem(id, a.systemId, a.toProposalId))
export const useMoveSystem = (id: number) =>
  useProjectMutation(id, (a: { systemId: number; toProposalId: number }) => api.moveSystem(id, a.systemId, a.toProposalId))
export const useUpsertLineItem = (id: number) =>
  useProjectMutation(id, (item: Omit<LineItemRec, 'id'> & { id?: number }) => api.upsertLineItem(id, item))
export const useDeleteLineItems = (id: number) =>
  useProjectMutation(id, (ids: number[]) => api.deleteLineItems(id, ids))
export const useDeleteLineItemsAsCO = (id: number) =>
  useProjectMutation(id, (a: { ids: number[]; co: ChangeOrderDetails }) => api.deleteLineItemsAsCO(id, a.ids, a.co))
export const useQuickAddBaseDesigns = (id: number) =>
  useProjectMutation(id, (p: Parameters<typeof api.quickAddBaseDesigns>[1]) => api.quickAddBaseDesigns(id, p))
export const useUpdateCircuit = (id: number) =>
  useProjectMutation(id, (a: { lineId: number; length: number; difficult: boolean }) => api.updateCircuitLength(id, a.lineId, a.length, a.difficult))
export const useCreateMaintenancePlan = (id: number) =>
  useProjectMutation(id, (p: Parameters<typeof api.createMaintenancePlan>[1]) => api.createMaintenancePlan(id, p))
export const useUtilities = () => useQuery({ queryKey: ['utilities'], queryFn: api.listUtilities, staleTime: Infinity })
export const useRequestUtilityData = (id: number) => useProjectMutation(id, (req: { kind: string; via: 'bayou' | 'email' | 'companycam'; photos: string[] }) => api.requestUtilityData(id, req))
export const useRecalculate = (id: number) => useProjectMutation(id, (systemIds: number[]) => api.recalculateSystems(id, systemIds))
export const useAddLineItems = (id: number) =>
  useProjectMutation(id, (p: Parameters<typeof api.addLineItems>[1]) => api.addLineItems(id, p))

/* ---- invoices ---- */
export const useGenerateInvoices = (id: number) => useProjectMutation(id, (o: InvoiceOptions) => api.generateInvoices(id, o))
export const useApplyInvoiceSettings = (id: number) =>
  useProjectMutation(id, (a: { invoiceId: number; ccFee: boolean; upfrontDiscount: boolean }) => api.applyInvoiceSettings(id, a.invoiceId, { ccFee: a.ccFee, upfrontDiscount: a.upfrontDiscount }))
export const useUpdateInvoice = (id: number) => useProjectMutation(id, (a: { invoiceId: number; patch: Partial<Invoice> }) => api.updateInvoice(id, a.invoiceId, a.patch))
export const useInvoiceStatus = (id: number) => useProjectMutation(id, (a: { invoiceId: number; status: InvoiceStatus | 'approved' }) => api.setInvoiceStatus(id, a.invoiceId, a.status))
export const useEditDeposit = (id: number) => useProjectMutation(id, (a: { invoiceId: number; amount: number }) => api.editDepositAmount(id, a.invoiceId, a.amount))
export const useCreditCardFee = (id: number) => useProjectMutation(id, (a: { invoiceId: number; on: boolean }) => api.setCreditCardFee(id, a.invoiceId, a.on))
export const useDeleteInvoices = (id: number) => useProjectMutation(id, () => api.deleteInvoices(id))

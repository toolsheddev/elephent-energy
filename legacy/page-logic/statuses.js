//get project status
const project_status = {{ project.data.project_status }};
const retro_status =
  {{ project.data?.project_retro?.additional_data?.actual_margin_perc?.actual_margin_perc ?? undefined }};

//get proposal status
const proposals = {{proposals.data}};
const proposalStatusOrder = ["finalized", "out for signature", "out for review", "pending", "rejected"];

const sortedProposalStatuses = proposals
  .map(proposal => proposal.proposal_status)
  .filter(status => proposalStatusOrder.includes(status))
  .sort((a, b) => proposalStatusOrder.indexOf(a) - proposalStatusOrder.indexOf(b));

const firstProposalStatus = sortedProposalStatuses[0] || 'pending';

//get invoice statuses
const invoices = {{invoices.data ?? []}};
const invoiceStatusOrder = ["paid", "open", "not sent", "void", "draft"];

const dep1 = invoices.filter(invoice => invoice.invoice_type === 'First Deposit');
const sortedInvoiceStatusesDep1 = dep1
  .map(invoice => invoice.invoice_status)
  .filter(status => invoiceStatusOrder.includes(status))
  .sort((a, b) => invoiceStatusOrder.indexOf(a) - invoiceStatusOrder.indexOf(b));
const firstInvoiceStatusDep1 = sortedInvoiceStatusesDep1[0] || 'not created';

const dep2 = invoices.filter(invoice => invoice.invoice_type === 'Second Deposit');
const sortedInvoiceStatusesDep2 = dep2
  .map(invoice => invoice.invoice_status)
  .filter(status => invoiceStatusOrder.includes(status))
  .sort((a, b) => invoiceStatusOrder.indexOf(a) - invoiceStatusOrder.indexOf(b));
const firstInvoiceStatusDep2 = sortedInvoiceStatusesDep2[0] || 'not created';

const final = invoices.filter(invoice => invoice.invoice_type === 'Final Invoice');
const sortedInvoiceStatusesFinal = final
  .map(invoice => invoice.invoice_status)
  .filter(status => invoiceStatusOrder.includes(status))
  .sort((a, b) => invoiceStatusOrder.indexOf(a) - invoiceStatusOrder.indexOf(b));
const firstInvoiceStatusFinal = sortedInvoiceStatusesFinal[0] || 'not created';

// get all statuses
const statuses = {
  project: project_status,
  proposal: firstProposalStatus,
  equipment: null,
  deposit1: firstInvoiceStatusDep1,
  deposit2: firstInvoiceStatusDep2,
  deposit_final: firstInvoiceStatusFinal,
  retrospective: retro_status === undefined ? 'not complete' : 'completed'
};

return statuses;
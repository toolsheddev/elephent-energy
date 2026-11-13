const proposals = {{  proposals.data }}.sort((a, b) => {
  const dateA = new Date(a.proposal_created_at)
  const dateB = new Date(b.proposal_created_at)
  return dateA - dateB
})
const firstProposalDate = new Date(proposals[0]?.proposal_created_at);

const latestPricingChange = new Date({{ pricing_change_dates.data.date[0] }});


return firstProposalDate ? firstProposalDate < latestPricingChange : false; 
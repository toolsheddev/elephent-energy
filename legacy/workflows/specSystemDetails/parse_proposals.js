const inputIds = startTrigger.data.specIncentives.proposal_id || [];
const existingIds = [];
const newProposalNames = [];

inputIds.forEach(item => {
  // If it's a string and NOT just a number stored as a string
  if (typeof item === 'string' && isNaN(Number(item))) {
    newProposalNames.push(item);
  } else {
    existingIds.push(Number(item));
  }
});

return { 
  existingIds: existingIds, 
  newProposalNames: newProposalNames 
};
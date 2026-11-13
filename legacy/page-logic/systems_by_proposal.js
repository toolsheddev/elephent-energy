function filterSystemsByProposalId(systemsData, key_value) {
    // Filter the systems data where proposal_id matches key_value
  if(key_value === null || key_value === undefined){
    return;
  } else {
      return systemsData.filter(system => system.proposal_id == key_value);
  }
}

// Example usage
return filterSystemsByProposalId({{systems.data}}, {{proposalTable.selectedRow.id}});

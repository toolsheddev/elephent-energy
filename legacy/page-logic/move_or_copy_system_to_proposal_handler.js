let selectedProposal = targetProposalSelect.value; 
let selectedSystem = active_system_row.value;
const originalProposalId = selectedSystem.proposal_id;

if (selectedProposal === 'NEW_SINGLE') {
    console.log("Creating a single new proposal...");
    try {
        const singlePropDb = await insert_quick_add_proposal.trigger({
            additionalScope: {
                house_id: house.data.id,
                proposal_name: selectedSystem.system_nickname 
            }
        });
        active_proposal_row.value = singlePropDb;
        selectedProposal = singlePropDb?.id?.[0] || singlePropDb?.[0]?.id;
        if (selectedProposal) {
            console.log("✅ Created single proposal ID:", selectedProposal);
        }
    } catch (e) {
        console.error("Failed to create new single proposal:", e);
    }
}

if (system_action_type.value === 'duplicate') {
    await duplicate_system_to_proposal.trigger({
        additionalScope: {
            proposalId: selectedProposal,
            systemId: selectedSystem.id
        }
    });
    await new Promise((resolve, reject) => {
        specPermitWorkflow.trigger({
            additionalScope: { proposalId: selectedProposal },
            onSuccess: resolve,
            onFailure: reject
        });
    });

} else if (system_action_type.value === 'move') {
    await move_system_to_proposal.trigger({
        additionalScope: {
            proposalId: selectedProposal,
            systemId: selectedSystem.id
        }
    });
    await new Promise((resolve, reject) => {
        specPermitWorkflow.trigger({
            additionalScope: { proposalId: selectedProposal },
            onSuccess: resolve,
            onFailure: reject
        });
    });
}
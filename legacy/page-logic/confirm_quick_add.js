const selectedDesigns = baseDesignsTable.selectedSourceRows; 
const selectedProposals = quickAddTargetProposal.value; 

if (!selectedProposals || selectedProposals.length === 0 || !selectedDesigns || selectedDesigns.length === 0) {
    utils.showNotification({title: "Missing Data", description: "Please select at least one Base Design and one Proposal.", type: "warning"});
    return;
}

// 🚨 NEW VALIDATION: Prevent mixing HVAC and Water Heaters!
const selectedSystemTypes = [...new Set(selectedDesigns.map(row => row.system_type.toLowerCase()))];
if (selectedSystemTypes.length > 1) {
    utils.showNotification({
        title: "Invalid Selection", 
        description: "You cannot mix HVAC and Water Heater systems in the same batch. Please select only one system type.", 
        type: "error"
    });
    return; // Instantly stops the script!
}
run_quick_add_flow.trigger();
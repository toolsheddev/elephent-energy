let baseSystem = proposalsTab.selectedItem.SystemToInsert.value;
let baseLineItems = proposalsTab.selectedItem.LineItemsToInsert.value.filter(item => item.line_item_type != null);
let selectedProposal = active_system_row.value.proposal_id;

// 🛡️ Safe Snapshot: Grab the ID right now before any UI changes happen
let currentSystemId = active_system_row.value.id; 

let errors = [];

let system = { ...baseSystem, proposal_id: selectedProposal };
if (system.system_type === 'hvac') {
    sizingChartForHVACSystems.setValue(true);
}
permitMode.setValue('edit');

try {
    // 1. Wait for system update
    await update_system.trigger({
        additionalScope: { system: system }
    });
    console.log('Updated System: ', system);

    // 2. Wait for deletion of old line items
    await delete_line_items2.trigger({
        additionalScope: { system_id: currentSystemId }
    });

    // 3. Prepare the new line items
    let lineItems = baseLineItems.map(item => {
        delete item.temp_id;
        delete item.fetchedFromDb;
        item.system_id = currentSystemId; // Safely use our locked ID!
        return item;
    });
    console.log('New Line items for system ' + currentSystemId, lineItems);

    // 4. Wait for insertion of new line items
    if (lineItems.length > 0) {
        await insert_line_items.trigger({
            additionalScope: { lineItems: lineItems }
        });
    }

} catch (error) {
    // If ANY of the awaited queries fail, it jumps straight here
    errors.push(error);
    console.error("Edit flow failed:", error);
} finally {
    // 5. Handle errors and reset the UI (guaranteed to run last!)
    if (errors.length > 0) {
        let plainErrors = errors.map(error => {
            return { message: error.message, name: error.name, stack: error.stack, fail: error.fail };
        });
        NewSystemErrors.setValue(plainErrors);
        NewSystemErrorsModal.setHidden(false);
    }
    
    // Now it is 100% safe to reset the modal
    resetNewSystem.trigger();
}
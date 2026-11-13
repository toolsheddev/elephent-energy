// Get the IDs of line items to delete
let idsToDelete = lineItemsTable.selectedRows.map((row) => row.id);
console.log("Line item IDs selected for deletion:", idsToDelete);

// Set the selected system from systems table
await selectedSystem.setValue(active_system_row.value);
console.log("Selected system set:", active_system_row.value);

// Trigger deletion of line items
console.log("Triggering delete_line_items...");
await new Promise((resolve, reject) => {
  delete_line_items.trigger({
    onSuccess: () => {
      console.log("Line items deleted successfully.");
      resolve();
    },
    onFailure: (error) => {
      console.error("Failed to delete line items:", error);
      reject(error);
    },
  });
});

// Trigger specPermitWorkflow with proposalId from selected system
console.log("Triggering specPermitWorkflow with proposalId:", selectedSystem.value.proposal_id);
await new Promise((resolve, reject) => {
  specPermitWorkflow.trigger({
    additionalScope: {
      proposalId: selectedSystem.value.proposal_id,
    },
    onSuccess: () => {
      console.log("specPermitWorkflow completed successfully.");
      resolve();
    },
    onFailure: (error) => {
      console.error("specPermitWorkflow failed:", error);
      reject(error);
    },
  });
});

// Refresh line items
console.log("Refreshing line_items...");
await line_items.trigger();
console.log("line_items data refreshed:", line_items.data);

// Set selected line items
selectedLineItems.setValue(line_items.data);
console.log("Selected line items updated.");

// Filter out the deleted line items from the working data
let lineItems = line_items_by_system.value;
console.log("Original line items from system:", lineItems);

lineItems = lineItems.filter((item) => !idsToDelete.includes(item.id));
console.log("Filtered line items after deletion:", lineItems);

// Update working data
line_items_wk.setValue(lineItems);
console.log("Updated line_items_wk with filtered items.");

// Set the working system
system_wk.setValue(active_system_row.value);
console.log("Working system updated.");

// Flag that a line item was deleted
deleteLineItem.setValue(true);
console.log("deleteLineItem flag set to true.");

modalFrame3.setHidden(true);
// Trigger final workflow
console.log("Triggering specIncentivesWorkflow...");
await incentivesWithoutArray.setValue(true);

specIncentivesWorkflow.trigger({
  onSuccess: function() {
    // Reset to false on success
    incentivesWithoutArray.setValue(false);
    console.log("Workflow completed successfully.");
  },
  onFailure: function(error) {
    // Reset to false on failure so it doesn't get stuck
    incentivesWithoutArray.setValue(false);
    console.error("Workflow failed:", error);
  }
});

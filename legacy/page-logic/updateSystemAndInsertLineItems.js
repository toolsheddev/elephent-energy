let baseSystem = SystemToInsert.value;
let baseLineItems = LineItemsToInsert.value.filter(item => item.line_item_type != null);
let selectedProposal = systemsTable.selectedRow.proposal_id;

let errors = [];

let system = { ...baseSystem, proposal_id: selectedProposal };

let systemPromise = new Promise((resolve, reject) => {
	update_system.trigger({
		additionalScope: {
			system: system
		},
		onSuccess: (data) => {
			resolve(system);  // Return the updated system
		},
		onFailure: reject
	});
}).catch(error => {
	errors.push(error);
	throw error;
});

// Handle the system promise
systemPromise.then(system => {
	console.log('Updated System: ');
	console.log(system);

	// Delete existing line items for the system before inserting new ones
	let deleteLineItemsPromise = new Promise((resolve, reject) => {
		delete_line_items2.trigger({
			additionalScope: {
				system_id: systemsTable.selectedRow.id  // Delete line items for this system
			},
			onSuccess: (data) => {
				resolve(data);  // Proceed after deletion
			},
			onFailure: reject
		});
	}).catch(error => {
		errors.push(error);
		throw error;
	});

	// Handle the delete line items promise
	deleteLineItemsPromise.then(() => {
		// Prepare the new line items for insertion
		let lineItems = baseLineItems.map(item => {
			delete item.temp_id;
			item.system_id = systemsTable.selectedRow.id;  // Link to updated system
			return item;
		});
		console.log('New Line items for system ' + systemsTable.selectedRow.id);
		console.log(lineItems);

		// Insert the new line items
		let lineItemPromise = new Promise((resolve, reject) => {
			insert_line_items.trigger({
				additionalScope: {
					lineItems: lineItems
				},
				onSuccess: (data) => {
					resolve(data.result);  // Return inserted line items
				},
				onFailure: reject
			});
		}).catch(error => {
			errors.push(error);
			throw error;
		});

		// Handle line item insertion and final error handling
		lineItemPromise.finally(() => {
			if (errors.length > 0) {
				// Convert errors to plain object for Retool
				let plainErrors = errors.map(error => {
					return { message: error.message, name: error.name, stack: error.stack, fail: error.fail };
				});
				NewSystemErrors.setValue(plainErrors);
				NewSystemErrorsModal.setHidden(false);
			}
		});
	});
}).finally(() => {
	// Final error handling if any
	if (errors.length > 0) {
		// Convert errors to plain object for Retool
		let plainErrors = errors.map(error => {
			return { message: error.message, name: error.name, stack: error.stack, fail: error.fail };
		});
		console.log(plainErrors);
		NewSystemErrors.setValue(plainErrors);
		NewSystemErrorsModal.setHidden(false);
	}
	// Reset modal state
	resetNewSystem.trigger();
});

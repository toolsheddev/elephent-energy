proposalTabsState.value.forEach(tab =>
  {

let baseSystem = tab.SystemToInsert.value;
let baseLineItems = tab.LineItemsToInsert.value.filter(item=>item.line_item_type != null);
//  let selectedProposal = SelectProposalNewSystem.selectedItem;

let errors = [];

// Clone the base system object for each proposal
let system = { ...baseSystem, proposal_id: tab.proposal_id };
if (system.system_type === 'hvac') {
  sizingChartForHVACSystems.setValue(true);
}
permitMode.setValue('add');
// Create system insert promise
let systemPromise = new Promise((resolve,reject) => {
	insert_system.trigger({
		additionalScope: {
			system: system
		},
		onSuccess: (data) => {
			resolve(data.result[0]) // there will only be one here so just return the first
		},
		onFailure: reject
	});
}).catch(error => {
	errors.push(error);
	throw error;
});

systemPromise.then(system => {
	console.log('System: ');
	console.log(system);
	let lineItems = baseLineItems.map(item => {
    delete item.temp_id;
    item.system_id = system.id;
    if (state.value === 'CO') {
      item.status = 'proposed - from change order';
    } else {
      item.status = 'active - from finalized proposal';
    }
    return item;
	});
	console.log('Line items for system '+system.id);
	console.log(lineItems);

	let lineItemPromise = new Promise((resolve,reject) => {
		insert_line_items.trigger({
			additionalScope: {
				lineItems: lineItems
			},
			onSuccess: (data) => {
				resolve(data.result)
			},
			onFailure: reject
		});
	}).catch(error => {
		errors.push(error);
		throw error;
	});

	lineItemPromise.finally(() => {
		if(errors.length > 0){
	    //convert errors to plain object so Retool can see it properly
	    let plainErrors = errors.map(error => {
	      return { message: error.message, name: error.name, stack: error.stack, fail: error.fail };
	    });
	    NewSystemErrors.setValue(plainErrors);
	    NewSystemErrorsModal.setHidden(false);
  	}
	});
}).finally(() => {
	if(errors.length > 0){
    //convert errors to plain object so Retool can see it properly
      let plainErrors = errors.map(error => {
        return { message: error.message, name: error.name, stack: error.stack, fail: error.fail };
      });
      console.log(plainErrors);
      NewSystemErrors.setValue(plainErrors);
      NewSystemErrorsModal.setHidden(false);
	}
    // reset modal state
  resetNewSystem.trigger();
});

    });

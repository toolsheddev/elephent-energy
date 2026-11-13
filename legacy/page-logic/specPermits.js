// Comes in from AdditionalScope
if(!proposalId)
    return;



/*************
 * Functions *
 *************/

/**
 * @param String city
 * @param String county
 * @return {Object} permits - keyed by permit type
 * */
async function getPermits(){
    /** 
     * @param Enum type - hvac, plumbing, electrical
     * @param String city
     * @param String county
     * @return {Object} - applicable permit record
     * */

    // Get permit records - the query will insert placeholders if jurisdiction is not matched
    const permitRecords = await new Promise((resolve,reject) => {
        permits.trigger({
            onSuccess: resolve,
            onFailure: reject
        });
    });

    let hvac = permitRecords.find(permit => permit.permit_type === 'hvac');
    let electrical = permitRecords.find(permit => permit.permit_type === 'electrical');
    let plumbing = permitRecords.find(permit => permit.permit_type === 'plumbing');

    let permitsToSpec = {
        hvac: hvac,
        electrical: electrical,
        plumbing: plumbing
    }
    return permitsToSpec;
}
async function createPermitLineItems(){
    function getPermitLineItem(permit){
        if(!laborRecords.reduce((acc,record) => acc || record.category === permit?.permit_type,false))
            return null;

        let permitCost;

        if(permit?.price?.cost instanceof Object){

            /*** 
             * Process permit cost multiplier types - add others in "else if" statements 
             * ***/
            if(permit.price.cost.multiplier_type === 'hvac' && permit.price.cost.multiplier_value){
                let hvacSystemIds = systemsThisProposal.filter(system => system.system_type === 'hvac').map(system => system.id);
                let hvacCost = lineItems.reduce((acc,item) => {
                    if(hvacSystemIds.includes(item.system_id))
                        return acc + item.price_actual;
                    else
                        return acc;
                },0);

                permitCost = Math.round(hvacCost * permit.price.cost.multiplier_value);
            } else {
                throw new Error('Invalid multiplier_type/value combination for permit '+JSON.stringify(permit));
            }

        }
        else if(typeof permit?.price?.cost === 'number')
            permitCost = permit.price.cost;
        else{
            throw new Error(`Invalid permit price JSON structure for permit ${permit.name}: ${JSON.stringify(permit)}`);
        }

        let newPermit = {
            system_id: catchallSystem.id,
            permit_id: permit.id,
            price_actual: permitCost,
            line_item_type: 'permit',
            description: permit.name
        }

        // update old item if it exists, otherwise return new one
        let oldPermit = oldPermitLineItems.find(item => item.permit_id === permit.id);
        if(oldPermit)
            newPermit.id = oldPermit.id;

        return newPermit;
    }


  /* Outer function logic */
    console.log("Fetching permits...");
    const permitsObj = await getPermits();
    console.log("Fetched permits:", permitsObj);

    console.log("Fetching systems for this proposal...");
    const systemsThisHouse = await new Promise((resolve, reject) => {
        systems.trigger({
            onSuccess: resolve,
            onFailure: reject
        });
    });
    const systemsThisProposal = systemsThisHouse.filter(system => system.proposal_id === proposalId);
    console.log(`Fetched ${systemsThisProposal.length} systems for proposal ${proposalId}`);

    const systemIds = systemsThisProposal.map(system => system.id);
    console.log("System IDs for this proposal:", systemIds);
    console.log('si', systemIds)
    console.log("Fetching line items...");
    let systemIds2 = systemsTable.data.map(i => i.id);
console.log('si2',systemIds2);
    const lineItemsAll = await new Promise((resolve, reject) => {
        line_items.trigger({
            onSuccess: resolve,
            onFailure: reject
        });
    });
    const lineItems = lineItemsAll.filter(item => systemIds.includes(item.system_id) && item.line_item_type != 'incentive');
    console.log(`Fetched ${lineItems.length} line items associated with the systems`);

    console.log("Fetching labor records...");
    const laborIds = lineItems.reduce((acc, item) => {
        if (item.labor_id) return [...acc, item.labor_id];
        else return acc;
    }, []);
    const laborRecords = await new Promise((resolve, reject) => {
        labor_filtered.trigger({
            additionalScope: {
                laborIds: laborIds
            },
            onSuccess: resolve,
            onFailure: reject
        });
    });
    console.log(`Fetched ${laborRecords.length} labor records`);

    console.log("Finding catchall system...");
    const catchallSystem = systemsThisProposal.find(system => system.system_type === 'other');
    if (!catchallSystem) throw new Error('Could not find catchall system for proposal ID ' + proposalId);
    console.log("Found catchall system:", catchallSystem);

    console.log("Identifying old permit line items...");
    const oldPermitLineItems = lineItems.filter(item => item.system_id === catchallSystem.id && item.line_item_type === 'permit');
    console.log(`Found ${oldPermitLineItems.length} old permit line items`);

    console.log("Specifying permits...");
    let permitLineItems = Object.keys(permitsObj).reduce((acc, type) => {
        let item = getPermitLineItem(permitsObj[type]);
        if (!item) return acc;
        else return [...acc, item];
    }, []);
    console.log(`Created ${permitLineItems.length} new permit line items`);

    console.log("Identifying permits to delete...");
    let permitsToDelete = [];
    oldPermitLineItems.forEach(oldItem => {
        if (!permitLineItems.find(newItem => newItem.id === oldItem.id)) permitsToDelete.push(oldItem);
    });
    console.log(`Found ${permitsToDelete.length} permits to delete`);

    permitsToDelete.forEach(item => {
        console.log(`Deleting permit line item: ${item.id}`);
        delete_line_item_js.trigger({
            additionalScope: {
                lineItemId: item.id
            }
        });
    });

    return permitLineItems;
}


/****** Run the program ******/
let permitLineItems = await createPermitLineItems();

// insert the permits
insert_permit_line_items.trigger({
    additionalScope: {
        lineItems: permitLineItems
    }
});

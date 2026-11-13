let house = startTrigger.data.house;
let proposalId = startTrigger.data.proposalId;
if (!proposalId) return;

async function getPermits() {
    let permitRecords = await permits(house);
    permitRecords = permitRecords.data;

    let hvac = permitRecords.find(permit => permit.permit_type === 'hvac');
    let electrical = permitRecords.find(permit => permit.permit_type === 'electrical');
    let plumbing = permitRecords.find(permit => permit.permit_type === 'plumbing');
    

    let permitsToSpec = {
        hvac: hvac,
        electrical: electrical,
        plumbing: plumbing
    };
    console.log('permitToSpec',permitsToSpec)
    return permitsToSpec;
}

async function createPermitLineItems() {
    function getPermitLineItem(permit) {
        if (!permit) return null;  

        let validLabor = laborRecords.some(record => record.category === permit.permit_type);
        if (!validLabor) return null;  

        let permitCost;

        if (permit?.price?.cost instanceof Object) {
            if (permit.price.cost.multiplier_type === 'hvac' && permit.price.cost.multiplier_value) {
                let hvacSystemIds = systemsThisProposal.filter(system => system.system_type === 'hvac').map(system => system.id);
                let hvacCost = lineItems.reduce((acc, item) => hvacSystemIds.includes(item.system_id) ? acc + item.price_actual : acc, 0);
                permitCost = Math.round(hvacCost * permit.price.cost.multiplier_value);
            } else {
                console.log("❌ Invalid multiplier type for permit:", permit);
                return null;
            }
        } else if (typeof permit?.price?.cost === 'number') {
            permitCost = permit.price.cost;
        } else {
            console.log(`❌ Invalid permit price JSON structure for ${permit.name}:`, permit);
            return null;
        }

        // ✅ **If house is in MA, add $100 per permit**
        if (house.state === 'MA') {
            console.log(`✅ Adding $100 to permit cost for ${permit.permit_type} in MA`);
            permitCost += 100;
        }

        let newPermit = {
            system_id: catchallSystem.id,
            permit_id: permit.id,
            price_actual: permitCost,
            line_item_type: 'permit',
            description: permit.name
        };

        let oldPermit = oldPermitLineItems.find(item => item.permit_id === permit.id);
        if (oldPermit) newPermit.id = oldPermit.id;

        return newPermit;
    }

    console.log("🚀 Fetching permits...");
    const permitsObj = await getPermits();
    if (!permitsObj) {
        console.log("❌ No permits found.");
        return [];
    }

    console.log("✅ Fetching systems for this proposal...");
    let systemsThisHouse = await systems(house.id);
    systemsThisHouse = systemsThisHouse.data;
    if (!systemsThisHouse.length) {
        console.log("❌ No systems found for house:", house.id);
        return [];
    }

    const systemsThisProposal = systemsThisHouse.filter(system => system.proposal_id === proposalId);
    if (!systemsThisProposal.length) {
        console.log("❌ No systems found for proposal:", proposalId);
        return [];
    }
    console.log(`✅ Found ${systemsThisProposal.length} systems for proposal ${proposalId}`);

    const systemIds = systemsThisProposal.map(system => system.id);
    console.log("✅ System IDs for this proposal:", systemIds);

    function filterSystemsByProposalId(systemsData, key_value) {
        if (key_value === null || key_value === undefined) {
            return;
        } else {
            return systemsData.filter(system => system.proposal_id == key_value);
        }
    }
    let filteredByProposalData = filterSystemsByProposalId(systemsThisHouse, proposalId);
    let system_ids = filteredByProposalData.map(i => i.id);
    console.log('✅ Filtered System IDs:', system_ids);

    console.log("🚀 Fetching line items...");
    let lineItemsAll = await line_items(system_ids);
    lineItemsAll = lineItemsAll.data;
    const lineItems = lineItemsAll.filter(item => systemIds.includes(item.system_id) && item.line_item_type !== 'incentive');
    console.log(`✅ Found ${lineItems.length} relevant line items`);

    console.log("🚀 Fetching labor records...");
    const laborIds = lineItems.reduce((acc, item) => item.labor_id ? [...acc, item.labor_id] : acc, []);
    let laborRecords = await labor_filtered(laborIds);
    laborRecords = laborRecords.data;
    console.log('lbr', laborRecords)
    if (!laborRecords.length) {
        console.log("❌ No labor records found for IDs:", laborIds);
        return [];
    }
    console.log(`✅ Found ${laborRecords.length} labor records`);

    console.log("🚀 Finding catchall system...");
    const catchallSystem = systemsThisProposal.find(system => system.system_type === 'other');
    if (!catchallSystem) {
        console.log("❌ Could not find catchall system for proposal ID:", proposalId);
        return [];
    }
    console.log("✅ Found catchall system:", catchallSystem);

    console.log("🚀 Identifying old permit line items...");
    const oldPermitLineItems = lineItems.filter(item => item.system_id === catchallSystem.id && item.line_item_type === 'permit');
    console.log(`✅ Found ${oldPermitLineItems.length} old permit line items`);

    console.log("🚀 Specifying permits...");
    let permitLineItems = Object.keys(permitsObj).reduce((acc, type) => {
        let item = getPermitLineItem(permitsObj[type]);
        if (item) acc.push(item);
        return acc;
    }, []);

    if (!permitLineItems.length) {
        console.log("⚠️ No new permit line items were created.");
        return [];
    }
    console.log(`✅ Created ${permitLineItems.length} new permit line items`);

    console.log("🚀 Identifying permits to delete...");
    let permitsToDelete = oldPermitLineItems.filter(oldItem => !permitLineItems.find(newItem => newItem.id === oldItem.id));
    console.log(`✅ Found ${permitsToDelete.length} permits to delete`);

    permitsToDelete.forEach(item => {
        console.log(`🚀 Deleting permit line item: ${item.id}`);
        delete_line_item_js(item.id);
    });

    return permitLineItems;
}

// Run the function and return the new permit line items
let permitLineItems = await createPermitLineItems();

console.log("✅ Final Permit Line Items:", permitLineItems);
return permitLineItems;

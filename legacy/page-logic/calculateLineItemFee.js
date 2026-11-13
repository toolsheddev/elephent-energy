const allSystemsWithLineItems = getLineItemsForAProposal.data;
const projectData = project.data;
const allEquipmentData = equipmentsData.data;

// =================================================================
//                 HELPER FUNCTION
// =================================================================
const getFinancingAmountsMap = (amountsArray) => {
    if (!Array.isArray(amountsArray)) return {};
    return Object.fromEntries(amountsArray.map(item => [item.lender, item.amount]));
};

// =================================================================
//                 MAIN LOGIC
// =================================================================

const financingAmountsMap = getFinancingAmountsMap(projectData.financing_amounts);
const synchronyAmount = financingAmountsMap.Synchrony;
const hasSynchrony = projectData.lender?.includes('Synchrony');

if (!hasSynchrony || !synchronyAmount || synchronyAmount <= 0) {
    return { upserts: [], marginUpdates: [] };
}

const eligibleSystems = allSystemsWithLineItems.filter(system => {
    const isHvac = system.system_type === 'hvac';
    if (!isHvac) return false;
    const condenserLineItem = system.line_items.find(li => li.description === 'Condenser');
    if (!condenserLineItem) return false;
    const equipment = allEquipmentData.find(eq => eq.id === condenserLineItem.equipment_id);
    const isMitsubishi = equipment?.manufacturer === 'Mitsubishi';
    return isMitsubishi;
});

if (eligibleSystems.length === 0) {
    return { upserts: [], marginUpdates: [] };
}

const passthroughTypes = ['incentive', 'change order', 'margin', 'permit', 'discount', 'financing fees'];
const totalEligibleCost = eligibleSystems.reduce((sum, sys) => {
    const systemPrice = sys.line_items
        .filter(li => !passthroughTypes.includes(li.line_item_type))
        .reduce((priceSum, li) => priceSum + Number(li.price_actual || 0), 0);
    return sum + systemPrice;
}, 0);

console.log("\nDEBUG: --- Pre-Calculation Values ---");
console.log("DEBUG: Total Eligible Cost for Proportion:", totalEligibleCost);

if (totalEligibleCost <= 0) {
    return { upserts: [], marginUpdates: [] };
}

const lineItemsToUpsert = [];
const marginUpdates = [];

for (const system of eligibleSystems) {
    console.log(`\nDEBUG: --- Processing System ID: ${system.id} ---`);
    const systemPrice = system.line_items
        .filter(li => !passthroughTypes.includes(li.line_item_type))
        .reduce((priceSum, li) => priceSum + Number(li.price_actual || 0), 0);
    
    console.log(`DEBUG: Individual System Price for Proportion:`, systemPrice);
    const costProportion = systemPrice / totalEligibleCost;
    console.log(`DEBUG: Cost Proportion:`, costProportion);

    const feeData = {
        price_actual: Math.round((-0.07 * synchronyAmount * costProportion) * 100) / 100,
        margin_amount: Math.round((-0.007 * synchronyAmount * costProportion) * 100) / 100,
        line_item_type: 'financing fees',
        description: 'Synchrony Financing Fee',
        system_id: system.id
    };
    console.log("DEBUG: Calculated Fee Data:", feeData);

    const existingFeeLineItem = system.line_items.find(li => li.line_item_type === 'financing fees');

    lineItemsToUpsert.push({
      id: existingFeeLineItem ? existingFeeLineItem.id : undefined,
      ...feeData
    });

    const marginLineItem = system.line_items.find(li => li.line_item_type === 'margin');
    
    // --- Margin Update Debugging ---
    if (marginLineItem) {
        console.log(`DEBUG: --- Margin Update Calculation for System ${system.id} ---`);
        const oldFeeMargin = existingFeeLineItem ? Number(existingFeeLineItem.margin_amount) : 0;
        const newFeeMargin = feeData.margin_amount;
        const currentMarginValue = Number(marginLineItem.price_actual);

        console.log("DEBUG: Current Margin Value:", currentMarginValue);
        console.log("DEBUG: Old Fee Margin to Subtract:", oldFeeMargin);
        console.log("DEBUG: New Fee Margin to Add:", newFeeMargin);
        
        const updatedMarginPriceRaw = (currentMarginValue - oldFeeMargin) + newFeeMargin;
        console.log("DEBUG: Unrounded New Margin:", updatedMarginPriceRaw);

        const updatedMarginPrice = Math.round(updatedMarginPriceRaw * 100) / 100;
        console.log("DEBUG: FINAL Rounded New Margin:", updatedMarginPrice);

        marginUpdates.push({
            id: marginLineItem.id,
            price_actual: updatedMarginPrice
        });
    } else {
        console.log(`DEBUG: No 'margin' line item found for system ${system.id}. Cannot update margin.`);
    }
}

console.log("\nDEBUG: --- Final Output ---");
console.log("DEBUG: Upserts Array:", lineItemsToUpsert);
console.log("DEBUG: Margin Updates Array:", marginUpdates);

return {
    upserts: lineItemsToUpsert,
    marginUpdates: marginUpdates
};
function formatCurrency(value, locale = 'en-US', currency = 'USD') {
    const formatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
    });
    let formatted = formatter.format(value);
    formatted = formatted.substr(0, formatted.length - 3);
    return formatted;
}

function roundCurrency(n) {
    return Math.round(n);
}

// Helper: Determine dynamic labor warranty label for a given set of line items
function getLaborWarrantyLabel(systemItems, laborMap, defaultDisplay) {
    const warrantyLabor = systemItems
        .filter(item => item.line_item_type === 'labor' || item.line_item_type === 'labor warranty')
        .map(item => laborMap[item.labor_id])
        .filter(Boolean);

    const hasTerm = (term) => warrantyLabor.some(l => l.name && l.name.includes(term));

    if (!hasTerm('12 Years') && hasTerm('2 Years')) {
        return '2 Years Extended Heat Pump Labor Warranty';
    }
    if (hasTerm('5 Years')) {
        return '5 Years Extended Heat Pump Labor Warranty';
    }
    if (hasTerm('10 Years Extended')) {
        return '10 Years Extended Heat Pump Labor Warranty';
    }
    if (hasTerm('12 Years')) {
        return '12 Years Extended Heat Pump Labor Warranty';
    }

    return defaultDisplay || 'Labor Warranty';
}

// Set up data
let systems = getSystems.data;
let equipment = getEquipmentById.data;
let labor = getLaborById.data;
const lineItems = getLineitems.data.filter(item => item.line_item_type !== 'financing fees');
let systemTypeDisplay = getSystemType.data;
let proposals = startTrigger.data.proposalToGenerate.map(i => i);
const electricalBreakout = startTrigger.data.electricalBreakout;

// Predefined order of key labels
const keyLabels = [
    { label: 'Total Cost', bold: true },
    { label: 'Total Point of Sale Rebates', bold: true, italic: true },
    { label: 'Out-of-Pocket Cost (Amount paid to Elephant or Financed)', bold: true },
    { label: 'Total Direct to Customer Incentives', bold: true, italic: true },
    { label: 'Net Cost', bold: true }
];
const keyLabelsOrder = keyLabels.map(obj => obj.label);

// Return an object indexed by proposal id
let tableData = proposals.reduce((acc, proposal) => {
    let proposalSystems = systems.filter(system => system.proposal_id === proposal);

    const systemSortOrder = ['hvac', 'water heater', 'adder', 'maintenance plan', 'labor warranty', 'other'];
    function sortSystems(a, b) {
        const orderMap = new Map(systemSortOrder.map((type, index) => [type, index]));
        const defaultIndex = systemSortOrder.indexOf('adder');
        const getOrderIndex = type => orderMap.has(type) ? orderMap.get(type) : defaultIndex;
        return getOrderIndex(a.system_type) - getOrderIndex(b.system_type);
    }
    proposalSystems.sort(sortSystems);

    let discounts = [];
    let incentives = [];
    let customerIncentives = [];
    let typeIndex = {};
    let electricalCost = 0;

    let proposalCosts = proposalSystems.flatMap(system => {
        let items = lineItems.filter(item => item.system_id === system.id && item.line_item_type !== 'margin');
        let breakouts = [];
        let totalSystemCost = 0;

        // Resolve specific label if this is a labor warranty system
        const resolvedWarrantyLabel = (system.system_type === 'labor warranty')
            ? getLaborWarrantyLabel(items, labor, systemTypeDisplay['labor warranty'])
            : null;

        // Handle 'adder' system type
        if (system.system_type === 'adder') {
            items.forEach((item) => {
                let price = roundCurrency(item.price_actual + item.margin_amount);

                if (electricalBreakout && item.line_item_type === 'labor' && labor[item.labor_id]?.category?.toLowerCase() === 'electrical') {
                    electricalCost += price;
                } else {
                    breakouts.push({
                        'label': item.description,
                        'value': price,
                        'typeIndex': typeIndex[item.description] || 0,
                        'item': item
                    });
                    typeIndex[item.description] = (typeIndex[item.description] || 0) + 1;
                }
            });
        } else {
            items.forEach((item) => {
                let price = roundCurrency(item.price_actual + item.margin_amount);

                if (electricalBreakout && item.line_item_type === 'labor' && labor[item.labor_id]?.category?.toLowerCase() === 'electrical') {
                    electricalCost += price;
                } else if (item.line_item_type === 'incentive' && price <= 0 && item.incentive_recipient === 'elephant' && item.incentive_id != 268) {
                    incentives.push({
                        'label': item.description + ' (point of sale)',
                        'value': price
                    });
                } else if (item.line_item_type === 'incentive' && price <= 0 && item.incentive_id != 268) {
                    customerIncentives.push({
                        'label': item.description + ' (direct to customer)',
                        'value': price
                    });
                } else if (item.line_item_type === 'discount') {
                    discounts.push({
                        'label': item.description,
                        'value': price
                    });
                } else if (item.show_in_proposal || system.system_type === 'labor warranty') {
                    const itemLabel = resolvedWarrantyLabel || item.description;
                    let ti = typeIndex[itemLabel] || 0;
                    typeIndex[itemLabel] = ti + 1;

                    breakouts.push({
                        'label': itemLabel,
                        'value': price,
                        'typeIndex': 0, // Keep 0 so matching warranties align across proposals
                        'item': item
                    });
                } else {
                    totalSystemCost += price;
                }
            });

            // Consolidate generic labor, equipment, and labor warranty items
            breakouts = Object.values(
                breakouts.reduce((acc, current) => {
                    const equip = equipment[current.item.equipment_id];
                    const equipId = current.item.equipment_id;
                    const equipLaborId = equip?.labor_id ?? null;
                    const lineLaborId = current.item.labor_id ?? null;
                    const effectiveLaborId = lineLaborId ?? equipLaborId ?? null;
                    const type = current.item.line_item_type;
                    const laborRef = labor[effectiveLaborId];

                    const parent = Object.values(equipment).find(
                        e => Array.isArray(e?.additional_equipment_ids) && e.additional_equipment_ids.includes(equipId)
                    );

                    let key;
                    let label = current.label;
                    const isLaborWarranty = system.system_type === 'labor warranty' || type === 'labor warranty';

                    if (isLaborWarranty) {
                        if (String(effectiveLaborId) === '181') {
                            key = `labor-warranty-181`;
                            label = current.item.description || resolvedWarrantyLabel || systemTypeDisplay['labor warranty'];
                        } else {
                            // Key by the computed warranty label so different year terms create separate rows
                            label = resolvedWarrantyLabel || systemTypeDisplay['labor warranty'] || 'Labor Warranty';
                            key = `labor-warranty-${label}`;
                        }
                    } else if (parent) {
                        key = `equip-${parent.id}`;
                    } else if (equipId) {
                        key = `equip-${equipId}`;
                    } else if (lineLaborId) {
                        key = `labor-${lineLaborId}-${current.item.description}`;
                    } else {
                        key = `line-${current.item.id}`;
                    }

                    if (!isLaborWarranty && type === 'labor' && laborRef?.category === 'hvac') {
                        label = current.item.description;
                    }

                    if (label === 'Wall Head' && equip) {
                        const model = equip.model_number || current.item.description?.split('|')[0]?.trim() || equipId;
                        label = `${label} (${model})`;
                    }

                    if (!acc[key]) {
                        acc[key] = {
                            label,
                            value: 0,
                            typeIndex: current.typeIndex,
                            item: current.item
                        };
                    }

                    acc[key].value += roundCurrency(current.value);
                    return acc;
                }, {})
            );
        }

        if (system.system_type === 'labor warranty' || totalSystemCost === 0) {
            return breakouts;
        }

        let ti = typeIndex[system.system_type] || 0;
        typeIndex[system.system_type] = ti + 1;
        let label = system.system_nickname ? system.system_nickname : systemTypeDisplay[system.system_type];
        if (ti > 0) label = `${label} ${ti + 1}`;

        return [{
            'label': label,
            'typeIndex': ti,
            'value': totalSystemCost
        }, ...breakouts];
    });

    if (electricalBreakout && electricalCost > 0) {
        proposalCosts.push({
            'label': 'Electrical Upgrades',
            'value': electricalCost,
            'typeIndex': 0
        });
    }

    proposalCosts = proposalCosts.concat(discounts);
    incentives = incentives.sort((a, b) => a.label.localeCompare(b.label));
    customerIncentives = customerIncentives.sort((a, b) => a.label.localeCompare(b.label));

    let totalCost = proposalCosts.reduce((total, val) => total + val.value, 0);
    proposalCosts.push({ 'label': 'Total Cost', 'value': totalCost });

    const rebateLabel = "Denver Cares Electrical Rebate";
    const rebateDisplayLabel = `${rebateLabel} (point of sale)`;
    let consolidatedRebate = incentives
        .filter(incentive => incentive.label.includes(rebateLabel))
        .reduce((total, rebate) => total + rebate.value, 0);

    incentives = incentives.filter(incentive => !incentive.label.includes(rebateLabel));

    if (consolidatedRebate !== 0) {
        incentives.push({ label: rebateDisplayLabel, value: consolidatedRebate });
    }

    proposalCosts = proposalCosts.concat(incentives);
    let totalIncentives = incentives.reduce((total, val) => total + val.value, 0);
    proposalCosts.push({ 'label': 'Total Point of Sale Rebates', 'value': totalIncentives });

    let netCostToElephant = totalCost + totalIncentives;
    proposalCosts.push({ 'label': 'Out-of-Pocket Cost (Amount paid to Elephant or Financed)', 'value': netCostToElephant });

    proposalCosts = proposalCosts.concat(customerIncentives);
    let totalCustomerIncentives = customerIncentives.reduce((total, val) => total + val.value, 0);
    proposalCosts.push({ 'label': 'Total Direct to Customer Incentives', 'value': totalCustomerIncentives });

    let netCostToCustomer = netCostToElephant + totalCustomerIncentives;
    proposalCosts.push({ 'label': 'Net Cost', 'value': netCostToCustomer });

    proposalCosts = proposalCosts.filter(cost => 
        cost.value !== 0 || cost.label === '10-Year Heat Pump Performance Guarantee' || cost.label === 'Net Cost' || cost.label === 'Out-of-Pocket Cost (Amount paid to Elephant or Financed)' || 
        (cost.label && (cost.label.toLowerCase().includes('promo') || cost.label.toLowerCase().includes('discount') || cost.label.toLowerCase().includes('warranty')))
    );

    acc[proposal] = proposalCosts;
    return acc;
}, {});

/*** Turn it into a columnar format ***/

function findInsertIndex(line, table, proposal) {
    for (let i = 0; i < table.length; i++) {
        if (table[i]['label'] === line.label && table[i]['typeIndex'] === line.typeIndex) {
            return i;
        }
    }

    let nextKeyLabel = null;
    let lineIndex = proposal.findIndex(item => item.label === line.label && item.typeIndex === line.typeIndex);
    for (let i = lineIndex; i < proposal.length; i++) {
        let strippedLabel = proposal[i]['label'].replace(/<\/?[^>]+(>|$)/g, "");
        if (keyLabelsOrder.includes(strippedLabel)) {
            nextKeyLabel = strippedLabel;
            break;
        }
    }

    if (nextKeyLabel) {
        for (let i = 0; i < table.length; i++) {
            let strippedLabel = table[i]['label'].replace(/<\/?[^>]+(>|$)/g, "");
            if (strippedLabel === nextKeyLabel) {
                return i;
            }
        }
    }

    return table.length;
}

const filteredKeyLabels = keyLabels.filter(keyLabel => 
    Object.values(tableData).some(proposal => 
        proposal.some(line => line.label === keyLabel.label)
    )
);

let table = filteredKeyLabels.map(keyLabel => {
    let formatted = keyLabel.label;
    if (keyLabel.bold) formatted = '<b>' + formatted + '</b>';
    if (keyLabel.italic) formatted = '<i>' + formatted + '</i>';
    return { 'label': formatted, 'typeIndex': 0 };
});

Object.keys(tableData).forEach((proposalId, proposalIndex) => {
    let proposal = tableData[proposalId];
    table.forEach(row => row[proposalIndex] = null);

    proposal.forEach((line) => {
        line.value = formatCurrency(line.value);
        const keyLabel = keyLabels.find(keyLabel => line.label === keyLabel.label);
        if (keyLabel?.bold) {
            line.label = '<b>' + line.label + '</b>';
            line.bold = true;
        }
        if (keyLabel?.italic) {
            line.label = '<i>' + line.label + '</i>';
            line.italic = true;
        }

        let existingLineIndex = table.findIndex(row => {
            return row.label === line.label && (keyLabel ? true : row.typeIndex === line.typeIndex);
        });

        if (existingLineIndex !== -1) {
            let existingValue = parseFloat(table[existingLineIndex][proposalIndex]?.replace(/[^0-9.-]+/g, "")) || 0;
            let newValue = formatCurrency(existingValue + parseFloat(line.value.replace(/[^0-9.-]+/g, "")));
            if (line.bold) newValue = '<b>' + newValue + '</b>';
            if (line.italic) newValue = '<i>' + newValue + '</i>';
            table[existingLineIndex][proposalIndex] = newValue;
        } else {
            const newRow = { 'label': line.label, [proposalIndex]: line.value, 'typeIndex': line.typeIndex };
            let insertIndex = findInsertIndex(line, table, proposal);
            table.splice(insertIndex, 0, newRow);
        }
    });
});

return table;
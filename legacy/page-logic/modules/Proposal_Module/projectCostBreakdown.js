function formatCurrency(value, locale = 'en-US', currency = 'USD') {
    const formatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
    });
    let formatted = formatter.format(Math.round(value));
    formatted = formatted.substr(0, formatted.length - 3);
    return formatted;
}

// Set up data
let proposals = {{proposalsToGenerate.value}};
console.log(proposals);
let systems = {{new_systems.data}};
let equipment = {{equipment_by_id.data}};
let labor = {{labor_by_id.data}};
let lineItems = {{line_items.data}};
let systemTypeDisplay = {{systemTypeDisplay.value}};
const electricalBreakout = {{DisplayOptions.value.includes('electrical_breakout')}};

// Predefined order of key labels
const keyLabels = [
    {
        label: 'Total Cost',
        bold: true
    },
    {
        label: 'Total Point of Sale Rebates',
        bold: true,
        italic: true
    },
    {
        label: 'Out-of-Pocket Cost (Amount paid to Elephant or Financed)',
        bold: true
    },
    {
        label: 'Total Direct to Customer Incentives',
        bold: true,
        italic: true
    },
    {
        label: 'Net Cost',
        bold: true
    }
];
const keyLabelsOrder = keyLabels.map(obj => obj.label);

// Return an object indexed by proposal id
let tableData = proposals.reduce((acc, proposal) => {
    // Filter systems by proposal_id
    let proposalSystems = systems.filter(system => system.proposal_id === proposal);
    console.log('Systems for ' + proposal.nickname + ' proposal:');
    console.log(proposalSystems);

    // Sort systems by type
    const systemSortOrder = ['hvac', 'water heater', 'adder', 'maintenance plan', 'other'];
    function sortSystems(a, b) {
        const orderMap = new Map(systemSortOrder.map((type, index) => [type, index]));
        const defaultIndex = systemSortOrder.indexOf('adder');
        const getOrderIndex = type => orderMap.has(type) ? orderMap.get(type) : defaultIndex;
        return getOrderIndex(a.system_type) - getOrderIndex(b.system_type);
    }
    proposalSystems.sort(sortSystems);

    // Sum line item costs for each system
let discounts = [];
let incentives = [];
let customerIncentives = [];
let electricalCost = 0;
let typeIndex = {};
let showHeatLoanPayment = false;
let optionalSlides = {{ optionalSlideSelection.selectedLabels }};
let proposalCosts = proposalSystems.flatMap(system => {
    let items = lineItems.filter(item => item.system_id === system.id && item.line_item_type !== 'margin');
    let breakouts = [];
    let totalSystemCost = 0;

    // Handle new 'adder' system type
    if (system.system_type === 'adder') {
        items.forEach((item) => {
            let price = item.price_actual + item.margin_amount;
            breakouts.push({
                'label': item.description,
                'value': price,
                'typeIndex': typeIndex[item.description] || 0,
                'item': item
            });
            typeIndex[item.description] = (typeIndex[item.description] || 0) + 1;
        });
    } else {
        items.forEach((item) => {
            let price = item.price_actual + item.margin_amount;

            console.log('Processing Line Item: ' + item.description + ' - ' + price, ' margin ', item.margin_amount);


            if (item.line_item_type === 'incentive' && price <= 0 && item.incentive_recipient === 'elephant') {
                incentives.push({
                    'label': item.description + ' (point of sale)',
                    'value': price
                });
            } else if (item.line_item_type === 'incentive' && price <= 0) {
                customerIncentives.push({
                    'label': item.description + ' (direct to customer)',
                    'value': price
                });
            } else if (item.line_item_type === 'discount') {
                discounts.push({
                    'label': item.description,
                    'value': price
                });
            } else if (item.line_item_type === 'labor'
                && labor[item.labor_id]?.category === 'electrical'
                && electricalBreakout) {
                electricalCost += price;
            } else if (item.show_in_proposal) {
                let ti = typeIndex[item.description];
                if (!ti && ti !== 0) ti = 0;
                else ti += 1;
                typeIndex[item.description] = ti;
                breakouts.push({
                    'label': item.description,
                    'value': price,
                    'typeIndex': ti,
                    'item': item
                });
            } else {
                console.log(system.system_type + ' system total before addition: ' + totalSystemCost);
                totalSystemCost += price;
                console.log(system.system_type + ' system total after addition: ' + totalSystemCost);
            }
        });

 // Generic labor and equipment consolidation
breakouts = breakouts.reduce((acc, current) => {
    console.log('Processing breakout: ' + current.label + ' - ' + current.value);

    // Determine if the current item is a parent or child equipment
    let isParent = equipment[current.item.equipment_id] && equipment[current.item.equipment_id].additional_equipment_ids;
    let isChild = acc.some(item => equipment[item.item.equipment_id] && equipment[item.item.equipment_id].additional_equipment_ids && equipment[item.item.equipment_id].additional_equipment_ids.includes(current.item.equipment_id));

    console.log('equipment_id: ' + current.item.equipment_id + ' | labor_id: ' + current.item.labor_id);
    console.log('Is Parent: ' + isParent + ' | Is Child: ' + isChild);

    if (isChild) {
        // If the item is a child, find its parent in the acc array
        let parent = acc.find(item => equipment[item.item.equipment_id] && equipment[item.item.equipment_id].additional_equipment_ids && equipment[item.item.equipment_id].additional_equipment_ids.includes(current.item.equipment_id));

        if (parent) {
            parent.value += current.value; // Add child value to parent
            console.log('Child item added to parent: ' + parent.label + ' - ' + parent.value);
        }
    } else {
        // If the item is a parent or an independent equipment (not child of any other)
        let parent = isParent 
            ? acc.find(item => item.item.equipment_id === current.item.equipment_id && item.typeIndex === current.typeIndex)
            : null;

        if (parent) {
            // Consolidate labor and equipment costs
            parent.value += current.value;
            console.log('Item added to existing parent: ' + parent.label + ' - ' + parent.value);

            // Update the label if labor description is available
            if (current.item.labor_id && labor[current.item.labor_id] && labor[current.item.labor_id].name) {
                parent.label = labor[current.item.labor_id].name;
                console.log('Parent label updated to labor description: ' + parent.label);
            }
        } else {
            // Add new parent or independent item to the accumulator
            let label = current.item.labor_id && labor[current.item.labor_id] && labor[current.item.labor_id].name
                ? labor[current.item.labor_id].name 
                : current.label;  
            acc.push({
                'label': label, 
                'value': current.value,
                'typeIndex': current.typeIndex,
                'item': current.item
            });
            console.log('New parent or independent item added: ' + label + ' - ' + current.value);
        }
    }

    return acc;
}, []);

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

    if (electricalCost > 0) {
        proposalCosts.push({
            'label': 'Electrical Upgrades',
            'value': electricalCost
        });
    }

    // Discounts
    proposalCosts = proposalCosts.concat(discounts);

    // Group and sort incentives by label
    incentives = incentives.sort((a, b) => a.label.localeCompare(b.label));
    customerIncentives = customerIncentives.sort((a, b) => a.label.localeCompare(b.label));

    let totalCost = Math.round(proposalCosts.reduce((total, val) => total + val.value, 0));
    proposalCosts.push({
        'label': 'Total Cost',
        'value': totalCost,
    });

    // Incentives
    proposalCosts = proposalCosts.concat(incentives);
    let totalIncentives = Math.round(incentives.reduce((total, val) => total + val.value, 0));
    proposalCosts.push({
        'label': 'Total Point of Sale Rebates',
        'value': totalIncentives,
    });

    // Net cost due to Elephant
    let netCostToElephant = Math.round(totalCost + totalIncentives);
    proposalCosts.push({
        'label': 'Out-of-Pocket Cost (Amount paid to Elephant or Financed)',
        'value': netCostToElephant,
    });

    // Incentives payable to customer
    proposalCosts = proposalCosts.concat(customerIncentives);
    let totalCustomerIncentives = Math.round(customerIncentives.reduce((total, val) => total + val.value, 0));
    proposalCosts.push({
        'label': 'Total Direct to Customer Incentives',
        'value': totalCustomerIncentives,
    });

    // Net cost to customer
    let netCostToCustomer = netCostToElephant + totalCustomerIncentives;
    proposalCosts.push({
        'label': 'Net Cost',
        'value': netCostToCustomer,
    });

  // Remove any with zero value except for "10-Year Heat Pump Performance Guarantee"
proposalCosts = proposalCosts.filter(cost => 
    cost.value !== 0 || cost.label === '10-Year Heat Pump Performance Guarantee' || cost.label === 'Net Cost'
);
  
    // Assign the aggregated costs to the corresponding proposal in the accumulator
    acc[proposal] = proposalCosts;

    return acc;
}, {});


/*** Turn it into a columnar format ***/

// Function to find the correct insert index based on the first proposal
function findInsertIndex(line, table, proposal) {
    // Check for a match first
    for (let i = 0; i < table.length; i++) {
        if (table[i]['label'] === line.label && table[i]['typeIndex'] === line.typeIndex) {
            return i;
        }
    }

    // Find the next occurring key label in the proposal
    let nextKeyLabel = null;
    let lineIndex = proposal.findIndex(item => item.label === line.label && item.typeIndex === line.typeIndex);
    for (let i = lineIndex; i < proposal.length; i++) {
        let strippedLabel = proposal[i]['label'].replace(/<\/?[^>]+(>|$)/g, ""); // Stripping HTML tags for comparison
        if (keyLabelsOrder.includes(strippedLabel)) {
            nextKeyLabel = strippedLabel;
            break;
        }
    }

    // Find the index of that key label in the table
    if (nextKeyLabel) {
        for (let i = 0; i < table.length; i++) {
            let strippedLabel = table[i]['label'].replace(/<\/?[^>]+(>|$)/g, "");
            if (strippedLabel === nextKeyLabel) {
                return i;
            }
        }
    }

    // If no key label is found after the section, return the length of the table
    return table.length;
}

// Set up table with key labels
const filteredKeyLabels = keyLabels.filter(keyLabel => 
  Object.values(tableData).some(proposal => 
    proposal.some(line => line.label === keyLabel.label)
  )
);
let table = filteredKeyLabels.map(keyLabel => {
    let formatted = keyLabel.label;
    if(keyLabel.bold)
        formatted = '<b>' + formatted + '</b>';
    if(keyLabel.italic)
        formatted = '<i>' + formatted + '</i>';
    return {'label': formatted, 'typeIndex': 0}
});
console.log('Prepared table: ',table);

Object.keys(tableData).forEach((proposalId, proposalIndex) => {
    let proposal = tableData[proposalId];
    console.log('Processing proposal ' + proposalId);
    console.log(proposal);

    // Add the column to each item even if it's not going to have a value
    table.forEach(row => row[proposalIndex] = null);

    proposal.forEach((line, lineIndex) => {
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

        // Match existing line if it exists from a previous proposal
        let existingLineIndex = table.findIndex(row => {
            return row.label === line.label && (keyLabel ? true : row.typeIndex === line.typeIndex);
        });

        if (existingLineIndex !== -1) {
            // Existing line found, sum the value at the correct column index
            let existingValue = parseFloat(table[existingLineIndex][proposalIndex]?.replace(/[^0-9.-]+/g, "")) || 0; // Convert currency back to number for summing
            let newValue = formatCurrency(existingValue + parseFloat(line.value.replace(/[^0-9.-]+/g, ""))); // Sum the values
            console.log('the thing before ',newValue);
            if(line.bold)
                newValue = '<b>'+newValue+'</b>';
            if(line.italic)
                newValue = '<i>'+newValue+'</i>';
            console.log('wtf is happening??? ', newValue);
            table[existingLineIndex][proposalIndex] = newValue; // Update with summed value
            console.log('Match found - summing line value at index ' + existingLineIndex);
        } else {
            // Line does not exist, find the correct insert index based on the first proposal
            const newRow = { 'label': line.label, [proposalIndex]: line.value, 'typeIndex': line.typeIndex };
            let insertIndex = findInsertIndex(line, table, proposal);

            table.splice(insertIndex, 0, newRow);
            console.log('No match found - adding line to table at index ' + insertIndex);
        }
    });
});

console.log('Final table:', table);
return table;

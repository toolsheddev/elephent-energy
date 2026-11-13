/*********
 * Setup *
 *********/

// Check for project
let projectId;
if (!project.data) throw Error('A project must be selected in order to generate invoices');
else projectId = project.data.id;

// Check for proposal id
const proposalId = project.data.finalized_proposal_id;
if (!proposalId) throw Error('A proposal must be finalized in order to generate invoices');

// Set up pretty invoice names for labor items, keyed by system_type
const laborNames = {
  hvac: 'Electric Heat Pump Installation',
  'water heater': 'Heat Pump Water Heater Installation',
  ev: 'Electric Vehicle Charger Installation',
  solar: 'Solar Panel Installation',
  panel: 'Panel Upgrades',
  cooktop: 'Induction Cooktop Wiring',
  'energy efficiency': 'Energy Efficiency Measures',
  maintenance: 'Maintenance Plan',
  other: 'Other',
};

// Equipment types to give their own invoice lines to
const enumeratedEquipmentTypes = [
  'Condenser',
  'AHU',
  'Dual-Fuel Coil',
  'Horizontal-Ducted Head',
  'Wall Head',
  'Floor Head',
  'Ceiling Cassette',
  'Thermostat',
  'ERV',
  'EV Charger',
  'HPWH',
];

const sortOrder = ['labor']
  .concat(enumeratedEquipmentTypes)
  .concat(['parts', 'permit', 'discount', 'change order', 'incentive']);

// Place to store invoice lines before being inserted
let invoiceLines = [];

// Place to store margin line items to deal with later in application flow
let marginLineItems = [];

// Incentives payable to customer directly go in the footer
let footerLines = [];

// Total cost of project before incentives
let amountBeforeIncentives;

// Other global vars for info
let lineItems; // Array
let systems; // keyed by id
let equipmentData; // Get equipment data keyed by id
let ahriData; // get AHRI data keyed by id
let incentivesData; // get incentives data keyed by id
let permitsData; // get permits data keyed by id

/*************
 * Functions *
 *************/
function getSystem(item) {
  let system = systems.find((system) => item.system_id === system.id);
  if (system) return system;
  else throw Error('Line item must be attributed to a system: ' + JSON.stringify(item));
}

// Variable to track electrical upgrades across all systems
let electricalUpgradesLineItem = null;

function processLabor(item) {
    let system = getSystem(item);

    // Use category from finalized line items to identify electrical labor
    let laborDescription = item.description || laborNames[system.system_type] || 'Custom Installation';

    // Check if labor is electrical work based on the category from finalized line items
    if (item.category && item.category.toLowerCase() === 'electrical') {
        // Check if the Electrical Upgrades line already exists at a global level
        if (electricalUpgradesLineItem) {
            // If it exists, just add the labor cost to the existing line
            electricalUpgradesLineItem.amount += item.price_actual + item.margin_amount;
        } else {
            // Otherwise, create a new Electrical Upgrades line item at the global level
            electricalUpgradesLineItem = {
                sort_type: 'electrical',
                line_item_type: 'labor',
                system_id: system.id,  // Still keep the system id of the first item
                name: 'Electrical Upgrades',
                amount: item.price_actual + item.margin_amount
            };
            // Add it to the invoiceLines directly
            invoiceLines.push(electricalUpgradesLineItem);
        }
    } else {
        // Handle multiple items for the 'adder' system type
        if (system.system_type === 'adder' && laborDescription) {
            // Create a separate line for each labor item in the 'adder' system
            system.invoiceItems['labor_${item.id}'] = {
                sort_type: 'labor',
                line_item_type: 'labor',
                system_id: system.id,
                name: laborDescription,
                amount: item.price_actual + item.margin_amount
            };
        } else if (system.invoiceItems && system.invoiceItems.labor) {
            system.invoiceItems.labor.amount = system.invoiceItems.labor.amount 
                ? system.invoiceItems.labor.amount + item.price_actual + item.margin_amount 
                : item.price_actual + item.margin_amount;
        } else {
            let name = laborNames[system.system_type];
            if (system.system_type === 'hvac') {
                name += ' \nAHRI Number: ' + (ahriData[system.ahri_id]?.ahri_number ? ahriData[system.ahri_id]?.ahri_number : '') 
                        + ' \nSEER2: ' + (ahriData[system.ahri_id]?.seer_2 ? ahriData[system.ahri_id]?.seer_2 : '') 
                        + ' \nEER2: ' + (ahriData[system.ahri_id]?.eer_2 ? ahriData[system.ahri_id]?.eer_2 : '') 
                        + ' \nHSPF2: ' + (ahriData[system.ahri_id]?.hspf_2 ? ahriData[system.ahri_id]?.hspf_2 : '');
            }

            system.invoiceItems.labor = {
                sort_type: 'labor',
                line_item_type: 'labor',
                system_id: system.id,
                name: name,
                amount: item.price_actual + item.margin_amount
            };
        }
    }
}

function processEquipment(item) {
  let system = getSystem(item);
  let equipment = equipmentData[item.equipment_id];
  if (!equipment) throw Error('Equipment not found for line item ' + item);

  let equipmentDescription = equipment.equipment_name + '  \nModel Number: ' + equipment.model_number + '    Serial Number: ' + (item.serial_number ? item.serial_number : '');

  // Check if the equipment is a water heater and append UEF to the description
  if (equipment.equipment_type === 'HPWH') {
    let uefValue = equipment.uef ? equipment.uef : '';
    equipmentDescription += '  \nUEF: ' + uefValue;
  }

  if (enumeratedEquipmentTypes.includes(equipment.equipment_type)) {
    system.invoiceItems['equipment_' + item.id] = {
      sort_type: equipment.equipment_type,
      line_item_type: 'equipment',
      system_id: system.id,
      name: equipmentDescription,  // Use the updated description with UEF
      amount: item.price_actual + item.margin_amount,
    };
  } else if (system.invoiceItems && system.invoiceItems.parts) {
    system.invoiceItems.parts.amount = system.invoiceItems.parts.amount
      ? system.invoiceItems.parts.amount + item.price_actual + item.margin_amount
      : item.price_actual + item.margin_amount;
  } else {
    system.invoiceItems.parts = {
      sort_type: 'parts',
      line_item_type: 'equipment',
      system_id: system.id,
      name: 'Parts & Accessories',
      amount: item.price_actual + item.margin_amount,
    };
  }
}

let denverCaresRebate = null;

function processIncentive(item) {
  let system = getSystem(item);

  // Get the incentive from incentivesData
  let incentive = incentivesData[item.incentive_id];
  if (!incentive) throw Error('Could not find incentive for item ' + JSON.stringify(item));

  // Use item.incentive_recipient if it exists; fallback to incentive.recipient
  const recipient = item.incentive_recipient || incentive.recipient;

  // Skip incentive if the amount is zero
  if (item.price_actual === 0) return;

  // Define valid incentive IDs for "Denver Cares Electrical Rebate"
  const denverCaresIds = [38, 70, 71, 72, 73];

  // Consolidate "Denver Cares Electrical Rebate" into **one** line item across all systems
  if (denverCaresIds.includes(item.incentive_id)) {  
    if (!denverCaresRebate) {
      denverCaresRebate = {
        sort_type: 'incentive',
        line_item_type: 'incentive',
        system_id: null, 
        name: 'Denver Cares Electrical Rebate',
        amount: 0 
      };
      invoiceLines.push(denverCaresRebate);
    }
    denverCaresRebate.amount += item.price_actual;
    return;
  }

  // Process Elephant Energy incentives normally
  if (item.price_actual > 0 && recipient === 'elephant') {
    system.invoiceItems.labor.amount += item.price_actual;
  } else if (recipient === 'elephant') {
    let incentiveLine = {
      sort_type: 'incentive',
      line_item_type: 'incentive',
      system_id: system.id,
      name: item.description || 'Incentive',
      amount: item.price_actual,
    };
    system.invoiceItems['incentive_' + item.id] = incentiveLine;
  } 
  else if (recipient === 'customer' || recipient === 'homeowner') {
    footerLines.push({
      name: item.description || 'Incentive',
      amount: -Math.abs(item.price_actual), // Ensure it's negative for clarity
    });
  } else {
    throw Error(`Invalid incentive recipient "${recipient}" for line item: ${JSON.stringify(item)}`);
  }
}

function processDiscount(item) {
  let system = getSystem(item);
  system.invoiceItems['discount_' + item.id] = {
    sort_type: 'discount',
    line_item_type: 'discount',
    system_id: system.id,
    name: item.description,
    amount: item.price_actual,
  };
}

//  function processChangeOrder(item) {
//    let system = getSystem(item);
//    system.invoiceItems['change_order_' + item.id] = {
//      sort_type: 'change order',
//      line_item_type: 'change order',
//      system_id: system.id,
//      name: `Change Order: ${item.description}`,
//      amount: item.price_actual + item.margin_amount,
//    };
//  }

let permitsLineItem = null; // Global variable to track permit costs

function processPermit(item) {
  let system = getSystem(item);

  // If permitsLineItem doesn't exist, create it
  if (!permitsLineItem) {
    permitsLineItem = {
      sort_type: 'permit',
      line_item_type: 'permit',
      system_id: null, // No specific system association since it's aggregated
      name: 'Permits',
      amount: 0, // Start at zero, will accumulate total
    };

    // Add it to invoiceLines directly to ensure it appears only once
    invoiceLines.push(permitsLineItem);
  }

  // Add the permit cost to the total amount
  permitsLineItem.amount += item.price_actual;
}


function processMaintenancePlan(item) {
  let system = getSystem(item);
  if (system.invoiceItems && system.invoiceItems.maintenance) {
    system.invoiceItems.maintenance.amount = system.invoiceItems.maintenance.amount
      ? system.invoiceItems.maintenance.amount + item.price_actual + item.margin_amount
      : item.price_actual + item.margin_amount;
  } else {
    system.invoiceItems.maintenance = {
      sort_type: 'maintenance',
      line_item_type: 'maintenance',
      system_id: system.id,
      name: 'Maintenance Plan',
      amount: item.price_actual + item.margin_amount,
    };
  }
}

function processFinancingFee(item) {
    let system = getSystem(item);
    // Add the financing fee as a line item to the system's invoice items.
    // It's treated like a discount for sorting purposes.
    system.invoiceItems['financing_fee_' + item.id] = {
        sort_type: 'discount', // Sort it along with other discounts
        line_item_type: 'financing fees',
        system_id: system.id,
        name: 'Synchrony Financing Fee',
        amount: item.price_actual, // This is already a negative value
    };
}
/*********************
 * Application Logic *
 *********************/

// Get the right systems and line items
let lineItemsPromise = new Promise((resolve, reject) => {
  line_items_finalized.trigger({
    onSuccess: resolve,
    onFailure: reject,
    additionalScope: {
      finalizedProposalId: proposalId,
    },
  });
});
let systemsPromise = new Promise((resolve, reject) => {
  systems_finalized.trigger({
    onSuccess: resolve,
    onFailure: reject,
    additionalScope: {
      finalizedProposalId: proposalId,
    },
  });
});
let equipmentPromise = new Promise((resolve, reject) => {
  equipment_by_id.trigger({
    onSuccess: resolve,
    onFailure: reject,
  });
});
let ahriPromise = new Promise((resolve, reject) => {
  ahri_by_id.trigger({
    onSuccess: resolve,
    onFailure: reject,
  });
});
let incentivesPromise = new Promise((resolve, reject) => {
  incentives_by_id.trigger({
    onSuccess: resolve,
    onFailure: reject,
  });
});

// Get information on what invoices we're creating
let firstDepositPct = firstDepositAmount.value;
let firstCardFees = firstDepositCcFee.value;
let finalCardFees = finalInvoiceCcfee.value;
let firstDepositAmountCustom = firstDepositCustomAmount.value;
console.log('Card fees: ${firstCardFees} ${finalCardFees}');

let firstDepositInvoice;
if (firstDepositPct > 0 || firstDepositAmountCustom > 0) {
  firstDepositInvoice = {
    project_id: projectId,
    invoice_type: 'First Deposit',
    invoice_status: 'not sent',
    invoice_amount: 0,
  };
}
let finalInvoice = {
  project_id: projectId,
  invoice_type: 'Final Invoice',
  invoice_status: 'not sent',
  invoice_amount: 0,
};

Promise.all([
  lineItemsPromise,
  systemsPromise,
  equipmentPromise,
  ahriPromise,
  incentivesPromise,
])
  .then(async ([gotlineItems, gotSystems, gotEquipmentData, gotAhriData, gotIncentivesData]) => {
    console.log("let's goooooo");

    // Set global-scope vars
    const sortOrder = ['labor', 'equipment', 'margin', 'discount', 'change order', 'permit', 'maintenance plan'];
    lineItems = gotlineItems.sort((a, b) => {
      const indexA = sortOrder.indexOf(a.line_item_type);
      const indexB = sortOrder.indexOf(b.line_item_type);

      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return 0;
    });

    systems = gotSystems;
    equipmentData = gotEquipmentData;
    ahriData = gotAhriData;
    incentivesData = gotIncentivesData;

    // Get permits
    let permitIds = lineItems
      .filter((item) => item.line_item_type === 'permit' && item.permit_id)
      .map((item) => item.permit_id);
    permitsData = await new Promise((resolve, reject) => {
      permits_by_id.trigger({
        additionalScope: { permitIds },
        onSuccess: resolve,
        onFailure: reject,
      });
    });

   // Set up invoiceItems property on all systems and categorize systems as either change orders or not
    systems.forEach(system => {
      system.invoiceItems = {};
      system.isChangeOrder = system.system_status === 'active - from change order';
    });

    // Process line items
    console.log('Processing ' + lineItems.length + ' line items');
    lineItems.forEach((item) => {
       const system = getSystem(item);
       const isStandaloneChangeOrder = item.status === 'active - from change order' && system.system_status !== 'active - from change order';
       if (isStandaloneChangeOrder) {
       // Case 3: Standalone change order item associated with a proposed system
        system.invoiceItems['change_order_' + item.id] = {
        sort_type: 'change order',
        line_item_type: 'change order',
        system_id: system.id,
        name: `Change Order: ${item.description}`,
        amount: item.price_actual + item.margin_amount,
      };
  }
   else {
      if (item.line_item_type === 'labor') processLabor(item);
      else if (item.line_item_type === 'equipment') processEquipment(item);
      else if (item.line_item_type === 'margin') marginLineItems.push(item); // process margin later after all equipment and labor line items are dealt with
      else if (item.line_item_type === 'financing fees') processFinancingFee(item);
      else if (item.line_item_type === 'discount') processDiscount(item);
      else if (item.line_item_type === 'incentive') processIncentive(item);
      else if (item.line_item_type === 'permit') processPermit(item);
      else if (item.line_item_type === 'maintenance plan') processMaintenancePlan(item);
      else throw Error('Invalid line item type: ' + item.line_item_type + '. Item in question: ' + JSON.stringify(item));
      }
});
    systems.forEach((system) => {
    if (system.isChangeOrder) {
        // Add prefix to all line items of change order systems
        Object.keys(system.invoiceItems).forEach(key => {
          const item = system.invoiceItems[key];
          if (!item.name.startsWith('Change Order:')) {
            item.name = `Change Order: ${item.name}`;
          }
        });
      }
    });

    // Process invoice line items in systems
    let incentiveLines = [];
    let discountLines = [];
    let changeOrderLines = [];

    systems.forEach((system) => {
      let newLines = [];
      if (!system.invoiceItems || Object.keys(system.invoiceItems).length === 0) return;

      Object.values(system.invoiceItems).forEach((line) => {
        if (line.sort_type === 'incentive') incentiveLines.push(line);
        else if (line.sort_type === 'discount') discountLines.push(line);
        else if (line.sort_type === 'change order') changeOrderLines.push(line);
        else newLines.push(line);
      });

      // Sort newLines in the correct order
      newLines.sort((a, b) => {
        const indexA = sortOrder.indexOf(a.sort_type);
        const indexB = sortOrder.indexOf(b.sort_type);

        if (indexA < indexB) return -1;
        if (indexA > indexB) return 1;
        return 0;
      });

      // Add to invoiceLines
      invoiceLines = invoiceLines.concat(newLines);
    });

    // Add incentives, discounts, and change orders
    invoiceLines = invoiceLines.concat(discountLines, changeOrderLines, incentiveLines);

    // Add credit card fee for final invoice
    let applyUpfrontDiscount = finalInvoiceUpfrontDiscount.value;
    let applyFinalCcFee = finalInvoiceCcfee.value;
    
    // First, calculate the subtotal of all lines that have been assembled so far
    let subtotal = invoiceLines.reduce((acc, line) => acc + line.amount, 0);
    
    // 1. Apply the 3% Upfront Discount if the toggle is on
    if (applyUpfrontDiscount) {
      const discountAmount = -0.03 * subtotal; // Discount is a negative amount
      const otherSystem = systems.find(s => s.system_type === 'other');

      // 2. Insert the discount into line_items_new
      const insertedDiscount = await new Promise((resolve, reject) => {
          insert_line_items.trigger({
            additionalScope: {
              lineItems: [{
                system_id: otherSystem.id,
                line_item_type: 'discount',
                description: '3% Upfront Payment Discount',
                price_actual: discountAmount,
              }]
            },
            onSuccess: resolve,
            onFailure: reject
          });
      });
      
      invoiceLines.push({
        line_item_type: 'discount',
        name: '3% Upfront Payment Discount',
        amount: discountAmount,
        system_id: otherSystem.id,
      });
      // Update the subtotal to reflect the new discount
      subtotal += discountAmount;
    }
    
    // 2. Apply the 3% Credit Card Fee for the FINAL invoice if the toggle is on
    if (applyFinalCcFee) {
      invoiceLines.push({
        line_item_type: 'credit card fee',
        name: '3% Credit Card Fee',
        amount: 0.03 * subtotal,
      });
    }

    // Get amount after incentives (only those directed to Elephant)
let amountAfterIncentives = invoiceLines.reduce((acc, line) => {
  if (line.sort_type === 'incentive') {
    // Retrieve the incentive from incentivesData using the line's incentive_id
    const incentive = incentivesData[line.incentive_id];

    // Fallback logic: Use line.incentive_recipient if present; otherwise, fallback to incentive.recipient
    const recipient = line.incentive_recipient || incentive?.recipient;

    // Include the amount only if the recipient is not 'customer' or 'homeowner'
    if (recipient !== 'customer' && recipient !== 'homeowner') {
      return acc + line.amount;
    }
  } else {
    // Include amounts for non-incentive lines
    return acc + line.amount;
  }

  return acc;
}, 0);

// Calculate net cost including all invoice and footer line items
let netCost = Math.round(
  (invoiceLines.reduce((acc, line) => acc + line.amount, 0) +
    footerLines.reduce((acc, line) => acc + line.amount, 0)) * 100
) / 100;

let projectTotal = Math.round(invoiceLines.reduce((acc, line) => acc + line.amount, 0));
if (firstDepositInvoice) {
  firstDepositInvoice.invoice_amount =
    firstDepositAmountCustom > 0
      ? firstDepositAmountCustom
      : Math.round(projectTotal * firstDepositPct);

  finalInvoice.invoice_amount = projectTotal - firstDepositInvoice.invoice_amount;

  invoiceLines.push({
    line_item_type: 'deposit',
    name: 'Credit for First Deposit',
    amount: -firstDepositInvoice.invoice_amount,
  });
} else {
  finalInvoice.invoice_amount = projectTotal;
}

    // Remove sort_type field (not stored in DB)
    invoiceLines.forEach((line) => delete line.sort_type);

    // Set up final invoice footer
    if (footerLines.length > 0) {
      finalInvoice.footer = 'Incentives payable directly to customer: ';

      footerLines.forEach((line) => {
  finalInvoice.footer += `\n $${-line.amount} - ${line.name}`;
});

      finalInvoice.footer += '\n\nNet Project Cost: $' + netCost;
      finalInvoice.footer += '\nEquipment Purchase Date: ' + (project.data.closed_date || '');

      if (house.data.state === 'MA') {
        finalInvoice.footer += '\n\nFor Massachusetts Projects:';
        finalInvoice.footer += '\nHPIN Company ID NMTPPS1553827498';
        finalInvoice.footer += '\nInstall Date: ' + (project.data.install_date ? project.data.install_date : new Date ());
      }

      if (
        (house.data.city && house.data.city.includes('Boulder')) ||
        (house.data.county && house.data.county.includes('Boulder'))
      ) {
        finalInvoice.footer += '\n\nRemoval & disposal of old equipment included';
      }
    }


let deleteInvoiceLineItemsPromise = new Promise((resolve, reject) => {
  deleteExistingInvoiceLineItems.trigger({
    additionalScope: { projectId },
    onSuccess: resolve,
    onFailure: reject,
  });
});

let deleteInvoicesPromise = new Promise((resolve, reject) => {
  deleteExistingInvoices.trigger({
    additionalScope: { projectId },
    onSuccess: resolve,
    onFailure: reject,
  });
});

deleteInvoiceLineItemsPromise
  .then(() => {
    console.log('Invoice line items deleted (or no items to delete)');
    return deleteInvoicesPromise; // Trigger the second promise after the first one resolves
  })
  .then(() => {
    console.log('Deletion process completed, proceeding with insertion.');

    // Insert final invoice
    let finalInvoicePromise = new Promise((resolve, reject) => {
      insert_invoice.trigger({
        onSuccess: resolve,
        onFailure: reject,
        additionalScope: {
          invoiceData: finalInvoice,
        },
      });
    });

    finalInvoicePromise
      .then((gotFinalInvoice) => {
        console.log('Inserted final invoice');
        finalInvoice = gotFinalInvoice?.result[0];

        invoiceLines.forEach((item) => {
          item.invoice_id = finalInvoice.id;
        });

        let invoiceLinesPromise = new Promise((resolve, reject) => {
          insert_invoice_lines.trigger({
            onSuccess: resolve,
            onFailure: reject,
            additionalScope: {
              invoiceLines: invoiceLines,
            },
          });
        });

        invoiceLinesPromise
          .then((invoiceLines) => {
            console.log(invoiceLines?.result[0].rowCount + ' lines created for final invoice');
          })
          .catch((error) => {
            console.log('Error in processing line items for final invoice: ' + error.message);
            throw error;
          });

        // Add invoice id to other deposits
        if (firstDepositInvoice) firstDepositInvoice.invoice_id = finalInvoice.id;

        // Insert deposit invoices
        let firstDepositInvoicePromise;
        if (firstDepositInvoice) {
          firstDepositInvoicePromise = new Promise((resolve, reject) => {
            insert_invoice.trigger({
              onSuccess: resolve,
              onFailure: reject,
              additionalScope: {
                invoiceData: firstDepositInvoice,
              },
            });
          });
        }

        // Insert invoice lines for each deposit invoice
        Promise.all([firstDepositInvoicePromise])
          .then(([gotFirstDepositInvoice]) => {
            let newLines = [];
            let firstDepositInvoice = gotFirstDepositInvoice?.result[0];

            if (firstDepositInvoice) {
              console.log('First deposit invoice created: ' + JSON.stringify(firstDepositInvoice));
              newLines.push({
                invoice_id: firstDepositInvoice.id,
                line_item_type: 'deposit',
                name: firstDepositAmountCustom > 0 ? 'First Deposit' : 'First Deposit: ' + firstDepositPct * 100 + '% of total',
                amount: firstDepositInvoice.invoice_amount,
              });
              if (firstCardFees) {
                newLines.push({
                  invoice_id: firstDepositInvoice.id,
                  line_item_type: 'credit card fee',
                  name: '3% Credit Card Fee',
                  amount: Math.round((0.03 * firstDepositInvoice.invoice_amount) * 100) / 100, 
                });
              }
            }

            if (newLines.length > 0) {
              let depositLinesPromise = new Promise((resolve, reject) => {
                insert_invoice_lines.trigger({
                  onSuccess: resolve,
                  onFailure: reject,
                  additionalScope: {
                    invoiceLines: newLines,
                  },
                });
              })
                .then((invoiceLines) => {
                  console.log(invoiceLines?.result[0].rowCount + ' lines created for deposit invoices');
                })
                .catch((error) => {
                  console.log('Error in processing line items for deposit invoices: ' + error.stack);
                  throw error;
                });
            }
          })
          .catch((error) => {
            console.log('Error in processing deposit invoices: ' + error.stack);
            throw error;
          });
      })
      .catch((error) => {
        console.log('Error in processing final invoice: ' + error.message);
        throw error;
      });
  })
  .catch((error) => {
    console.log('Error encountered in processing: ' + error.stack);
    throw error;
  });
  });
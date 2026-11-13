/*********
 * Setup *
 *********/
console.log('in upsert query')
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
            system.invoiceItems[`labor_${item.id}`] = {
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

let depositConfigPromise = new Promise((resolve, reject) => {
  deposit_config.trigger({
    onSuccess: resolve,
    onFailure: reject,
  });
});
let depositConfigResult = [];
let firstDepositPct, firstCardFees, finalCardFees, firstDepositAmountCustom;
let insert = false;
// Fetch deposit config
Promise.all([depositConfigPromise])
  .then(([depositConfig]) => {
    depositConfigResult = depositConfig;
    handleDepositLogic();  // Call logic after resolving promise
  })
  .catch(error => {
    console.error('Error fetching deposit config:', error);
  });

// Function to handle deposit logic
function handleDepositLogic() {
  if (checkForInvoices.data.length <= 0) {
    console.log('insertion')
    insert = true;
    firstDepositPct = firstDepositAmount.value;
    firstCardFees = firstDepositCcFee.value;
    finalCardFees = finalInvoiceCcfee.value;
    firstDepositAmountCustom = firstDepositCustomAmount.value;
    console.log('firstdepositpct: ', firstDepositPct)
    console.log(`Card fees: ${firstCardFees}, ${finalCardFees}`);
    //  insert_deposit_config.trigger();
  } else if (depositConfigResult.length > 0) {
    console.log('upsertion')
    // OUTDATED: These params are no longer saved in the DB.  
    // Credit line items will not be generated during upsertion,  
    // and the credit line items inserted during the initial insertion will be used.  
    const config = depositConfigResult[0];
    firstDepositPct = config.first_deposit_pct;
    firstCardFees = config.first_card_fees;
    finalCardFees = config.final_card_fees;
    firstDepositAmountCustom = config.first_deposit_amount_custom;
    console.log('firstdepositpct: ', firstDepositPct)
  }

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
Promise.all([lineItemsPromise, systemsPromise, equipmentPromise, ahriPromise, incentivesPromise])
  .then(async ([gotlineItems, gotSystems, gotEquipmentData, gotAhriData, gotIncentivesData]) => {
    const sortOrder = ['labor', 'equipment', 'margin', 'discount', 'change order', 'permit', 'maintenance plan'];
    lineItems = gotlineItems.sort((a, b) => {
      const indexA = sortOrder.indexOf(a.line_item_type);
      const indexB = sortOrder.indexOf(b.line_item_type);

      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return 0;
    });
    console.log('line', lineItems);
    systems = gotSystems;
    equipmentData = gotEquipmentData;
    ahriData = gotAhriData;
    incentivesData = gotIncentivesData;

    // get permits
    let permitIds = lineItems
      .filter((item) => item.line_item_type === 'permit' && item.permit_id)
      .map((item) => item.permit_id);
    permitsData = await new Promise((resolve, reject) => {
      permits_by_id.trigger({
        additionalScope: {
          permitIds: permitIds,
        },
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

    /// Process invoice line items in systems
    let incentiveLines = [];
    let discountLines = [];
    let changeOrderLines = [];

    systems.forEach((system) => {
      let newLines = [];
      if (!system.invoiceItems || Object.keys(system.invoiceItems).length === 0) return;
      Object.values(system.invoiceItems).forEach((line) => {
        // put incentives, discounts, and change orders into separate arrays to be added at the end
        if (line.sort_type === 'incentive') incentiveLines.push(line);
        else if (line.sort_type === 'discount') discountLines.push(line);
        else if (line.sort_type === 'change order') changeOrderLines.push(line);
        else newLines.push(line);
      });

      // sort newLines in the right order
      newLines.sort((a, b) => {
        const indexA = sortOrder.indexOf(a.sort_type);
        const indexB = sortOrder.indexOf(b.sort_type);

        if (indexA < indexB) return -1;
        if (indexA > indexB) return 1;
        return 0;
      });

      // add to invoiceLines
      invoiceLines = invoiceLines.concat(newLines);
    });
    // add incentives, discounts, and change orders
    invoiceLines = invoiceLines.concat(discountLines);
    invoiceLines = invoiceLines.concat(changeOrderLines);
    invoiceLines = invoiceLines.concat(incentiveLines);
    console.log('changeOrderLines',changeOrderLines );
    // add credit card fee for final invoice
    if (finalCardFees) {
      invoiceLines.push({
        line_item_type: 'credit card fee',
        name: '3% Credit Card Fee',
        amount: 0.03 * invoiceLines.reduce((acc, line) => acc + line.amount, 0),
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

    // Ensure firstDepositInvoice is defined
if (!firstDepositInvoice) {
  console.warn("⚠ First Deposit Invoice is undefined, skipping credit line.");
} else {
  console.log("✅ First Deposit Invoice Found:", firstDepositInvoice);

  // Ensure the invoice amount is set correctly
  firstDepositInvoice.invoice_amount = firstDepositAmountCustom > 0 
    ? firstDepositAmountCustom 
    : Math.round(firstDepositPct * amountAfterIncentives) || 0;

  console.log("💰 First Deposit Invoice Amount:", firstDepositInvoice.invoice_amount);

  // Add the credit line only if there is a valid invoice amount
  if (firstDepositInvoice.invoice_amount > 0) {
    let depositCreditLine = {
      line_item_type: 'deposit',
      name: 'Credit for First Deposit',
      amount: -1 * firstDepositInvoice.invoice_amount, // Ensure it's negative
    };

    console.log("📝 Adding Deposit Credit Line:", depositCreditLine);

    invoiceLines.push(depositCreditLine);
  } else {
    console.warn("⚠ First Deposit Invoice has no amount, skipping credit line.");
  }
}

    finalInvoice.invoice_amount = Math.round(invoiceLines.reduce((acc, line) => acc + line.amount, 0) * 100) / 100;
    // During final invoice amount calculation, the pre-existing first credit line items  
    // will be fetched and added to the invoice amount.
    const existingFirstCreditLineItems = formatDataAsArray(checkForInvoicesLineItems.data)
      .filter((item) => item.line_item_type === "deposit");
      if (existingFirstCreditLineItems.length > 0) {
      finalInvoice.invoice_amount += existingFirstCreditLineItems[0].amount;
      }
    
    invoiceLines.forEach((line) => delete line.sort_type);

    // set up final invoice footer
    if (footerLines.length > 0) {
      finalInvoice.footer = 'Incentives payable directly to customer: ';

      footerLines.forEach((line) => {
        finalInvoice.footer += `\n $${-line.amount} - ${line.name}`;
      });

      // Add Net Project Cost line first
      finalInvoice.footer += '\n\nNet Project Cost: $' + netCost;

      finalInvoice.footer += '\nEquipment Purchase Date: ' + (project.data.closed_date ? project.data.closed_date : '');

      // Check for Massachusetts projects and add the footer line after Net Project Cost
      if (house.data.state === 'MA') {
        finalInvoice.footer += '\n\nFor Massachusetts Projects:';
        finalInvoice.footer += '\nHPIN Company ID NMTPPS1553827498';
        finalInvoice.footer += '\nInstall Date: ' + (project.data.install_date ? project.data.install_date : new Date());
      }

      // Check for Boulder in city or county and add the footer line after Net Project Cost
      if ((house.data.city && house.data.city.includes('Boulder')) || (house.data.county && house.data.county.includes('Boulder'))) {
        finalInvoice.footer += '\n\nRemoval & disposal of old equipment included';
      }
    }
    if(insert)
    {
  console.log('final invoice insertion');
  console.log(finalInvoice);
  finalInvoicePromise = new Promise((resolve, reject) => {
      insert_invoice.trigger({
        onSuccess: resolve,
        onFailure: reject,
        additionalScope: {
          invoiceData: finalInvoice,
        },
      });
    })
      .then((gotFinalInvoice) => {
        console.log('inserted final invoice');
        // Get inserted invoice data w/id
        finalInvoice = gotFinalInvoice?.result[0];

        // add invoice id to line items
        invoiceLines.forEach((item) => {
          item.invoice_id = finalInvoice.id;
        });

        // insert line items
        invoiceLinesPromise = new Promise((resolve, reject) => {
          insert_invoice_lines.trigger({
            onSuccess: resolve,
            onFailure: reject,
            additionalScope: {
              invoiceLines: invoiceLines,
            },
          });
        })
          .then((invoiceLines) => {
            console.log(invoiceLines?.result[0].rowCount + ' lines created for final invoice');
          })
          .catch((error) => {
            console.log('Error in processing line items for final invoice: ' + error.message);
            throw error;
          });

        // add invoice id to other deposits
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
              console.log('first deposit invoice created: ' + JSON.stringify(firstDepositInvoice));
              newLines.push({
                invoice_id: firstDepositInvoice.id,
                line_item_type: 'deposit',
                name: firstDepositAmountCustom > 0 ? 'First Deposit' : 'First Deposit: ' + firstDepositPct * 100 + '% of total',
                amount: firstDepositInvoice.invoice_amount,
              });
              // add cc fees
              if (firstCardFees) {
                newLines.push({
                  invoice_id: firstDepositInvoice.id,
                  line_item_type: 'credit card fee',
                  name: '3% Credit Card Fee',
                  amount: Math.round(0.03 * firstDepositInvoice.invoice_amount),
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
      });
      runOnChange.setValue(false);
    }
    else{
      console.log('final invoice upsertion');
      console.log('new invoice', finalInvoice);
      let finalInvoice2 = checkForInvoices.data
      console.log('existed invoice', finalInvoice2);
      let finalInvoice3;
      
      if (finalInvoice2.length > 0) {
          const existingInvoice = finalInvoice2[0];
          finalInvoice3 = {
            id: existingInvoice.id, // Keep the ID from finalInvoice2
            project_id: existingInvoice.project_id, // Keep the project ID
            invoice_type: existingInvoice.invoice_type, // Keep the invoice type
            invoice_status: existingInvoice.invoice_status, // Keep the invoice status
            invoice_amount: finalInvoice.invoice_amount, // Overwrite the amount with finalInvoice's amount
            invoice_created_at: existingInvoice.invoice_created_at, // Keep the created date
            footer: existingInvoice.footer, // Keep the footer details
            memo: existingInvoice.memo, // Keep the memo
            stripe_invoice_id: existingInvoice.stripe_invoice_id, // Keep the Stripe ID
            notes: existingInvoice.notes, // Keep the notes
          };
        } else
        {
          finalInvoice3 = { ...finalInvoice };
        }
        console.log('invoice to upsert', finalInvoice3)
        let finalInvoicePromise = new Promise((resolve, reject) => {
          update_invoice.trigger({
            onSuccess: resolve,
            onFailure: reject,
            additionalScope: {
              invoiceData: finalInvoice3,
                },
              });
            })
              .then((gotFinalInvoice) => {
                finalInvoice = gotFinalInvoice?.result[0];
                invoiceLines.forEach((item) => {
                  item.invoice_id = finalInvoice.id;
                });
                let invoiceLines2 = formatDataAsArray(checkForInvoicesLineItems.data);
                console.log('existing inv lines', invoiceLines2);
                console.log('new inv lines', invoiceLines);
//                  const groupedData = invoiceLines.reduce((acc, item) => {
//      // Define the grouping key (system_id + name)
//      const key = `${item.system_id}_${item.name}`;
    
//      if (!acc[key]) {
//          // If the group doesn't exist, initialize it with the current item
//          acc[key] = { ...item }; // Copy the entire item
//          acc[key].amount = parseFloat(item.amount) || 0; // Ensure amount is a number
//      } else {
//          // If the group exists, sum the amount
//          acc[key].amount += parseFloat(item.amount) || 0;
//      }
    
//      return acc;
//  }, {});
// Function to generate a temporary key for matching line items
const generateTemporaryKeys = (dataset) => {
  const keyMap = new Map();

  return dataset.map((item) => {
    const baseKey = item.system_id
      ? `${item.name}-${item.system_id}`
      : `${item.name}-${item.line_item_type}`;
        console.log('i1:',item,'b1:',baseKey);
    if (!keyMap.has(baseKey)) {
      keyMap.set(baseKey, 1);
    } else {
      const counter = keyMap.get(baseKey);
      keyMap.set(baseKey, counter + 1);
    }

    const temporaryKey = `${baseKey}-${keyMap.get(baseKey)}`;
    return { ...item, temporaryKey };
  });
};

// Apply unique key generation to both datasets
invoiceLines = generateTemporaryKeys(invoiceLines);
invoiceLines2 = generateTemporaryKeys(invoiceLines2);
// Extract deposits from both datasets
const depositsFromInvoiceLines = invoiceLines.filter(
  (item) => item.line_item_type === "deposit"
);
const oldFeeAndDiscountLines = invoiceLines.filter(
  item => item.line_item_type === 'credit card fee' || item.name === '3% Upfront Payment Discount'
);
const depositsFromInvoiceLines2 = invoiceLines2.filter(
  (item) => item.line_item_type === "deposit"
);
 const preservedFeeAndDiscountLines = invoiceLines2.filter(
            item => item.line_item_type === 'credit card fee' || item.name === '3% Upfront Payment Discount'
        );

        // 2. Exclude these special lines from BOTH arrays before comparison.
invoiceLines = invoiceLines.filter(
            item => item.line_item_type !== 'credit card fee' && item.name !== '3% Upfront Payment Discount'
        );
invoiceLines2 = invoiceLines2.filter(
            item => item.line_item_type !== 'credit card fee' && item.name !== '3% Upfront Payment Discount'
        );
// Remove deposits from datasets for comparison
invoiceLines = invoiceLines.filter(
  (item) => item.line_item_type !== "deposit"
);
invoiceLines2 = invoiceLines2.filter(
  (item) => item.line_item_type !== "deposit"
);
// Extract Denver Cares Rebate lines separately
const denverCaresIds = [38, 70, 71, 72, 73];
const denverCaresFromInvoiceLines = invoiceLines.filter((item) =>
  denverCaresIds.includes(item.incentive_id)
);
const denverCaresFromInvoiceLines2 = invoiceLines2.filter((item) =>
  denverCaresIds.includes(item.incentive_id)
);

// Consolidate Denver Cares Rebate into a single line item
let consolidatedDenverCaresRebate = {
  sort_type: "incentive",
  line_item_type: "incentive",
  system_id: null,
  name: "Denver Cares Electrical Rebate",
  amount: 0,
};

// Sum all Denver Cares rebates
denverCaresFromInvoiceLines.forEach((item) => {
  consolidatedDenverCaresRebate.amount += item.amount;
});
denverCaresFromInvoiceLines2.forEach((item) => {
  consolidatedDenverCaresRebate.amount += item.amount;
});

// Remove Denver Cares rebate from original lists
invoiceLines = invoiceLines.filter(
  (item) => !denverCaresIds.includes(item.incentive_id)
);
invoiceLines2 = invoiceLines2.filter(
  (item) => !denverCaresIds.includes(item.incentive_id)
);

// Add the consolidated Denver Cares rebate back
if (consolidatedDenverCaresRebate.amount > 0) {
  invoiceLines.push(consolidatedDenverCaresRebate);
}

// Populate the invoiceLines2Map
const invoiceLines2Map = new Map();
invoiceLines2.forEach((item) => {
  invoiceLines2Map.set(item.temporaryKey, item);
});

let insertObjects = [];
let deleteObjects = [];
let commonObjects = [];

// Compare invoiceLines with invoiceLines2Map
invoiceLines.forEach((line) => {
  const matchingLine = invoiceLines2Map.get(line.temporaryKey);

  if (matchingLine) {
    const updatedCommon = { ...matchingLine, amount: line.amount };
    commonObjects.push(updatedCommon);
    invoiceLines2Map.delete(line.temporaryKey);
  } else {
    insertObjects.push(line);
  }
});

// Delete remaining items from the map
deleteObjects.push(...invoiceLines2Map.values());
commonObjects.push(...depositsFromInvoiceLines2);
commonObjects.push(...preservedFeeAndDiscountLines);
// Function to remove the temporaryKey property from an object
const removeTemporaryKey = (objects) => {
  return objects.map(({ temporaryKey, ...rest }) => rest);
};

// Remove uniqueKey from each list
insertObjects = removeTemporaryKey(insertObjects);
commonObjects = removeTemporaryKey(commonObjects);
deleteObjects = removeTemporaryKey(deleteObjects);

// Process the data (e.g., insert, update, delete)
(async () => {
  try {
    if (insertObjects.length > 0) {
      await new Promise((resolve, reject) => {
        insert_invoice_lines.trigger({
          onSuccess: resolve,
          onFailure: reject,
          additionalScope: { invoiceLines: insertObjects },
        });
      });
    }

    if (commonObjects.length > 0) {
      await new Promise((resolve, reject) => {
        update_invoice_lines.trigger({
          onSuccess: resolve,
          onFailure: reject,
          additionalScope: { objectsToUpdate: commonObjects },
        });
      });
    }

    if (deleteObjects.length > 0) {
      await new Promise((resolve, reject) => {
        deleteInvoiceLineItems.trigger({
          onSuccess: resolve,
          onFailure: reject,
          additionalScope: { del: deleteObjects },
        });
      });
    }

    console.log("Invoice processing completed successfully!");
  } catch (error) {
    console.error("An error occurred:", error);
  }
})();
});

         let upsertFirstDeposit = false;       
        // add invoice id to other deposits
      if(upsertFirstDeposit)
      {
        if (firstDepositInvoice) firstDepositInvoice.invoice_id = finalInvoice.id;
        let firstDepositInvoice2 = checkForDeposits.data
        let firstDepositInvoice3;
        console.log('fdep', firstDepositInvoice);
        console.log('fdep2', firstDepositInvoice2)
        
        //  Compare the two invoices and construct finalInvoice3
        if (firstDepositInvoice2.length > 0) {
          const existingInvoice = firstDepositInvoice2[0]; 
          firstDepositInvoice3 = {
            id: existingInvoice.id, // Keep the ID from finalInvoice2
            project_id: existingInvoice.project_id, // Keep the project ID
            invoice_type: existingInvoice.invoice_type, // Keep the invoice type
            invoice_status: existingInvoice.invoice_status, // Keep the invoice status
            invoice_amount: firstDepositInvoice.invoice_amount, // Overwrite the amount with finalInvoice's amount
            invoice_created_at: existingInvoice.invoice_created_at, // Keep the created date
            footer: existingInvoice.footer, // Keep the footer details
            memo: existingInvoice.memo, // Keep the memo
            stripe_invoice_id: existingInvoice.stripe_invoice_id, // Keep the Stripe ID
            notes: existingInvoice.notes, // Keep the notes
          };
        } else {
          // Use finalInvoice as is if no data exists in finalInvoice2
          firstDepositInvoice3 = { ...firstDepositInvoice };
        }
                console.log('fdep3', firstDepositInvoice3)
        let firstDepositInvoicePromise;
        if (firstDepositInvoice) {
          firstDepositInvoicePromise = new Promise((resolve, reject) => {
            update_deposit.trigger({
              onSuccess: resolve,
              onFailure: reject,
              additionalScope: {
                invoiceData: firstDepositInvoice2,
              },
            });
          });
        }

        // Insert invoice lines for each deposit invoice
        Promise.all([firstDepositInvoicePromise])
          .then(([gotFirstDepositInvoice]) => {
            let firstDepositInvoice = gotFirstDepositInvoice?.result[0];
            console.log(firstDepositInvoice)
            let newLines = [];

            if (firstDepositInvoice) {
              console.log('first deposit invoice created: ' + JSON.stringify(firstDepositInvoice));
              newLines.push({
                invoice_id: firstDepositInvoice.id,
                line_item_type: 'deposit',
                name: firstDepositAmountCustom > 0 ? 'First Deposit' : 'First Deposit: ' + firstDepositPct * 100 + '% of total',
                amount: firstDepositInvoice.invoice_amount,
              });
              // add cc fees
              if (firstCardFees) {
                newLines.push({
                  invoice_id: firstDepositInvoice.id,
                  line_item_type: 'credit card fee',
                  name: '3% Credit Card Fee',
                  amount: Math.round(0.03 * firstDepositInvoice.invoice_amount),
                });
              }
            }
            let invoiceLines2 = formatDataAsArray(checkForDepositLineItems.data);
                console.log('inv2', invoiceLines2);
                console.log(newLines)
            let insertObjects = [];
            let deleteObjects = [];
            let commonObjects = [];
            const invoiceLines2Map = new Map(
              invoiceLines2.map((line) => [line.name, line])
            );
            
            // Compare invoiceLines against invoiceLines2
            newLines.forEach((line) => {
              const matchingLine = invoiceLines2Map.get(line.name);
              if (matchingLine) {
                const updatedCommon = { ...matchingLine, amount: line.amount };
                commonObjects.push(updatedCommon);
                invoiceLines2Map.delete(line.name);
              } else {
                insertObjects.push(line);
              }
            });
            deleteObjects.push(...invoiceLines2Map.values());
                console.log('del2', deleteObjects);
                console.log('upd2', commonObjects);
                console.log('ins2', insertObjects);

              (async () => {
  try {
     console.log('invoiceLines2: ',insertObjects)
    // Trigger insert_invoice_lines if insertObjects has data
    if (insertObjects.length > 0) {
      const invoiceLines = await new Promise((resolve, reject) => {
        insert_invoice_lines.trigger({
          onSuccess: resolve,
          onFailure: reject,
          additionalScope: { invoiceLines: insertObjects },
        });
      });
    }
console.log('objectsToUpdate2: ', commonObjects)
    // Trigger update_invoice_lines if commonObjects has data
    if (commonObjects.length > 0) {
      const updatedInvoiceLines = await new Promise((resolve, reject) => {
        update_invoice_lines.trigger({
          onSuccess: resolve,
          onFailure: reject,
          additionalScope: { objectsToUpdate: commonObjects },
        });
      });
    }
  console.log('del222: ', deleteObjects)
    // Trigger delete_invoice_lines if deleteObjects has data
    if (deleteObjects.length > 0) {
      const deletedInvoiceLines = await new Promise((resolve, reject) => {
        deleteInvoiceLineItems.trigger({
          onSuccess: resolve,
          onFailure: reject,
          additionalScope: { del: deleteObjects },
        });
      });
    }

    console.log("Deposit invoice processing completed successfully!");

  } catch (error) {
    console.error("An error occurred:", error);
  }
})();

          })
          
          .catch((error) => {
            console.log('Error in processing deposit invoices: ' + error.stack);
            throw error;
          });
      }
      
    }
    //TODO workflow to add credit line item to final invoice when deposit invoice is paid
  })
  .catch((error) => {
    console.log('Error encountered in processing: ' + error.stack);
    throw error;
  });
}
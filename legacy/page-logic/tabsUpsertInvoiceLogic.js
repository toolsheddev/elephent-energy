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

// Helper: round to nearest dollar where we explicitly need whole dollars
function roundToDollar(v) {
  const n = Number(v) || 0;
  return Math.round(n);
}

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

// Other global vars
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

  if (item.category && item.category.toLowerCase() === 'electrical') {
    if (electricalUpgradesLineItem) {
      electricalUpgradesLineItem.amount += (item.price_actual + item.margin_amount);
    } else {
      electricalUpgradesLineItem = {
        sort_type: 'electrical',
        line_item_type: 'labor',
        system_id: system.id,  // Keep system id of first item encountered
        name: 'Electrical Upgrades',
        amount: (item.price_actual + item.margin_amount)
      };
      invoiceLines.push(electricalUpgradesLineItem);
    }
  } else {
    if (system.system_type === 'adder' && laborDescription) {
      system.invoiceItems[`labor_${item.id}`] = {
        sort_type: 'labor',
        line_item_type: 'labor',
        system_id: system.id,
        name: laborDescription,
        amount: (item.price_actual + item.margin_amount)
      };
    } else if (system.invoiceItems && system.invoiceItems.labor) {
      system.invoiceItems.labor.amount = system.invoiceItems.labor.amount
        ? system.invoiceItems.labor.amount + item.price_actual + item.margin_amount
        : item.price_actual + item.margin_amount;
    } else {
      let name = laborNames[system.system_type];
      if (system.system_type === 'hvac') {
        name += ' \nAHRI Number: ' + (ahriData[system.ahri_id]?.ahri_number || '') 
              + ' \nSEER2: ' + (ahriData[system.ahri_id]?.seer_2 || '') 
              + ' \nEER2: ' + (ahriData[system.ahri_id]?.eer_2 || '') 
              + ' \nHSPF2: ' + (ahriData[system.ahri_id]?.hspf_2 || '');
      }
      system.invoiceItems.labor = {
        sort_type: 'labor',
        line_item_type: 'labor',
        system_id: system.id,
        name: name,
        amount: (item.price_actual + item.margin_amount)
      };
    }
  }
}

function processEquipment(item) {
  let system = getSystem(item);
  let equipment = equipmentData[item.equipment_id];
  if (!equipment) throw Error('Equipment not found for line item ' + item);

  let equipmentDescription =
    equipment.equipment_name +
    '  \nModel Number: ' +
    equipment.model_number +
    '    Serial Number: ' +
    (item.serial_number ? item.serial_number : '');

  // Append UEF for HPWH
  if (equipment.equipment_type === 'HPWH') {
    let uefValue = equipment.uef ? equipment.uef : '';
    equipmentDescription += '  \nUEF: ' + uefValue;
  }

  if (enumeratedEquipmentTypes.includes(equipment.equipment_type)) {
    system.invoiceItems['equipment_' + item.id] = {
      sort_type: equipment.equipment_type,
      line_item_type: 'equipment',
      system_id: system.id,
      name: equipmentDescription,
      amount: (item.price_actual + item.margin_amount),
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
      amount: (item.price_actual + item.margin_amount),
    };
  }
}

let denverCaresRebate = null;

function processIncentive(item) {
  let system = getSystem(item);
  // Get the incentive from incentivesData
  let incentive = incentivesData[item.incentive_id];
  if (!incentive) throw Error('Could not find incentive for item ' + JSON.stringify(item));

  const recipient = item.incentive_recipient || incentive.recipient;
  if (item.price_actual === 0) return;

  const denverCaresIds = [38, 70, 71, 72, 73];

  // Consolidate Denver Cares Electrical Rebate into one line
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

  // Elephant incentives increase payable to Elephant
  if (item.price_actual > 0 && recipient === 'elephant') {
    system.invoiceItems.labor.amount += item.price_actual;
  } else if (recipient === 'elephant') {
    system.invoiceItems['incentive_' + item.id] = {
      sort_type: 'incentive',
      line_item_type: 'incentive',
      system_id: system.id,
      name: item.description || 'Incentive',
      amount: item.price_actual,
    };
  } else if (recipient === 'customer' || recipient === 'homeowner') {
    footerLines.push({
      name: item.description || 'Incentive',
      amount: -Math.abs(item.price_actual),
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

let permitsLineItem = null; // Global variable to track permit costs
function processPermit(item) {
  if (!permitsLineItem) {
    permitsLineItem = {
      sort_type: 'permit',
      line_item_type: 'permit',
      system_id: null,
      name: 'Permits',
      amount: 0,
    };
    invoiceLines.push(permitsLineItem);
  }
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
  system.invoiceItems['financing_fee_' + item.id] = {
    sort_type: 'discount', // sort alongside discounts
    line_item_type: 'financing fees',
    system_id: system.id,
    name: 'Synchrony Financing Fee',
    amount: item.price_actual, // negative already
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

// Fetch deposit config and then run logic
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
    // INSERT mode
    insert = true;
    firstDepositPct = firstDepositAmount.value;
    firstCardFees = firstDepositCcFee.value;
    finalCardFees = finalInvoiceCcfee.value;
    firstDepositAmountCustom = firstDepositCustomAmount.value;
  } else if (depositConfigResult.length > 0) {
    // UPSERT mode (params are not recalculated; deposit must be preserved)
    const config = depositConfigResult[0];
    firstDepositPct = config.first_deposit_pct;
    firstCardFees = config.first_card_fees;
    finalCardFees = config.final_card_fees;
    firstDepositAmountCustom = config.first_deposit_amount_custom;
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
      const sortOrderLocal = ['labor', 'equipment', 'margin', 'discount', 'change order', 'permit', 'maintenance plan'];

      // Sort incoming line items for deterministic processing
      lineItems = gotlineItems.sort((a, b) => {
        const indexA = sortOrderLocal.indexOf(a.line_item_type);
        const indexB = sortOrderLocal.indexOf(b.line_item_type);
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

      // Set up invoiceItems property on all systems and categorize systems as change orders or not
      systems.forEach((system) => {
        system.invoiceItems = {};
        system.isChangeOrder = system.system_status === 'active - from change order';
      });

      // Process line items
      lineItems.forEach((item) => {
        const system = getSystem(item);
        const isStandaloneChangeOrder =
          item.status === 'active - from change order' && system.system_status !== 'active - from change order';

        if (isStandaloneChangeOrder) {
          // Standalone change order item associated with a proposed system
          system.invoiceItems['change_order_' + item.id] = {
            sort_type: 'change order',
            line_item_type: 'change order',
            system_id: system.id,
            name: `Change Order: ${item.description}`,
            amount: item.price_actual + item.margin_amount,
          };
        } else {
          if (item.line_item_type === 'labor') processLabor(item);
          else if (item.line_item_type === 'equipment') processEquipment(item);
          else if (item.line_item_type === 'margin') marginLineItems.push(item); // process later
          else if (item.line_item_type === 'financing fees') processFinancingFee(item);
          else if (item.line_item_type === 'discount') processDiscount(item);
          else if (item.line_item_type === 'incentive') processIncentive(item);
          else if (item.line_item_type === 'permit') processPermit(item);
          else if (item.line_item_type === 'maintenance plan') processMaintenancePlan(item);
          else throw Error('Invalid line item type: ' + item.line_item_type + '. Item in question: ' + JSON.stringify(item));
        }
      });

      // Prefix change-order system lines
      systems.forEach((system) => {
        if (system.isChangeOrder) {
          Object.keys(system.invoiceItems).forEach((key) => {
            const item = system.invoiceItems[key];
            if (!item.name.startsWith('Change Order:')) {
              item.name = `Change Order: ${item.name}`;
            }
          });
        }
      });

      // Gather lines from systems
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

        // Sort within each system grouping
        newLines.sort((a, b) => {
          const ia = sortOrder.indexOf(a.sort_type);
          const ib = sortOrder.indexOf(b.sort_type);
          if (ia < ib) return -1;
          if (ia > ib) return 1;
          return 0;
        });

        invoiceLines = invoiceLines.concat(newLines);
      });

      // Add incentives, discounts, and change orders at end
      invoiceLines = invoiceLines.concat(discountLines, changeOrderLines, incentiveLines);

      // --- CARD FEE HANDLING ---
      // INSERT: add 3% credit-card fee line (rounded to dollar) if toggle on
      // UPSERT: DO NOT add; we’ll preserve existing fee lines instead.
      if (insert && finalCardFees) {
        const preFeeSubtotal = invoiceLines.reduce((acc, line) => acc + line.amount, 0);
        invoiceLines.push({
          line_item_type: 'credit card fee',
          name: '3% Credit Card Fee',
          amount: roundToDollar(0.03 * preFeeSubtotal),
        });
      }

      // Compute net project cost for footer (includes footerLines later)
      let netCost = Math.round(
        (invoiceLines.reduce((acc, line) => acc + line.amount, 0) +
          footerLines.reduce((acc, line) => acc + line.amount, 0)) * 100
      ) / 100;

      // --------- INSERT vs UPSERT divergence ----------
      if (insert) {
        // INSERT MODE: calculate deposit from project total (rounded), unless custom amount
        let projectTotal = roundToDollar(invoiceLines.reduce((acc, line) => acc + line.amount, 0));

        if (firstDepositInvoice) {
          firstDepositInvoice.invoice_amount =
            firstDepositAmountCustom > 0
              ? firstDepositAmountCustom
              : roundToDollar(projectTotal * firstDepositPct);

          // Final = remainder (rounded)
          finalInvoice.invoice_amount = roundToDollar(projectTotal - firstDepositInvoice.invoice_amount);

          // Add deposit credit line to final invoice
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
            finalInvoice.footer += '\nInstall Date: ' + (project.data.install_date ? project.data.install_date : new Date());
          }
          if (
            (house.data.city && house.data.city.includes('Boulder')) ||
            (house.data.county && house.data.county.includes('Boulder'))
          ) {
            finalInvoice.footer += '\n\nRemoval & disposal of old equipment included';
          }
        }

        // INSERT final invoice
        console.log('final invoice insertion');
        let finalInvoicePromise = new Promise((resolve, reject) => {
          insert_invoice.trigger({
            onSuccess: resolve,
            onFailure: reject,
            additionalScope: { invoiceData: finalInvoice },
          });
        })
          .then((gotFinalInvoice) => {
            console.log('inserted final invoice');
            finalInvoice = gotFinalInvoice?.result[0];

            // Attach invoice_id to lines and insert
            invoiceLines.forEach((item) => { item.invoice_id = finalInvoice.id; });

            new Promise((resolve, reject) => {
              insert_invoice_lines.trigger({
                onSuccess: resolve,
                onFailure: reject,
                additionalScope: { invoiceLines },
              });
            })
              .then((res) => {
                console.log(res?.result[0].rowCount + ' lines created for final invoice');
              })
              .catch((error) => {
                console.log('Error in processing line items for final invoice: ' + error.message);
                throw error;
              });

            // Insert the deposit invoice + lines
            if (firstDepositInvoice) firstDepositInvoice.invoice_id = finalInvoice.id;

            let firstDepositInvoicePromise;
            if (firstDepositInvoice) {
              firstDepositInvoicePromise = new Promise((resolve, reject) => {
                insert_invoice.trigger({
                  onSuccess: resolve,
                  onFailure: reject,
                  additionalScope: { invoiceData: firstDepositInvoice },
                });
              });
            }

            Promise.all([firstDepositInvoicePromise])
              .then(([gotFirstDepositInvoice]) => {
                let newLines = [];
                let dep = gotFirstDepositInvoice?.result[0];

                if (dep) {
                  console.log('first deposit invoice created: ' + JSON.stringify(dep));
                  newLines.push({
                    invoice_id: dep.id,
                    line_item_type: 'deposit',
                    name: firstDepositAmountCustom > 0 ? 'First Deposit' : 'First Deposit: ' + firstDepositPct * 100 + '% of total',
                    amount: dep.invoice_amount,
                  });
                  if (firstCardFees) {
                    newLines.push({
                      invoice_id: dep.id,
                      line_item_type: 'credit card fee',
                      name: '3% Credit Card Fee',
                      amount: roundToDollar(0.03 * dep.invoice_amount),
                    });
                  }
                }

                if (newLines.length > 0) {
                  new Promise((resolve, reject) => {
                    insert_invoice_lines.trigger({
                      onSuccess: resolve,
                      onFailure: reject,
                      additionalScope: { invoiceLines: newLines },
                    });
                  })
                    .then((res2) => {
                      console.log(res2?.result[0].rowCount + ' lines created for deposit invoices');
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

      } else {
        // -------------------------
        // UPSERT MODE (preserve deposit and existing fee/discount lines)
        // -------------------------
        console.log('final invoice upsertion');

        // 1) Determine existing deposit amount to use (no recalculation)
        let existingDepositAmount = 0;
        if (Array.isArray(checkForDeposits.data) && checkForDeposits.data.length > 0) {
          existingDepositAmount = Number(checkForDeposits.data[0].invoice_amount) || 0;
        } else {
          // Fallback: read from existing final invoice deposit credit line (negative)
          const existingDepositCredit = formatDataAsArray(checkForInvoicesLineItems.data)
            .find((item) => item.line_item_type === 'deposit');
          if (existingDepositCredit) {
            existingDepositAmount = Math.abs(Number(existingDepositCredit.amount) || 0);
          }
        }

        // 2) Pull existing fee/discount lines so totals include what will remain in DB
        let existingLinesRaw = formatDataAsArray(checkForInvoicesLineItems.data);
        const preservedFeeAndDiscountLines = existingLinesRaw.filter(
          item => item.line_item_type === 'credit card fee' || item.name === '3% Upfront Payment Discount'
        );

        // 3) Compute project total EFFECTIVE for upsert:
        //    = current rebuilt lines (WITHOUT a new card-fee line) + preserved fee/discount lines
        //    (deposit will be subtracted separately)
        const rebuiltSubtotal = invoiceLines.reduce((acc, line) => acc + line.amount, 0);
        const preservedFeeDiscountTotal = preservedFeeAndDiscountLines.reduce((acc, l) => acc + (Number(l.amount) || 0), 0);
        const projectTotalEffective = roundToDollar(rebuiltSubtotal + preservedFeeDiscountTotal);

        // 4) Final invoice amount = project total - existing deposit (rounded)
        finalInvoice.invoice_amount = roundToDollar(projectTotalEffective - existingDepositAmount);

        // 5) Build footer
        invoiceLines.forEach((line) => delete line.sort_type);
        if (footerLines.length > 0) {
          finalInvoice.footer = 'Incentives payable directly to customer: ';
          footerLines.forEach((line) => {
            finalInvoice.footer += `\n $${-line.amount} - ${line.name}`;
          });
          finalInvoice.footer += '\n\nNet Project Cost: $' + netCost;
          finalInvoice.footer += '\nEquipment Purchase Date: ' + (project.data.closed_date ? project.data.closed_date : '');
          if (house.data.state === 'MA') {
            finalInvoice.footer += '\n\nFor Massachusetts Projects:';
            finalInvoice.footer += '\nHPIN Company ID NMTPPS1553827498';
            finalInvoice.footer += '\nInstall Date: ' + (project.data.install_date ? project.data.install_date : new Date());
          }
          if ((house.data.city && house.data.city.includes('Boulder')) || (house.data.county && house.data.county.includes('Boulder'))) {
            finalInvoice.footer += '\n\nRemoval & disposal of old equipment included';
          }
        }

        // 6) Upsert the final invoice header
        let finalInvoice2 = checkForInvoices.data;
        let finalInvoice3;

        if (finalInvoice2.length > 0) {
          const existingInvoice = finalInvoice2[0];
          finalInvoice3 = {
            id: existingInvoice.id,
            project_id: existingInvoice.project_id,
            invoice_type: existingInvoice.invoice_type,
            invoice_status: existingInvoice.invoice_status,
            invoice_amount: finalInvoice.invoice_amount,
            invoice_created_at: existingInvoice.invoice_created_at,
            footer: existingInvoice.footer,
            memo: existingInvoice.memo,
            stripe_invoice_id: existingInvoice.stripe_invoice_id,
            notes: existingInvoice.notes,
          };
        } else {
          finalInvoice3 = { ...finalInvoice };
        }

        let finalInvoicePromise = new Promise((resolve, reject) => {
          update_invoice.trigger({
            onSuccess: resolve,
            onFailure: reject,
            additionalScope: { invoiceData: finalInvoice3 },
          });
        })
          .then((gotFinalInvoice) => {
            finalInvoice = gotFinalInvoice?.result[0];
            invoiceLines.forEach((item) => { item.invoice_id = finalInvoice.id; });

            // 7) Diff lines (preserving deposits + existing fee/discount lines)
            let invoiceLines2 = formatDataAsArray(checkForInvoicesLineItems.data);

            // Generate temp keys (name + system_id (or type) + index) to match duplicates reliably
            const generateTemporaryKeys = (dataset) => {
              const keyMap = new Map();
              return dataset.map((item) => {
                const baseKey = item.system_id
                  ? `${item.name}-${item.system_id}`
                  : `${item.name}-${item.line_item_type}`;
                if (!keyMap.has(baseKey)) keyMap.set(baseKey, 1);
                else keyMap.set(baseKey, keyMap.get(baseKey) + 1);
                const temporaryKey = `${baseKey}-${keyMap.get(baseKey)}`;
                return { ...item, temporaryKey };
              });
            };

            // Extract and preserve deposit credit lines from existing
            const depositsFromInvoiceLines2 = invoiceLines2.filter(
              (item) => item.line_item_type === "deposit"
            );

            // Preserve existing fee/discount lines
            const preservedFeeAndDiscountLines2 = invoiceLines2.filter(
              item => item.line_item_type === 'credit card fee' || item.name === '3% Upfront Payment Discount'
            );

            // Remove special lines from both datasets before diff
            invoiceLines = invoiceLines.filter(
              item => item.line_item_type !== 'credit card fee' && item.name !== '3% Upfront Payment Discount' && item.line_item_type !== "deposit"
            );
            invoiceLines2 = invoiceLines2.filter(
              item => item.line_item_type !== 'credit card fee' && item.name !== '3% Upfront Payment Discount' && item.line_item_type !== "deposit"
            );

            // Denver Cares consolidation across both sets
            const denverCaresIds = [38, 70, 71, 72, 73];
            const denverCaresFromInvoiceLines = invoiceLines.filter((item) => denverCaresIds.includes(item.incentive_id));
            const denverCaresFromInvoiceLines2 = invoiceLines2.filter((item) => denverCaresIds.includes(item.incentive_id));
            let consolidatedDenverCaresRebate = {
              sort_type: "incentive",
              line_item_type: "incentive",
              system_id: null,
              name: "Denver Cares Electrical Rebate",
              amount: 0,
            };
            denverCaresFromInvoiceLines.forEach((item) => { consolidatedDenverCaresRebate.amount += item.amount; });
            denverCaresFromInvoiceLines2.forEach((item) => { consolidatedDenverCaresRebate.amount += item.amount; });
            invoiceLines = invoiceLines.filter((item) => !denverCaresIds.includes(item.incentive_id));
            invoiceLines2 = invoiceLines2.filter((item) => !denverCaresIds.includes(item.incentive_id));
            if (consolidatedDenverCaresRebate.amount > 0) invoiceLines.push(consolidatedDenverCaresRebate);

            // Apply unique keys
            invoiceLines = generateTemporaryKeys(invoiceLines);
            invoiceLines2 = generateTemporaryKeys(invoiceLines2);

            // Map existing lines
            const invoiceLines2Map = new Map();
            invoiceLines2.forEach((item) => {
              invoiceLines2Map.set(item.temporaryKey, item);
            });

            // Build insert/update/delete sets
            let insertObjects = [];
            let deleteObjects = [];
            let commonObjects = [];

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

            // Whatever remains in map should be deleted
            deleteObjects.push(...invoiceLines2Map.values());

            // Re-attach preserved special lines (deposits + fee/discount)
            commonObjects.push(...depositsFromInvoiceLines2);
            commonObjects.push(...preservedFeeAndDiscountLines2);

            // Strip temporaryKey before DB ops
            const stripTemp = (arr) => arr.map(({ temporaryKey, ...rest }) => rest);
            insertObjects = stripTemp(insertObjects);
            commonObjects = stripTemp(commonObjects);
            deleteObjects = stripTemp(deleteObjects);

            // Perform DB ops
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
                console.log("Invoice upsertion completed successfully!");
              } catch (error) {
                                console.error("An error occurred during invoice line upsert:", error);
              }
            })();
          });
      }
      // end upsert branch
    })
    .catch((error) => {
      console.log('Error encountered in processing: ' + error.stack);
      throw error;
    });
}


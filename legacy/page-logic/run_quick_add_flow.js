console.log("1. Starting Fail-Safe Quick Add Flow (Using onSuccess)");

const selectedDesigns = baseDesignsTable.selectedSourceRows;
let selectedProposals = quickAddTargetProposal.value; 

if (!selectedProposals || selectedProposals.length === 0 || !selectedDesigns || selectedDesigns.length === 0) {
    utils.showNotification({title: "Missing Data", message: "Please select at least one proposal/option and one base design.", type: "warning"});
    return;
}
if (PricingStructure3.value !== project.data.pricing_structure){
  await update_pricing_structure_quick_add.trigger();
}

// 1. Detect our magic "Create New" triggers
let isNewEach = selectedProposals.includes("NEW_EACH");
let isNewSingle = selectedProposals.includes("NEW_SINGLE");

// 2. Filter out the magic strings so we are left with only actual, existing Proposal IDs
let safeProposalsArray = selectedProposals.filter(p => p !== "NEW_EACH" && p !== "NEW_SINGLE").map(Number);

// --- SCENARIO 1: Create ONE single new proposal for the whole batch ---
if (isNewSingle) {
    console.log("Creating a single new proposal for the batch...");
    try {
        const singlePropDb = await insert_quick_add_proposal.trigger({
            additionalScope: {
                house_id: house.data.id, // Make sure this matches your global house variable
                proposal_name: selectedDesigns[0].nickname 
            }
        });
        const singlePropId = singlePropDb?.id?.[0] || singlePropDb?.[0]?.id;
        if (singlePropId) {
            safeProposalsArray.push(singlePropId);
            console.log("✅ Created single proposal ID:", singlePropId);
        }
    } catch (e) {
        console.error("Failed to create new single proposal:", e);
    }
}

console.log(`2. Generating ${selectedDesigns.length} base design(s)...`);

// --- OUTER LOOP: Iterate over each selected Base Design ---
for (let d = 0; d < selectedDesigns.length; d++) {
    const baseRow = selectedDesigns[d];
    console.log(`\n--- Processing Base Design (${d + 1}/${selectedDesigns.length}): ${baseRow.nickname} ---`);

    // --- SCENARIO 2: Create a separate proposal for EACH system ---
    let currentLoopProposals = [...safeProposalsArray]; // Copy the array so we don't bleed into the next loop
    if (isNewEach) {
        console.log(`Creating a dedicated proposal named: ${baseRow.nickname}`);
        try {
            const eachPropDb = await insert_quick_add_proposal.trigger({
                additionalScope: {
                    house_id: house.data.id,
                    proposal_name: baseRow.nickname // Automatically named after the system option!
                }
            });
            const eachPropId = eachPropDb?.id?.[0] || eachPropDb?.[0]?.id;
            if (eachPropId) {
                currentLoopProposals.push(eachPropId);
                console.log(`✅ Created dedicated proposal ID: ${eachPropId}`);
            }
        } catch (e) {
            console.error("Failed to create dedicated proposal:", e);
        }
    }

    let mappedPricing = baseRow.pricing_structure || "standard";
    if (mappedPricing.includes("CO")) { mappedPricing = "standard"; } 
    else if (mappedPricing.includes("iChoosr")) { mappedPricing = "ichoosr_2026"; } 
    else if (mappedPricing.includes("MA")) { mappedPricing = "ma_forge"; } 
    else if (mappedPricing.includes("CA") || mappedPricing.includes("LA")) { mappedPricing = "la_standard"; }

    console.log("3. Triggering workflow...");

    // Wrap the trigger in a Promise so the loop waits for onSuccess to finish!
    await new Promise((resolve) => {
        specSystemDetailsWorkflow_QuickAdd.trigger({
            additionalScope: {
                sys_id: -1, 
                prop_id: currentLoopProposals, // <--- NOW USING THE DYNAMICALLY CREATED ARRAY!
                ahri_id: null, 
                odu_id: baseRow.odu || null,
                idu_id: baseRow.idu || null,
                thermostat_id: baseRow.thermostat || null,
                system_type: baseRow.system_type.toLowerCase(),
                pricing_structure: mappedPricing,
                safe_mode: "add system",
                safe_state: "",
                safe_date: new Date().toISOString(),
                
                target_margin: quickAddMargin.value || 0.30,
                system_status: "proposed",
                surge_protection: quickAddSurge.value || "Single Circuit",
                price_date: quickAddPriceDate.value || new Date().toISOString(),
                rebate_date: quickAddRebateDate.value || new Date().toISOString(),
                gfci_enabled: quickAddGfci.value || false,
                condensate_enabled: quickAddCondensate.value || false,
                a2l_enabled: quickAddA2l.value || false,
                attic_enabled: quickAddAttic.value || false,
                tmv_enabled: (quickAddTmv.value && !baseRow.integrated_tmv) || false,
                venting_enabled: quickAddVenting.value || false
            },
            onSuccess: async function(data) {
                console.log("4. Workflow onSuccess triggered! Raw data:", data);
                
                // Extract Array
                let workflowResults = data?.result;

                console.log(`5. Extracted Array of ${workflowResults?.length || 0} items to insert.`);

                // --- INNER LOOP: Insert into Database ---
                for (let i = 0; i < workflowResults.length; i++) {
                    const resultData = workflowResults[i];
                    const propId = resultData?.proposal_id;
                    const generatedLineItems = resultData?.LineItemsToInsert?.value || [];

                    if (!propId) {
                        console.warn(`⚠️ Skipping row due to missing proposal ID or workflow error. Data:`, resultData);
                        continue;
                    }

                    console.log(`6. Inserting system for proposal ${propId}...`);
                    
                    try {
                        const newSystemDb = await insert_quick_add_system.trigger({
                            additionalScope: { 
                                current_proposal_id: propId,
                                current_ahri_number: baseRow.ahri_number || null, 
                                current_system_type: baseRow.system_type.toLowerCase(),
                                current_nickname: null,
                                current_margin: quickAddMargin.value || 0.30,
                                current_status: "proposed",
                                current_rebate_date: quickAddRebateDate.value || null
                            }
                        });
                        
                        let newSystemId = newSystemDb?.system_id?.[0] || newSystemDb?.[0]?.system_id || newSystemDb?.id?.[0] || newSystemDb?.[0]?.id;

                        if (!newSystemId) {
                            console.error(`🚨 Failed to retrieve new System ID from DB for ${baseRow.nickname}.`);
                            continue;
                        }

                        if (generatedLineItems.length > 0) {
                            console.log(`7. Saving ${generatedLineItems.length} items to System ID: ${newSystemId}...`);
                            await insert_quick_add_line_items.trigger({
                                additionalScope: {
                                    current_sys_id: newSystemId,
                                    current_line_items: JSON.stringify(generatedLineItems)
                                }
                            });
                            console.log(`✅ System & Line Items successfully saved for proposal ${propId}!`);
                        } else {
                            console.warn(`⚠️ System saved, but no line items were returned by the workflow.`);
                        }
                    } catch (dbError) {
                        console.error(`🚨 DATABASE ERROR on ${baseRow.nickname}:`, dbError);
                    }
                }
                
                // RESOLVE the promise so the outer loop can move to the next Base Design
                resolve();
            },
            onFailure: function(error) {
                console.error(`🚨 Workflow failed for ${baseRow.nickname}:`, error);
                // RESOLVE the promise even on failure, so the script doesn't hang forever
                resolve();
            }
        });
    });
}

console.log("\n8. Refreshing UI...");
await proposals.trigger();
await systems.trigger(); 
quickAddModal.hide();
utils.showNotification({title: "Success!", description: "System(s) Added Successfully.", type: "success"});
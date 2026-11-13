// SAFELY grab the data. If it's already an array, use it. If not, format it.
let rawSurge = checkExistingSurge.data || [];
let surgeData = Array.isArray(rawSurge) ? rawSurge : formatDataAsArray(rawSurge);

let loopResults = loopProposals.data;

// Safely grab the array of IDs 
//  let incData = startTrigger.data.specIncentives || {};
//  let rawIds = incData.proposal_ids || incData.proposal_id || startTrigger.data.proposal_ids || startTrigger.data.proposal_id;
let rawIds = returnProposals.data
let proposalIds = Array.isArray(rawIds) ? rawIds : [rawIds];

let finalArray = [];
const t = startTrigger.data; // Define t

for (let i = 0; i < loopResults.length; i++) {
  let currentIncentives = loopResults[i].specIncentives;
  let currentProposalId = proposalIds[i];

  var errors = [];
  if (specSystemDetails.data.errors) {
    errors = errors.concat(specSystemDetails.data.errors);
  }

  let lineItems = currentIncentives.result;

  let pricingPromise =  priceLineItems.data;
  if (pricingPromise.errors) {
    errors = errors.concat(pricingPromise.errors);
  }

  if (currentIncentives.errors) {
    errors = errors.concat(currentIncentives.errors);
  }

  // Clone base system and assign this specific loop's proposal_id
  let currentSystem = { ...specSystemDetails.data.newSystem, proposal_id: currentProposalId };
  
  // Make a clean copy of the line items for this specific proposal
  let currentLineItems = [...lineItems]; 

  // --- SURGE PROTECTOR CLEANUP ---
  if (t.surgeProtection === 'Whole Home') {
      let matchId = String(currentProposalId);
      
      // Find the match without using an inline function to keep the linter happy!
      let surgeMatch = null;
      for (let j = 0; j < surgeData.length; j++) {
          if (String(surgeData[j].proposal_id) === matchId) {
              surgeMatch = surgeData[j];
              break;
          }
      }

      let existingCount = surgeMatch ? parseInt(surgeMatch.count) : 0;
      console.log(`Checking Surge DB for Proposal ${matchId} | Match Found:`, surgeMatch);

      if (existingCount > 0) {
          console.log(`Removing Whole Home Surge for ${matchId}: Already exists in DB.`);
          
          // We also rewrite the filter as a traditional loop to keep it 100% warning-free
          let cleanedLineItems = [];
          for (let k = 0; k < currentLineItems.length; k++) {
              if (String(currentLineItems[k].labor_id) !== "122") {
                  cleanedLineItems.push(currentLineItems[k]);
              }
          }
          currentLineItems = cleanedLineItems;
      }
  }
  // --------------------------------

  if (startTrigger.data.mode === 'edit system') {
    let lineItemsPromise = await getManualLineItems(specSystemDetails.data.system_id);
    let transformedData = [];
    let transformed_data = lineItemsPromise.data;
    transformed_data.forEach((item) => {
      transformedData.push({
        ...item,
        temp_id: item.id,
        fetchedFromDb: true
      });
    });
    const itemsToAdd = Array.isArray(transformedData) ? transformedData : [transformedData];
    currentLineItems = currentLineItems.concat(itemsToAdd);
  }

  // Push this specific proposal's formatted data to our final array
  finalArray.push({
    proposal_id: currentProposalId,
    SystemToInsert: { value: currentSystem },
    LineItemsToInsert: { value: currentLineItems },
    newErrors: errors,
    status: (errors && errors.length > 0) ? "error" : "success"
  });
  
} // <-- This brace closes the for-loop

return finalArray;
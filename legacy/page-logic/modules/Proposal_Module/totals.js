const projectCosts = {{ hearProjectCostBreakdown.data }}; 
const nonIraRebates = {{ nonHearRebateBreakdown.data }}; 
const hearRebates = {{ hearRebateBreakdown.data }}; 
const projectCostBreakdown = {{ projectCostBreakdownAndDesignOptions.data.projectCostBreakDown }}; 

// ---- helpers ---- 
const sumField = (rows, field) => (rows || []).reduce( (sum, row) => sum + Number(row[field] || 0), 0 ); 

// ---- totals ---- 
const customerTotal = sumField(projectCosts, "total_cost"); const nonIraTotal = sumField(nonIraRebates, "incentive_amount"); 
const hearTotal = sumField(hearRebates, "amount"); 
const finalCustomerCost = (customerTotal - nonIraTotal - hearTotal) > 0 ? (customerTotal - nonIraTotal - hearTotal) : 0; 
const outOfPocketCost = projectCostBreakdown.filter(i => i.label === "<b>Out-of-Pocket Cost (Amount paid to Elephant or Financed)</b>" )[0]; 
const removeTags = outOfPocketCost[0].replace(/<\/?b>/g, "").trim();
const amountDue = Number(removeTags.replace(/[^0-9.-]/g, ""));

// ---- result ---- 
return [{ 
customer_total: customerTotal, 
non_ira_total: nonIraTotal, 
hear_total: hearTotal, 
final_customer_cost: finalCustomerCost, 
amount_due: finalCustomerCost}];
const netCostDueToElephant = {{parseFloat(projectCostBreakdownAndDesignOptions.data.projectCostBreakDown.find(item => item.label === "<b>Out-of-Pocket Cost (Amount paid to Elephant or Financed)</b>")['0'].replace(/(\$|,|<\/?b>)/g, ''))}};
const depositAmount = {{parseFloat(projectCostBreakdownAndDesignOptions.data.projectCostBreakDown.find(item => item.label === "<b>Out-of-Pocket Cost (Amount paid to Elephant or Financed)</b>")['0'].replace(/(\$|,|<\/?b>)/g, ''))}};
const totalProjectValue = {{parseFloat(projectCostBreakdownAndDesignOptions.data.projectCostBreakDown.find(item => item.label === "<b>Total Cost</b>")['0'].replace(/(\$|,|<\/?b>)/g, ''))}}
return [netCostDueToElephant, depositAmount, totalProjectValue];

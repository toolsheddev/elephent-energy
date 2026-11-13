proposalModule1.setOutput("pdfUrl", "");
  const proposalGenerationValues = [
  { proposalsToGenerate: proposalTable.selectedRows.map(row => row.id) },
  { pipedrive_customer: salesforce_opportunity.data[0] },
  { pipedrive_deal: salesforce_opportunity.data[0] },
  { house: house.data },
  { project: project.data },
  { salesforce_opportunity: salesforce_opportunity.data[0] },
  { customer: customer.data[0] }
];
return proposalGenerationValues;

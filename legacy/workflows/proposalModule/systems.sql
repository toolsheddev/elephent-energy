select distinct id 
  from systems_new 
  where proposal_id = ANY({{ startTrigger.data.proposalToGenerate }})
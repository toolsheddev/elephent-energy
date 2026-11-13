UPDATE systems_new
SET proposal_id = {{ proposalId }}
WHERE id = {{ systemId }};
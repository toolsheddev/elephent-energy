SELECT
  *
FROM
  line_items_new
WHERE
  incentive_id IS NOT NULL
  AND system_id IN (
    SELECT
      id
    FROM
      systems_new
    WHERE
      (
        system_status = 'active'
        OR (proposal_id = {{SelectProposalNewSystem.value}} AND {{ mode.value }} = 'add system')
        OR (proposal_id = {{proposalTable.selectedRowKey}} AND system_id != {{ systemsTable.selectedRowKey }} AND
    ({{ mode.value  }} = 'edit system' OR {{ !mode.value }} ) )
      )
      AND house_id = {{house.data.id}}
      AND price_actual != 0
  );
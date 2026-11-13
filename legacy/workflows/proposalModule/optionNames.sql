SELECT
      id,
      nickname
FROM
      proposals_new
WHERE
      id = ANY ({{ startTrigger.data.proposalToGenerate}})
ORDER BY
      id ASC;

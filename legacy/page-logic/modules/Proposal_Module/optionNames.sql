SELECT
      id,
      nickname,
      additional_terms,
      deposit_amount,
      indicative
FROM
      proposals_new
WHERE
      id = ANY ({{proposalsToGenerate.value}})
ORDER BY
      id ASC;

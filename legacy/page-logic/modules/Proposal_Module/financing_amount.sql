SELECT
    p.id,
    fa->>'lender' AS lender,
    (fa->>'amount')::numeric AS amount
FROM projects_new p
CROSS JOIN LATERAL jsonb_array_elements(p.financing_amounts::jsonb) fa
WHERE fa->>'lender' ILIKE 'Synchrony'
AND p.id = {{ project.value.id }}
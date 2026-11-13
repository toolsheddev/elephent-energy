SELECT 
    DISTINCT e.*
FROM 
    equipment_new e
JOIN 
    prices_new p 
ON 
    e.id = p.equipment_id
WHERE 
    p.active_date <= {{ startTrigger.data.PricingEffectiveDate || moment() }}
    AND (p.inactive_date IS NULL OR p.inactive_date > {{ startTrigger.data.PricingEffectiveDate || moment() }})
    AND (
        ({{ startTrigger.data.pricingStructure }} = 'standard' AND p.territory = 'CO') OR
        ({{ startTrigger.data.pricingStructure }} = 'ma_forge' AND p.territory = 'MA') OR
        ({{ startTrigger.data.pricingStructure }} = 'ma_laminar' AND p.territory = 'MA-Laminar') OR
        ({{ startTrigger.data.pricingStructure }} = 'la_standard' AND p.territory = 'CA')
    );

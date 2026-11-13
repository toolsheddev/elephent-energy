const systems = {{ systems_by_proposal.value }};
// pull from UI mapping on previous page
const mapping = {{Systems.data}};

const results = systems.map(system => {
    const systemType = system.system_type_detail.system_type;
    const matchingRecord = mapping.find(mapping => mapping.label === systemType);

    return {
        original_id: system.id,
        system_type: systemType,
        matched_id: matchingRecord ? matchingRecord.id : 'No matching label'
    };
});

return results;

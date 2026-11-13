let systems = {{systems.data}};

function filterArray(systems) {
    return systems.filter(item => item.proposal_id === null && item.system_type === 'other' && item.system_status === 'active');
}

const hvacSystems = filterArray(systems);
console.log(hvacSystems);
return hvacSystems;



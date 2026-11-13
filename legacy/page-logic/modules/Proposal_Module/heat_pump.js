let systems = {{new_systems.data}};

function filterArray(systems) {
    return systems.filter(item => item.system_type === 'hvac');
}

const wh = filterArray(systems);
console.log(wh);
return wh;



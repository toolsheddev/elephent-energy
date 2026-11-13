let systems = {{ systems.data }};

function sanitize(str) {
  return str?.toString().replace(/\s+/g, '_') || '';
}

function buildCombo(type, fuel, condensing) {
  let combo = `${sanitize(type)}-${sanitize(fuel)}`;
  if (condensing && condensing !== '') {
    combo += `-${sanitize(condensing)}`;
  }
  return combo;
}

function filterAndTransformArray(systems) {
  return systems
    .filter(item => item.proposal_id === null && item.system_type === 'hvac' && item.system_status === 'active')
    .map(item => {
      const heating = item.system_type_detail?.heating || {};
      const cooling = item.system_type_detail?.cooling || {};

      const heatingCombo = buildCombo(heating.type, heating.fuel, heating.condensing);
      const coolingCombo = buildCombo(cooling.type, cooling.fuel, cooling.condensing);

      return {
        ...item,
        system_type_detail: {
          ...item.system_type_detail,
          heating: {
            ...heating,
            combined: heatingCombo
          },
          cooling: {
            ...cooling,
            combined: coolingCombo
          }
        }
      };
    });
}

const hvacSystems = filterAndTransformArray(systems);
console.log(hvacSystems);
return hvacSystems;

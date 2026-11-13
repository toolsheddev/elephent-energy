let systems = {{ systems.data }};

function sanitize(str) {
  return str?.toString().replace(/\s+/g, '_') || '';
}

function buildCombo(type, fuel) {
  return `${sanitize(type)}-${sanitize(fuel)}`;
}

function filterAndTransformArray(systems) {
  return systems
    .filter(item => item.proposal_id === null && item.system_type === 'water heater' && item.system_status === 'active')
    .map(item => {
      const detail = item.system_type_detail || {};
      const combo = buildCombo(detail.type, detail.fuel);

      return {
        ...item,
        system_type_detail: {
          ...detail,
          combination: combo
        }
      };
    });
}

const waterHeaterSystems = filterAndTransformArray(systems);
console.log(waterHeaterSystems);
return waterHeaterSystems;

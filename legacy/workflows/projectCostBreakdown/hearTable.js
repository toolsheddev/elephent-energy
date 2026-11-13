// -----------------------------
// Normalize inputs
// -----------------------------
const systems = getSystems.data || [];
const ahriList = getAhri.data || [];
const equipmentRaw = getEquipmentById.data || {};
const breakdown = hearBreakdown.data || [];

// Normalize equipment into an array
const equipment = Array.isArray(equipmentRaw)
  ? equipmentRaw
  : Object.values(equipmentRaw);

// Build AHRI lookup
const ahriById = Object.fromEntries(
  ahriList.map(a => [a.id, a])
);

// -----------------------------
// HVAC processing
// -----------------------------
const hvacSystems = systems.filter(s => s.system_type === 'hvac');

// Efficiency ratings (HVAC)
const hvacEfficiencyRatings = hvacSystems
  .map(sys => {
    const ahri = ahriById[sys.ahri_id];
    if (!ahri) return null;

    return [
      ahri.ahri_number ? `AHRI ${ahri.ahri_number}` : null,
      ahri.seer_2 ? `SEER2 ${ahri.seer_2}` : null,
      ahri.eer_2 ? `EER2 ${ahri.eer_2}` : null,
      ahri.hspf_2 ? `HSPF2 ${ahri.hspf_2}` : null
    ]
      .filter(Boolean)
      .join(' | ');
  })
  .filter(Boolean)
  .join(' / ');

// Model numbers (HVAC)
const hvacModelNumbers = equipment
  .filter(e =>
    [
      'Condenser',
      'AHU',
      'Wall Head',
      'Floor Head',
      'Ceiling Cassette',
      'Heat Kit',
      'furnace'
    ].includes(e.equipment_type)
  )
  .map(e => e.model_number)
  .filter(Boolean)
  .join(' | ');

// -----------------------------
// Water Heater processing
// -----------------------------
const whSystems = systems.filter(s => s.system_type === 'water heater');

// Efficiency ratings (Water Heater)
const whEfficiencyRatings = [
  // AHRI numbers
  ...whSystems
    .map(sys => {
      const ahri = ahriById[sys.ahri_id];
      return ahri?.ahri_number ? `AHRI ${ahri.ahri_number}` : null;
    })
    .filter(Boolean),

  // UEF from HPWH equipment
  ...equipment
    .filter(e => e.equipment_type === 'HPWH' && e.uef)
    .map(e => `UEF ${e.uef}`)
]
  .filter(Boolean)
  .join(' | ');

// Model numbers (Water Heater)
const whModelNumbers = equipment
  .filter(e => e.equipment_type === 'HPWH')
  .map(e => e.model_number)
  .filter(Boolean)
  .join(' / ');

// -----------------------------
// Merge into hearBreakdown
// -----------------------------
const result = breakdown.map(row => {
  if (row.description === 'HVAC Equipment') {
    return {
      ...row,
      efficiency_ratings: hvacEfficiencyRatings || null,
      model_numbers: hvacModelNumbers || null
    };
  }

  if (row.description === 'Water Heater Equipment') {
    return {
      ...row,
      efficiency_ratings: whEfficiencyRatings || null,
      model_numbers: whModelNumbers || null
    };
  }

  // All other rows unchanged
  return {
    ...row,
    efficiency_ratings: null,
    model_numbers: null
  };
});

return result;

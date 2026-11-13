const rows = {{ systems_checklists_needed.data }} ?? [];
const state = {{  house.data.state }};

// -------------------------
// Flatten template ID array
// -------------------------
const templateMap = Object.assign({}, ...{{  companycamTemplateIds.value}});
// result:
// {
//   co_ducted: "...",
//   co_ductless: "...",
//   ...
// }

// -------------------------
// Initialize result
// -------------------------
const result = {
  dual_fuel: false,
  ducted: false,
  ductless: false,
  mixed: false,
  hpwh: false,
  checklist_template_ids: []
};

// -------------------------
// Detect system types
// -------------------------
rows.forEach(row => {
  const systemType = row.system_type;
  const systemFuel = row.system_type_detail;
  const certDetail = row.certification_type_detail;

  if (systemType === 'hvac' && systemFuel.fuel === 'dual fuel') 
  {
    result.dual_fuel = true;
  }
  
  if (systemType === 'hvac' && systemFuel.fuel !== 'dual fuel') {
    if (certDetail === 'ducted') result.ducted = true;
    if (certDetail === 'ductless') result.ductless = true;
    if (certDetail === 'mixed') result.mixed = true;
  }

  if (systemType === 'water heater') {
    result.hpwh = true;
  }
});

// -------------------------
// Select checklist templates
// -------------------------
if (result.dual_fuel) result.checklist_template_ids.push(templateMap.dual_fuel);

if (state === 'CO') {
  if (result.ducted) result.checklist_template_ids.push(templateMap.co_ducted);
  if (result.ductless) result.checklist_template_ids.push(templateMap.co_ductless);
  if (result.mixed) result.checklist_template_ids.push(templateMap.co_mixed);
  if (result.hpwh) result.checklist_template_ids.push(templateMap.co_hpwh);

  // always include
  result.checklist_template_ids.push(templateMap.co_electrical);
}

if (state === 'MA') {
  if (result.ducted) result.checklist_template_ids.push(templateMap.ma_ducted);
  if (result.ductless) result.checklist_template_ids.push(templateMap.ma_ductless);
  if (result.mixed) result.checklist_template_ids.push(templateMap.ma_mixed);
  if (result.hpwh) result.checklist_template_ids.push(templateMap.ma_hpwh);

  // always include
  result.checklist_template_ids.push(templateMap.ma_electrical);
}

if (state === 'CA') {
  if (result.ducted) result.checklist_template_ids.push(templateMap.ca_ducted);
  if (result.ductless) result.checklist_template_ids.push(templateMap.ca_ductless);
  if (result.mixed) result.checklist_template_ids.push(templateMap.ca_mixed);
  if (result.hpwh) result.checklist_template_ids.push(templateMap.ca_hpwh);

  // always include
  result.checklist_template_ids.push(templateMap.ca_electrical);
}

// -------------------------
// Deduplicate + clean
// -------------------------
result.checklist_template_ids = [
  ...new Set(result.checklist_template_ids.filter(Boolean))
];

return result;
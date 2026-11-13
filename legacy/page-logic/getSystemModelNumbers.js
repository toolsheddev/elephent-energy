// 1. INPUTS
const system = {{ systemsTable.selectedRow }};
const rawLines = {{ line_items_by_system.value || [] }};
const lineItems = Array.isArray(rawLines) ? rawLines : formatDataAsArray(rawLines);
const rawEquip = {{ equipment_by_id.data || [] }}; 
const equipmentList = Array.isArray(rawEquip) ? rawEquip : formatDataAsArray(rawEquip);

// Helper to find equipment
const findEquipment = (id) => {
    if (!id) return null;
    let match = equipmentList.find(e => e.id == id);
    if (match) return match;
    if (!Array.isArray(rawEquip) && rawEquip[id]) return rawEquip[id];
    return null;
};

// Helper: Text check
const check = (str, keyword) => (str || "").toLowerCase().includes(keyword.toLowerCase());

// Helper: Model Extractor from Name (e.g. "MXZ-SM36... | Mitsubishi...")
const extractModel = (str) => {
    if (!str) return "";
    let clean = str.split('|')[0].trim(); // Pipe se pehle ka hissa
    return clean.split(' ')[0].trim();   // Space se pehle ka hissa (Model usually first word hota hai)
};

if (!system) return { outdoor: "", indoor: "", system_type: "hvac" };

const systemItems = lineItems.filter(li => li.system_id == system.id);

// 3. IDENTIFY UNITS
let outdoorModel = "";
let indoorModel = "";

systemItems.forEach(item => {
  // Step A: Try Equipment Data
  const equip = findEquipment(item.equipment_id);
  
  // Step B: Determine Attributes (Fallback to Line Item data)
  const cat = equip ? (equip.category || "") : (item.category || item.type || "");
  const sub = equip ? (equip.subcategory || "") : (item.subcategory || item.type_detail || "");
  
  // Step C: Get Model Number (Best Effort)
  let model = equip ? (equip.model_number || equip.model) : (item.model_number || item.model);
  
  // Fallback: Agar model abhi bhi empty hai, to 'name' se extract karo
  if (!model) {
      model = extractModel(item.name || item.description);
  }

  // OUTDOOR DETECTION
  // Keywords: Heat Pump, Condenser, Outdoor
  if (check(cat, 'heat pump') || check(cat, 'condenser') || check(sub, 'condenser') || check(sub, 'outdoor') || check(item.name, 'condenser')) {
      // Avoid Accessories (like 'Riser', 'Stand', 'Pad')
      if (!check(item.name, 'riser') && !check(item.name, 'stand') && !check(item.name, 'pad') && !check(item.name, 'accessory')) {
           outdoorModel = model;
      }
  }
  
  // INDOOR DETECTION
  // Keywords: Air Handler, Furnace, AHU, Evaporator, Indoor
  if (check(cat, 'air handler') || check(cat, 'furnace') || check(sub, 'ahu') || check(sub, 'indoor') || check(item.name, 'air handler') || check(item.name, 'ahu')) {
      indoorModel = model;
  }
});

return {
  outdoor: outdoorModel || "",
  indoor: indoorModel || "",
  system_type: system.system_type || "hvac",
  _debug_count: systemItems.length,
  _debug_outdoor_found: outdoorModel
};
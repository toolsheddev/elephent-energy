const startData = startTrigger.data;

const equipmentData = (!startData.equipmentData || (startData.equipmentData instanceof Object && Object.keys(startData.equipmentData)?.length === 0))
  ? (getEquipmentData.data).reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {})
  : startData.equipmentData;

const laborData = (!startData.laborData || (startData.laborData instanceof Object && Object.keys(startData.laborData)?.length === 0))
  ? (getLaborData.data).reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {})
  : startData.laborData;
let pricingStructure = startData.pricingStructure;
let PricingEffectiveDate = startData.PricingEffectiveDate;
let lineItems = startData.lineItems;

return {
  equipmentData,
  laborData,
  pricingStructure,
  PricingEffectiveDate,
  lineItems
};

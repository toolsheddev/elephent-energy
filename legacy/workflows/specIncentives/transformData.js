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

const incentivesData = (getIncentives.data).reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

const incentiveLimitsData = (startData.incentivesLimitData);

const incentivesForLimits = (getIncentiveForLimits.data);

const ahriRecord = startData.ahriRecord ? startData.ahriRecord : (getAhriRecord.data[0]);
console.log('transformdata',ahriRecord)

return {
  ahriRecord,
  equipmentData,
  laborData,
  incentivesData,
  incentiveLimitsData,
  incentivesForLimits,
};

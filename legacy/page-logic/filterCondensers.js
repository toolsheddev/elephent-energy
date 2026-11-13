const allCondensers = {{ formatDataAsArray(getCondensersWithCapacity.data) }};
const houseData = {{ getHouseLoadTemp.data }};
const heatLoad = houseData?.heat_load[0];
const designTemp = houseData?.design_temp[0];
const viewAll = {{ condenserViewAllButton.value }};
const roundedDesignTemp = Math.round(designTemp);

if (viewAll || !heatLoad) {
  return allCondensers;
}

const filteredCondensers = allCondensers.filter((condenser) => {
  const capacityData = condenser.capacity_json;
  if (!Array.isArray(capacityData) || capacityData.length === 0) {
    return false;
  }

  const performance = capacityData.find(
    (c) => c.temperature === roundedDesignTemp
  );
  if (!performance) {
    return false;
  }

  return performance.value >= heatLoad;
});

return filteredCondensers;

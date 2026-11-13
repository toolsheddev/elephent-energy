const allData = formDesignOptionsTable.data;

const finalResult = allData.map(dataSet => {
  // Step 1: Identify the keys where System Type = "hvac"
  const systemTypeRow = dataSet.find(row => row.label === "System Type");
  if (!systemTypeRow) return null;

  const hvacKeys = Object.entries(systemTypeRow)
    .filter(([key, value]) => key.startsWith("system") && value === "hvac")
    .map(([key]) => key);

  // Step 2: Filter out the "System Type" row
  const filteredRows = dataSet.filter(row => row.label !== "System Type");

  // Step 3: Only include rows where at least one hvacKey has a non-empty value
  const result = filteredRows
    .map(row => {
      const newRow = { label: row.label };
      hvacKeys.forEach(key => {
        newRow[key] = row[key];
      });

      const hasValue = hvacKeys.some(key => {
        const val = newRow[key];
        return val !== null && val !== undefined && val.toString().trim() !== "";
      });

      return hasValue ? newRow : null;
    })
    .filter(row => row !== null);

  return result;
}).filter(entry => entry !== null); // Filter out any nulls in case some dataSets had no System Type

return finalResult;

function arrayToObjectById(array) {
  // Reduce the array to an object where each key is the `id` from the item
  return array.reduce((acc, item) => {
    if (item.id !== undefined) {
      acc[item.id] = item; // Use the `id` as the key
    }
    return acc;
  }, {});
}

// Ensure the `getLabor.data` is formatted properly
const formattedData = arrayToObjectById(getLabor.data);

// Return the result to be used elsewhere
return formattedData;

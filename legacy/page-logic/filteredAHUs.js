// The data from your getAHU query is available.
const allAHUs = formatDataAsArray({{ahu_models.data}});

// Get the values from your UI components
const selectedSeries = {{ condensor_model_series.value }};
const excludeFilter = {{ variable39?.value || false}};

// If the checkbox is checked OR no condenser is selected, return the full list.
if (excludeFilter || !selectedSeries) {
  return allAHUs;
}

// Define the series that require a "position" (substring) match.
const positionMatchSeries = ['S', 'M', 'P', 'SM', 'MP', 'MPS', 'A', 'B', 'C', 'AB', 'AC'];

// Filter the list based on the selected condenser's series.
const filteredAHUs = allAHUs.filter(ahu => {
  const ahuSeries = ahu.model_series;
  if (!ahuSeries) {
    return false; // An AHU without a series can't be a match.
  }
  
  // Check if the selected condenser's series is in our special position-match list.
  if (positionMatchSeries.includes(selectedSeries)) {
    // Use "position match" logic (e.g., is 'S' inside 'SM'?)
    return selectedSeries.includes(ahuSeries);
  } else {
    // For all others (like 'VersaPro', 'IDS Ultra'), use a "direct match".
    return ahuSeries === selectedSeries;
  }
});

return filteredAHUs;
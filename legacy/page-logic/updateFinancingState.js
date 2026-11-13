// Data is passed in from the trigger via additionalScope
const newState = {};

// Build the new state using the passed-in 'selectedLenders' array
selectedLenders.forEach(lender => {
  // Use the passed-in 'currentState' object to check for existing amounts
  if (currentState.hasOwnProperty(lender)) {
    newState[lender] = currentState[lender];
  } else {
    newState[lender] = 0;
  }
});

// Update the temporary state
financingState.setValue(newState);
LineItemsToInsert.setValue(null);

if (systemStateSelection.selectedItem.value === "non_co_system") {
  state.setValue("");
} else if (systemStateSelection.selectedItem.value === "co_system") {
  state.setValue("CO");
}

specSystemDetailsWorkflow.trigger();

async function runAll() {
  await lineItemsForMarginCalculation.trigger();
  await mergeLineItems.trigger();
  await marginLogic.trigger();
  resetDeleteLineItemAsCoForm.trigger();
}

runAll();
 
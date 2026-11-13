return {{listView2.instanceValues}}.map((row, i) => {
  const typeValue = row?.lineItemType;
  const typeDetail = row?.lineItemTypeDetail;
  const itemId = row?.lineItemName;

  let fullSelectedItem = null;

  if (
    {{newLineItemDetail.value}} &&
    typeValue &&
    {{newLineItemDetail.value}}[typeValue]
  ) {
    fullSelectedItem = {{newLineItemDetail.value}}[typeValue].find(
      item => item.id === itemId
    );
  }

  const subcategory = fullSelectedItem?.subcategory;

  const equipmentData = itemId
    ? {{getEquipmentsWithCircuit.data}}?.[itemId]
    : undefined;

  const isCircuit = subcategory === "circuit";
  const isValidEquipment = typeValue === "equipment" && equipmentData;

  return isCircuit || isValidEquipment;
});
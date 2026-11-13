// 1. Helper function (Updated to accept 'row' data)
// Returns ONE row per item per margin group. Quantity is carried on the row
// rather than duplicating it, so the single preview table stays readable and
// the footer total is meaningful.
//
// IMPORTANT: price_actual and margin_amount on these rows are EXTENDED amounts
// (unit value * quantity), not the per-unit values that get inserted. That is
// what makes the table reconcile: price + margin = line_total on every row, and
// the column sums add up to the Price Matching Discount. The true per-unit
// values are kept alongside as unit_price / unit_margin, and the real insert
// reads addtlLineItemsList, never this.
function generateTablePreview(baseItems, row, rowIndex) {
  let selectedSystems = _.cloneDeep(bulkSystemSelect.selectedItems || []);

  // Extract values from the specific row, not the global component
  let lineItemsQty = parseInt(row?.lineItemQty || 1);
  let isDiscount = row?.discountDesc ? true : false;

  let groupedItems = [];

  // If no systems selected, return base items with 0 margin
  if (selectedSystems.length === 0) {
    return baseItems.map((item, itemIndex) => {
      let unitPrice = parseFloat(item.price_actual || 0);
      return {
        ...item,
        system_name: 'No system selected',
        quantity: lineItemsQty,
        unit_price: unitPrice,
        unit_margin: 0,
        price_actual: Number((unitPrice * lineItemsQty).toFixed(2)),
        margin_percent: 0,
        margin_amount: 0,
        line_total: Number((unitPrice * lineItemsQty).toFixed(2)),
        preview_id: 'r' + rowIndex + '-nosys-i' + itemIndex
      };
    });
  }

  // Group systems by margin so we don't create duplicate rows for identical margins
  let marginGroups = {};
  for (let index = 0; index < selectedSystems.length; index++) {
    let system = selectedSystems[index];
    let rawMargin = parseFloat(marginListView.instanceValues[index]?.customMarginInput || 0);
    let target = rawMargin > 1 ? rawMargin / 100 : rawMargin;

    // Match the Save handlers + workflow: with no custom margin entered they
    // fall back to the system's own target margin (newLineItemMargin ->
    // transientMargin -> systemTarget), so the preview has to as well.
    if (!(target > 0)) {
      let systemTarget = in_out_system.value === 'out_system'
        ? system?.target_margin
        : system?.SystemToInsert?.value?.target_margin;
      let fallbackMargin = parseFloat(systemTarget || 0);
      target = fallbackMargin > 1 ? fallbackMargin / 100 : fallbackMargin;
    }

    if (!marginGroups[target]) {
      marginGroups[target] = { target: target, systems: [] };
    }
    marginGroups[target].systems.push(system);
  }

  // Generate the preview rows
  Object.values(marginGroups).forEach((group, groupIndex) => {
    let target = group.target;
    let systemNames = group.systems.map(s => s.name).join(', ');

    let mappedItems = baseItems.map((item, itemIndex) => {
      let unitPrice = parseFloat(item.price_actual || 0);

      // Prevent negative margin impact on discounts or negative values.
      // Margin is only persisted when the user chose to include it: the
      // workflow zeroes margin_amount on transient items when 'exclude'.
      let unitMargin = 0;
      if (target > 0 && !isDiscount && segmentedControl1.value === 'add') {
        unitMargin = Math.round((target * unitPrice / (1 - target)) * 100) / 100;
      }

      return {
        ...item,
        system_name: systemNames,
        quantity: lineItemsQty,
        // Per-unit values, kept for reference (this is what actually inserts)
        unit_price: unitPrice,
        unit_margin: unitMargin,
        // Extended amounts, so the displayed columns reconcile with the discount
        price_actual: Number((unitPrice * lineItemsQty).toFixed(2)),
        margin_percent: target,
        margin_amount: Number((unitMargin * lineItemsQty).toFixed(2)),
        // What this line actually adds to the customer's total
        line_total: Number(((unitPrice + unitMargin) * lineItemsQty).toFixed(2)),
        preview_id: 'r' + rowIndex + '-g' + groupIndex + '-i' + itemIndex
      };
    });

    groupedItems = groupedItems.concat(mappedItems);
  });

  return groupedItems;
}

// 1b. Price Matching Discount preview helpers
// These mirror the auto-apply logic in the modal's Save/Insert handlers so the
// preview shows exactly the discount that will be written on insert.
function isPriceMatchingEligible(item) {
  let co = item?.change_order_details;
  return item?.line_item_type !== 'discount'
    && !!co
    && !!co.respParty
    && co.respParty !== 'Homeowner';
}

function buildPriceMatchingLabel(descriptions) {
  let unique = [...new Set(descriptions)];
  let extra = unique.length > 1 ? ' +' + (unique.length - 1) + ' more' : '';
  return 'Price Matching Discount (' + unique[0] + extra + ')';
}

// Builds the discount rows for the preview. The Save handlers add one discount
// per system covering every CO item in the batch, so we aggregate across every
// preview row and group the same way generateTablePreview does (by margin /
// system group) rather than emitting one discount per item.
function buildPriceMatchingPreviewRows(previewItems) {
  // Margin is only folded into the discount when the user chose to include it
  let includeMargin = segmentedControl1.value === 'add';

  let groups = {};
  let groupOrder = [];

  previewItems.forEach(item => {
    if (!isPriceMatchingEligible(item)) return;

    let groupKey = item.system_name || '';
    if (!groups[groupKey]) {
      groups[groupKey] = { total: 0, descriptions: [] };
      groupOrder.push(groupKey);
    }

    // price_actual and margin_amount are already extended by quantity, so do
    // NOT multiply again here.
    let price = parseFloat(item.price_actual || 0);
    let margin = includeMargin ? parseFloat(item.margin_amount || 0) : 0;

    groups[groupKey].total += price + margin;
    groups[groupKey].descriptions.push(item.description || 'item');
  });

  return groupOrder
    .filter(groupKey => groups[groupKey].total > 0)
    .map((groupKey, groupIndex) => ({
      line_item_type: 'discount',
      description: buildPriceMatchingLabel(groups[groupKey].descriptions),
      price_actual: Number((-groups[groupKey].total).toFixed(2)),
      quantity: 1,
      unit_price: Number((-groups[groupKey].total).toFixed(2)),
      unit_margin: 0,
      margin_percent: 0,
      margin_amount: 0,
      line_total: Number((-groups[groupKey].total).toFixed(2)),
      system_name: groupKey,
      preview_id: 'pmd-g' + groupIndex,
      pmd_preview: true // display-only marker, never inserted
    }));
}

// 2. Main Execution - Loop through all List View rows
const rows = listView2.instanceValues;
// Change order info is entered once (visible on the last row only) and applies to every item
const coRow = rows[rows.length - 1];
// Create an array of Promises (one for each row)
const pricingPromises = rows.map((row, i) => {
  const lineItemNameId = row?.lineItemName;

  // THE FIX: This is a global component, so we use .value directly!
  const segmentedVal = segmentedControlLineitem.value;

  const isValidItem = !!lineItemNameId && ![55, 87, 129, 130].includes(lineItemNameId);
  const isStandardItemType = ['non_co_line_item', 'co_line_item'].includes(segmentedVal);

  if (isStandardItemType && isValidItem) {
    // STANDARD ITEM: Trigger database query
    return new Promise((resolve, reject) => {

      // A. Look up the full item details
      let fullSelectedItem = null;
      if (newLineItemDetail.value && row?.lineItemType && newLineItemDetail.value[row.lineItemType]) {
        fullSelectedItem = newLineItemDetail.value[row.lineItemType].find(item => item.id === lineItemNameId);
      }

      // B. Build the parameter payload for this specific row
      const payload = {
        itemId: lineItemNameId,
        lineItemType: row?.lineItemType,
        itemName: fullSelectedItem?.name || fullSelectedItem?.description || 'Unknown Item',
        hasCircuit: checkForCircuitField.value ? checkForCircuitField.value[i] : false,
        circuitLength: row?.lineItemCircuitLength,
        segmentedControl: segmentedVal, // Updated here
        // NOTE: If these Change Order fields are also outside the list view, change them to .value!
        changeOrderDesc: coRow?.changeOrderDesc2,
        changeOrderReason: coRow?.changeOrderReason2,
        requester: coRow?.requester2,
        timeline: coRow?.timeline2,
        impact: coRow?.impact2,
        responsible: coRow?.responsible2,
        customerConsent: coRow?.customerConsent2,
        installerConsent: coRow?.installerConsent2,
      };

      // C. Trigger the query
      addtlLineItems.trigger({
        additionalScope: { rowParams: payload },
        onSuccess: (data) => resolve({ index: i, data: data, rowInfo: row }),
        onFailure: reject,
      });
    });
  }
  else if (row?.discountDesc || row?.lineItemType === 'discount') {
    // MANUAL/DISCOUNT ITEM
    let manualItem = [{
      line_item_type: row?.lineItemType,
      description: row?.discountDesc ? row?.discountDesc : lineItemNameId,
      price_actual: row?.lineItemType === 'discount' ? -Math.abs(Number(row?.newLineItemAmount) || 0) : row?.newLineItemAmount,
      manually_added: true,
      state: 'transient',
      status: in_out_system.value !== 'out_system'
        ? (state.value === 'CO' ? 'proposed - from change order' : 'active - from finalized proposal')
        : (segmentedVal === 'co_line_item' ? 'proposed - from change order' : 'active - from finalized proposal'),
      ...(segmentedVal === 'co_line_item' && {
        change_order_details: {
          description: coRow?.changeOrderDesc2, // (Same note applies to these!)
          reason: coRow?.changeOrderReason2,
          requester: coRow?.requester2,
          timeline: coRow?.timeline2,
          impact: coRow?.impact2,
          respParty: coRow?.responsible2,
          customerConsent: coRow?.customerConsent2,
          installerConsent: coRow?.installerConsent2,
          severity: Math.max(coRow?.timeline2 || 0, coRow?.impact2 || 0),
        }
      })
    }];

    return Promise.resolve({ index: i, data: manualItem, rowInfo: row });
  }
  else {
    return Promise.resolve(null);
  }
});

// 3. Wait for all queries to finish, then save to states!
Promise.all(pricingPromises)
  .then((results) => {
    // finalList MUST stay keyed by List View row index - the Save handlers do
    // Object.keys(...) on it and use each key to read
    // listView2.instanceValues[rowIndex].lineItemQty. Do not flatten it.
    let finalList = {};
    let previewByRow = {};

    results.forEach(result => {
      if (!result) return; // Skip empty rows

      let i = result.index;

      // Save original data (per row index)
      finalList[i] = result.data;

      // Build table preview rows for this List View row
      previewByRow[i] = generateTablePreview(result.data, result.rowInfo, i);
    });

    // finalVar is display-only, so it can be a single flat array feeding one
    // table. Object.values keeps ascending row order.
    let previewItems = _.flatten(Object.values(previewByRow));

    // Append the auto-applied Price Matching Discount so it is visible before
    // insert. Only the preview is touched - finalList drives the actual save,
    // where the Save handlers add the real discount themselves.
    let finalVar = previewItems.concat(buildPriceMatchingPreviewRows(previewItems));

    addtlLineItemsList.setValue(finalList);
    addtlLineItemsVar.setValue(finalVar);

    console.log("Global Pricing Complete!", finalVar);
  })
  .catch(err => console.error("Pricing error:", err));

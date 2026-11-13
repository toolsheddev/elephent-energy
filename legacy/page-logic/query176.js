let invoicesPromise = new Promise((resolve, reject) => {
  fetchExistingInvoiceIds.trigger({
    onSuccess: resolve,
    onFailure: reject,
  });
});

let depositConfigPromise = new Promise((resolve, reject) => {
  deposit_config.trigger({
    onSuccess: resolve,
    onFailure: reject,
  });
});
let firstDepositPct, firstCardFees, finalCardFees, firstDepositAmountCustom;
Promise.all([invoicesPromise, depositConfigPromise])
  .then(([invoicesResult, depositConfigResult]) => {
    console.log(invoicesResult)

    if (Object.keys(invoicesResult).length  <= 0) {
      console.log('hey')
      // Use values from invoices query if rows exist
       firstDepositPct = firstDepositAmount.value;
       firstCardFees = firstDepositCcFee.value;
       finalCardFees = finalInvoiceCcfee.value;
       firstDepositAmountCustom = firstDepositCustomAmount.value;
       console.log(`Card fees: ${firstCardFees} ${finalCardFees}`);
       insert_deposit_config.trigger();
    } else if (Object.keys(depositConfigResult).length > 0) {
      console.log('hey 2')
      firstDepositPct = depositConfigResult[0].first_deposit_pct;
      firstCardFees = depositConfigResult[0].first_card_fees;
      finalCardFees = depositConfigResult[0].final_card_fees;
      firstDepositAmountCustom = 
      depositConfigResult[0].first_deposit_amount_custom;
    }
 else {
      console.error("No data found in invoices or deposit_config.");
      throw new Error("No data available to populate variables.");
    }
  })
  .catch(error => {
    console.error("Error occurred during promise execution:", error);
  });
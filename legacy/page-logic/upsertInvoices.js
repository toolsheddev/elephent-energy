(async () => {
  try {
    await checkForDeposits.trigger();
    await checkForDepositLineItems.trigger();

    await Promise.all([
      checkForInvoicesLineItems.trigger(),
      checkForDeposits.trigger()
    ]);

    if (checkForInvoices.data.length > 0 || runOnChange.value) {
      const invoiceCreatedAt = checkForInvoices.data[0]?.invoice_created_at;

      if (invoiceCreatedAt) {
        const createdDate = new Date(invoiceCreatedAt);
        const cutoffDate = new Date("2025-09-03T00:00:00Z"); // Sept 3, 2025

        if (createdDate >= cutoffDate) {
          await tabsUpsertInvoiceLogic.trigger();
          console.log("Ran tabsUpsertInvoiceLogic");
        } else {
          await invoiceLogicUpsert.trigger();
          console.log("Ran invoiceLogicUpsert");
        }
      } else {
        // fallback if invoice_created_at is missing
        await invoiceLogicUpsert.trigger();
        console.log("No invoice_created_at found, ran invoiceLogicUpsert");
      }
    }

    console.log("Flow completed successfully!");
  } catch (error) {
    console.error("An error occurred:", error);
  }
})();

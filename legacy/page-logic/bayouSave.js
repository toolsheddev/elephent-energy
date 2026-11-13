async function runQueries() {
saveState.setValue(true);
  
    try {
      await Promise.allSettled([
        write_to_account.trigger(),
        write_to_opportunity.trigger(),
        write_to_products.trigger(),
        write_to_home.trigger(),
        write_home_data.trigger(),
        write_customer_data.trigger(),
        write_existing_hvac_data.trigger(),
        write_existing_other_system_data.trigger(),
        write_existing_panel_data.trigger(),
        write_existing_wh_data.trigger(),
        write_prospective_systems_data.trigger()
      ]);

        await project.trigger();


    } catch (error) {
        console.error("Error running queries:", error);
    } finally {
      saveState.setValue(false);     
    }
}

runQueries();


  const evalStartTriggerBlock = () => {
    const getExampleInputJSON = () => {
      try {
        return {"house":{"id":1,"address":"11579 Decatur Street unit","city":"Boulder","state":"CO","zipcode":"80234","territory":"Test","market":"Test","customer_id":1,"electric_utility":"Eversource","gas_utility":"Eversource","move_in_date":"2020-08-01","has_paperless_billing":true,"county":"Boulder","home_type":"Single Family","num_ppl":8,"year_built":1921,"sq_footage":null,"comfort_notes":"Testing","insulation_notes":"Unknown","addtl_notes":"","massachusetts_details":{"energy_audit":"na","completed":"na","certificate":"na","whole_home_verification":null,"heat_loan_status":"Unknown","primaryResidence":false},"heating_load":35000,"created_at":"2024-02-14T23:05:30.221Z","electrical_acct_num":"12345678","num_rooms":6,"units":1,"special_considerations":"none","existing_system_notes":"really old water heater","colorado_details":{"energy_efficiency":"na","hear_amount":"none","energy_smart_co":false},"manual_j":"Not Needed","manual_d":null,"manual_s":null,"load_calc":null,"salesforce_house_id":"a01Hs00001yNCq8IAG","market_id":1,"attic":"unsure","unfinished_basement":"yes","crawlspace":"no","xcel_whole_home_efficiency":false,"move_in_year":2025,"home_features":"unfinishedBasement,","google_place_id":null,"hvac_profile":{},"gas_acct_num":null,"electrical_meter_num":null,"gas_meter_num":null,"renter":false,"ventilation_type":null,"overburdened":false,"utility_customer_name":"Tara Masgracchio","is_primary_residence":null,"proposal_id":13807},"proposalId":13807}
      } catch {
        return { error: true, message: 'Error parsing example input JSON' }
      }
    }
    const getExamplePathParams = () => {
      try {
        return {}
      } catch {
        return { error: true, message: 'Error parsing example path params' }
      }
    }
    const getExampleHeaders = () => {
      try {
        return {}
      } catch {
        return { error: true, message: 'Error parsing example headers' }
      }
    }
    return {
      _retool_exampleInputJSON: getExampleInputJSON(),
      _retool_exampleHeaders: getExampleHeaders(),
      _retool_examplePathParams: getExamplePathParams(),
    }
  }
  return evalStartTriggerBlock()
  
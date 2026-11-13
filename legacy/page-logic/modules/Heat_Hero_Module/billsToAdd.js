function createBillsObject(n) {
  let bills = [];

  for (let i = 0; i < n; i++) {
    let start_date = {{dates}}[i].value
    bills.push({
        id: {{customer.data.id[0]}}+start_date,
        customer_id: {{customer.data.id[0] }},
        start_date: start_date,
        end_date: {{dates2}}[i].value,
        utility_name: {{utilitySelector}}[i].value.split("_")[0],
        meter_type: {{utilitySelector}}[i].value.split("_")[1],
        consumption: {{consumption}}[i].value,
        bill_type: 'manual',
        address: {{ house.data.address[0] }}
       });
  }

  return bills; 
}

const numberOfBills = {{billsCT.value}};
const result = createBillsObject(numberOfBills).filter(item=> item.start_date != '' && item.end_date != '');

return result;
const bills = {{sizing.data.sizing.bills.gas.concat(sizing.data.sizing.bills.electric)}};

// Function to parse the date for better comparison
const parseDate = dateStr => new Date(dateStr);

// Find the minimum start date
const minStartDate = bills.reduce((min, bill) => {
    const startDate = parseDate(bill.start_date);
    return startDate < parseDate(min) ? bill.start_date : min;
}, bills[0].start_date); 

// Find the maximum end date
const maxEndDate = bills.reduce((max, bill) => {
    const endDate = parseDate(bill.end_date);
    return endDate > parseDate(max) ? bill.end_date : max;
}, bills[0].end_date); 

const result = {min: minStartDate,
               max: maxEndDate,
               station: {{station.value}} };

return result;

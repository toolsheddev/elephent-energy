const bills = {{sizing.data.sizing.bills.gas.concat(sizing.data.sizing.bills.electric)}}.filter(bill => bill.address === {{address.value}});

return bills;
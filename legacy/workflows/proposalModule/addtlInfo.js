let state = startTrigger.data.houseState;
let data = {
  "coMap": "false",
  "maMap": "false",
  "serviceAgreementCO": "false",
  "serviceAgreementMA": "false",
  "serviceAgreementCA": "false",
  "COInvoice": "false",
  "MAInvoice": "false",
  "CAInvoice": "false",
  "coAmountDue": 0,
  "coDepositAmount": 0,
  "caAmountDue": 0,
  "caDepositAmount": 0,
  "maAmountDue": 0,
  "maDepositAmount": 0
};

if (state === 'CA') {
  data.CAInvoice = "true";
  data.serviceAgreementCA = "true";
  data.caAmountDue = parseInt(startTrigger.data.amountDue);
  data.caDepositAmount = parseInt(startTrigger.data.depositAmount);
  
} else if (state === 'CO') {
  data.COInvoice = "true";
  data.serviceAgreementCO = "true";
  data.coMap = "true";
  data.coAmountDue = parseInt(startTrigger.data.amountDue);
  data.coDepositAmount = parseInt(startTrigger.data.depositAmount);
  
} else if (state === 'MA') {
  data.MAInvoice = "true";
  data.serviceAgreementMA = "true";
  data.maMap = "true";
  data.maAmountDue = parseInt(startTrigger.data.amountDue);
  data.maDepositAmount = parseInt(startTrigger.data.depositAmount);
}

return data;
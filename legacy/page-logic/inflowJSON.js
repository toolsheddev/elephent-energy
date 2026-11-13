// Comes in thru additionalScope
var customer;
if (!customer) {
  // Check if inflow_get_customer.data exists and has at least one entry
  if (inflow_get_customer.data && inflow_get_customer.data.length > 0) {
    customer = inflow_get_customer.data[0];
  } else {
    throw new Error("No customer data found in inflow_get_customer.");
  }
}

customer = customer.customerId;

const salesOrderId = uuid.v4();
const source = "Retool";
var errors = [];

// Set location
const maLoc = "7882303e-4a44-4f3c-b702-e052329dcfca";
const coLoc = "3f37590f-c649-48a6-b98d-b716ad155862";
const caLoc = "ac6e1e12-d733-4a64-9a2d-e0e8e50b05dc";
var location;
if (house.data.state === "CO") {
  location = coLoc;
} else if (house.data.state === "MA") {
  location = maLoc;
} else if (house.data.state === "CA") {
  location = caLoc;
} else {
  throw new Error(
    "Cannot create an InFlow order outside of CO and MA. State specified: " +
      house.data.state
  );
}

var equipmentLineItems = finalized_line_items.value.filter(
  (item) => item.line_item_type === "equipment"
);

var lines = [];

equipmentLineItems.forEach(function (lineItem) {
  let line = {
    productId: lineItem.inflow_id,
    salesOrderLineId: uuid.v4(),
    unitPrice: lineItem.price_actual,
  };
  if (
    !lineItem ||
    ((!lineItem.inflow_id || lineItem.inflow_id === "NEEDS_INPUT") &&
      lineItem.equipment_provider === "elephant")
  ) {
    errors.push({
      name: "InFlow",
      message:
        "No InFlow ID specified for " +
        lineItem.description +
        " - Retool ID: " +
        lineItem.equipment_id,
    });
  } else if (lineItem.inflow_id && lineItem.inflow_id !== "NEEDS_INPUT") {
    lines.push(line);
  }
});

// Check if customer data exists before accessing first_name and last_name
let customerFullName = "";
if (customer.data && customer.data.length > 0) {
  customerFullName =
    customer.data[0].first_name + " " + customer.data[0].last_name;
} else {
  console.warn("Customer data is missing first_name and last_name.");
}

var data = {
  customerId: customer,
  salesOrderId: salesOrderId,
  source: source,
  lines: lines,
  customFields: {
    custom3: project.data.id,
    custom4: customerFullName, // Safely set the customer full name
  },
  shippingAddress: {
    address1: house.data.address,
    city: house.data.city,
    postalCode: house.data.zipcode,
    state: house.data.state,
  },
  showShipping: true,
  locationId: location,
};

console.log("InFlow JSON:");
console.log(data);

// Convert the object to a JSON string
var jsonString = JSON.stringify(data);

// Show errors
if (errors.length > 0) {
  NewSystemErrors.setValue(errors);
  NewSystemErrorsModal.show();
}

// Return the JSON string
return jsonString;

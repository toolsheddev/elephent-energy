/**** Inflow Handler
 * Handles the process of creating a customer and sales order in InFlow
 **/
var errors = [];

let customerData = salesforce_opportunity.data;
let customerEmail = customerData[0]?.Account?.PersonEmail;

let inflowCustomers = await new Promise((resolve, reject) => {
  inflow_get_customer.trigger({
    onSuccess: resolve,
    onFailure: reject
  });
});

// Ensure inflowCustomers is an array
let customerList = Array.isArray(inflowCustomers) 
  ? inflowCustomers 
  : (inflowCustomers ? [inflowCustomers] : []);

// Find matching customer by email (case-insensitive)
let matchingCustomer = customerList.find(
  (cust) => cust.email?.toLowerCase() === customerEmail?.toLowerCase()
);

let inflowCustomer;

if (matchingCustomer) {
  // Use the matching customer found in InFlow
  inflowCustomer = matchingCustomer;
} else {
  // If customers exist with the same name but different emails, append " 1" to rename existing records
  if (customerList.length > 0) {
    for (const oldCust of customerList) {
      try {
        await new Promise((resolve, reject) => {
          inflow_update_customer.trigger({
            additionalScope: {
              customerId: oldCust.customerId,
              updatedName: `${oldCust.name} 1`
            },
            onSuccess: resolve,
            onFailure: reject
          });
        });
      } catch (e) {
        const errorMessage = parseInflowError(e);
        console.log("Failed to update old customer name:", errorMessage);
        throw new Error(errorMessage);
      }
    }
  }

  // Create a new customer with the clean name and new email
  let customerId = crypto.randomUUID();
  let addressId = crypto.randomUUID();

  try {
    inflowCustomer = await new Promise((resolve, reject) => {
      inflow_create_customer.trigger({
        additionalScope: {
          customerID: customerId,
          addressID: addressId
        },
        onSuccess: resolve,
        onFailure: reject
      });
    });
  } catch (e) {
    const errorMessage = parseInflowError(e);
    console.log(errorMessage);
    throw new Error(errorMessage);
  }
}

// Create the JSON payload for the sales order
try {
  await new Promise((resolve, reject) => {
    inflowJSON.trigger({
      additionalScope: {
        customer: inflowCustomer
      },
      onSuccess: resolve,
      onFailure: reject
    });
  });
} catch (e) {
  const errorMessage = parseInflowError(e);
  console.log(errorMessage);
  throw new Error(errorMessage);
}

// Create the sales order
try {
  await new Promise((resolve, reject) => {
    inflow_create_order.trigger({
      onSuccess: resolve,
      onFailure: reject
    });
  });
} catch (e) {
  const errorMessage = parseInflowError(e);
  console.log(errorMessage);
  throw new Error(errorMessage);
}

// Write the sales order ID back to the project
try {
  await new Promise((resolve, reject) => {
    write_salesOrderId_to_project.trigger({
      onSuccess: resolve,
      onFailure: reject
    });
  });
} catch (e) {
  const errorMessage = parseInflowError(e);
  console.log(errorMessage);
  throw new Error(errorMessage);
}

function parseInflowError(errorString) {
  try {
    const error = typeof errorString === "string" ? JSON.parse(errorString) : errorString;
    return error?.data?.message || error?.message || "An unknown error occurred.";
  } catch (e) {
    return errorString || "An unknown error occurred.";
  }
}
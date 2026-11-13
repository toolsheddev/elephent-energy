function getOption(level,type){
	let option = mpOptions.filter(option => option.plan_level === level && option.type === type);
	if(!option || option.length < 1)
		throw new Error('Did not find a maintenance plan option for plan level '+level+' and type '+type);
	else if(option.length > 1)
		throw new Error('Found multiple maintenance plan options for plan level '+level+' and type '+type);
	else
		return option[0];
}
function newLineItem(option){
	lineItems.push({
		maintenance_plan_id: option.id,
		line_item_type: 'maintenance plan',
		description: option.name
	});
}
function newLineItems(option, qty){
	qty = Math.max(qty, 0);
	for(let i = 0; i < qty; i++)
		newLineItem(option);
}


// Gather data from the modal frame
let planLevel = mpPlanLevel.value;
let condenserCt = mpCondensers.value;
let ahuCt = mpAHUs.value;
let headCt = mpHeads.value;
let hpwhCt = mpHPWHs.value;
let ervCt = mpERVs.value;
let smartAcCt = mpSmartACs.value;

// Set up some global vars
let errors = [];
let newSystem = {
	system_type: 'maintenance plan',
	system_status: 'proposed',
	house_id: house.data.id,
	target_margin: 0,
	proposal_id: proposalTable.selectedRow.id
}
let lineItems = [];
let mpOptions;
let mpPrices;


try {

	// Validate inputs
	if(!planLevel)
		throw new Error('You must specify a plan level to create a maintenance plan');
	if(!condenserCt || condenserCt < 1)
		throw new Error('Cannot create a maintenance plan without at least 1 HVAC system');

	// Get plan data
	mpOptions = await new Promise((resolve,reject) => {
		maintenance_plans.trigger({
			onSuccess: resolve,
			onFailure: reject
		});
	});

	// Get pricing data
	mpPrices = await new Promise((resolve,reject) => {
		prices_maintenance_plan.trigger({
			onSuccess: resolve,
			onFailure: reject
		});
	});
	let pricingStructure = project.data.pricing_structure;
	if(!pricingStructure)
		throw new Error('No pricing structure found. Create a new system and select a pricing structure first.');

	// Set up options as vars
	let basePlan = getOption(planLevel,'base');
	let addtlCondenser = getOption(planLevel,'additional_condenser');
	let addtlAHU = getOption(planLevel,'additional_ahu');
	let addtlHead = getOption(planLevel,'additional_head');
	let smartAc = getOption(null,'addon_smartac');
	let hpwh = getOption(null,'addon_hpwh');
	let erv = getOption(null,'addon_erv');

	/*** Create line items ***/

	// Condensers
	newLineItem(basePlan);
	newLineItems(addtlCondenser,condenserCt - 1);

	// AHUs - 1 included per condenser 
	newLineItems(addtlAHU,ahuCt - condenserCt);

	// Heads - 3 included per condenser (after accounting for AHUs)
	newLineItems(addtlHead,headCt - ((condenserCt - ahuCt) * 3));

	// Add-ons
	newLineItems(smartAc,smartAcCt);
	newLineItems(hpwh,hpwhCt);
	newLineItems(erv,ervCt);

	/*** Price line items ***/
	const pricingPromise = await new Promise((resolve,reject) => {
		priceLineItems.trigger({
			additionalScope: {
				lineItems: lineItems,
				pricingStructure: pricingStructure
			},
			onSuccess: resolve,
			onFailure: reject
		});
	});
	lineItems = pricingPromise.result;

	if(pricingPromise.errors)
		errors = errors.concat(pricingPromise.errors);

} catch(error) {
	errors.push(error);
}

/**** Set environment vars ****/
SystemToInsert.setValue(newSystem);
LineItemsToInsert.setValue(lineItems);
console.log('To Insert:');
console.log(newSystem);
console.log(lineItems);
console.log('-------- End of specMaintPlan --------');


/*** Error handling ***/
if(errors.length > 0){
	//convert errors to plain object so Retool can see it properly
	let plainErrors = errors.map(error => {
	  return { message: error.message, name: error.name, stack: error.stack, fail: error.fail };
	})
	NewSystemErrors.setValue(plainErrors);
	NewSystemErrorsModal.setHidden(false);

	throw new Error('Errors occurred processing maintenance plan: '+JSON.stringify(errors));
}
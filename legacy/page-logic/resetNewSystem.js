/** This query resets the state of the new system modal */

costSystemType.resetValue();
PricingStructure.resetValue();
SelectProposalNewSystem.resetValue();
marginTarget.resetValue();

// heat pump step 2
Condenser1Model3.resetValue();
Condenser1Location3.resetValue();
//  massRebateType.resetValue();
CircuitLengthCondenser3.resetValue();
//  CircuitDifficultCondenser.resetValue();
//  ServiceOutletCondenser.resetValue();
//  integratedControl.resetValue();
//  controlWiresNeeded.resetValue();

//  ComplicationAdderMS.resetValue();
//  BranchBoxesOutside.resetValue();
//  CircuitLengthBB1.resetValue();
//  CircuitLengthBB2.resetValue();
if(CostAHUList3.instances > 0){
  //  HeatKitQ4.resetValue();
  //  HumidifierQ3.resetValue();
  AHUModel3.resetValue();
  AHULocationType3.resetValue();
  //  HumidifierModel3.resetValue();
  ThermostatSelect3.resetValue();
  //  TstatAccessoryAHU3.resetValue;
  //  ComplicationAdderAHU3.resetValue();
  CircuitLengthAHU3.resetValue();
  //  CircuitDifficultAHU3.resetValue();
  CondensatePumpAHUCircuit3.resetValue();
  CondensatePumpAHU3.resetValue();
}
if(CostMsList3.instances > 0){
  MSLoc.resetValue();
  MsModel3.resetValue();
  TstatAccessoryMS3.resetValue();
  //  headComplicationAdder.resetValue();
}

// water heater step 2
WaterHeaterModel3.resetValue();
WHLocation4.resetValue();
//  ComplicationAdderHPWH.resetValue();
CircuitLengthHPWH3.resetValue();
//  CircuitDifficultHPWH.resetValue();
IncludeTMV3.resetValue();
//  NewCondensatePump.resetValue();
//  CondensatePumpCircuit.resetValue();

// charger step 2
ChargerModel3.resetValue();
PlugOrHardwiredEV3.resetValue();
CircuitLengthEV3.resetValue();
CircuitDifficultEV3.resetValue();
CircuitLengthIW3.resetValue();
CircuitDifficultIW3.resetValue();
CostIWAmperage3.resetValue();

// EE step 2
energyAudit4.resetValue();
energyAtticInsulationFloorAirSealing4.resetValue();
atticSqft4.resetValue();
energyAeroseal4.resetValue();
energyBlowerTest4.resetValue();
energyCrawlspaceInsulation4.resetValue();
crawlspaceSqft4.resetValue();

// Electrical upgrades step 2
ElectricalUpgradesSelect3.resetValue();
electricalUpgradesEquip3.resetValue();

// Reset new syste modal index
AddSystemSteps.setCurrentView('select_system');
//  AddSystemSteps2.setCurrentView('select_system')
systemStateSelection.resetValue();

// Set AHUCount & MSCount state variables
AHUCount.setValue(0);
MSCount.setValue(0);
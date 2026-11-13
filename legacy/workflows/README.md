# Legacy Retool workflows (reference extracts)

Untouched source of every code/SQL block of the four Retool Workflows that were ported to `packages/engine`
(`@sd/engine`). Nothing here is executed; it exists for reference and diffing.

Extraction: `legacy/tools/extract.py` decodes nothing itself - it reads the already-decoded Transit dump
(`{ "<file>": { meta, app } }`, see `legacy/tools/`) and writes `app.v.plugins[<blockId>].v.template.query` to
`<workflow>/<blockId>.js|.sql` (`subtype` `SqlQueryUnified` -> `.sql`, otherwise `.js`).
`legacy/tools/graph.py` prints the block graph (`blockData[].incomingOnSuccessEdges`, also saved in `legacy/tools/graph.txt`).
Run both with `python -I`; the JSON is treated as data only.
`_exampleInput.json` in each folder is the webhook's `exampleInputJSON`; `startTrigger.js` is Retool boilerplate with the
same example embedded. `{{ ... }}` inside a block = Retool templating that reads another block's output.

Blocks without code (GUI-mode datasources, REST, sub-workflow calls) are described by hand in `*.json` / `*.txt` files.

---------------------------------------------------------------------------------------------------

## 1. `priceLineItems` (`priceLineItems- workflow.json`)

Prices an array of line items.

**Input (startTrigger)**: `lineItems[]` (24 in the example: `{equipment_id|labor_id, location?, zone_index?, quantity?, additional_data.electrical{circuit_length,difficult,termination,...}, line_item_type, description, price_actual}`),
`pricingStructure` (`standard`|`ma_forge`|`ma_laminar`|`la_standard`; the copy embedded in specSystemDetails also knows `ichoosr_2026`),
`PricingEffectiveDate` (`YYYY-MM-DD`), `equipmentData` (id -> equipment row, 486 rows) and `laborData` (id -> labor row, 108 rows).
When `equipmentData`/`laborData` are empty the workflow loads them with the two SQL blocks below.

**Flow**: `startTrigger -> getEquipmentData -> getLaborData -> transformData -> priceLineItems -> response1` (`catchErrors` = failure webhookReturn).
`getHvacSystemType`, `prices_all`, `maintenance_plans` are *function-style* queries called from inside `priceLineItems` (not on the edge graph).

| JS block | reads | purpose |
|---|---|---|
| `transformData.js` | `startTrigger`, `getEquipmentData.sql`, `getLaborData.sql` | uses the posted lookup tables, else builds `{id: row}` maps from the SQL results |
| `priceLineItems.js` | `transformData`, `prices_all.sql`, `getHvacSystemType.js` | per-item price lookup, circuit pricing, returns `{result, errors[]}` |
| `getHvacSystemType.js` | called with `(lineItems, equipmentData)` | ducted / ductless / mixed / null |

SQL: `getEquipmentData.sql` / `getLaborData.sql` (rows that have an active price in the requested territory), `prices_all.sql`
(**contains a leftover `and labor_id = 3` debug filter in this workflow's copy only**; the specSystemDetails copy has none and is what the port follows),
`maintenance_plans.sql` (`SELECT * FROM maintenance_plans_new`, result unused by the code).

## 2. `specSystemDetails` (`specSystemDetails - workflow - optimized.json`)

Add / edit one "system" (HVAC, water heater, EV, energy efficiency, cooktop, panel, adder, labor warranty): builds the
`systems_new` row and the line items, prices them, runs incentives, and returns per-proposal rows to persist.

**Input (startTrigger)** - see `specSystemDetails/_exampleInput.json`:
`mode` (`add system`|`edit system`), `state` (`'CO'` = change order!), `cost_system_type`, `targetMargin`, `rebateEligibilityType`, `rebateEffectiveDate`, `heatLoadCoverage`,
change-order fields (`description, reason, requester, timeline, impact, respParty, customerConsent, installerConsent`),
`heatPump{condenser, controls, kumoSetup, ahu{units,count}, miniSplit{units,count,complications}, branchBoxes{outside,advanced}}`, `HPWH`, `energyEfficiency`, `inductionWiring`,
`electricalUpgrades`, `laborWarranty`, `otherData`, `evCharging`, `specEquipment{CircuitLength/DifficultBB1/BB2}`,
`PricingStructure`, `PricingEffectiveDate`, `surgeProtection` (`Whole Home`|`Single Circuit`), `specIncentives{proposal_id[], house, customer, project, ...}`,
`existingHVACRead[]`, `laborData[]`, `incentivesLimitData[]`, and in edit mode `system_id`, `system_status`.

**Flow** (edges): `startTrigger -> parse_proposals -> return_newProposalNames -> create_new_proposals_loop -> final_proposal_ids -> getEquipmentData -> getJurisdictionRules -> checkExistingSurge -> warrantyCounts -> specSystemDetails -> priceLineItems -> returnProposals -> loopProposals -> transformResult -> response1`.
`query1`, `specEquipment`, `getHvacSystemType`, `ahri`, `getManualLineItems`, `prices_all`, `maintenance_plans` are function queries called from the JS blocks.
`loopProposals` calls the nested workflow **`specIncentives`** once per proposal (source in `specIncentives-workflow - optimized.json`, not ported).

| JS block | SQL / blocks it reads |
|---|---|
| `parse_proposals.js` | `startTrigger.specIncentives.proposal_id` (numbers = existing proposals, non-numeric strings = new proposal nicknames) |
| `create_new_proposals_loop.sql` | **WRITE**: inserts `proposals_new` + placeholder `'other'` system per new nickname |
| `final_proposal_ids.js` | existing ids + ids returned by the insert loop |
| `specSystemDetails.js` | `getEquipmentData.sql` (`equipment_minimal`), `getJurisdictionRules.sql`, `warrantyCounts.sql`, `ahri.sql`, `specEquipment.js`, `getHvacSystemType.js` |
| `specEquipment.js` | called with `(equipmentData, laborData, lineItems, CircuitDifficultBB2/1, CircuitLengthBB2/1, isManualOverride)` |
| `priceLineItems.js` | `specSystemDetails.data.lineItems`, `prices_all.sql`, `getHvacSystemType.js` (same logic as workflow 1, plus `ichoosr_2026`) |
| `transformResult.js` | `checkExistingSurge.sql`, `loopProposals` (incentives result), `priceLineItems.errors`, `getManualLineItems.sql` (edit mode) -> `[{proposal_id, SystemToInsert, LineItemsToInsert, newErrors, status}]` |

Other SQL: `checkExistingSurge.sql` (whole-home surge = labor 122 already on the proposal), `warrantyCounts.sql` (condenser/AHU/mini-split counts per proposal),
`query1.sql` (unused by the JS), `getManualLineItems.sql` (`manually_added = true` rows of the edited system), `ahri.sql` (AHRI certification fuzzy match).

## 3. `specPermits` (`specPermits - workflow.json`)

Creates/updates the permit line items of a proposal.

**Input**: `{ house{...}, proposalId }` (house = `houses_new` row; `proposalId` may be omitted -> block returns `undefined`).

**Flow**: `startTrigger -> specPermits -> insertPermitLineItems -> response1` (`catchErrors` on failure).

| block | role |
|---|---|
| `permits.sql` | one permit per type for the house: state > city > county > 'other' |
| `systems.sql` | house's systems (excluding change-order/deleted statuses; **NULL status excluded by `NOT IN`**) |
| `line_items.sql` | line items of those systems (same status filter, NULL allowed) |
| `labor_filtered.sql` | `labor_new` rows for the labor ids found (used to check the labor category) |
| `delete_line_item_js.sql` | **WRITE** (function query run from JS for each stale permit). The exported text is just `select * from line_items_new where id = ` (apparently truncated / GUI-mode); the intended effect is deleting that line item |
| `specPermits.js` | builds permit line items on the catch-all (`system_type = 'other'`) system |
| `insertPermitLineItems.json` | **WRITE**: GUI bulk upsert into `line_items_new` by `id` of `{{specPermits.data}}` |

## 4. `proposalModuleWorkFlow` (`proposalModuleWorkFlow.json`)

Assembles the proposal PDF/slide content and calls a PDF service.

**Input** (`proposalModule/_exampleInput.json`): `date, filename, proposalToGenerate[], customer*/hca* fields, houseState, proposalDate, systemMockUps, systemMockUpImages[], amountDue, depositAmount`,
plus many optional flags the UI sends (`indicativeProposal, heatPump, hddInfo, hddGraph, hddSlides, estmSavings*, carbonSavings*, reduction*, energyEfficiency, panelUpgrades, smartAC, heatStrip, maintenanceSlide, maintenanceTable, renuLoan, heatLoan, hpwh, hpwhLength, waterHeaterSavings, ...`).

**Flow**: `startTrigger -> addtlInfo -> systems -> lineItems -> createPdfProposalGenerationData -> projectCostBreakDownAndDesgnOptions (sub-workflow) -> transformProposalGenerationData -> reduceSystemMockup -> optionNames -> new_systems -> equipment_by_id -> filterEquipments -> proposal_details -> hearProjectBreakdown -> nonHearRebateBreakdown -> hearRebateBreakdown -> hearTotals -> rmiCalcResults -> APITemplate (REST) -> saveProposalURL (UPDATE proposals_new.apitemplate_url) -> proposalModuleWorkflowResponse` (`ErrorHandler` on failure).
`proposal1/2/3_details` and `reduceSystemMockup1/2/3` are chained, older per-proposal variants that `proposal_details` / `reduceSystemMockup` replaced.

| JS block | SQL / blocks it reads |
|---|---|
| `addtlInfo.js` | `startTrigger` only |
| `createPdfProposalGenerationData.js` | `startTrigger` |
| `transformProposalGenerationData.js` | `createPdfProposalGenerationData`, `projectCostBreakDownAndDesgnOptions` (not provided here), `lineItems.sql` |
| `proposal_details.js` | `optionNames.sql`, `new_systems.sql`, `lineItems.sql`, `filterEquipments.js` (<- `equipment_by_id.sql`) |
| `hearTotals.js` | `hearProjectBreakdown.sql`, `nonHearRebateBreakdown.sql`, `hearRebateBreakdown.sql`, `projectCostBreakDownAndDesgnOptions` |
| `APITemplate` (REST body in `APITemplate.body.json.txt`) | everything above + `rmiCalcResults.sql`, `reduceSystemMockup.js` |
| `reduceSystemMockup.js` | `startTrigger.systemMockUpImages` - uses `sharp` (image I/O, not ported) |

---------------------------------------------------------------------------------------------------

## Not provided / not ported

* `specIncentives` and `projectCostBreakdown` workflows exist in the repository root (`specIncentives-workflow - optimized.json`, `projectCostBreakdown - workflow.json`) but were out of scope; the engine exposes an `IncentivesProvider` seam and takes the cost-breakdown output as an input.
* Page-level Retool queries (`calculateLineItemFee`, `calculateBranchBoxes`, `marginLogic`, ...) were not ported (see engine README, "Known gaps").

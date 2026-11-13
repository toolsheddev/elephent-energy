# @sd/engine

Pure TypeScript port of the System Design business logic that lived in four Retool Workflows
(`specSystemDetails`, `priceLineItems`, `specPermits`, `proposalModuleWorkFlow`) and of the "recalculation" logic (`specIncentives`: margin, incentives, limits, tax credits, finance fees, EnergySmart cap; the Recalculate button; the Synchrony financing fee). Framework-free and I/O-free: it runs in the
browser (Vite) and in Node.

* `"main"`/`"types"` point at `src/index.ts` - consume it without a build step. No runtime dependencies.
* No `fetch`, no DB, no `Date.now()`/`Math.random()`: reference data comes in through a `RefData` object, "now" is injected.
* Where Retool swallowed errors into a `catchErrors` response, functions return `{ ok: false, errors: EngineError[] }`.
* Where Retool wrote to the DB, functions return a description of the writes; **the caller persists them**.
* Source of truth for every port: `legacy/workflows/<workflow>/<block>.js|.sql` (see `legacy/workflows/README.md`).

> **Parity is NOT claimed.** No recorded Retool outputs were available. The tests assert invariants and
> hand-derived expectations (including the prices/circuit math visible in the example payloads, which the port reproduces),
> not byte-for-byte equality with Retool.

```ts
import { priceLineItems, specSystemDetails, specPermits, buildProposalData, sampleRefData } from '@sd/engine';
```

## Public API

All functions are exported from `src/index.ts` (`import ... from '@sd/engine'`).

### Pricing

| function | description |
|---|---|
| `getHvacSystemType(lineItems, equipment) => 'ducted'\|'ductless'\|'mixed'\|null` | `equipment` = `RefData`, `Equipment[]` or `{[id]: Equipment}`. Throws if a line item references an unknown equipment id. |
| `priceLineItems(lineItems, refData, opts) => { ok:true, result, errors, systemType } \| { ok:false, errors }` | `opts = { pricingStructure, pricingEffectiveDate?, now?, systemType? }`. Input not mutated. Per-item problems go to `errors[]` (with `lineItemIndex`), the call still succeeds (as in Retool). Territory map: standard=CO, ma_forge=MA, ma_laminar=MA-Laminar, la_standard=CA, ichoosr_2026=iChoosr26. Needs `refData.{equipment,labor,prices}`. |
| `filterActivePrices(prices, at)` | the `prices_all` SQL date filter. |

### Spec'ing a system

| function | description |
|---|---|
| `specSystemDetails(input: SystemInput, refData, ctx?: SpecContext) => { ok:true, lineItems, newSystem, ahriRecord, system_id, errors } \| { ok:false, errors }` | add/edit system. Gathers by `cost_system_type`, runs jurisdiction rules, `specEquipment`, advanced branch boxes, surge protection, AHRI lookup. Line items are **un-priced**. `ctx.warrantyCounts` (rows of the `warrantyCounts` SQL) feeds labor-warranty systems. Needs `refData.{equipment,labor,jurisdictionRules,ahri}` (labor can also come from `input.laborData`). |
| `specEquipment(lineItems, refData, opts?: SpecEquipmentOptions) => { ok:true, lineItems } \| { ok:false, errors }` | install labor, recursive accessories, branch boxes/joints/refrigerant adder (Mitsubishi), circuits from `electrical_requirements`, descriptions. `opts = { CircuitLengthBB1/2, CircuitDifficultBB1/2, isManualBBOverride }`. `specEquipmentUnsafe` is the throwing variant. |
| `specAndPriceSystem(input, refData, ctx: SpecAndPriceContext) => { ok:true, proposals, newProposals } \| { ok:false, errors }` | the whole workflow: parse proposal ids -> spec -> price -> incentives provider -> per-proposal assembly (whole-home surge de-duplication, edit-mode manual items). `ctx = { now, newProposalIds?, existing?, surgeCounts?, warrantyCounts?, manualLineItems?, incentives? }`. Returns `proposals[] = { proposal_id, system, lineItems, errors, status }` to persist and `newProposals[]` (proposal + catch-all system INSERT descriptions). |
| `parseProposals`, `computeWarrantyCounts`, `computeSurgeCounts`, `findAhriRecord`, `mapRequiredIds`, `evaluateCriterion` | helpers (SQL results re-implemented in memory). |
| `IncentivesProvider`, `noIncentives`, `createIncentivesProvider` | `specAndPriceSystem(..., { incentives })` seam. `noIncentives` stays the default (lines pass through, no margin line); `createIncentivesProvider(refData, extra)` runs the ported `specIncentives` per proposal (see below). |

Modes: `'add system'` and `'edit system'` only (anything else -> `{ok:false}`, as in Retool). "Quick-add" systems in the UI are
the `cost_system_type`s `adder`, `panel`, `cooktop`, `ev`, `labor warranty`; they all go through the same function (see `sampleSystemInputs`).

### Recalculation: margin, incentives, limits, finance fees

Port of the `specIncentives` workflow (blocks `transformData`, `getInitializedLimits`, `calculateMargin`, `specIncentives`), the page logic
`marginLogic.js` / `calculateLineItemFee.js`, and the Recalculate button. **Parity is NOT claimed** (no recorded Retool outputs); the tests assert
hand-derived numbers and invariants. Source: `legacy/workflows/specIncentives/`, `legacy/page-logic/`; narrative in `legacy/workflows/README-recalculation.md`.

```ts
// margin
calculateMargin({ lineItems, system:{target_margin}, initialAdd?, system_margin?: 'add'|'exclude', transientMargin? }): LineItem[]   // lines + margin line LAST; throws TypeError if lineItems/system missing (like the original)
sumMargin(lines): number            // marginLogic.js: non-passthrough, non-excluded-status margin_amount, rounded to cents
marginLine(lines): LineItem         // { id?, price_actual: sumMargin(lines), line_item_type:'margin', description:'Elephant Margin' }
withMarginLine(lines): LineItem[]   effectiveMargin(lines): number   marginForPrice(price, target): number

// incentives
specIncentives(input: SpecIncentivesInput, refData, ctx: SpecIncentivesContext):
  { ok:true, result, deletedIncentives, errors, warnings, existingSystem, limits } | { ok:false, errors }   // never throws
initializeLimits(incentivesForLimits, limits): InitializedIncentiveLimit[]       // getInitializedLimits.js
selectIncentivesForLimits({ systems, lineItems, houseId, proposalId, mode, existingSystemId })   // getIncentiveForLimits.sql in memory
selectPermitCostRows({ proposalId, systems, lineItems, permits })                // permits.sql in memory
checkCriteria(criteria, data) / checkCriterion(value, dataValue) / applyLimits(...)
createIncentivesProvider(refData, extra?: IncentivesProviderExtra): IncentivesProvider

// the Recalculate button
recalculateSystem({ system, lineItems, house, customer?, ahriRecord?, rebateEffectiveDate?, incentivesLimitData?, refData, ctx, assumePersisted? }):
  { ok:true, lineItems, upserts, deletes, margin, errors, warnings, existingSystem } | { ok:false, errors }

// Synchrony financing fee (page logic calculateLineItemFee.js)
calculateFinancingFees({ systems: [{id, system_type, line_items}], project: {lender, financing_amounts}, equipment }): { upserts, marginUpdates }
```

**What a caller must pass** (everything the Retool workflow queried is input; nothing is fetched):

| `specIncentives` input | Retool source | notes |
|---|---|---|
| `refData.incentives: IncentiveRow[]` | `getIncentives.sql` (`incentives_new`: id, name, incentive_type, recipient, active_date, inactive_date, incentive_criteria JSON, system_type, finance_fee, affects_tax_credit) | iterated in ascending id order (as the JS object keyed by id was) |
| `refData.incentiveLimits` or `input.incentivesLimitData` | `getIncentiveLimits` (`incentive_limits_new`) | `incentive_ids` may be an array, JSON text or CSV |
| `refData.equipment`, `refData.labor` (or `input.equipmentData/laborData`) | `getEquipmentData.sql`, `getLaborData.sql` | criteria `equipment`/`labor` match the catalog rows of the lines; `labor.category === 'electrical'` drives the electrical cost |
| `refData.ahri` / `input.ahriRecord` / `input.ahri_id` | `getAhriRecord.sql` | the record needs `cooling_95`, `heating_47`, `heating_5` for the tonnage multipliers; `''` (what the page posts) = look up by id |
| `input.system` | the `systems_new` row (or `NewSystem`) | `system_type`, `target_margin` (number or numeric string), `proposal_id`, `rebate_effective_date`, `ahri_id`; criteria `system` is matched against this object |
| `input.lineItems` | page: fresh DB lines of the system; add flow: priced lines | for margin the lines need `state: 'persisted'` (or pass `initialAdd:true`) |
| `input.house`, `input.customer` | `house`, `customer` queries | criteria `house`/`home`/`customer` |
| `input.proposal_id`, `mode`, `existing_system_id` | startTrigger | feed `selectIncentivesForLimits` (Recalculate = `mode:null`, `existing_system_id = system.id`) |
| `ctx.now` | `new Date()` | fallback of the rebate effective date window |
| `ctx.houseSystems` | `getSystems.sql` (house systems not in a change-order/deleted status) | existing system for `existing_system` criteria; count of hvac/water heater/cooktop/panel systems of the proposal that share the electrical permit |
| `ctx.permitLineItems` | `permits.sql` (`price_actual`, `permit_type` of the proposal's `other`-system permit lines) | electrical share is added to `electricalCost`; hvac/plumbing permits to `nonElectricalCost` |
| `ctx.incentivesForLimits` **or** `ctx.houseLineItems` | `getIncentiveForLimits.sql` | incentive lines already on the house (counted against the limits) |

Flow inside `specIncentives`: `calculateMargin` -> cost bases (`fullInstallCost` = all lines except incentives, incl. the margin line; electrical/non-electrical/furnace cost include
`margin_amount`) -> date window -> pass 1 (non-tax): eligibility (first fully matching option), amount (`multiplier_type`, `rounding_place`, `max_amount`), sort by amount desc, limits (quantity before amount),
adjusted lines preserved, ids reused -> pass 2 (tax credits; `tax-federal` base = `fullInstallCost + sum(affects_tax_credit lines)`) -> `Finance Charge for ...` lines -> EnergySmart 50% cap -> old incentive lines replaced, `temp_id` assigned.

Criteria JSON: `incentive_criteria = { option_1: { criteria: { equipment|labor|house|home|customer|existing_system|system|ahri: { path: value } }, amount: { multiplier_type, multiplier_value, rounding_place?, max_amount? } } }`;
values: `'>=5'` operator strings (remainder must be a pure number, else literal compare), literals, booleans/numbers, arrays (OR), nested objects; `criteria.amount.max_amount: 0` = not eligible; no criteria = always eligible.

`createIncentivesProvider(refData, extra)` mimics how `specSystemDetails.loopProposals` called the workflow (`initialAdd:true`, `system_margin:'add'`, system = the new system without `proposal_id`).
`specAndPriceSystem` now also hands the provider `ahriRecord`, `house`, `customer`, `now` and `ctx.existing`; `extra` (`IncentivesProviderExtra`) adds `houseSystems`, `houseLineItems`, `incentivesForLimits`, `permitLineItems` (array or `(proposalId) => rows`), `incentivesLimitData`.

`recalculateSystem` = Recalculate button: `specIncentives` with `initialAdd:false, mode:null, system_margin:'add'` on the persisted lines, then **describes** the writes: `upserts` (by `id`, `system_id` set, no permit lines, no `temp_id`), `deletes` (persisted incentive lines no longer produced), `margin`. The caller persists. Financing fees are a separate step (`calculateFinancingFees`), as on the page.

### Permits

`specPermits({ house, proposalId, systems, lineItems }, refData) => { ok:true, lineItems, writes:{ inserts, updates, deletes }, notes } | { ok:false, errors }`
(`refData.{permits,labor}`). `selectPermitsForHouse(permits, house)` implements the `permits` SQL (state > city > county > other).
`writes.inserts` = new permit line items, `updates` = existing ones (id kept; the Retool bulk upsert-by-id), `deletes` = stale permit line item ids
(only produced when at least one permit is produced, as in Retool). `notes` mirrors the original `console.log` early exits.

### Proposal data

`buildProposalData(input: ProposalWorkflowInput, db: ProposalDbData, refData) => { ok:true, additionalInfo, proposalDetails, hearTotals, content, pdfRequest:{path, body} } | { ok:false, errors }`.
Pieces are exported too: `buildAdditionalInfo` (addtlInfo), `buildProposalDetails` (proposal_details), `buildHearTotals`, `buildProposalContent` (create/transformProposalGenerationData), `buildPdfRequestBody` (APITemplate body).
Not ported: the PDF HTTP call, saving `apitemplate_url`, image down-scaling (`sharp`), and the `projectCostBreakDownAndDesgnOptions` sub-workflow (its output is `db.projectCostBreakDownAndDesignOptions`).

### Fixtures (for mocks and tests)

`import { sampleRefData, sampleHouses, sampleSystemInputs, samplePriceLineItemsInput, samplePermitsInputs, sampleProposalInput, sampleProposalDb, makeSystemInput, ahuUnit, miniSplitUnit, asEditInput, blankSystemInput } from '@sd/engine'` (also `@sd/engine/fixtures`).
Incentive fixtures: `sampleRefData.incentives` (INVENTED criteria/amounts; names/ids of 19, 20, 45, 243 are real) - CO Xcel 201, CO EnergySmart 19/20 (50% cap), CO HEAR 301 (income test + `max_amount:0` option), MA Mass Save 101/102, MA finance-fee incentive 103, Reading 45 (quantity limit), LA DWP 243 (reproduces the -4500 of `_exampleInput.json`), federal 25C-style tax credits 401/402 (`tax-federal`, max 2000); `sampleRefData.incentiveLimits` (ids 5, 10-13); `sampleIncentiveInputs.{coHeatPump,maHeatPump,laDwpHeatPump,energySmartCap}` = `{ input, ctx }`, ready for `specIncentives(input, sampleRefData, ctx)`; helpers `sampleCustomer(patch?)`, `sampleIncentiveSystem(patch?)`, `sampleHvacLines()`, `sampleLine(type, price, patch?)`.
Everything is marked SAMPLE in `src/fixtures/refData.ts`; ids are stable. 204 equipment rows (24 condensers, 25 AHUs, 20 wall heads, 16 HPWH, 5 EV chargers, thermostats, branch boxes, ...), 164 labor rows (11 circuit sizes), ~2,080 price rows in 5 territories, AHRI rows, permits (CO/MA/NY), jurisdiction rules, incentives.
`catalogData.ts` is generated from the Retool example payloads by `legacy/tools/gen_fixture_catalog.py` (real ids/models/names; invented prices except those visible in the payloads).

## RefData and the Retool SQL that populates it

A backend repository layer can implement these 1:1 (rows are returned exactly as the SQL did, snake_case):

| `RefData` member | table / Retool query | notes |
|---|---|---|
| `equipment: Equipment[]` | `equipment_new` (priceLineItems `getEquipmentData.sql`: rows with an active price in the territory) / `equipment_minimal` (specSystemDetails `getEquipmentData.sql`) | `electrical_requirements` is a JSONB array of conditions; `additional_equipment_ids` int[] |
| `labor: Labor[]` | `labor_new` (`getLaborData.sql`; the add-system modal also posts `laborData`) | |
| `prices: PriceRow[]` | `prices_new` (`prices_all.sql`) - give the engine ALL rows; it applies territory, date (`active_date <= d < inactive_date`) and system type | circuit labor has 4 rows (`circuit_price_type`: base [with `circuit_price_limit`], per-ft-easy, per-ft-difficult, first-circuit-adder) |
| `maintenancePlans` | `maintenance_plans_new` (`maintenance_plans.sql`) | prices via `prices.maintenance_plan_id` |
| `ahri: AhriCertification[]` | `ahri_certifications_new` (`ahri.sql`) | `fuzzy_*_id_opt` columns are SQL LIKE patterns; matching + `ORDER BY specificity_rank_opt DESC LIMIT 1` is in `findAhriRecord` |
| `jurisdictionRules` | `jurisdiction_rules_new WHERE is_active` (`getJurisdictionRules.sql`) | criteria = `[{path, operator, value}]` on the SystemInput |
| `permits: PermitRow[]` | `permits_new` (all rows; `permits.sql` precedence is done in `selectPermitsForHouse`) | `price.cost` = number or `{multiplier_type:'hvac', multiplier_value}` |
| `incentives: IncentiveRow[]`, `incentiveLimits` | `incentives_new` (`getIncentives.sql`), `incentive_limits_new` (`incentivesLimitData`) | consumed by `specIncentives` / `createIncentivesProvider` |

Per-call database state that is **not** RefData and is passed in by the caller: `systems`/`lineItems` for `specPermits`; `ctx.warrantyCounts` / `ctx.surgeCounts` / `ctx.existing` /
`ctx.manualLineItems` for `specAndPriceSystem` (SQL `warrantyCounts`, `checkExistingSurge`, `getManualLineItems`; or pass `ctx.existing = {systems, lineItems}` and let the engine count); `ProposalDbData` for the proposal module.

## Deliberate deviations from the Retool code

* Inputs are never mutated (Retool mutated line items in place).
* `priceLineItems`: items with no `labor_id`/`equipment_id`/`maintenance_plan_id` and type != `discount` (permits, incentives) keep their `price_actual` instead of becoming `NaN`.
* `specEquipment`: the nine catalog ids (PAC-MKA32BC, ..., MSDD-50AR2-E) are resolved lazily; Retool threw a TypeError on *every* call if any model number was missing from the catalog.
* `specPermits`: `price_actual` is coerced with `Number()` before summing (the original `acc + item.price_actual` would string-concatenate if pg returned numerics as strings). `systems.sql` semantics are kept (a system with NULL `system_status` is dropped by `NOT IN`).
* `computeWarrantyCounts` / `computeSurgeCounts` re-implement the SQL in memory for convenience; `ctx.warrantyCounts` takes precedence.
* `getHvacSystemType` / `specSystemDetails` throw a descriptive Error for unknown equipment ids instead of a TypeError.
* Retool `errors` inside `specSystemDetails` is never populated by the original either; it is returned as `[]`.

### Deviations in the recalculation port

* Inputs are never mutated (calculateMargin / specIncentives mutated line items and the limit rows in place; the EnergySmart cap even mutated the caller's preserved line).
* `specIncentives` returns `{ ok:false, errors }` instead of throwing into `catchErrors`; `errors` are plain `{name,message,stack}` objects (as the workflow's `transformedErrors`).
* New field `warnings`: per-incentive failures of the FIRST (non-tax) pass (bad rounding_place, unknown multiplier type, missing AHRI, `tax-federal` on a non-tax incentive, null `incentive_criteria`). The original only `console.log`ged them (they never reached `errors`); tax-credit-pass failures and limit/cap messages are in `errors` exactly as before.
* `tax-federal` on a non-tax-credit incentive: the original passed `isFinalRun = true` but read the later-declared `let taxAffectingIncentives` (temporal dead zone -> a ReferenceError swallowed by the map's catch); the port throws the intended "only valid for tax credits" error into `warnings`. Same net effect: no line.
* `ctx.now` replaces `new Date()`; a `null` in the middle of a dotted criteria path is treated as missing instead of throwing.
* AHRI: looked up from `refData.ahri` by `input.ahri_id ?? system.ahri_id` when no record is given (Retool ran `getAhriRecord.sql` with the posted `ahri_id`).
* `recalculateSystem` defaults a missing `state` to `'persisted'` (`assumePersisted`), because `calculateMargin` silently keeps the old `margin_amount` of lines with an unknown state. `deletes` lists stale incentive lines (open question 3).
* `sumMargin` rounds to cents; `calculateMargin` keeps the raw float sum (`4147.5599999999995` in the payload) like the original.
* Quirks kept on purpose (see comments in `src/incentives/*.ts`): `Object.values(incentivesData)` order = ascending id; an empty criteria group that comes first in an option is ignored by the `reduce(..., null)` AND; the electrical / non-electrical bases use `price + margin_amount` and skip lines whose `margin_amount` is undefined (NaN); finance-charge lines of an EnergySmart incentive take part in the cap; `fullInstallCost` includes permit and discount lines and the margin line.

### Open questions (recalculation)

1. **Heating-only / cooling-only `existing_system` criteria never match.** When `criteria.existing_system` has only `heating` (or only `cooling`) the original passes `system_type_detail.heating` as the data but keeps the nested key, so it looks up `heating.heating`. Only the both-nested form and the flat form (`{ fuel: 'oil' }`, which uses `system_type_detail.heating` when present) can match. Intended?
2. **Financing fee lines vs. recalculation.** `calculateMargin` does not treat `financing fees` as a passthrough type (`calculateLineItemFee` does), so a later Recalculate gives the (negative) fee line a normal margin (`round(t*p/(1-t))`) and counts it in `fullInstallCost`, overriding the `-0.007` margin from the fee step. Which is right?
3. **Stale incentive lines are never deleted** by the Recalculate path (it only upserts the result; the `deleteOldIncentivesLineItems` block has no incoming edge and its call in the workflow is commented out). An incentive that became ineligible keeps its old line in the DB. `recalculateSystem().deletes` lists them so the UI can decide.
4. **EnergySmart cap and finance-charge lines.** `Finance Charge for EnergySmart ...` lines carry the EnergySmart incentive id, so they are counted as EnergySmart rebates (abs value) and in the scaled branch a positive fee is turned into a negative credit.
5. **`system.proposal_id` is empty in the add flow** (the workflow passes `newSystem`, which has no proposal_id), so the electrical-permit split divides by 1 there but by the real system count on Recalculate. Kept; `createIncentivesProvider` does the same.
6. On the add-line path the page re-sums the margin WITHOUT the excluded-status filter (inline code) while `calculateMargin` applies it; `sumMargin`/`marginLine` follow `marginLogic.js` (passthrough + excluded statuses filtered).
7. Which `state` do DB lines carry for lines never edited in the UI (`persisted` is assumed)?
8. The `projectCostBreakdown` data assembly (cost breakdown / design options tables) is not ported.

## Known gaps

* `projectCostBreakdown` workflow (cost breakdown + design options used by the proposal PDF) not ported; its output is a parameter of `buildProposalData`.
* Not ported from the page logic: the SQL write steps of `updateSystemMarginAmounts`/`refreshSystemMargins` (use `recalculateSystem`/`marginLine` and persist), branch-box capacity `calculateBranchBoxes`/`trackBranchBoxCapacity`.
* Persisting writes (new proposals + catch-all system, permit upserts/deletes, `apitemplate_url`) is the caller's job.
* Image resizing (`sharp`) and PDF generation are I/O and live outside the engine.
* The nested `loopProposals` per-proposal incentive run is sequential/in-memory here (`createIncentivesProvider`).

## Rules I was unsure about (please confirm with the business)

1. **Pricing `prices_all` leftover**: the standalone priceLineItems workflow's `prices_all.sql` ends with `and labor_id = 3` (looks like debug). The port follows the specSystemDetails copy (no such filter).
2. **Price dates**: Retool defaulted to `moment()` when no `PricingEffectiveDate` is sent; the port requires `pricingEffectiveDate` or an injected `now`. `active_date`/`inactive_date` comparisons are done on UTC timestamps (`'2026-10-07'` = midnight UTC).
3. **Surge cut-off** `2025-10-29` is compared with `new Date(PricingEffectiveDate)` (UTC), "Single Circuit" adds one device per 240V circuit labor line item (including GFI/branch-box circuits).
4. **`'CO'` in `state` means change order**, not Colorado (`isChangeOrder`); status becomes `'proposed - from change order'`.
5. **Warranty counts** use only the *first* row of `warrantyCounts` (all proposals in one list); for new proposals (no rows yet) every count is 0 and no warranty line items are produced. Mitsubishi terms: 2/5/12 years; other manufacturers (or dual fuel): 2/5/10 years, with ducted vs mini-split labor ids. Terms outside those sets silently produce nothing.
6. **Labor names** are used as lookup keys (`'Thermostat Wiring'`, `'Aeroseal (Supply Ductwork)'`, ...). The example catalog snapshot had older names for three of them; the sample labor rows were renamed to match the code.
7. **Branch box circuits**: `electrical_requirements` rows using camelCase `conditionType` (e.g. the "item_count >= 2" Branch Box rows) are ignored by the original and therefore by the port.
8. **Ducted systems** get equipment id **563** (hard-coded) added before the AHRI lookup; the sample catalog invents it as "Ducted System Commissioning Kit".
9. **Dual-fuel switchover temp** is taken from the *furnace* unit when both a furnace and a coil exist, otherwise from the coil unit; a `0` default in the UI is stored as `0`.
10. **AHRI SQL precedence**: `... AND ductingType = detail OR (water heater ...)` - the water-heater branch is OR-ed at top level; the port keeps that (with `waterHeaterModel = null` the pattern is `'%null%'`).
11. **`hearTotals.amount_due`** parses the "Out-of-Pocket Cost" row of the cost breakdown; the original read `row[0]`, whose shape we could not verify. The port accepts `row[0]`, `row.value`, or `row.amount`.
12. **MA +$100 per permit** applies for `house.state === 'MA'` only; HVAC multiplier permits are rounded with `Math.round` and only count line items of systems whose `system_type === 'hvac'` (incentive line items excluded).
13. `specPermits` only deletes stale permit line items if at least one permit line item was produced (a house with no applicable permit keeps its old ones).

## Development

```
npm install            # at the repo root (workspaces) or: npm install --workspace @sd/engine
cd packages/engine
npx vitest run         # 173 tests
npx tsc --noEmit       # strict typecheck
```

Layout: `src/types` (all types), `src/pricing`, `src/spec`, `src/permits`, `src/proposal`, `src/incentives`, `src/fixtures`, `src/util`; `test/*.test.ts`.

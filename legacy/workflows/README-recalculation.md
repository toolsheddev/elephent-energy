# How "recalculation" works in the Retool app

Source: the five workflow exports plus the page logic in `System Design.json`. Extracted files live in
`legacy/workflows/<name>/` and `legacy/page-logic/`. Everything below was read from that code, not guessed.

## 1. The workflows and who calls whom

```
Page button / modal                                   Retool Workflow (webhook)             Reads (SQL)                       Writes
---------------------------------------------------   -----------------------------------   -------------------------------   ---------------------------
Add / edit system, quick add  -> specSystemDetails    specSystemDetails                     equipment, ahri, prices,          returns lines per proposal
                                                        |- getEquipmentData, ahri, prices_all   maintenance plans, surge,
                                                        |- specEquipment (branch boxes, circuits) jurisdiction rules, warranty
                                                        |- priceLineItems (inline copy)           counts
                                                        '- loopProposals ---------------------> specIncentives   (once per proposal)
Edit a priced line (priceLineItemsWorkflow) ---------> priceLineItems                        equipment, labor, prices          returns priced lines
                                                        '- then page triggers ---------------> specIncentives
RECALCULATE button (button20) -----------------------> specIncentives                        see section 3                     page upserts lines (no permits)
After a system/line change ---------------------------> specPermits                           permits, systems, line items      permit lines on the "other" system
Generate PDF ----------------------------------------> proposalModuleWorkFlow                 lines, systems, HEAR tables       PDF URL
                                                        '- projectCostBreakdownAndDesignOptions (sub-workflow)
```

Key point: **the Recalculate button does not re-run spec or pricing.** It re-reads the line items from the database
(so change orders approved elsewhere are not overwritten), then runs only **specIncentives**: margin, incentives,
finance charges. Spec and pricing run when a system is added or edited.

## 2. Margin (inside specIncentives, block `calculateMargin`)

Prices in `prices_new` are base prices. Margin is a separate line item.

- per line (not incentive / change order / margin / permit / discount):
  `margin_amount = round(target * price / (1 - target), 2)` using the line's own `margin_percent`, else the system `target_margin`
- one line of type `margin`, description **Elephant Margin**, `price_actual = sum(margin_amount)` over lines whose status
  is not `proposed - from change order`, `pending deletion`, `deleted - from change order`
- `margin_to_include = false` excludes a line; `state = transient` lines are new lines being added (modes `add` / `exclude`)
- customer price = base lines + margin line + (negative) incentive lines, so effective margin = margin / (base + margin) = target

## 3. Incentives (block `specIncentives`, 1,000 lines)

Inputs it needs: the system, its lines, equipment + labor catalog, all `incentives_new` rows, `incentive_limits_new`,
the AHRI record, the house, the customer, the house's other systems, the proposal's permit lines, and the existing incentive
lines on the house (to count limits already used).

Algorithm, in order:
1. Keep incentives whose `active_date` / `inactive_date` window contains the rebate effective date (system date, else install date, else today).
2. Skip incentives for another `system_type`.
3. **Eligibility.** `incentive_criteria` is a set of options; the first option where ALL criteria pass wins. Criteria are nested
   objects matched against `equipment`, `labor`, `house`, `customer`, `existing_system` (heating / cooling aware), `system`, `ahri`.
   Values: `">=5"` style operators, literal text, booleans/numbers, arrays (OR). `max_amount: 0` means "not eligible".
4. **Amount** = `round(multiplier_value * target / rounding_place) * rounding_place`, capped by `max_amount`. `target` depends on
   `multiplier_type`: full install cost, electrical cost, non-electrical cost, furnace cost, cooling/heating tonnage from AHRI (several roundings).
   Electrical cost includes this system's share of the proposal's electrical permits; non-electrical cost adds the system's permit.
5. Non-tax incentives are sorted by amount (largest first), then **limits** are applied: quantity limits first, then amount limits
   (limits are pre-loaded with what the house already received). Hitting a limit reduces the amount and records an error message.
6. **Tax credits** run second: `tax-federal` amount = `multiplier * (full install cost + tax-affecting incentives)`.
7. **Finance fees**: an incentive with `finance_fee` adds a positive "Finance Charge for ..." line.
8. **EnergySmart cap**: if EnergySmart rebates + the rest exceed 50% of install cost, EnergySmart lines are zeroed or scaled down proportionally.
9. Adjusted lines (`adjustment_reason`) are preserved; matching lines keep their id so the page upserts instead of duplicating.
10. Old incentive lines are replaced by the new ones.

## 4. Financing fee (page logic `calculateLineItemFee`)

Synchrony only: Mitsubishi HVAC systems share `-7%` of the Synchrony financing amount (price) and `-0.7%` (margin) in proportion to
system cost, as a `financing fees` line; the margin line is adjusted by the change in the fee's margin.

## 5. Where this runs in our build

Decision: **we implement it ourselves, in `@sd/engine`**, not as Retool workflow calls. See the answer in the project notes:
the code is plain JS + SQL, the engine already hosts the other four ports, and a pitch build has no access to the client's Retool org or database.

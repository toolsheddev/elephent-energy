import type {
  AhriCertification,
  EngineError,
  Equipment,
  Failure,
  House,
  IncentiveEligibilityOption,
  IncentiveForLimitsRow,
  IncentiveLimit,
  IncentiveRow,
  InitializedIncentiveLimit,
  Labor,
  LineItem,
  PermitRow,
  RefData,
  System,
} from '../types';
import { indexById, toEngineError } from '../util';
import { checkCriteria } from './criteria';
import { applyLimits, initializeLimits, selectIncentivesForLimits } from './limits';
import { calculateMargin } from './margin';

/* ------------------------------------------------------------------ */
/* Input / context / result                                            */
/* ------------------------------------------------------------------ */

/** The webhook payload of the specIncentives workflow (`startTrigger.data`), typed. See `legacy/workflows/specIncentives/_exampleInput.json`. */
export interface SpecIncentivesInput {
  /** the system the lines belong to. Needs `system_type`; `target_margin`, `proposal_id`, `rebate_effective_date`, `ahri_id` are read when present. */
  system: System;
  /** the system's current lines (persisted or fresh from pricing). Old incentive / margin lines in here are replaced. */
  lineItems: LineItem[];
  house: House;
  customer?: Record<string, unknown> | null;
  /** AHRI row; when missing (or '' as the page sends it) it is looked up by `ahri_id` / `system.ahri_id` in `refData.ahri`. */
  ahriRecord?: AhriCertification | '' | null;
  ahri_id?: number | null;
  /** the proposal being calculated (also feeds the limits query) */
  proposal_id?: number | string | null;
  /** 'add system' | 'edit system' | null (the Recalculate button sends null) */
  mode?: string | null;
  /** id of the system being edited/recalculated (`existing_system_id`) */
  existing_system_id?: number | null;
  /** ISO date; used when `system.rebate_effective_date` is empty; else `ctx.now` */
  rebateEffectiveDate?: string | Date | null;
  /** margin controls, see {@link calculateMargin}. Retool: add flow = ('add', initialAdd true); Recalculate = (segmentedControl value, false). */
  system_margin?: 'add' | 'exclude' | (string & {}) | null;
  initialAdd?: boolean;
  transientMargin?: number | string | null;
  /** "arbitrary" checker: house/customer/existing_system criteria are treated as met */
  isArbitrary?: boolean;
  /** incentive limit rows; default `refData.incentiveLimits` */
  incentivesLimitData?: IncentiveLimit[];
  /** optional overrides of the catalogs (the add-system modal posts `laborData`); default `refData.labor` / `refData.equipment` */
  laborData?: Labor[];
  equipmentData?: Equipment[];
}

/** Row of `permits.sql`: permit line items of the proposal's 'other' system joined to their permit type. */
export interface PermitCostRow {
  price_actual: number | string | null;
  /** 'hvac' | 'electrical' | 'plumbing' */
  permit_type: string;
}

/** Per-call database state (SQL blocks `getSystems`, `permits`, `getIncentiveForLimits`) - supplied by the caller. */
export interface SpecIncentivesContext {
  /** injected clock: fallback rebate effective date */
  now: string | Date;
  /**
   * `getSystems.sql`: the house's systems whose status is not 'proposed - from change order' / 'deleted - from change order' /
   * 'pending deletion'. Used for the existing (active) system of the same type and for splitting the electrical permit.
   */
  houseSystems?: System[];
  /** `permits.sql` rows (see {@link selectPermitCostRows}) */
  permitLineItems?: PermitCostRow[];
  /** `getIncentiveForLimits.sql` rows; or give `houseLineItems` and let the engine derive them */
  incentivesForLimits?: IncentiveForLimitsRow[];
  /** all line items of the house's systems; only used to derive `incentivesForLimits` when that is not given */
  houseLineItems?: LineItem[];
}

export interface SpecIncentivesOk {
  ok: true;
  /** new line set: non-incentive lines (with margin_amount) + Elephant Margin line + new incentive / finance-charge lines; each with `temp_id` 1..n */
  result: LineItem[];
  /** the incentive lines (of the input) that were replaced - the workflow returned them for the caller to delete */
  deletedIncentives: LineItem[];
  /** collected like the original `errors` (limit reached, EnergySmart cap, invalid criteria key, per-tax-credit failures, ...) */
  errors: EngineError[];
  /**
   * Per-incentive failures of the FIRST (non-tax) pass. The original only `console.log`ged these (they never reached `errors`),
   * so they are kept apart here: surface them in a debug view, but do not treat them as user-facing errors.
   */
  warnings: EngineError[];
  /** the active system of the same type already in the house (criteria key `existing_system`), or null */
  existingSystem: System | { system_type: string; system_status: string; system_type_detail: Record<string, unknown> } | null;
  /** limits after this run (received_* include what this run granted) */
  limits: InitializedIncentiveLimit[];
}
export type SpecIncentivesResult = SpecIncentivesOk | Failure;

/* ------------------------------------------------------------------ */
/* helpers to build the context from DB-shaped rows                    */
/* ------------------------------------------------------------------ */

/** In-memory `permits.sql`: permit line items of the proposal's 'other' systems with their permit type. */
export function selectPermitCostRows(args: {
  proposalId: number | string;
  systems: readonly System[];
  lineItems: readonly LineItem[];
  permits: readonly Pick<PermitRow, 'id' | 'permit_type'>[];
}): PermitCostRow[] {
  const otherIds = new Set(
    args.systems
      .filter((s) => s.id !== undefined && String(s.proposal_id) === String(args.proposalId) && s.system_type === 'other')
      .map((s) => s.id as number),
  );
  const permitById = new Map(args.permits.map((p) => [p.id, p]));
  const rows: PermitCostRow[] = [];
  for (const li of args.lineItems) {
    if (li.permit_id === null || li.permit_id === undefined || !li.system_id || !otherIds.has(li.system_id)) continue;
    const permit = permitById.get(li.permit_id);
    if (permit) rows.push({ price_actual: li.price_actual ?? null, permit_type: permit.permit_type });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Core                                                                */
/* ------------------------------------------------------------------ */

type Pass = 'rebate' | 'tax credit';

/**
 * Port of the `specIncentives` workflow (blocks transformData -> getInitializedLimits -> calculateMargin -> specIncentives).
 *
 *  1. margin per line + the 'Elephant Margin' line ({@link calculateMargin})
 *  2. non-tax incentives: date window, system type, eligibility, amount, sorted by amount desc, limits applied
 *  3. tax credits (second pass; 'tax-federal' base = fullInstallCost + tax-affecting incentives)
 *  4. finance charges, EnergySmart 50% cap
 *  5. old incentive lines replaced by the new ones, `temp_id` assigned
 *
 * Never throws: a failure that aborted the whole workflow in Retool (-> `catchErrors`) is returned as `{ ok:false, errors }`.
 * Inputs are not mutated. No recorded Retool outputs were available - parity is NOT claimed.
 */
export function specIncentives(
  input: SpecIncentivesInput,
  refData: Pick<RefData, 'incentives' | 'incentiveLimits'> & Partial<Pick<RefData, 'equipment' | 'labor' | 'ahri'>>,
  ctx: SpecIncentivesContext,
): SpecIncentivesResult {
  try {
    return runSpecIncentives(input, refData, ctx);
  } catch (e) {
    return { ok: false, errors: [toEngineError(e)] };
  }
}

function mkError(message: string): EngineError {
  return toEngineError(new Error(message));
}

function runSpecIncentives(
  input: SpecIncentivesInput,
  refData: Pick<RefData, 'incentives' | 'incentiveLimits'> & Partial<Pick<RefData, 'equipment' | 'labor' | 'ahri'>>,
  ctx: SpecIncentivesContext,
): SpecIncentivesOk {
  const system = input.system;
  if (!system) throw new Error('system not passed in as additional scope');
  if (!input.lineItems) throw new Error('lineItems not provided in additionalScope variable');

  const errors: EngineError[] = [];
  const warnings: EngineError[] = [];

  /* ---- transformData ---- */
  const equipmentById = indexById<Equipment>(input.equipmentData ?? refData.equipment ?? []);
  const laborById = indexById<Labor>(input.laborData ?? refData.labor ?? []);
  // `Object.values(incentivesData)` iterates integer keys in ascending order -> sort by id like a JS object would
  const incentivesSorted: IncentiveRow[] = [...(refData.incentives ?? [])].sort((a, b) => a.id - b.id);
  const ahriId = input.ahri_id ?? (system.ahri_id as number | null | undefined) ?? null;
  const ahriRecord: AhriCertification | null =
    input.ahriRecord && typeof input.ahriRecord === 'object'
      ? input.ahriRecord
      : (ahriId !== null ? (refData.ahri ?? []).find((a) => a.id === ahriId) ?? null : null);

  const houseSystems = ctx.houseSystems ?? [];
  const permitsData = Array.isArray(ctx.permitLineItems) ? ctx.permitLineItems : [];

  /* ---- existing system ---- */
  let existingSystem: SpecIncentivesOk['existingSystem'];
  if (system.system_type === 'cooktop') {
    existingSystem = { system_type: 'cooktop', system_status: 'active', system_type_detail: { fuel: 'gas', system_type: 'cooktop' } };
  } else {
    existingSystem =
      houseSystems.find(
        (old) =>
          old.system_status === 'active' &&
          ((old.system_type === system.system_type && system.system_type !== 'cooktop') ||
            (old.system_type === 'other' && system.system_type === 'cooktop')),
      ) ?? null;
  }

  /* ---- limits (getIncentiveForLimits + getInitializedLimits) ---- */
  const incentivesForLimits =
    ctx.incentivesForLimits ??
    selectIncentivesForLimits({
      systems: houseSystems,
      lineItems: ctx.houseLineItems ?? [],
      houseId: input.house?.id,
      proposalId: input.proposal_id ?? (system.proposal_id as number | string | null | undefined) ?? null,
      mode: input.mode ?? null,
      existingSystemId: input.existing_system_id ?? null,
    });
  const initializedLimits = initializeLimits(incentivesForLimits, input.incentivesLimitData ?? refData.incentiveLimits ?? []);

  /* ---- calculateMargin ---- */
  const lineItems = calculateMargin({
    lineItems: input.lineItems,
    system,
    initialAdd: input.initialAdd,
    system_margin: input.system_margin,
    transientMargin: input.transientMargin,
  });

  const incentiveLineItems = computeIncentiveLines();
  const oldIncentiveLineItems = lineItems.filter((item) => item.line_item_type === 'incentive');
  let result = lineItems.filter((item) => item.line_item_type !== 'incentive').concat(incentiveLineItems);
  result = result.filter((item) => item && typeof item === 'object' && Object.keys(item).length > 0);
  let tempId = 1;
  result = result.map((item) => ({ ...item, temp_id: tempId++ }));

  return {
    ok: true,
    result,
    deletedIncentives: oldIncentiveLineItems,
    errors,
    warnings,
    existingSystem,
    limits: initializedLimits,
  };

  /* ================================================================ */
  /* the specIncentives(lineItems) function                           */
  /* ================================================================ */
  function computeIncentiveLines(): LineItem[] {
    const electricalPermitSystemCount =
      houseSystems.filter(
        (s) => ['hvac', 'water heater', 'cooktop', 'panel'].includes(s.system_type) && s.proposal_id === system.proposal_id,
      ).length || 1;

    // full install cost = sum of all lines except incentives (margin line included, no separate margin_amount)
    const fullInstallCost = lineItems.reduce((acc, item) => {
      const price = Number(item.price_actual);
      if (!isNaN(price) && item.line_item_type !== 'incentive') return acc + price;
      return acc;
    }, 0);

    const equipmentArray = lineItems.reduce<Equipment[]>((acc, item) => {
      const rec = equipmentById[item.equipment_id as number];
      if (rec) acc.push(rec);
      return acc;
    }, []);
    const laborArray = lineItems.reduce<Labor[]>((acc, item) => {
      const rec = laborById[item.labor_id as number];
      if (rec) acc.push(rec);
      return acc;
    }, []);

    const electricalPermitShare = () =>
      permitsData.filter((p) => p.permit_type === 'electrical').reduce((sum, p) => sum + Number(p.price_actual || 0), 0) /
      electricalPermitSystemCount;

    const systemPermitCost = (systemType: string) => {
      if (systemType === 'hvac') return permitsData.filter((p) => p.permit_type === 'hvac').reduce((s, p) => s + Number(p.price_actual || 0), 0);
      if (systemType === 'water heater')
        return permitsData.filter((p) => p.permit_type === 'plumbing').reduce((s, p) => s + Number(p.price_actual || 0), 0);
      return 0;
    };

    // NB: `price_actual + margin_amount` is NaN when a line has no margin_amount (undefined) -> that line is skipped, as in Retool
    let electricalCost = lineItems.reduce((acc, item) => {
      const price = Number(item.price_actual) + Number(item.margin_amount);
      const labor = laborArray.find((l) => l.id === item.labor_id);
      if (!isNaN(price) && item.line_item_type === 'labor' && labor?.category === 'electrical') return acc + price;
      return acc;
    }, 0);
    electricalCost += electricalPermitShare();

    let nonElectricalCost = lineItems.reduce((acc, item) => {
      const price = Number(item.price_actual) + Number(item.margin_amount);
      const labor = laborArray.find((l) => l.id === item.labor_id);
      if (!isNaN(price) && item.line_item_type !== 'incentive' && item.line_item_type !== 'margin' && labor?.category !== 'electrical')
        return acc + price;
      return acc;
    }, 0);
    nonElectricalCost += systemPermitCost(system.system_type);

    const furnaceCost = lineItems.reduce((acc, item) => {
      const price = Number(item.price_actual) + Number(item.margin_amount || 0);
      const desc = typeof item.description === 'string' ? item.description.toLowerCase() : '';
      if (!isNaN(price) && item.line_item_type !== 'incentive' && item.line_item_type !== 'margin' && desc.includes('furnace')) return acc + price;
      return acc;
    }, 0);

    // incentives in effect at the tentative install date
    const systemDate = system.rebate_effective_date
      ? new Date(system.rebate_effective_date)
      : input.rebateEffectiveDate
        ? new Date(input.rebateEffectiveDate)
        : new Date(ctx.now);
    const filteredIncentives = incentivesSorted.filter(
      (inc) =>
        (!inc.active_date || new Date(inc.active_date) <= systemDate) && (!inc.inactive_date || new Date(inc.inactive_date) >= systemDate),
    );
    const filteredById = new Map<number, IncentiveRow>(filteredIncentives.map((i) => [i.id, i]));

    /* ---- eligibility ---- */
    function matchEligibility(incentive: IncentiveRow): IncentiveEligibilityOption | null | undefined {
      if (incentive.system_type !== system.system_type) return null;

      const eligibilities = Object.values(incentive.incentive_criteria as Record<string, IncentiveEligibilityOption>);
      return eligibilities.find((option) => {
        // no criteria -> match
        if (!option.criteria || Object.keys(option.criteria).length === 0) return true;
        // max amount 0 -> explicit "not eligible"
        if (option.criteria?.amount?.max_amount === 0) return false;

        const criteriaTypes = Object.keys(option.criteria);
        const returnValue = criteriaTypes.reduce<boolean | null>((acc, key) => {
          const criteria = (option.criteria as Record<string, any>)[key];
          let isMet: boolean | null = false;
          if (key === 'equipment') {
            isMet = equipmentArray.reduce<boolean | null>((acc2, eq) => acc2 || checkCriteria(criteria, eq), false);
          } else if (key === 'labor') {
            isMet = laborArray.reduce<boolean | null>((acc2, lb) => acc2 || checkCriteria(criteria, lb), false);
          } else if (key === 'home' || key === 'house') {
            isMet = input.isArbitrary ? true : checkCriteria(criteria, input.house);
          } else if (key === 'customer') {
            isMet = input.isArbitrary ? true : checkCriteria(criteria, input.customer);
          } else if (key === 'existing_system') {
            if (input.isArbitrary) {
              isMet = true;
            } else {
              const detail = (existingSystem as any)?.system_type_detail;
              let systemTypeDetail: unknown;
              const hasCooling = criteria.cooling && typeof criteria.cooling === 'object';
              const hasHeating = criteria.heating && typeof criteria.heating === 'object';
              if (hasCooling && hasHeating) systemTypeDetail = { cooling: detail?.cooling || {}, heating: detail?.heating || {} };
              else if (hasCooling) systemTypeDetail = detail?.cooling;
              else if (hasHeating) systemTypeDetail = detail?.heating;
              else if (existingSystem && detail && Object.keys(detail).includes('heating')) systemTypeDetail = detail.heating;
              else if (existingSystem && detail) systemTypeDetail = detail;
              isMet = checkCriteria(criteria, systemTypeDetail);
            }
          } else if (key === 'system') {
            isMet = checkCriteria(criteria, system);
          } else if (key === 'ahri') {
            isMet = checkCriteria(criteria, ahriRecord);
          } else {
            errors.push(mkError('Invalid incentive criteria key: ' + key));
            isMet = false;
          }
          if (acc === null) return isMet;
          return isMet && acc;
        }, null);
        return returnValue ? returnValue : false;
      });
    }

    /* ---- amount ---- */
    function calcAmount(option: IncentiveEligibilityOption, multiplierTarget: number): number {
      const isPowerOfTen = (n: number) => n > 0 && 10 ** Math.round(Math.log10(n)) === n;
      let roundingPlace = option.amount.rounding_place;
      roundingPlace = roundingPlace ? roundingPlace : 0.01; // default: nearest cent
      if (!isPowerOfTen(roundingPlace)) throw new Error('rounding_place must be a power of 10');

      const multiplied = Math.round(((option.amount.multiplier_value as number) * multiplierTarget) / roundingPlace) * roundingPlace;
      const maxAmount = option.amount.max_amount;
      if (maxAmount !== null && maxAmount !== undefined && multiplied !== null && multiplied !== undefined) return Math.min(maxAmount, multiplied);
      if (maxAmount !== null && maxAmount !== undefined) return maxAmount;
      if (multiplied !== null && multiplied !== undefined) return multiplied;
      throw new Error('No valid amount for incentive ' + JSON.stringify(option));
    }

    const rounded2 = (btu: number, per = 12000) => Math.round((btu / per + Number.EPSILON) * 100) / 100;

    function getActualAmount(incentive: IncentiveRow, option: IncentiveEligibilityOption | null | undefined, pass: Pass, taxAffecting: number): number {
      if (!option) return 0;
      const type = option.amount.multiplier_type;
      const needAhri = () => {
        if (!ahriRecord) throw new Error('No AHRI record found - cannot calculate amount for incentive ' + incentive.name);
        return ahriRecord as Record<string, any>;
      };
      let returnVal: number;
      if (type === 'full install') returnVal = Number(calcAmount(option, fullInstallCost));
      else if (type === 'electrical') returnVal = Number(calcAmount(option, electricalCost));
      else if (type === 'non-electrical') returnVal = Number(calcAmount(option, nonElectricalCost));
      else if (type === 'furnace cost') returnVal = Number(calcAmount(option, furnaceCost));
      else if (type === 'cooling tonnage rounded 2') returnVal = Number(calcAmount(option, rounded2(needAhri().cooling_95)));
      else if (type === 'cooling tonnage rounded down') returnVal = Number(calcAmount(option, Math.floor(needAhri().cooling_95 / 12000)));
      else if (type === 'heating tonnage rounded 2') returnVal = Number(calcAmount(option, rounded2(needAhri().heating_5)));
      else if (type === 'heating47 tonnage rounded 1')
        returnVal = Number(calcAmount(option, Math.round((needAhri().heating_47 / 12000 + Number.EPSILON) * 10) / 10));
      else if (type === 'heating tonnage rounded down') returnVal = Number(calcAmount(option, Math.floor(needAhri().heating_47 / 12000)));
      else if (type === 'cooling tonnage rounded half ton') returnVal = Number(calcAmount(option, Math.round((needAhri().cooling_95 / 12000) * 2) / 2));
      else if (type === 'tax-federal' && pass === 'rebate')
        // the original passes isFinalRun=true here but reads `taxAffectingIncentives`, a `let` declared later in the same
        // function (temporal dead zone) -> a ReferenceError that was swallowed by the map's catch: same net effect as this throw
        throw new Error('tax-federal multiplier type is only valid for tax credits. This incentive: ' + incentive.name);
      else if (type === 'tax-federal') returnVal = Number(calcAmount(option, fullInstallCost + taxAffecting));
      else if (type === '') returnVal = 0;
      else throw new Error('Invalid multiplier type ' + type + ' for incentive: ' + incentive.name);
      return returnVal;
    }

    function findMatchedLineItem(incentive: IncentiveRow): LineItem | undefined {
      return lineItems.find(
        (item) =>
          item.incentive_id === incentive.id &&
          item.line_item_type === 'incentive' &&
          typeof item.description === 'string' &&
          item.description.toLowerCase() === incentive.name?.toLowerCase(),
      );
    }

    function buildLine(incentive: IncentiveRow, actualAmount: number, matched: LineItem | undefined): LineItem {
      let newLineItem: LineItem = {
        price_actual: -1 * actualAmount,
        line_item_type: 'incentive',
        incentive_id: incentive.id,
        incentive_recipient: incentive.recipient,
        description: incentive.name,
      };
      if (matched && matched.id && matched.adjustment_reason) newLineItem = { ...matched }; // preserve adjusted line items
      else if (matched && matched.id) newLineItem.id = matched.id; // deduplicate
      return newLineItem;
    }

    let incentiveLineItems: LineItem[] = [];
    const taxAffectingIncentiveLineItems: LineItem[] = [];

    /* ---- pass 1: everything except tax credits ---- */
    type Candidate = { incentive: IncentiveRow; actualAmount: number; matchedEligibility: IncentiveEligibilityOption };
    let tempIncentives: LineItem[] = filteredIncentives
      .filter((inc) => inc.incentive_type !== 'tax credit')
      .map((incentive): Candidate | null => {
        try {
          const matchedEligibility = matchEligibility(incentive);
          if (matchedEligibility) {
            const actualAmount = getActualAmount(incentive, matchedEligibility, 'rebate', 0);
            return { incentive, actualAmount, matchedEligibility };
          }
          return null;
        } catch (error) {
          const e = toEngineError(error);
          warnings.push({ ...e, message: `Error calculating actualAmount for incentive ${incentive.id}: ${e.message}` });
          return null;
        }
      })
      .filter((c): c is Candidate => c !== null)
      .sort((a, b) => b.actualAmount - a.actualAmount)
      .reduce<LineItem[]>((acc, { incentive, actualAmount }) => {
        try {
          const matched = findMatchedLineItem(incentive);
          actualAmount = applyLimits(actualAmount, incentive, initializedLimits, errors, 'incentive');
          const newLineItem = buildLine(incentive, actualAmount, matched);
          if (incentive.affects_tax_credit) taxAffectingIncentiveLineItems.push(newLineItem);
          acc.push(newLineItem);
          return acc;
        } catch (error) {
          const e = toEngineError(error);
          errors.push({ ...e, message: `Error processing criteria for incentive ${incentive.id}. Message: ${e.message}` });
          return acc;
        }
      }, []);

    tempIncentives = tempIncentives.filter((item) => item != null && ((item.price_actual && item.price_actual !== 0) || item.id));
    incentiveLineItems = incentiveLineItems.concat(tempIncentives);

    const taxAffectingIncentives = taxAffectingIncentiveLineItems.reduce((total, item) => total + (item?.price_actual as number), 0);

    /* ---- pass 2: tax credits ---- */
    tempIncentives = filteredIncentives
      .filter((inc) => inc.incentive_type === 'tax credit')
      .reduce<LineItem[]>((acc, incentive) => {
        try {
          const matched = findMatchedLineItem(incentive);
          const matchedEligibility = matchEligibility(incentive);
          if (matchedEligibility) {
            let actualAmount = getActualAmount(incentive, matchedEligibility, 'tax credit', taxAffectingIncentives);
            actualAmount = applyLimits(actualAmount, incentive, initializedLimits, errors, 'tax credit');
            acc.push(buildLine(incentive, actualAmount, matched));
          }
          return acc;
        } catch (error) {
          const e = toEngineError(error);
          errors.push({ ...e, message: `Error processing tax credit incentive ${incentive.id}. Message: ${e.message}` });
          return acc;
        }
      }, []);
    tempIncentives = tempIncentives.filter((item) => item != null && ((item.price_actual && item.price_actual !== 0) || item.id));
    incentiveLineItems = incentiveLineItems.concat(tempIncentives);

    /* ---- finance fees ---- */
    const oldFees = lineItems.filter((item) => typeof item.description === 'string' && item.description.includes('Finance Charge'));
    tempIncentives = incentiveLineItems.reduce<LineItem[]>((acc, item) => {
      const incentive = filteredById.get(item.incentive_id as number);
      if (incentive?.finance_fee) {
        let newFee: LineItem = {
          price_actual: incentive.finance_fee,
          line_item_type: 'incentive',
          incentive_id: incentive.id,
          description: 'Finance Charge for ' + incentive.name,
        };
        const oldFee = oldFees.find((fee) => fee.incentive_id === incentive.id);
        if (oldFee && oldFee.id && oldFee.adjustment_reason) newFee = { ...oldFee }; // don't replace adjusted line items
        else if (oldFee && oldFee.id) newFee.id = oldFee.id;
        acc.push(newFee);
      }
      return acc;
    }, []);
    tempIncentives = tempIncentives.filter((item) => item != null && ((item.price_actual && item.price_actual !== 0) || item.id));
    if (tempIncentives.length > 0) incentiveLineItems = incentiveLineItems.concat(tempIncentives);

    /* ---- EnergySmart 50% project cost cap ---- */
    try {
      const projectCostCap = fullInstallCost * 0.5;
      const isEnergySmart = (item: LineItem) => !!filteredById.get(item.incentive_id as number)?.name?.includes('EnergySmart');
      const energySmartItems = incentiveLineItems.filter(isEnergySmart);

      if (energySmartItems.length > 0 && fullInstallCost > 0) {
        const nonEnergySmartTotal = incentiveLineItems
          .filter((item) => !isEnergySmart(item))
          .reduce((acc, item) => acc + Math.abs(Number(item.price_actual) || 0), 0);

        if (nonEnergySmartTotal >= projectCostCap) {
          // eliminate all EnergySmart incentives
          energySmartItems.forEach((item) => {
            item.price_actual = 0;
          });
          errors.push(
            mkError(`All EnergySmart rebates eliminated: incentive stack already exceeds 50% of project cost ($${projectCostCap}) before EnergySmart rebates.`),
          );
        } else {
          // reduce proportionally if needed
          const remainingRoom = projectCostCap - nonEnergySmartTotal;
          const energySmartTotal = energySmartItems.reduce((acc, item) => acc + Math.abs(Number(item.price_actual) || 0), 0);
          if (energySmartTotal > remainingRoom && energySmartTotal > 0) {
            energySmartItems.forEach((item) => {
              const originalAmount = Math.abs(Number(item.price_actual) || 0);
              const scaledAmount = Math.round((originalAmount / energySmartTotal) * remainingRoom);
              item.price_actual = -1 * scaledAmount;
            });
            errors.push(
              mkError(`EnergySmart rebates reduced from $${energySmartTotal} to $${remainingRoom} to stay within 50% of project cost ($${projectCostCap}).`),
            );
          }
        }
      }
    } catch (capError) {
      errors.push(mkError('EnergySmart cap check failed silently: ' + (capError as Error).message));
    }

    return incentiveLineItems;
  }
}

import type { LineItem } from '../types';

/** Line item types that carry no margin of their own (`passthroughTypes` in calculateMargin.js / marginLogic.js). */
export const MARGIN_PASSTHROUGH_TYPES: readonly string[] = ['incentive', 'change order', 'margin', 'permit', 'discount'];

/** Statuses whose margin is not counted (`excludedStatuses`). */
export const MARGIN_EXCLUDED_STATUSES: readonly string[] = [
  'proposed - from change order',
  'pending deletion',
  'deleted - from change order',
];

export const MARGIN_LINE_DESCRIPTION = 'Elephant Margin';

/** `Math.round((target * price / (1 - target)) * 100) / 100` (target may be a numeric string like '0.2200'). */
export function marginForPrice(price: number, target: number | string): number {
  const t = Number(target);
  return Math.round(((t * price) / (1 - t)) * 100) / 100;
}

export interface CalculateMarginArgs {
  lineItems: LineItem[];
  /** only `target_margin` is read (number or numeric string) */
  system: { target_margin?: number | string | null; [k: string]: unknown };
  /** true on first creation of the system's lines: every line gets the SYSTEM target and `margin_to_include = true` */
  initialAdd?: boolean;
  /** only for `state === 'transient'` lines: 'add' = give them margin, 'exclude' = margin 0 */
  system_margin?: 'add' | 'exclude' | (string & {}) | null;
  /** margin target for NEW (transient) lines; '' / null = system target */
  transientMargin?: number | string | null;
}

/**
 * Port of `specIncentives/calculateMargin.js`.
 *
 * Returns copies of the input lines (inputs are NOT mutated; the original mutated them) with `margin_amount` (and for
 * transient lines `margin_percent`/`margin_to_include`) set, `state: 'transient'` flipped to `'persisted'`, all old
 * margin lines removed and ONE new margin line appended at the end:
 * `{ price_actual: sum(margin_amount of lines whose status is not excluded), line_item_type: 'margin', description:
 * 'Elephant Margin', id?: <id of the old margin line> }`.
 *
 * Quirks kept on purpose: a line whose `state` is neither 'persisted' nor 'transient' (and not initialAdd) keeps whatever
 * `margin_amount` it had; passthrough lines get price 0 -> margin 0; the sum is NOT rounded (float noise like
 * 4147.5599999999995 is what Retool stored). Throws (TypeError) when `lineItems`/`system` are missing, like the original.
 */
export function calculateMargin(args: CalculateMarginArgs): LineItem[] {
  const { lineItems, system } = args;
  if (!lineItems) throw new TypeError('lineItems not passed in as additional scope');
  if (!system) throw new TypeError('system not passed in as additional scope');

  const oldMargin = lineItems.find((item) => item.line_item_type === 'margin');
  const returnItems: LineItem[] = lineItems.filter((item) => item.line_item_type !== 'margin').map((item) => ({ ...item }));

  const systemTarget = system.target_margin as number | string; // system's true margin - never use for persisted items
  const transientTarget =
    args.transientMargin !== null && args.transientMargin !== undefined && args.transientMargin !== ''
      ? args.transientMargin
      : systemTarget;

  returnItems.forEach((item) => {
    let price = 0;
    if (!MARGIN_PASSTHROUGH_TYPES.includes(item.line_item_type as string)) {
      price = item.price_actual ? Number(item.price_actual) : 0;
    }

    if (args.initialAdd) {
      item.margin_amount = marginForPrice(price, systemTarget);
      item.margin_to_include = true;
    } else if (item.state === 'persisted') {
      // false means "exclude margin"; not-set means "include".
      if (item.margin_to_include !== false) {
        const itemTarget = item.margin_percent !== null && item.margin_percent !== undefined ? item.margin_percent : systemTarget;
        item.margin_amount = marginForPrice(price, itemTarget);
      } else {
        item.margin_amount = 0;
      }
    } else if (item.state === 'transient') {
      if (args.system_margin === 'exclude') {
        item.margin_amount = 0;
        item.margin_to_include = false;
      } else if (args.system_margin === 'add') {
        item.margin_amount = marginForPrice(price, transientTarget);
        item.margin_percent =
          Math.abs(Number(transientTarget) - Number(systemTarget)) > 1e-6 ? (transientTarget as number | string) : null;
        item.margin_to_include = true;
      }
    }
  });

  returnItems.forEach((item) => {
    if (item.state === 'transient') item.state = 'persisted';
  });

  const margin = returnItems.reduce((acc, item) => {
    if (!MARGIN_EXCLUDED_STATUSES.includes(item.status as string)) return acc + Number(item.margin_amount || 0);
    return acc;
  }, 0);

  const marginLineItem: LineItem = { price_actual: margin, line_item_type: 'margin', description: MARGIN_LINE_DESCRIPTION };
  if (oldMargin && oldMargin.id) marginLineItem.id = oldMargin.id;
  returnItems.push(marginLineItem);
  return returnItems;
}

/**
 * Port of `page-logic/marginLogic.js` (the UI's "sum the margin" step): total of `margin_amount` over lines that are
 * neither passthrough types nor in an excluded status, rounded to cents (the original returned the raw float sum).
 */
export function sumMargin(lines: readonly LineItem[]): number {
  const total = lines.reduce((acc, item) => {
    if (
      item.line_item_type !== 'margin' &&
      !MARGIN_EXCLUDED_STATUSES.includes(item.status as string) &&
      !MARGIN_PASSTHROUGH_TYPES.includes(item.line_item_type as string)
    ) {
      return acc + Number(item.margin_amount || 0);
    }
    return acc;
  }, 0);
  return Math.round(total * 100) / 100;
}

/**
 * `marginLogic.js` result: the margin line item to (up)sert - `{ id?, price_actual: sumMargin(lines), line_item_type:
 * 'margin', description: 'Elephant Margin' }`. The id of an existing margin line in `lines` is kept.
 */
export function marginLine(lines: readonly LineItem[]): LineItem {
  const oldMargin = lines.find((item) => item.line_item_type === 'margin');
  const line: LineItem = { price_actual: sumMargin(lines), line_item_type: 'margin', description: MARGIN_LINE_DESCRIPTION };
  if (oldMargin && oldMargin.id) line.id = oldMargin.id;
  return line;
}

/** `marginLogic` applied to a set of lines: returns the lines without the old margin line plus the fresh one (last). */
export function withMarginLine(lines: readonly LineItem[]): LineItem[] {
  return [...lines.filter((item) => item.line_item_type !== 'margin'), marginLine(lines)];
}

/** Effective margin % of a priced system = margin / (base + margin); 0 when there is nothing to price. */
export function effectiveMargin(lines: readonly LineItem[]): number {
  const m = lines.find((l) => l.line_item_type === 'margin');
  const margin = m ? Number(m.price_actual || 0) : 0;
  const base = lines
    .filter((l) => !MARGIN_PASSTHROUGH_TYPES.includes(l.line_item_type as string))
    .reduce((a, l) => a + Number(l.price_actual || 0), 0);
  return base + margin > 0 ? margin / (base + margin) : 0;
}

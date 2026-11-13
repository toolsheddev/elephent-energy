/**
 * Criteria matching of `specIncentives.js` (`checkCriteria` / `checkCriterion`), ported 1:1 including its quirks:
 *  - an operator string ('>=5', '<=0.5', '>1', '<2', '==3', '=3') is numeric only when the remainder is a pure number,
 *    otherwise the whole string is compared literally (so '<50%' matches the data value '<50%');
 *  - a single-element data array is unwrapped when the criterion is not an array;
 *  - an array criterion is an OR over its members (and also true on `dataValue == checkValue`);
 *  - a plain-object criterion recurses into a plain-object data value (false if the data is not an object);
 *  - `checkCriteria` of an empty criteria object returns `null` (falsy, but "not yet decided" for the caller).
 */

function getInnerValue(obj: unknown, path: string): unknown {
  const keys = path.split('.');
  let current: any = obj;
  if (!current) return undefined;
  for (const key of keys) {
    // (original would throw a TypeError on a null in the middle of the path; treated as "missing" here)
    if (current === null || current === undefined || current[key] === undefined) return undefined;
    current = current[key];
  }
  return current;
}

/** one criterion: `checkValue` (from the incentive JSON) against `dataValue` (from the data). */
export function checkCriterion(checkValue: unknown, dataValue: unknown): boolean {
  if (!Array.isArray(checkValue) && Array.isArray(dataValue) && dataValue.length === 1) dataValue = dataValue[0];

  let isMet = false;
  if (typeof checkValue === 'string') {
    const regex = /^(>=|>|<=|<|==|=)/;
    const operator = checkValue.match(regex);
    const remainder = operator ? checkValue.replace(regex, '').trim() : '';
    if (operator && remainder !== '' && !isNaN(Number(remainder))) {
      const stripped = Number(remainder);
      const numeric = Number(dataValue);
      switch (operator[0]) {
        case '>=':
          isMet = numeric >= stripped;
          break;
        case '>':
          isMet = numeric > stripped;
          break;
        case '<=':
          isMet = numeric <= stripped;
          break;
        case '<':
          isMet = numeric < stripped;
          break;
        case '==':
        case '=':
          // eslint-disable-next-line eqeqeq
          isMet = numeric == stripped;
          break;
      }
    } else {
      isMet = String(dataValue).trim() === String(checkValue).trim();
    }
  } else if (typeof checkValue === 'boolean' || typeof checkValue === 'number') {
    // eslint-disable-next-line eqeqeq
    isMet = dataValue == checkValue;
  } else if (Array.isArray(checkValue)) {
    // eslint-disable-next-line eqeqeq
    isMet = (dataValue as any) == (checkValue as any) || checkValue.reduce<boolean>((acc, value) => acc || checkCriterion(value, dataValue), false);
  } else {
    throw new Error(`${typeof checkValue} is an invalid criterion value. Value: ${checkValue}`);
  }
  return isMet;
}

/**
 * `{ path: value }` criteria against one data object; ALL must hold. Returns `null` for empty criteria (as the original's
 * `reduce(..., null)` did) - callers treat null as falsy.
 */
export function checkCriteria(criteria: Record<string, unknown>, data: unknown): boolean | null {
  return Object.keys(criteria).reduce<boolean | null>((acc, criterionKey) => {
    const checkValue = criteria[criterionKey];
    const dataValue = getInnerValue(data, criterionKey);
    let conditionMet: boolean | null;
    if (typeof checkValue === 'object' && !Array.isArray(checkValue)) {
      if (typeof dataValue === 'object' && !Array.isArray(dataValue)) conditionMet = checkCriteria(checkValue as Record<string, unknown>, dataValue);
      else conditionMet = false;
    } else {
      conditionMet = checkCriterion(checkValue, dataValue);
    }
    if (acc === null) return conditionMet;
    return conditionMet && acc;
  }, null);
}

import type { Equipment, EngineError, Labor, RefData } from '../types';

export function toEngineError(e: unknown): EngineError {
  if (e instanceof Error) return { name: e.name, message: e.message, stack: e.stack };
  return { name: 'Error', message: typeof e === 'string' ? e : JSON.stringify(e) };
}

/** Build an id -> row map (Retool: `arr.reduce((acc,item)=>{acc[item.id]=item})`). */
export function indexById<T extends { id: number }>(rows: readonly T[]): Record<number, T> {
  const out: Record<number, T> = {};
  for (const r of rows) out[r.id] = r;
  return out;
}

export interface Lookups {
  equipmentById: Record<number, Equipment>;
  laborById: Record<number, Labor>;
  equipmentArray: Equipment[];
  laborArray: Labor[];
}

const cache = new WeakMap<object, Lookups>();

/** Cached (per RefData / per array pair) lookup tables. */
export function buildLookups(equipment: Equipment[], labor: Labor[]): Lookups {
  return {
    equipmentById: indexById(equipment),
    laborById: indexById(labor),
    equipmentArray: equipment,
    laborArray: labor,
  };
}

export function getLookups(refData: Pick<RefData, 'equipment' | 'labor'>, laborOverride?: Labor[]): Lookups {
  if (laborOverride) return buildLookups(refData.equipment, laborOverride);
  const hit = cache.get(refData);
  if (hit && hit.equipmentArray === refData.equipment && hit.laborArray === refData.labor) return hit;
  const l = buildLookups(refData.equipment, refData.labor);
  cache.set(refData, l);
  return l;
}

/**
 * Postgres `value LIKE pattern` (case sensitive, % and _ wildcards, `\` escapes).
 * NULL on either side -> false (three-valued logic collapses to false in the ahri query).
 */
const escapeRe = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function sqlLike(value: string | null | undefined, pattern: string | null | undefined): boolean {
  if (value === null || value === undefined || pattern === null || pattern === undefined) return false;
  let re = '^';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\' && i + 1 < pattern.length) re += escapeRe(pattern[++i]);
    else if (ch === '%') re += '[\\s\\S]*';
    else if (ch === '_') re += '[\\s\\S]';
    else re += escapeRe(ch);
  }
  return new RegExp(re + '$').test(value);
}

/** `path.split('.').reduce(...)` exactly like the jurisdiction engine's getNestedValue. */
export function getNestedValue(obj: unknown, path: string | null | undefined): unknown {
  if (!path) return undefined;
  return path
    .split('.')
    .reduce<any>((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

/** JS `Number(x)` validity check used all over the original: `(!n && n !== 0)` is invalid. */
export function isValidNumber(n: number): boolean {
  return !(!n && n !== 0);
}

/** structuredClone-free deep clone for JSON-like data (works in every browser/Node target). */
export function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** Resolve a Date from a string/number/Date; invalid -> null. */
export function toDate(v: Date | string | number | null | undefined): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

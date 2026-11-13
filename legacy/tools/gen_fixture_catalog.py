# usage: python -I gen_fixture_catalog.py <priceLineItems/_exampleInput.json> <specSystemDetails/_exampleInput.json> <out.ts>
# Curates a SAMPLE catalog (equipment + labor) from the real example payloads. Treats input as data only.
import json, sys, collections

pe = json.load(open(sys.argv[1], encoding='utf-8'))
se = json.load(open(sys.argv[2], encoding='utf-8'))
eq = {int(k): v for k, v in pe['equipmentData'].items()}
lab = {int(k): v for k, v in pe['laborData'].items()}
for l in se['laborData']:
    lab.setdefault(l['id'], l)

KEEP = ['id', 'equipment_name', 'model_number', 'equipment_type', 'model_series', 'manufacturer', 'provider', 'labor_id',
        'additional_equipment_ids', 'electrical_requirements', 'max_indoor_units', 'refrigerant', 'output_btu', 'uef',
        'is_energystar', 'heating_tonnage', 'capacity_gallons', 'cfm', 'fan_type', 'width', 'height', 'depth',
        'decibels', 'weight', 'power', 'rla', 'active']


def slim(e):
    r = {k: e.get(k) for k in KEEP}
    r['equipment_name'] = (r['equipment_name'] or '').replace('�', '”')
    if r['electrical_requirements'] is None:
        r['electrical_requirements'] = {}
    return r


def ids_of(t, pred=lambda e: True, n=None):
    out = [i for i, e in sorted(eq.items()) if e['equipment_type'] == t and pred(e)]
    return out[:n] if n else out


sel = set()
sel |= {380, 378, 379, 381, 382, 383, 370, 372, 374, 376, 100, 101, 437, 97, 394, 395, 398, 400, 74, 76, 72, 73}
sel |= set(ids_of('Condenser', lambda e: e['manufacturer'] == 'MRCOOL', 2))
sel |= {431, 430, 429, 432, 428, 404, 405, 406, 407, 408, 409, 50, 53, 59, 49, 51, 54, 57, 60, 293, 296, 468, 469, 52, 55}
sel |= set(ids_of('Wall Head', lambda e: e['refrigerant'] == 'R-454B', 12))
sel |= set(ids_of('Wall Head', lambda e: e['refrigerant'] == 'R-410A', 8))
sel |= {121, 122, 318, 319, 68, 69, 322, 323, 410, 145, 146, 386, 387, 392}
sel |= set(range(484, 490)) & set(eq)
sel |= {102, 104, 106, 108, 110, 273, 274, 474, 476, 478, 480}
sel |= {149, 151, 153, 155, 156, 157, 232, 233, 234, 268, 280, 463, 464, 213, 275, 286}
sel |= {117, 118, 119, 120, 276}
for t in ('Thermostat', 'Thermostat Accessory', 'Integrated Control', 'Branch Box', 'Header', 'Electrical', 'ERV'):
    sel |= set(ids_of(t))
sel |= {158, 159, 161, 163, 125, 127, 131, 136, 139, 140, 143, 144, 299, 301, 200, 201}
sel |= {11, 15, 28, 282, 316, 317, 32, 33, 203, 204, 209, 210}
sel |= set(ids_of('Accessory', n=14))
# transitive closure of additional equipment
changed = True
while changed:
    changed = False
    for i in list(sel):
        for a in (eq.get(i, {}).get('additional_equipment_ids') or []):
            if a in eq and a not in sel:
                sel.add(a)
                changed = True
sel &= set(eq)
rows = [slim(eq[i]) for i in sorted(sel)]


def inv(id_, name, model, typ, **kw):
    r = {k: None for k in KEEP}
    r.update(id=id_, equipment_name=name, model_number=model, equipment_type=typ, provider='elephant',
             electrical_requirements={}, additional_equipment_ids=[], active=True)
    r.update(kw)
    return r


# SAMPLE rows the Retool code looks up by id/name but that are absent from the example catalog snapshot
rows += [
    inv(525, 'Branch Box Flare Joint Tee (R-454B)', 'MSDD-50AR2-E', 'Header', manufacturer='Mitsubishi', refrigerant='R-454B'),
    inv(526, 'Refrigerant Adder', None, 'Accessory', refrigerant='R-410A'),
    inv(527, 'Refrigerant Adder >3 IDU', None, 'Accessory', refrigerant='R-410A'),
    inv(528, 'Refrigerant Adder', None, 'Accessory', refrigerant='R-454B'),
    inv(529, 'Refrigerant Adder >3 IDU', None, 'Accessory', refrigerant='R-454B'),
    inv(563, 'Ducted System Commissioning Kit', 'DSCK-1', 'Accessory'),
]
rows.sort(key=lambda r: r['id'])


def cat(l):
    if l.get('category'):
        return l['category'].lower()
    n = l['name']
    s = l.get('subcategory')
    if s == 'circuit':
        return 'electrical'
    if 'Warranty' in n:
        return 'other'
    if any(w in n for w in ('Subpanel', 'Panel', 'Surge', 'Electrical')):
        return 'electrical'
    if any(w in n for w in ('HPWH', 'Water Heater', 'Plumbing', 'Leak')):
        return 'plumbing'
    if any(w in n for w in ('Kumo', 'Venting', 'Minisplit', 'Ducting', 'Refrigerant', 'A2L', 'MS Removal', 'Furnace', 'RTU', 'Swamp')):
        return 'hvac'
    return 'other'


# The example labor snapshot predates the names the Retool code looks up; align them (SAMPLE data).
RENAME = {16: 'Thermostatic Mixing Valve (Caleffi 521516AC/520516A, Taco 5004-H3-G)',
          17: 'Expansion Tank (Amtrol, Proflow, Zurn, Wilkins)', 40: 'Aeroseal (Supply Ductwork)'}
labs = []
for i in sorted(lab):
    l = lab[i]
    labs.append({'id': i, 'name': RENAME.get(i, l['name']), 'category': cat(l), 'subcategory': l.get('subcategory'),
                 'labor_hours': l.get('labor_hours', '0') or '0', 'circuit_amps': l.get('circuit_amps'),
                 'circuit_voltage': l.get('circuit_voltage')})


def dump(name, typ, arr):
    s = 'export const %s: %s[] = [\n' % (name, typ)
    s += ''.join('  ' + json.dumps(r, ensure_ascii=False, separators=(',', ':')) + ',\n' for r in arr)
    return s + '];\n'


out = ('// GENERATED by legacy/tools/gen_fixture_catalog.py from the Retool example payloads. SAMPLE DATA - do not edit by hand.\n'
       "import type { Equipment, Labor } from '../types';\n\n")
out += dump('CATALOG_EQUIPMENT', 'Equipment', rows) + '\n' + dump('CATALOG_LABOR', 'Labor', labs)
open(sys.argv[3], 'w', encoding='utf-8', newline='\n').write(out)
print(len(rows), 'equipment', len(labs), 'labor', dict(collections.Counter(r['equipment_type'] for r in rows)))

# usage: python -I extract_new.py   (run from D:\Toolshed\Projects\EE)
# Extracts (1) the two newly exported workflows and (2) the page-level logic of the Retool app
# (recalculation, margin, financing fee, incentive helpers) as plain files under legacy/.
# Source JSON is treated as untrusted data: it is only parsed, never executed.
import io, json, os, re, sys
from collections.abc import Mapping
from transit.reader import Reader

ROOT = os.getcwd()
OUT = os.path.join(ROOT, 'legacy')


def conv(o):
    if isinstance(o, Mapping):
        return {str(k): conv(v) for k, v in o.items()}
    if isinstance(o, (list, tuple, set, frozenset)):
        return [conv(v) for v in o]
    if isinstance(o, (str, int, float, bool)) or o is None:
        return o
    if hasattr(o, 'rep'):
        return conv(o.rep)
    return str(o)


def flat(x):
    if isinstance(x, Mapping):
        return x
    x = list(x)
    return {str(x[i]): x[i + 1] for i in range(0, len(x) - 1, 2)}


def dec(s):
    r = Reader('json')

    def H(f):
        class _H:
            @staticmethod
            def from_rep(x):
                return f(x)
        return _H
    for t in ('iM', 'iOM'):
        r.register(t, H(flat))
    r.register('iL', H(list))
    r.register('iR', H(lambda x: x))
    return conv(r.read(io.StringIO(s)))


def dump_app(app, outdir, only=None):
    os.makedirs(outdir, exist_ok=True)
    rows = []
    for k, p in app['v']['plugins'].items():
        pv = p['v']
        t = pv.get('template') if isinstance(pv.get('template'), dict) else {}
        q = t.get('query') or t.get('funcBody')
        if not q or (only and k not in only):
            continue
        ext = 'sql' if pv.get('subtype') == 'SqlQueryUnified' else 'js'
        with open(os.path.join(outdir, f'{k}.{ext}'), 'w', encoding='utf-8', newline='\n') as f:
            f.write(q)
        rows.append((k, pv.get('subtype'), len(q)))
    return rows


# ---- 1. new workflows
new = {
    'specIncentives-workflow - optimized.json': 'specIncentives',
    'projectCostBreakdown - workflow.json': 'projectCostBreakdown',
}
for fn, name in new.items():
    d = json.load(open(os.path.join(ROOT, fn), encoding='utf-8'))
    app = dec(d['templateData'])
    ex = d['triggerWebhooks'][0].get('exampleInputJSON', '')
    od = os.path.join(OUT, 'workflows', name)
    os.makedirs(od, exist_ok=True)
    open(os.path.join(od, '_exampleInput.json'), 'w', encoding='utf-8').write(ex)
    blocks = d['blockData']
    graph = [(b['pluginId'], b['blockType'], [e if isinstance(e, str) else e.get('id', str(e)) for e in (b.get('incomingOnSuccessEdges') or [])]) for b in blocks]
    open(os.path.join(od, '_graph.txt'), 'w', encoding='utf-8').write('\n'.join(f'{a} [{t}] <- {e}' for a, t, e in graph))
    rows = dump_app(app, od)
    print(name, rows)

# ---- 2. page-level logic
page = dec(json.load(open(os.path.join(ROOT, 'System Design.json'), encoding='utf-8'))['page']['data']['appState'])
mods = {k: dec(m['data']['appState']) for k, m in json.load(open(os.path.join(ROOT, 'System Design.json'), encoding='utf-8'))['modules'].items()}
os.makedirs(os.path.join(OUT, 'page-logic'), exist_ok=True)
rows = dump_app(page, os.path.join(OUT, 'page-logic'))
print('page-logic', len(rows))
for name, app in mods.items():
    if name in ('Proposal Module', 'Heat Hero Module'):
        dump_app(app, os.path.join(OUT, 'page-logic', 'modules', name.replace(' ', '_')))
json.dump({'page': page}, open(os.path.join(OUT, 'page-logic', '_page-decoded.json'), 'w', encoding='utf-8'), ensure_ascii=False)

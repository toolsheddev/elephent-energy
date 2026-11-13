# usage: python -I graph.py <dir containing the 4 workflow .json exports>   (prints block graph; JSON is treated as data only)
import json, sys, os
base = sys.argv[1]
for f in ["specSystemDetails - workflow - optimized.json", "priceLineItems- workflow.json", "specPermits - workflow.json", "proposalModuleWorkFlow.json"]:
    d = json.load(open(os.path.join(base, f), encoding='utf-8'))
    m = {b['uuid']: b.get('pluginId') for b in d['blockData']}
    print("==", f)
    for b in d['blockData']:
        print(' ', b.get('pluginId'), '(', b['blockType'], ')', '<-', [m.get(e, e) for e in b.get('incomingOnSuccessEdges', [])])

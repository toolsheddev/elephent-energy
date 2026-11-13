# usage: python -I extract.py <wf.json> <outdir>
import json,sys,os,re
src,out=sys.argv[1],sys.argv[2]
d=json.load(open(src,encoding='utf-8'))
names={"specSystemDetails - workflow - optimized.json":"specSystemDetails","priceLineItems- workflow.json":"priceLineItems","specPermits - workflow.json":"specPermits","proposalModuleWorkFlow.json":"proposalModule"}
readme=[]
for f,o in d.items():
    wf=names[f]; os.makedirs(os.path.join(out,wf),exist_ok=True)
    pl=o['app']['v']['plugins']
    ex=o['meta']['triggerWebhooks'][0].get('exampleInputJSON','')
    open(os.path.join(out,wf,'_exampleInput.json'),'w',encoding='utf-8').write(ex)
    for k,p in pl.items():
        pv=p['v']; t=pv.get('template') or {}
        q=t.get('query') if isinstance(t,dict) else None
        if not q: continue
        ext='sql' if pv.get('subtype')=='SqlQueryUnified' else 'js'
        open(os.path.join(out,wf,k+'.'+ext),'w',encoding='utf-8',newline='\n').write(q)

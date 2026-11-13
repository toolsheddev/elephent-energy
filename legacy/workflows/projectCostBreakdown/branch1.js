if (getLineitems.data.find(i => i.description?.includes ('HEAR')) && startTrigger.data.proposalToGenerate.length === 1) {
  executePathAtMostOnce('0')
}
else { executePathAtMostOnce('1') }
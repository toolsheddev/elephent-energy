function createIdObjectFromProposals(proposalsToGenerate) {
    let idObject = {};
    for (let i = 0; i < proposalsToGenerate.value.length; i++) {
        let item = proposalsToGenerate.value[i];
        idObject[item.id] = item;
    }
    return idObject;
}

let idObject = createIdObjectFromProposals(proposalsToGenerate);
console.log(idObject);
return idObject;

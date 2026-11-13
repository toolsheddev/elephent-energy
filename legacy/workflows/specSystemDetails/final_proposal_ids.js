const existingIds = parse_proposals.data.existingIds || [];
const loopOutput = create_new_proposals_loop.data; // This holds [[{"id":10470}]]

let newIds = [];

// Safely unpack the nested arrays from the loop
if (loopOutput && Array.isArray(loopOutput)) {
    loopOutput.forEach(iteration => {
        // 'iteration' is [{"id": 10470}]
        if (iteration && iteration.length > 0 && iteration[0].id) {
            newIds.push(iteration[0].id);
        }
    });
}

console.log("Existing IDs:", existingIds);
console.log("Newly Created Proposal IDs:", newIds);

// Combine the original IDs with the brand new ones!
return [...existingIds, ...newIds];
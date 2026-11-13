console.log('collectBranchBoxAssignments data:', collectBranchBoxAssignments.data);
console.log('AHU assignments:', collectBranchBoxAssignments.data?.ahus);
console.log('MS assignments:', collectBranchBoxAssignments.data?.miniSplits);

return {
  raw: collectBranchBoxAssignments.data,
  ahuKeys: CostAHUList3.rowKeys,
  msKeys: CostMsList3.rowKeys,
  test: CostAHUList3.rowKeys.map((key, index) => ({
    key: key,
    index: index,
    assignment: collectBranchBoxAssignments.data?.ahus?.[index]?.assignedTo,
    dropdownValue: AHUBranchBoxAssignment[key]?.value
  }))
};
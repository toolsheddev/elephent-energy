const generateReturn = () => {
    const status = () => {
      try {
        return 200
      } catch {
        return 200
      }
    }
  const body = () => {
    try {
      return {
  'optionNames': getOptionNames.data,
  'projectCostBreakDown' : formProjectCostBreakDownTable.data,
  'designOptions' : formDesignOptionsTable.data,
  'hvacOnly': hvacOnly.data,
  'hearBreakdown': hearBreakdown.data ? hearBreakdown.data : null

}
    } catch {
      return {'error': true, 'message': 'There was a problem parsing the JSON body of response1'}
    }
  }
  return {status: status(), body: body() }
  }
  return generateReturn()
  
const generateReturn = () => {
    const status = () => {
      try {
        return 500
      } catch {
        return 200
      }
    }
  const body = () => {
    try {
      return {
  "error": workflowContext.currentRun.error
}

    } catch {
      return {'error': true, 'message': 'There was a problem parsing the JSON body of catechErrors'}
    }
  }
  return {status: status(), body: body() }
  }
  return generateReturn()
  
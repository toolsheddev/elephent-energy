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
  result : priceLineItems.data
}
    } catch {
      return {'error': true, 'message': 'There was a problem parsing the JSON body of response1'}
    }
  }
  return {status: status(), body: body() }
  }
  return generateReturn()
  
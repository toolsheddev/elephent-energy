
  const evalStartTriggerBlock = () => {
    const getExampleInputJSON = () => {
      try {
        return {"proposalToGenerate":[15752],"optionalSlides":[],"electricalBreakout":false}
      } catch {
        return { error: true, message: 'Error parsing example input JSON' }
      }
    }
    const getExamplePathParams = () => {
      try {
        return {}
      } catch {
        return { error: true, message: 'Error parsing example path params' }
      }
    }
    const getExampleHeaders = () => {
      try {
        return {}
      } catch {
        return { error: true, message: 'Error parsing example headers' }
      }
    }
    return {
      _retool_exampleInputJSON: getExampleInputJSON(),
      _retool_exampleHeaders: getExampleHeaders(),
      _retool_examplePathParams: getExamplePathParams(),
    }
  }
  return evalStartTriggerBlock()
  
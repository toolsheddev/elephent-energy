
  const evalStartTriggerBlock = () => {
    const getExampleInputJSON = () => {
      try {
        return {"date":"7/14/2026","filename":"Joe.Herrick_Proposal.pdf","proposalToGenerate":[12522],"customerName":"Joe Herrick","customerAddress":"924 Grouse Circle Fort Collins, CO 80524","customerEmail":"joecubs@gmail.com","hca":"Allison Toth","hcaEmail":"allison@elephantenergy.com","hcaPhone":"(720) 608-3856","houseState":"CO","proposalDate":"2026-07-14T16:46:52-0600","systemMockUps":false,"systemMockUpImages":[],"amountDue":6958,"depositAmount":3479}
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
  
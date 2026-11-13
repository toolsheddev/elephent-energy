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
   proposalModuleContent :transformProposalGenerationData.data,
  pdfToExport : APITemplate.data.download_url
}
    } catch {
      return {'error': true, 'message': 'There was a problem parsing the JSON body of proposalModuleWorkflowResponse'}
    }
  }
  return {status: status(), body: body() }
  }
  return generateReturn()
  
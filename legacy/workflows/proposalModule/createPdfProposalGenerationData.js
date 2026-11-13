let proposalAppModule = {
  proposalAppHeader: {
    elephantEnergyImage: 'https://elephantenergy.retool.com/api/file/a3538d5f-96e2-41da-b19d-e7d5e8e73c8a',
    elephantEnergyLabel: "Elephant Energy"
  },
  hcpHomePage: {
    title: startTrigger.data.indicativeProposal === 'true'
      ? "Indicative Home Comfort Proposal" 
      : "Home Comfort Proposal",
    ...(startTrigger.data.indicativeProposal === 'true' && {
      subTitle: '*Pricing is subject to change pending an onsite consultation'
    }),
    preparedFor: {
      customerName: startTrigger.data.customerName || "N/A",
      customerAddress: startTrigger.data.customerAddress || "N/A",
      customerEmail: startTrigger.data.customerEmail || "N/A",
      customerPhone: startTrigger.data.customerPhone || "N/A"
    },
    preparedBy: {
      companyName: startTrigger.data.hca || "N/A",
      contactEmail: startTrigger.data.hcaEmail || "N/A",
      contactPhone: startTrigger.data.hcaPhone || "N/A"
    },
    date: startTrigger.data.proposalDate,
    footerImage: "https://elephantenergy.retool.com/api/file/6b90ed63-1678-411e-9872-8790328a6392"
  },
  theElephantWay: {
    theElephantWayImage: "https://elephantenergy.retool.com/api/file/afee4384-7c42-484d-8e09-3df1047301e7"
  },
  ...(startTrigger.data.houseState === 'CO' && {
    mapCo: {
      mapCoImage: "https://elephantenergy.retool.com/api/file/3b3a3844-9106-4273-b1e0-3505097af92e"
    }
  }),
  ...(startTrigger.data.houseState === 'MA' && {
    mapMa: {
      mapMaImage: "https://elephantenergy.retool.com/api/file/3b3a3844-9106-4273-b1e0-3505097af92e"
    }
  })
};

return proposalAppModule;
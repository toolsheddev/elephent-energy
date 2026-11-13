return {
  ...createPdfProposalGenerationData.data, 
  projectCostBreakDown: {
    title: "Project Cost Breakdown",
    data: projectCostBreakDownAndDesgnOptions.data.projectCostBreakDown
  },
  designOptions: {
    title: "System Design for Consideration",
    data: projectCostBreakDownAndDesgnOptions.data.designOptions
  },
  ...(startTrigger.data.hddInfo?.length > 0 && 
     startTrigger.data.heatPump === 'true' && 
     startTrigger.data.hddSlides === 'true'
    ? { 
        sizeSystemForHome: {
          title: "Sizing a System for Your Unique Home",
          subtitle: "We design & size your system to ensure that during the coldest and the warmest days of the year, you can maintain comfortable temperatures inside.",
          sizeSystemForHomeTable: startTrigger.data.hddInfo,
          sizeSystemForHomeImage: startTrigger.data.hddGraph
        } 
      } 
    : {}),
  ...(startTrigger.data.heatPump === 'true' && 
     startTrigger.data.hddSlides === 'true'
    ? { 
        hpCostCarbon: {
          title: "Heat Pump: Cost and Carbon Implications",
          subtitle: "Heat Pumps will reduce your annual heating bills and carbon emissions by using technology that is significantly more efficient.",
          image: "https://elephantenergy.retool.com/api/file/6b90ed63-1678-411e-9872-8790328a6392",
          inputs: {
            estimatedSavings: {
              label: "Estimated 15 Year Savings of:",
              value: startTrigger.data.estmSavings || "$0"
            },
            carbonSavings: {
              label: "Carbon Savings",
              value: startTrigger.data.carbonSavings || "0 Tons"
            },
            percentReduction: {
              label: "% Reduction",
              value: startTrigger.data.reduction || "0%"
            }
          }
        }
      } 
    : {}),
  ...(startTrigger.data.waterHeaterSavings === true
    ? {
        hpwhCostCarbon: {
          title: "Water Heater: Cost & Carbon Implications",
          subtitle: "A Heat Pump Water Heater will reduce your annual water heating bills and carbon emissions by using technology that is significantly more efficient.",
          image: "https://elephantenergy.retool.com/api/file/85ea0988-739f-441a-8bd7-e8085ebd1da3",
          inputs: {
            estimatedSavings: {
              label: "Estimated 12 Year Savings of:",
              value: startTrigger.data.estmSavings2 || "$0"
            },
            carbonSavings: {
              label: "Carbon Savings",
              value: startTrigger.data.carbonSavings2 || "0"
            },
            percentReduction: {
              label: "% Reduction",
              value: startTrigger.data.reduction2 || "0%"
            }
          }
        }
      }
    : {}),
  ...(startTrigger.data.hpwh === 1 &&
      lineItems.data.some(item => item.description.includes('AO Smith 50'))
    ? { aoSmith50gal: { image: "https://elephantenergy.retool.com/api/file/739a3d06-113c-4cd3-9b8f-f75911d1218b" } }
    : {}),
  ...(startTrigger.data.hpwh === 1 &&
     lineItems.data.some(item => item.description.includes('AO Smith 66'))
    ? { aoSmith66gal: { image: "https://elephantenergy.retool.com/api/file/2f1dd5c0-db14-4f9a-a207-c87efd78a048" } }
    : {}),
  ...(startTrigger.data.hpwh === 1 &&
     lineItems.data.some(item => item.description.includes('AO Smith 80'))
    ? { aoSmith80gal: { image: "https://elephantenergy.retool.com/api/file/562362a4-7ff9-483b-868a-c959ee667d54" } }
    : {}),
  ...(startTrigger.data.hpwh >= 2 &&
     lineItems.data.some(item => item.description.includes('AO Smith'))
    ? { aoSmithSizeOptions: { image: "https://elephantenergy.retool.com/api/file/fa6da3b2-40c7-4045-ba04-873f5e1c43a7" } }
    : {}),
  ...(startTrigger.data.energyEfficiency === 'true'
  ? {
      energyEfficiency: {
        title: "Upgrades for Your Home - Energy Efficiency",
        inputs: {
          atticSqFt: {
            label: "Attic Sq Ft",
            value: startTrigger.data.atticSqFt
          },
          atticPrice: {
            label: "Attic Price",
            value: startTrigger.data.atticPrice
          },
          crawlSpaceSqFt: {
            label: "Crawl Space Sq Ft",
            value: startTrigger.data.crawlSpaceSqFt
          },
          crawlSpacePrice: {
            label: "Crawl Space Price",
            value: startTrigger.data.crawlSpacePrice
          },
          airSealingValue: {
            label: "Air Sealing Value",
            value: startTrigger.data.airSealingValue
          },
          airSealingPrice: {
            label: "Air Sealing Price",
            value: startTrigger.data.airSealingPrice
          }
        },
        data: startTrigger.data.energyEfficiencyTable
      }
    }
  : {}),
  ...(startTrigger.data.hpwh === 1 &&
     lineItems.data.some(item => item.description.includes('Rheem 50'))
    ? { rheem50gal: { image: "https://elephantenergy.retool.com/api/file/ed4ddfbd-9d68-4358-b33f-30b72428fc4b" } }
    : {}),
  ...(startTrigger.data.hpwh === 1 &&
     lineItems.data.some(item => item.description.includes('Rheem 65'))
    ? { rheem65gal: { image: "https://elephantenergy.retool.com/api/file/54d6e28f-698d-4cc3-aac7-99ba43b7ef89" } }
    : {}),
  ...(startTrigger.data.hpwh === 1 &&
     lineItems.data.some(item => item.description.includes('Rheem 40'))
    ? { rheem40gal: { image: "https://elephantenergy.retool.com/api/file/859d7a77-6965-4372-9f61-83374a2472a6" } }
    : {}),
  ...(startTrigger.data.hpwh === 1 &&
     lineItems.data.some(item => item.description.includes('Rheem 80'))
    ? { rheem80gal: { image: "https://elephantenergy.retool.com/api/file/596d7d54-6abd-4c6e-912c-6ab66e12dcab" } }
    : {}),
  ...(startTrigger.data.hpwh >= 2 &&
     lineItems.data.some(item => item.description.includes('Rheem'))
    ? { rheemSizeOptions: { image: "https://elephantenergy.retool.com/api/file/9d4a9662-dcf7-47f5-b2d6-8f8c4711c101" } }
    : {}),
  ...(startTrigger.data.hpwh === 1 &&
     lineItems.data.some(item => item.description.includes('RUUD 80'))
    ? { ruud80gal: { image: "https://elephantenergy.retool.com/api/file/4103143f-a3c6-4839-8277-dbd2afcf6cb1" } }
    : {}),
  ...(startTrigger.data.hpwh === 1 &&
     lineItems.data.some(item => item.description.includes('RUUD 65'))
    ? { ruud65gal: { image: "https://elephantenergy.retool.com/api/file/6620432f-2f15-4d3f-8360-ecd95921d533" } }
    : {}),
  ...(startTrigger.data.hpwh === 1 &&
     lineItems.data.some(item => item.description.includes('RUUD 50'))
    ? { ruud50gal: { image: "https://elephantenergy.retool.com/api/file/c424afe8-7eab-4e81-957e-168ff804b729" } }
    : {}),
  ...(startTrigger.data.hpwh >= 2 &&
     lineItems.data.some(item => item.description.includes('RUUD'))
    ? { ruudSizeOptions: { image: "https://elephantenergy.retool.com/api/file/a1b3697a-1e4e-44f2-8abb-b086e3d7e208" } }
    : {}),
  ...(startTrigger.data.panelUpgrades === 'true'
    ? { panelUpgrades: { image: "https://elephantenergy.retool.com/api/file/2b8d9d21-3246-4504-a6c7-6249d8d583f0" } }
    : {}),
  ...(startTrigger.data.smartAC === 'true'
    ? { smartAC: { image: "https://elephantenergy.retool.com/api/file/15da4103-2399-452e-9c59-add03b6d04e8" } }
    : {}),
  ...(startTrigger.data.smartAC === 'true'
    ? { smartMonitoring: { image: "https://elephantenergy.retool.com/api/file/d3183813-995f-4f7c-9da6-d13b5db6f604" } }
    : {}),
  ...(startTrigger.data.heatStrip === 'true'
    ? { heatStrip: { image: "https://elephantenergy.retool.com/api/file/660650b7-3fea-4926-a300-a1b96b36c4d3" } }
    : {}),
  installIncludes: { image: "https://elephantenergy.retool.com/api/file/71cf80c4-efdf-4101-aa05-3068190bc89b" },
   ...(startTrigger.data.maintenanceSlide === 'true'
    ? {
        maintenancePlan: {
          "title": "Protect your Investment: Maintenance & Extended Labor Warranty Packages",
          "table": {
            "data": startTrigger.data.maintenanceTable
          },
          "text": "*Homeowner must keep continuous coverage with the Platinum plan for the labor warranty to remain active, up to 12 years from installation",
          "image1": "https://elephantenergy.retool.com/api/file/f1fdcc3b-9dbd-4e14-9cad-082995afe85e",
          "image2": "https://elephantenergy.retool.com/api/file/ccf3ad2f-49eb-4237-a7c1-e8ac3a3f9161"
        }
      }
    : {}),
  qualityInstallations: {
    "image": "https://elephantenergy.retool.com/api/file/b737825c-2998-45f4-b6d0-3496f92e977e"
  },
  wte: {
    "image": "https://elephantenergy.retool.com/api/file/ebf926a6-f68b-46e7-9c04-e079f8ca1135"
  },
  estmLeadTime: {
    "estimatedLeadTime": startTrigger.data.estmLeadTime
  },
  invoiceInfo: {
    "image": "https://elephantenergy.retool.com/api/file/8d2d91e6-92d5-4888-8e10-75271a0cdba0"
  },
  ...(startTrigger.data.renuLoan === 'true'
    ? { renuFinancing: { image: "https://elephantenergy.retool.com/api/file/bc3d59ab-1d04-40cc-94f7-0ce17c71b548" } }
    : {}),
  
  ...(startTrigger.data.heatLoan === 'true'
    ? { heatFinancing: { image: "https://elephantenergy.retool.com/api/file/803f24ec-ad18-47d7-af58-c35f531db9f0" } }
    : {}),
  
  ...(startTrigger.data.houseState === 'MA'
    ? { massSaveRebate: { image: "https://elephantenergy.retool.com/api/file/361ca15b-62dc-4e24-ae0a-1deeea1064d4" } }
    : {}),
   ...(startTrigger.data.systemMockUps === true
  ? {
      systemMockUps: {
        title: "System Mockups",
        image: "https://elephantenergy.retool.com/api/file/3f87629b-661b-49c7-8434-aaa24deb2548",
        ...(startTrigger.data.systemMockUpImages.length > 0
          ? {
              systemMockUpImages: Object.fromEntries(
                startTrigger.data.systemMockUpImages.map((image, index) => [
                  `image ${index}`,
                  `data:${image.type};base64,${image.base64Data}`,
                ])
              ),
            }
          : {}),
      },
    }
  : {}),
  whyElectrify : {
    image : "https://elephantenergy.retool.com/api/file/91c4a0ae-a81d-4e11-b258-dbcd50ec2af2"
}
};

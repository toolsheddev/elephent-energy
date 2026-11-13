import type { Equipment, EngineError, Failure, LineItem, RefData, System } from '../types';
import { indexById, toEngineError } from '../util';

/** PDF template id used by the original APITemplate REST block (`v2/create-pdf?template_id=...`). */
export const PDF_TEMPLATE_ID = 'd4577b23446d2d54';

/** Payload posted to the proposal workflow (`startTrigger.data`). Unlisted keys pass through untouched. */
export interface ProposalWorkflowInput {
  date?: string;
  filename?: string;
  proposalToGenerate: number[];
  customerName?: string;
  customerAddress?: string;
  customerEmail?: string;
  customerPhone?: string;
  hca?: string;
  hcaEmail?: string;
  hcaPhone?: string;
  houseState?: string;
  proposalDate?: string;
  systemMockUps?: boolean;
  systemMockUpImages?: Array<{ type: string; base64Data: string }>;
  amountDue?: number | string;
  depositAmount?: number | string;
  indicativeProposal?: 'true' | 'false' | string;
  /** Line items posted by the UI (used by the per-proposal fan-type scan); DB rows are used when omitted. */
  line_items?: LineItem[];
  hpwh?: number;
  hddInfo?: unknown[];
  hddGraph?: unknown;
  hddSlides?: 'true' | 'false' | string;
  heatPump?: 'true' | 'false' | string;
  waterHeaterSavings?: boolean;
  energyEfficiency?: 'true' | 'false' | string;
  maintenanceSlide?: 'true' | 'false' | string;
  [k: string]: unknown;
}

export interface OptionName {
  id: number;
  nickname: string | null;
}

export interface ProposalDbData {
  /** optionNames: proposals_new (id, nickname) for proposalToGenerate ORDER BY id. */
  optionNames: OptionName[];
  /** systems_new rows for those proposals (any status; filtered here like new_systems.sql). */
  systems: System[];
  /** line_items_new rows for those systems (filtered here like lineItems.sql). */
  lineItems: LineItem[];
  /** Rows of hearProjectBreakdown / nonHearRebateBreakdown / hearRebateBreakdown SQL. */
  hearProjectBreakdown: Array<{ total_cost?: number | string; [k: string]: unknown }>;
  nonHearRebateBreakdown: Array<{ incentive_amount?: number | string; [k: string]: unknown }>;
  hearRebateBreakdown: Array<{ amount?: number | string; [k: string]: unknown }>;
  /** Output of the `projectCostBreakDownAndDesgnOptions` sub-workflow (NOT ported): supplied by the caller. */
  projectCostBreakDownAndDesignOptions: { projectCostBreakDown: any[]; designOptions: any[][] };
  /** projects_new.rmi_calculator_results rows (rmiCalcResults SQL). */
  rmiCalcResults?: Array<{ rmi_calculator_results: any }>;
  /** Output of reduceSystemMockup (resized images; image processing is I/O and is not ported). */
  reducedSystemMockups?: Record<string, string>;
}

export interface AdditionalInfo {
  coMap: 'true' | 'false';
  maMap: 'true' | 'false';
  serviceAgreementCO: 'true' | 'false';
  serviceAgreementMA: 'true' | 'false';
  serviceAgreementCA: 'true' | 'false';
  COInvoice: 'true' | 'false';
  MAInvoice: 'true' | 'false';
  CAInvoice: 'true' | 'false';
  coAmountDue: number;
  coDepositAmount: number;
  caAmountDue: number;
  caDepositAmount: number;
  maAmountDue: number;
  maDepositAmount: number;
}

/** `addtlInfo` block: state-specific flags & amounts (parseInt of amountDue/depositAmount). */
export function buildAdditionalInfo(input: Pick<ProposalWorkflowInput, 'houseState' | 'amountDue' | 'depositAmount'>): AdditionalInfo {
  const state = input.houseState;
  const data: AdditionalInfo = {
    coMap: 'false', maMap: 'false', serviceAgreementCO: 'false', serviceAgreementMA: 'false', serviceAgreementCA: 'false',
    COInvoice: 'false', MAInvoice: 'false', CAInvoice: 'false',
    coAmountDue: 0, coDepositAmount: 0, caAmountDue: 0, caDepositAmount: 0, maAmountDue: 0, maDepositAmount: 0,
  };
  const due = parseInt(String(input.amountDue));
  const dep = parseInt(String(input.depositAmount));
  if (state === 'CA') {
    data.CAInvoice = 'true';
    data.serviceAgreementCA = 'true';
    data.caAmountDue = due;
    data.caDepositAmount = dep;
  } else if (state === 'CO') {
    data.COInvoice = 'true';
    data.serviceAgreementCO = 'true';
    data.coMap = 'true';
    data.coAmountDue = due;
    data.coDepositAmount = dep;
  } else if (state === 'MA') {
    data.MAInvoice = 'true';
    data.serviceAgreementMA = 'true';
    data.maMap = 'true';
    data.maAmountDue = due;
    data.maDepositAmount = dep;
  }
  return data;
}

export interface ProposalDetail {
  miniSplitFound: boolean;
  condenserFanType: 'single' | 'dual' | 'both' | null;
  ahuFound: boolean;
}

const MINISPLIT_TYPES = ['ceiling cassette', 'floor head', 'horizontal-ducted head', 'wall head'];

/**
 * `proposal_details` block: for the first three proposals (ordered by id) scan the equipment line items of
 * their active systems for mini-split heads, AHUs and the condenser fan type (single / dual / both).
 * Missing proposals yield `{ false, null, false }`.
 */
export function buildProposalDetails(
  optionNames: OptionName[],
  systems: System[],
  lineItems: LineItem[],
  equipment: Record<number, Equipment>,
): Record<'proposal1_details' | 'proposal2_details' | 'proposal3_details', ProposalDetail> {
  const proposals: Array<number | null> = optionNames.map((o) => o.id);
  while (proposals.length < 3) proposals.push(null);
  const activeSystems = systems.filter((s) => s.system_status != null && ['active - from change order', 'proposed', 'active'].includes(s.system_status));

  const result: any = {};
  proposals.slice(0, 3).forEach((proposal, index) => {
    let foundMiniSplit = false;
    let fanTypeResult: ProposalDetail['condenserFanType'] = null;
    let foundAHU = false;
    if (proposal) {
      const proposalSystems = activeSystems.filter((s) => s.proposal_id === proposal);
      outer: for (const system of proposalSystems) {
        const items = lineItems.filter((i) => i.system_id === system.id && i.line_item_type === 'equipment');
        for (const item of items) {
          const details = equipment[item.equipment_id as number];
          const equipmentType = details?.equipment_type?.toLowerCase();
          const fanType = details?.fan_type?.toLowerCase();
          if (equipmentType && MINISPLIT_TYPES.includes(equipmentType)) foundMiniSplit = true;
          if (equipmentType === 'condenser') {
            if (fanType === 'single') fanTypeResult = fanTypeResult === 'dual' ? 'both' : 'single';
            else if (fanType === 'dual') fanTypeResult = fanTypeResult === 'single' ? 'both' : 'dual';
          }
          if (equipmentType === 'ahu') foundAHU = true;
          if (foundMiniSplit && fanTypeResult === 'both' && foundAHU) break;
        }
        if (foundMiniSplit && fanTypeResult === 'both' && foundAHU) break outer;
      }
    }
    result[`proposal${index + 1}_details`] = {
      miniSplitFound: proposal ? foundMiniSplit : false,
      condenserFanType: proposal ? fanTypeResult : null,
      ahuFound: proposal ? foundAHU : false,
    };
  });
  return result;
}

export interface HearTotals {
  customer_total: number;
  non_ira_total: number;
  hear_total: number;
  final_customer_cost: number;
  amount_due: number;
}

/**
 * `hearTotals` block. `amount_due` is parsed from the "Out-of-Pocket Cost" row of the cost breakdown
 * (`<b>Out-of-Pocket Cost (Amount paid to Elephant or Financed)</b>`): the original read the first element of the
 * matching row (`row[0]`); here `row.value`, `row[0]` or `row.amount` are accepted (the breakdown sub-workflow was not
 * available). Throws if the row cannot be found.
 */
export function buildHearTotals(
  projectCosts: ProposalDbData['hearProjectBreakdown'],
  nonIraRebates: ProposalDbData['nonHearRebateBreakdown'],
  hearRebates: ProposalDbData['hearRebateBreakdown'],
  projectCostBreakdown: any[],
): HearTotals[] {
  const sumField = (rows: any[] | undefined, field: string) => (rows || []).reduce((sum, row) => sum + Number(row[field] || 0), 0);
  const customerTotal = sumField(projectCosts, 'total_cost');
  const nonIraTotal = sumField(nonIraRebates, 'incentive_amount');
  const hearTotal = sumField(hearRebates, 'amount');
  const finalCustomerCost = customerTotal - nonIraTotal - hearTotal;

  const label = '<b>Out-of-Pocket Cost (Amount paid to Elephant or Financed)</b>';
  const row = (projectCostBreakdown || []).filter((i) => i && i.label === label)[0];
  if (!row) throw new Error('hearTotals: Out-of-Pocket Cost row not found in projectCostBreakDown');
  const raw = row[0] ?? row.value ?? row.amount;
  const removeTags = String(raw).replace(/<\/?b>/g, '').trim();
  const amountDue = Number(removeTags.replace(/[^0-9.-]/g, ''));

  return [{ customer_total: customerTotal, non_ira_total: nonIraTotal, hear_total: hearTotal, final_customer_cost: finalCustomerCost, amount_due: amountDue }];
}

const IMG = (id: string) => `https://elephantenergy.retool.com/api/file/${id}`;

/**
 * `createPdfProposalGenerationData` + `transformProposalGenerationData`: the slide/section content object
 * ("proposalModuleContent") the UI renders and the PDF service consumes. Image URLs are the original Retool-hosted files.
 */
export function buildProposalContent(
  t: ProposalWorkflowInput,
  lineItems: LineItem[],
  costAndDesign: ProposalDbData['projectCostBreakDownAndDesignOptions'],
): Record<string, any> {
  const has = (s: string) => lineItems.some((item) => (item.description ?? '').includes(s));
  const hpwh = t.hpwh as number;
  const cond = (c: unknown, v: Record<string, unknown>) => (c ? v : {});

  const base: Record<string, any> = {
    proposalAppHeader: { elephantEnergyImage: IMG('a3538d5f-96e2-41da-b19d-e7d5e8e73c8a'), elephantEnergyLabel: 'Elephant Energy' },
    hcpHomePage: {
      title: t.indicativeProposal === 'true' ? 'Indicative Home Comfort Proposal' : 'Home Comfort Proposal',
      ...(t.indicativeProposal === 'true' && { subTitle: '*Pricing is subject to change pending an onsite consultation' }),
      preparedFor: {
        customerName: t.customerName || 'N/A',
        customerAddress: t.customerAddress || 'N/A',
        customerEmail: t.customerEmail || 'N/A',
        customerPhone: t.customerPhone || 'N/A',
      },
      preparedBy: { companyName: t.hca || 'N/A', contactEmail: t.hcaEmail || 'N/A', contactPhone: t.hcaPhone || 'N/A' },
      date: t.proposalDate,
      footerImage: IMG('6b90ed63-1678-411e-9872-8790328a6392'),
    },
    theElephantWay: { theElephantWayImage: IMG('afee4384-7c42-484d-8e09-3df1047301e7') },
    ...(t.houseState === 'CO' && { mapCo: { mapCoImage: IMG('3b3a3844-9106-4273-b1e0-3505097af92e') } }),
    ...(t.houseState === 'MA' && { mapMa: { mapMaImage: IMG('3b3a3844-9106-4273-b1e0-3505097af92e') } }),
  };

  const hddSlides = t.heatPump === 'true' && t.hddSlides === 'true';
  return {
    ...base,
    projectCostBreakDown: { title: 'Project Cost Breakdown', data: costAndDesign.projectCostBreakDown },
    designOptions: { title: 'System Design for Consideration', data: costAndDesign.designOptions },
    ...((t.hddInfo?.length ?? 0) > 0 && hddSlides
      ? {
          sizeSystemForHome: {
            title: 'Sizing a System for Your Unique Home',
            subtitle:
              'We design & size your system to ensure that during the coldest and the warmest days of the year, you can maintain comfortable temperatures inside.',
            sizeSystemForHomeTable: t.hddInfo,
            sizeSystemForHomeImage: t.hddGraph,
          },
        }
      : {}),
    ...(hddSlides
      ? {
          hpCostCarbon: {
            title: 'Heat Pump: Cost and Carbon Implications',
            subtitle: 'Heat Pumps will reduce your annual heating bills and carbon emissions by using technology that is significantly more efficient.',
            image: IMG('6b90ed63-1678-411e-9872-8790328a6392'),
            inputs: {
              estimatedSavings: { label: 'Estimated 15 Year Savings of:', value: t.estmSavings || '$0' },
              carbonSavings: { label: 'Carbon Savings', value: t.carbonSavings || '0 Tons' },
              percentReduction: { label: '% Reduction', value: t.reduction || '0%' },
            },
          },
        }
      : {}),
    ...(t.waterHeaterSavings === true
      ? {
          hpwhCostCarbon: {
            title: 'Water Heater: Cost & Carbon Implications',
            subtitle:
              'A Heat Pump Water Heater will reduce your annual water heating bills and carbon emissions by using technology that is significantly more efficient.',
            image: IMG('85ea0988-739f-441a-8bd7-e8085ebd1da3'),
            inputs: {
              estimatedSavings: { label: 'Estimated 12 Year Savings of:', value: t.estmSavings2 || '$0' },
              carbonSavings: { label: 'Carbon Savings', value: t.carbonSavings2 || '0' },
              percentReduction: { label: '% Reduction', value: t.reduction2 || '0%' },
            },
          },
        }
      : {}),
    ...cond(hpwh === 1 && has('AO Smith 50'), { aoSmith50gal: { image: IMG('739a3d06-113c-4cd3-9b8f-f75911d1218b') } }),
    ...cond(hpwh === 1 && has('AO Smith 66'), { aoSmith66gal: { image: IMG('2f1dd5c0-db14-4f9a-a207-c87efd78a048') } }),
    ...cond(hpwh === 1 && has('AO Smith 80'), { aoSmith80gal: { image: IMG('562362a4-7ff9-483b-868a-c959ee667d54') } }),
    ...cond(hpwh >= 2 && has('AO Smith'), { aoSmithSizeOptions: { image: IMG('fa6da3b2-40c7-4045-ba04-873f5e1c43a7') } }),
    ...(t.energyEfficiency === 'true'
      ? {
          energyEfficiency: {
            title: 'Upgrades for Your Home - Energy Efficiency',
            inputs: {
              atticSqFt: { label: 'Attic Sq Ft', value: t.atticSqFt },
              atticPrice: { label: 'Attic Price', value: t.atticPrice },
              crawlSpaceSqFt: { label: 'Crawl Space Sq Ft', value: t.crawlSpaceSqFt },
              crawlSpacePrice: { label: 'Crawl Space Price', value: t.crawlSpacePrice },
              airSealingValue: { label: 'Air Sealing Value', value: t.airSealingValue },
              airSealingPrice: { label: 'Air Sealing Price', value: t.airSealingPrice },
            },
            data: t.energyEfficiencyTable,
          },
        }
      : {}),
    ...cond(hpwh === 1 && has('Rheem 50'), { rheem50gal: { image: IMG('ed4ddfbd-9d68-4358-b33f-30b72428fc4b') } }),
    ...cond(hpwh === 1 && has('Rheem 65'), { rheem65gal: { image: IMG('54d6e28f-698d-4cc3-aac7-99ba43b7ef89') } }),
    ...cond(hpwh === 1 && has('Rheem 40'), { rheem40gal: { image: IMG('859d7a77-6965-4372-9f61-83374a2472a6') } }),
    ...cond(hpwh === 1 && has('Rheem 80'), { rheem80gal: { image: IMG('596d7d54-6abd-4c6e-912c-6ab66e12dcab') } }),
    ...cond(hpwh >= 2 && has('Rheem'), { rheemSizeOptions: { image: IMG('9d4a9662-dcf7-47f5-b2d6-8f8c4711c101') } }),
    ...cond(hpwh === 1 && has('RUUD 80'), { ruud80gal: { image: IMG('4103143f-a3c6-4839-8277-dbd2afcf6cb1') } }),
    ...cond(hpwh === 1 && has('RUUD 65'), { ruud65gal: { image: IMG('6620432f-2f15-4d3f-8360-ecd95921d533') } }),
    ...cond(hpwh === 1 && has('RUUD 50'), { ruud50gal: { image: IMG('c424afe8-7eab-4e81-957e-168ff804b729') } }),
    ...cond(hpwh >= 2 && has('RUUD'), { ruudSizeOptions: { image: IMG('a1b3697a-1e4e-44f2-8abb-b086e3d7e208') } }),
    ...cond(t.panelUpgrades === 'true', { panelUpgrades: { image: IMG('2b8d9d21-3246-4504-a6c7-6249d8d583f0') } }),
    ...cond(t.smartAC === 'true', { smartAC: { image: IMG('15da4103-2399-452e-9c59-add03b6d04e8') } }),
    ...cond(t.smartAC === 'true', { smartMonitoring: { image: IMG('d3183813-995f-4f7c-9da6-d13b5db6f604') } }),
    ...cond(t.heatStrip === 'true', { heatStrip: { image: IMG('660650b7-3fea-4926-a300-a1b96b36c4d3') } }),
    installIncludes: { image: IMG('71cf80c4-efdf-4101-aa05-3068190bc89b') },
    ...(t.maintenanceSlide === 'true'
      ? {
          maintenancePlan: {
            title: 'Protect your Investment: Maintenance & Extended Labor Warranty Packages',
            table: { data: t.maintenanceTable },
            text: '*Homeowner must keep continuous coverage with the Platinum plan for the labor warranty to remain active, up to 12 years from installation',
            image1: IMG('f1fdcc3b-9dbd-4e14-9cad-082995afe85e'),
            image2: IMG('ccf3ad2f-49eb-4237-a7c1-e8ac3a3f9161'),
          },
        }
      : {}),
    qualityInstallations: { image: IMG('b737825c-2998-45f4-b6d0-3496f92e977e') },
    wte: { image: IMG('ebf926a6-f68b-46e7-9c04-e079f8ca1135') },
    estmLeadTime: { estimatedLeadTime: t.estmLeadTime },
    invoiceInfo: { image: IMG('8d2d91e6-92d5-4888-8e10-75271a0cdba0') },
    ...cond(t.renuLoan === 'true', { renuFinancing: { image: IMG('bc3d59ab-1d04-40cc-94f7-0ce17c71b548') } }),
    ...cond(t.heatLoan === 'true', { heatFinancing: { image: IMG('803f24ec-ad18-47d7-af58-c35f531db9f0') } }),
    ...cond(t.houseState === 'MA', { massSaveRebate: { image: IMG('361ca15b-62dc-4e24-ae0a-1deeea1064d4') } }),
    ...(t.systemMockUps === true
      ? {
          systemMockUps: {
            title: 'System Mockups',
            image: IMG('3f87629b-661b-49c7-8434-aaa24deb2548'),
            ...((t.systemMockUpImages?.length ?? 0) > 0
              ? {
                  systemMockUpImages: Object.fromEntries(
                    (t.systemMockUpImages ?? []).map((image, index) => [`image ${index}`, `data:${image.type};base64,${image.base64Data}`]),
                  ),
                }
              : {}),
          },
        }
      : {}),
    whyElectrify: { image: IMG('91c4a0ae-a81d-4e11-b258-dbcd50ec2af2') },
  };
}

const nz = (v: unknown) => (v === undefined || v === null ? undefined : v);

/** Body of the PDF-generation REST call (`APITemplate` block). `undefined` members mean "omit". */
export function buildPdfRequestBody(
  t: ProposalWorkflowInput,
  db: ProposalDbData,
  additionalInfo: AdditionalInfo,
  details: ReturnType<typeof buildProposalDetails>,
  totals: HearTotals[],
): Record<string, unknown> {
  const designOptions = db.projectCostBreakDownAndDesignOptions.designOptions;
  const opt = (i: number) => (designOptions[i] && designOptions[i].length > 0 ? designOptions[i] : undefined);
  const name = (i: number) => (db.optionNames[i] && db.optionNames[i].nickname !== null ? db.optionNames[i].nickname : undefined);
  const rmi = db.rmiCalcResults?.[0]?.rmi_calculator_results;
  const mov = (n: number | undefined) => (n! > 0 ? 'Increase' : n! < 0 ? 'Decrease' : n === 0 ? 'No Change' : null);
  const det = (k: 'proposal1_details' | 'proposal2_details' | 'proposal3_details') => details[k];
  const m = db.reducedSystemMockups ?? {};
  return {
    customerName: t.customerName, customerAddress: t.customerAddress, customerEmail: t.customerEmail, customerPhone: t.customerPhone,
    date: t.date, hca: t.hca, hcaEmail: t.hcaEmail, hcaPhone: t.hcaPhone, coldGraph: t.coldGraph,
    systemDesignOption1: opt(0), systemDesignOption2: opt(1), systemDesignOption3: opt(2),
    hddInfo: t.hddInfo, estmSavings: t.estmSavings, carbonSavings: t.carbonSavings, reduction: t.reduction,
    hpwhImplications: t.hpwhImplications, estmSavings2: t.estmSavings2, carbonSavings2: t.carbonSavings2, reduction2: t.reduction2,
    maintenanceTable: t.maintenanceTable,
    coMap: additionalInfo.coMap, maMap: additionalInfo.maMap,
    coAmountDue: additionalInfo.coAmountDue, coDepositAmount: additionalInfo.coDepositAmount,
    caAmountDue: additionalInfo.caAmountDue, caDepositAmount: additionalInfo.caDepositAmount,
    maAmountDue: additionalInfo.maAmountDue, maDepositAmount: additionalInfo.maDepositAmount,
    renuLoan: t.renuLoan, heatLoan: t.heatLoan, panelUpgrades: t.panelUpgrades,
    systemMockup1: m.reducedSystemMockup1 ? m.reducedSystemMockup1 : undefined,
    systemMockup2: m.reducedSystemMockup2 ? m.reducedSystemMockup2 : undefined,
    systemMockup3: m.reducedSystemMockup3 ? m.reducedSystemMockup3 : undefined,
    maintenanceSlide: t.maintenanceSlide, hddSlides: t.hddSlides,
    projectCostBreakdown: db.projectCostBreakDownAndDesignOptions.projectCostBreakDown,
    addtlTerms: t.addtlTerms || undefined,
    serviceAgreementCO: additionalInfo.serviceAgreementCO, energyEfficiency: t.energyEfficiency, heatStrip: t.heatStrip, smartAC: t.smartAC,
    serviceAgreementMA: additionalInfo.serviceAgreementMA, COInvoice: additionalInfo.COInvoice, MAInvoice: additionalInfo.MAInvoice,
    optionName1: name(0), optionName2: name(1), optionName3: name(2),
    indicative: t.indicativeProposal, aoSmithMulti: t.aoSmithMulti, estmLeadTime: t.estmLeadTime, ruudMulti: t.ruudMulti, homeSqft: t.homeSqft,
    aoSmith50: t.aoSmith50, aoSmith66: t.aoSmith66, aoSmith80: t.aoSmith80, ruud50: t.ruud50, ruud65: t.ruud65, ruud80: t.ruud80,
    heatPump: t.heatPump, hpwh: t.hpwhLength, auditAddendum: t.auditAddendum,
    minisplit1: det('proposal1_details').miniSplitFound ? 'true' : 'false', ahu1: det('proposal1_details').ahuFound ? 'true' : 'false', condenser1: det('proposal1_details').condenserFanType,
    minisplit2: det('proposal2_details').miniSplitFound ? 'true' : 'false', ahu2: det('proposal2_details').ahuFound ? 'true' : 'false', condenser2: det('proposal2_details').condenserFanType,
    minisplit3: det('proposal3_details').miniSplitFound ? 'true' : 'false', ahu3: det('proposal3_details').ahuFound ? 'true' : 'false', condenser3: det('proposal3_details').condenserFanType,
    hddGraph: t.hddGraph, rheem50: t.rheem50, rheem65: t.rheem65, rheem80: t.rheem80, rheemMulti: t.rheemMulti, rheem40: t.rheem40,
    hearProjectBreakdown: db.hearProjectBreakdown, nonHearRebateBreakdown: db.nonHearRebateBreakdown,
    hearRebateBreakdown: db.hearRebateBreakdown.length > 0 ? db.hearRebateBreakdown : undefined,
    hearTotals: totals,
    firstYearMovement: mov(rmi?.net_cost_1st_year),
    firstYearCost: rmi?.net_cost_1st_year?.toFixed(2) ?? null,
    lifeTimeMovement: mov(rmi?.net_cost_lifetime),
    lifeTimeCost: rmi?.net_cost_lifetime?.toFixed(2) ?? null,
    rmiShareLink: nz(rmi?.shareLink),
    hearUbForm: rmi ? 'true' : 'false',
  };
}

export interface ProposalData {
  ok: true;
  /** `addtlInfo` */
  additionalInfo: AdditionalInfo;
  /** `proposal_details` (first three proposals: mini-split / AHU / condenser fan type) */
  proposalDetails: ReturnType<typeof buildProposalDetails>;
  /** `hearTotals` */
  hearTotals: HearTotals[];
  /** `transformProposalGenerationData` (`proposalModuleContent` in the HTTP response) */
  content: Record<string, any>;
  /** The REST request the workflow sent to the PDF service (path + JSON body). */
  pdfRequest: { path: string; body: Record<string, unknown> };
}

/**
 * Data assembly of `proposalModuleWorkFlow` (everything except the HTTP/PDF call, the image down-scaling and the
 * `projectCostBreakDownAndDesgnOptions` sub-workflow, whose output is an input here).
 *
 * `refData.equipment` replaces the `equipment_by_id` query. Returns `{ ok:false }` instead of the ErrorHandler block.
 */
export function buildProposalData(
  input: ProposalWorkflowInput,
  db: ProposalDbData,
  refData: Pick<RefData, 'equipment'>,
): ProposalData | Failure {
  try {
    const equipment = indexById(refData.equipment);
    const systems = db.systems.filter((s) => (input.proposalToGenerate ?? []).includes(s.proposal_id as number));
    const systemIds = systems.map((s) => s.id);
    const EXCLUDED = ['proposed - from change order', 'deleted - from change order', 'pending deletion'];
    const lineItems = db.lineItems.filter((li) => systemIds.includes(li.system_id) && (li.status == null || !EXCLUDED.includes(li.status)));

    const additionalInfo = buildAdditionalInfo(input);
    const proposalDetails = buildProposalDetails(db.optionNames, systems, lineItems, equipment);
    const hearTotals = buildHearTotals(db.hearProjectBreakdown, db.nonHearRebateBreakdown, db.hearRebateBreakdown, db.projectCostBreakDownAndDesignOptions.projectCostBreakDown);
    const content = buildProposalContent(input, lineItems, db.projectCostBreakDownAndDesignOptions);
    const body = buildPdfRequestBody(input, db, additionalInfo, proposalDetails, hearTotals);
    return {
      ok: true,
      additionalInfo,
      proposalDetails,
      hearTotals,
      content,
      pdfRequest: { path: `v2/create-pdf?template_id=${PDF_TEMPLATE_ID}&filename=${input.filename ?? ''}`, body },
    };
  } catch (e) {
    return { ok: false, errors: [toEngineError(e) as EngineError] };
  }
}

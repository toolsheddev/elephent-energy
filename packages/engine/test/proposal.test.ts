import { describe, expect, it } from 'vitest';
import {
  buildAdditionalInfo,
  buildHearTotals,
  buildProposalData,
  buildProposalDetails,
  indexById,
  sampleProposalDb,
  sampleProposalInput,
  sampleRefData,
  type ProposalData,
} from '../src';

function build(over: Record<string, unknown> = {}, dbOver: Record<string, unknown> = {}): ProposalData {
  const r = buildProposalData({ ...sampleProposalInput, ...over }, { ...sampleProposalDb, ...dbOver } as any, sampleRefData);
  if (!r.ok) throw new Error(r.errors[0].message);
  return r;
}

describe('buildAdditionalInfo (addtlInfo)', () => {
  it('sets state flags and parses amounts', () => {
    expect(buildAdditionalInfo({ houseState: 'CO', amountDue: '6958.40', depositAmount: 3479 })).toMatchObject({
      COInvoice: 'true', serviceAgreementCO: 'true', coMap: 'true', coAmountDue: 6958, coDepositAmount: 3479, MAInvoice: 'false', maAmountDue: 0,
    });
    expect(buildAdditionalInfo({ houseState: 'MA', amountDue: 100, depositAmount: 50 })).toMatchObject({ MAInvoice: 'true', maMap: 'true', maAmountDue: 100, coMap: 'false' });
    expect(buildAdditionalInfo({ houseState: 'CA', amountDue: 100, depositAmount: 50 })).toMatchObject({ CAInvoice: 'true', serviceAgreementCA: 'true', caDepositAmount: 50 });
    expect(buildAdditionalInfo({ houseState: 'NY', amountDue: 100, depositAmount: 50 })).toMatchObject({ COInvoice: 'false', coAmountDue: 0 });
  });
});

describe('buildProposalDetails (proposal_details)', () => {
  const equipment = indexById(sampleRefData.equipment);
  it('finds mini-split heads, AHUs and condenser fan type; pads to three proposals', () => {
    const d = buildProposalDetails(
      [{ id: 1, nickname: 'a' }],
      [{ id: 10, house_id: 1, proposal_id: 1, system_type: 'hvac', system_status: 'proposed' }],
      [
        { system_id: 10, equipment_id: 380, line_item_type: 'equipment' }, // dual fan condenser
        { system_id: 10, equipment_id: 74, line_item_type: 'equipment' }, // single fan condenser
        { system_id: 10, equipment_id: 431, line_item_type: 'equipment' }, // AHU
        { system_id: 10, equipment_id: 326, line_item_type: 'equipment' }, // wall head
      ],
      equipment,
    );
    expect(d.proposal1_details).toEqual({ miniSplitFound: true, condenserFanType: 'both', ahuFound: true });
    expect(d.proposal2_details).toEqual({ miniSplitFound: false, condenserFanType: null, ahuFound: false });
    expect(d.proposal3_details).toEqual({ miniSplitFound: false, condenserFanType: null, ahuFound: false });
  });
  it('ignores systems that are not active/proposed', () => {
    const d = buildProposalDetails(
      [{ id: 1, nickname: 'a' }],
      [{ id: 10, house_id: 1, proposal_id: 1, system_type: 'hvac', system_status: 'pending deletion' }],
      [{ system_id: 10, equipment_id: 431, line_item_type: 'equipment' }],
      equipment,
    );
    expect(d.proposal1_details.ahuFound).toBe(false);
  });
});

describe('buildHearTotals (hearTotals)', () => {
  it('sums the three result sets and parses the out-of-pocket row', () => {
    const t = buildHearTotals(
      [{ total_cost: 100 }, { total_cost: '50.5' }],
      [{ incentive_amount: 20 }],
      [{ amount: 5 }],
      [{ label: '<b>Out-of-Pocket Cost (Amount paid to Elephant or Financed)</b>', value: '<b>$1,234.50</b>' }],
    );
    expect(t).toEqual([{ customer_total: 150.5, non_ira_total: 20, hear_total: 5, final_customer_cost: 125.5, amount_due: 1234.5 }]);
  });
  it('throws without the out-of-pocket row', () => {
    expect(() => buildHearTotals([], [], [], [])).toThrow(/Out-of-Pocket/);
  });
});

describe('buildProposalData', () => {
  it('assembles content, details, totals and the PDF request for the example input', () => {
    const r = build();
    expect(r.additionalInfo.coAmountDue).toBe(6958);
    expect(r.hearTotals).toEqual([{ customer_total: 17650, non_ira_total: 2500, hear_total: 1000, final_customer_cost: 14150, amount_due: 6958 }]);
    expect(r.proposalDetails.proposal1_details).toEqual({ miniSplitFound: true, condenserFanType: 'dual', ahuFound: true });
    expect(r.content.hcpHomePage).toMatchObject({
      title: 'Home Comfort Proposal',
      preparedFor: { customerName: 'Joe Herrick', customerPhone: 'N/A' },
      preparedBy: { companyName: 'Allison Toth' },
      date: '2026-07-14T16:46:52-0600',
    });
    expect(r.content.mapCo).toBeDefined();
    expect(r.content.mapMa).toBeUndefined();
    expect(r.content.massSaveRebate).toBeUndefined();
    expect(r.content.projectCostBreakDown.title).toBe('Project Cost Breakdown');
    expect(r.content.rheem50gal).toBeDefined(); // hpwh === 1 and a 'Rheem 50' line item
    expect(r.content.aoSmith50gal).toBeUndefined();
    expect(r.pdfRequest.path).toBe('v2/create-pdf?template_id=d4577b23446d2d54&filename=Joe.Herrick_Proposal.pdf');
    expect(r.pdfRequest.body).toMatchObject({
      customerName: 'Joe Herrick', coAmountDue: 6958, minisplit1: 'true', ahu1: 'true', condenser1: 'dual', minisplit2: 'false', condenser2: null,
      optionName1: 'Option A - Whole Home Heat Pump', optionName2: undefined, firstYearMovement: 'Decrease', firstYearCost: '-120.50', lifeTimeMovement: 'Increase', hearUbForm: 'true',
    });
  });

  it('indicative proposals, MA state, hddSlides and mockups change the content', () => {
    const r = build({ indicativeProposal: 'true', houseState: 'MA', hddSlides: 'true', hddInfo: [{ x: 1 }], systemMockUps: true, systemMockUpImages: [{ type: 'image/png', base64Data: 'AAA' }], hpwh: 2 });
    expect(r.content.hcpHomePage.title).toBe('Indicative Home Comfort Proposal');
    expect(r.content.hcpHomePage.subTitle).toMatch(/subject to change/);
    expect(r.content.mapMa).toBeDefined();
    expect(r.content.massSaveRebate).toBeDefined();
    expect(r.content.sizeSystemForHome.sizeSystemForHomeTable).toEqual([{ x: 1 }]);
    expect(r.content.hpCostCarbon.inputs.estimatedSavings.value).toBe('$0');
    expect(r.content.systemMockUps.systemMockUpImages).toEqual({ 'image 0': 'data:image/png;base64,AAA' });
    expect(r.content.rheemSizeOptions).toBeDefined(); // hpwh >= 2 and a 'Rheem' line item
    expect(r.content.rheem50gal).toBeUndefined();
  });

  it('returns ok:false instead of throwing when the cost breakdown is incomplete', () => {
    const r = buildProposalData(sampleProposalInput, { ...sampleProposalDb, projectCostBreakDownAndDesignOptions: { projectCostBreakDown: [], designOptions: [] } }, sampleRefData);
    expect(r.ok).toBe(false);
  });
});

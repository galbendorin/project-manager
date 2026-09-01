import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFinanceAnalysisExportData,
  createFinanceAnalysisWorkbook,
  neutralizeSpreadsheetText,
} from './financeAnalysisExport.js';
import { loadXLSX } from './importParsers.js';

const generatedAt = new Date('2026-09-01T09:30:00.000Z');

const baseInput = () => ({
  generatedAt,
  timeZone: 'Europe/London',
  range: 'next_12',
  profile: {
    currencyCode: 'GBP',
    forecastStartMonth: '2026-09',
    openingCashPence: 120000,
    protectedCashFloorPence: 50000,
    emergencyTargetMonths: 6,
    annualExpenseInflationBps: 250,
    annualIncomeGrowthBps: 100,
    updatedAt: 'PRIVATE-TIMESTAMP',
    email: 'private@example.com',
  },
  categories: [
    { id: 'SECRET-CATEGORY-ID', name: 'Home & bills', flowType: 'expense' },
    { id: 'SECRET-INCOME-CATEGORY-ID', name: 'Salary', flowType: 'income' },
  ],
  budgetItems: [
    {
      id: 'SECRET-BUDGET-ID',
      categoryId: 'SECRET-CATEGORY-ID',
      name: '=Mortgage',
      amountPence: 80000,
      flowType: 'expense',
      classification: 'essential',
      cashTreatment: 'cash_outflow',
      frequency: 'monthly',
      startMonth: '2026-01',
      endMonth: '',
      annualGrowthBps: null,
      ownerLabel: 'PRIVATE-OWNER',
      notes: 'PRIVATE-BUDGET-NOTE',
    },
    {
      id: 'SECRET-INCOME-ID',
      categoryId: 'SECRET-INCOME-CATEGORY-ID',
      name: 'Salary',
      amountPence: 300000,
      flowType: 'income',
      classification: 'essential',
      cashTreatment: 'cash_outflow',
      frequency: 'monthly',
      startMonth: '2026-01',
      endMonth: '',
    },
  ],
  forecast: [
    {
      monthKey: '2026-09',
      incomePence: 300000,
      expensePence: 80000,
      essentialPence: 80000,
      discretionaryPence: 0,
      wealthBuildingPence: 0,
      internalTransfersPence: 20000,
      surplusPence: 220000,
      savingsRate: 220000 / 300000,
      openingCashPence: 120000,
      closingCashPence: 340000,
      emergencyCoverageMonths: 4.25,
      belowProtectedFloor: false,
      lineItems: [
        {
          categoryId: 'SECRET-CATEGORY-ID',
          name: '=Mortgage',
          amountPence: 80000,
          flowType: 'expense',
          classification: 'essential',
          cashTreatment: 'cash_outflow',
          frequency: 'monthly',
        },
        {
          categoryId: 'SECRET-INCOME-CATEGORY-ID',
          name: 'Salary',
          amountPence: 300000,
          flowType: 'income',
          classification: 'essential',
          cashTreatment: 'cash_outflow',
          frequency: 'monthly',
        },
      ],
    },
    {
      monthKey: '2026-10',
      incomePence: 300000,
      expensePence: 80000,
      essentialPence: 80000,
      discretionaryPence: 0,
      wealthBuildingPence: 0,
      internalTransfersPence: 0,
      surplusPence: 220000,
      savingsRate: 220000 / 300000,
      openingCashPence: 340000,
      closingCashPence: 560000,
      emergencyCoverageMonths: 7,
      belowProtectedFloor: false,
      lineItems: [],
    },
    {
      monthKey: '2028-01',
      incomePence: 1,
      expensePence: 0,
      essentialPence: 0,
      discretionaryPence: 0,
      wealthBuildingPence: 0,
      internalTransfersPence: 0,
      surplusPence: 1,
      savingsRate: 1,
      openingCashPence: 0,
      closingCashPence: 1,
      emergencyCoverageMonths: null,
      belowProtectedFloor: false,
      lineItems: [],
    },
  ],
  actualEntries: [
    {
      id: 'SECRET-ACTUAL-ID',
      categoryId: 'SECRET-CATEGORY-ID',
      budgetItemId: 'SECRET-BUDGET-ID',
      occurredOn: '2026-09-08',
      amountPence: 79000,
      flowType: 'expense',
      cashTreatment: 'cash_outflow',
      note: 'PRIVATE-ACTUAL-NOTE',
    },
    {
      id: 'SECRET-TRANSFER-ID',
      categoryId: 'SECRET-CATEGORY-ID',
      budgetItemId: '',
      occurredOn: '2026-09-10',
      amountPence: 20000,
      flowType: 'expense',
      cashTreatment: 'internal_transfer',
      note: 'PRIVATE-TRANSFER-NOTE',
    },
  ],
  balanceSnapshots: [
    {
      id: 'SECRET-SNAPSHOT-ID',
      asOfMonth: '2026-09',
      cashBalancePence: 330000,
      note: 'PRIVATE-BALANCE-NOTE',
    },
  ],
  goals: [
    {
      id: 'SECRET-GOAL-ID',
      name: 'Emergency fund',
      goalType: 'emergency_fund',
      currentBalancePence: 100000,
      targetBalancePence: 500000,
      targetDate: '2027-12-31',
      monthlyContributionPence: 20000,
      priority: 1,
      isProtected: true,
      notes: 'PRIVATE-GOAL-NOTE',
    },
  ],
  mortgages: [
    {
      id: 'SECRET-MORTGAGE-ID',
      name: 'Home mortgage',
      outstandingBalancePence: 10000000,
      annualRateBps: 400,
      remainingMonths: 120,
      contractualPaymentPence: 100000,
      voluntaryOverpaymentPence: 10000,
      propertyValuePence: 20000000,
      fixedRateEndDate: '2028-06-30',
      expectedFutureRateBps: 500,
    },
  ],
  scenarios: [
    {
      id: 'SECRET-SCENARIO-ID',
      name: '@Job change',
      description: 'PRIVATE-SCENARIO-DESCRIPTION',
    },
  ],
  scenarioChanges: [
    {
      id: 'SECRET-CHANGE-ID',
      scenarioId: 'SECRET-SCENARIO-ID',
      name: '+Salary change',
      effectiveMonth: '2027-01',
      changeType: 'income',
      amountPence: 50000,
      frequency: 'monthly',
      classification: 'essential',
      payload: { private: 'PRIVATE-PAYLOAD' },
    },
    {
      id: 'SECRET-FUTURE-CHANGE-ID',
      scenarioId: 'SECRET-SCENARIO-ID',
      name: 'Far future change',
      effectiveMonth: '2028-01',
      changeType: 'expense',
      amountPence: 10000,
      frequency: 'one_off',
      classification: 'discretionary',
    },
    {
      id: 'SECRET-ARCHIVED-CHANGE-ID',
      scenarioId: 'SECRET-ARCHIVED-SCENARIO-ID',
      name: 'ARCHIVED-SCENARIO-CHANGE',
      effectiveMonth: '2026-11',
      changeType: 'expense',
      amountPence: 25000,
      frequency: 'monthly',
      classification: 'discretionary',
    },
  ],
  userId: 'SECRET-USER-ID',
});

test('finance analysis export omits internal metadata and free text by default', () => {
  const output = buildFinanceAnalysisExportData(baseInput());
  const serialized = JSON.stringify(output);

  [
    'SECRET-USER-ID',
    'SECRET-CATEGORY-ID',
    'SECRET-BUDGET-ID',
    'SECRET-ACTUAL-ID',
    'SECRET-SNAPSHOT-ID',
    'SECRET-GOAL-ID',
    'SECRET-MORTGAGE-ID',
    'SECRET-SCENARIO-ID',
    'SECRET-CHANGE-ID',
    'SECRET-FUTURE-CHANGE-ID',
    'SECRET-ARCHIVED-CHANGE-ID',
    'SECRET-ARCHIVED-SCENARIO-ID',
    'ARCHIVED-SCENARIO-CHANGE',
    'PRIVATE-TIMESTAMP',
    'private@example.com',
    'PRIVATE-OWNER',
    'PRIVATE-BUDGET-NOTE',
    'PRIVATE-ACTUAL-NOTE',
    'PRIVATE-BALANCE-NOTE',
    'PRIVATE-GOAL-NOTE',
    'PRIVATE-SCENARIO-DESCRIPTION',
    'PRIVATE-PAYLOAD',
  ].forEach((secret) => assert.equal(serialized.includes(secret), false, secret));

  assert.equal(output.budgetScheduleRows[0].Item, "'=Mortgage");
  assert.equal(output.scenarioRows[0].Scenario, "'@Job change");
  assert.equal(output.scenarioRows[0].Change, "'+Salary change");
  assert.equal(Object.hasOwn(output.budgetScheduleRows[0], 'Notes'), false);
  assert.equal(Object.hasOwn(output.actualRows[0], 'Note'), false);
});

test('finance analysis export keeps currency numeric, separates transfers, and leaves absent actuals blank', () => {
  const output = buildFinanceAnalysisExportData(baseInput());
  const september = output.monthlySummaryRows.find((row) => row.Month === '2026-09');
  const october = output.monthlySummaryRows.find((row) => row.Month === '2026-10');
  const transfer = output.actualRows.find((row) => row['Cash treatment'] === 'Internal Transfer');

  assert.equal(september['Planned income'], 3000);
  assert.equal(september['Planned cash expenses'], 800);
  assert.equal(september['Actual expenses'], 790);
  assert.equal(september['Actual entries recorded'], 2);
  assert.equal(september['Recorded vs plan'], -100);
  assert.equal(typeof september['Savings rate'], 'number');
  assert.equal(october['Actual income'], '');
  assert.equal(october['Actual expenses'], '');
  assert.equal(transfer['Net cash impact'], 0);
  assert.equal(output.planLineRows.find((row) => row.Item === 'Salary')['Net cash impact'], 3000);
  assert.equal(output.planLineRows.find((row) => row.Item === "'=Mortgage")['Net cash impact'], -800);
});

test('range controls filter month-based rows without removing schedule context', () => {
  const input = baseInput();
  input.budgetItems.push({
    ...input.budgetItems[0],
    id: 'OLD-SCHEDULE-ID',
    name: 'Old mortgage amount',
    startMonth: '2024-01',
    endMonth: '2025-01',
  });
  const nextTwelve = buildFinanceAnalysisExportData(input);
  const complete = buildFinanceAnalysisExportData({ ...input, range: 'complete' });

  assert.deepEqual(nextTwelve.monthlySummaryRows.map((row) => row.Month), ['2026-09', '2026-10']);
  assert.equal(complete.monthlySummaryRows.some((row) => row.Month === '2028-01'), true);
  assert.equal(nextTwelve.budgetScheduleRows.length, 2);
  assert.equal(complete.budgetScheduleRows.length, 3);
  assert.deepEqual(nextTwelve.scenarioRows.map((row) => row.Change), ["'+Salary change"]);
  assert.equal(complete.scenarioRows.length, 2);
});

test('overview range contains twelve prior and twenty-four forward months including current', () => {
  const input = baseInput();
  const template = input.forecast[1];
  input.range = 'overview';
  input.forecast = [
    { ...template, monthKey: '2025-09' },
    { ...template, monthKey: '2028-08' },
    { ...template, monthKey: '2028-09' },
  ];
  const output = buildFinanceAnalysisExportData(input);
  const months = output.monthlySummaryRows.map((row) => row.Month);

  assert.equal(months.includes('2025-09'), true);
  assert.equal(months.includes('2028-08'), true);
  assert.equal(months.includes('2028-09'), false);
});

test('mortgage payoff is blank when the model ends with a balance outstanding', () => {
  const input = baseInput();
  input.mortgages = [{
    ...input.mortgages[0],
    annualRateBps: 1200,
    remainingMonths: 12,
    contractualPaymentPence: 1,
    voluntaryOverpaymentPence: 0,
  }];
  const [row] = buildFinanceAnalysisExportData(input).mortgageRows;

  assert.equal(row['Projected payoff months'], '');
  assert.equal(row['Projected balance at term'] > 0, true);
});

test('notes and owner labels are only added when explicitly included and remain formula-safe', () => {
  const input = baseInput();
  input.budgetItems[0].notes = '-private note';
  input.budgetItems[0].ownerLabel = '+Partner';
  const output = buildFinanceAnalysisExportData({ ...input, includeNotes: true });

  assert.equal(output.budgetScheduleRows[0].Owner, "'+Partner");
  assert.equal(output.budgetScheduleRows[0].Notes, "'-private note");
  assert.equal(output.actualRows[0].Note, 'PRIVATE-ACTUAL-NOTE');
  assert.equal(output.balanceRows[0].Note, 'PRIVATE-BALANCE-NOTE');
  assert.equal(output.goalRows[0].Notes, 'PRIVATE-GOAL-NOTE');
  assert.equal(output.scenarioRows[0].Description, 'PRIVATE-SCENARIO-DESCRIPTION');
  assert.equal(neutralizeSpreadsheetText('\tformula'), "'\tformula");
});

test('workbook has ordered sheets, schemas for empty data, and numeric cell formats', async () => {
  const output = buildFinanceAnalysisExportData(baseInput());
  const XLSX = await loadXLSX();
  const workbook = createFinanceAnalysisWorkbook(XLSX, output);

  assert.deepEqual(workbook.SheetNames, [
    '00_READ_ME',
    '01_SETTINGS',
    '02_MONTHLY_SUMMARY',
    '03_PLAN_LINES',
    '04_BUDGET_SCHEDULE',
    '05_ACTUALS',
    '06_BALANCES',
    '07_GOALS',
    '08_MORTGAGES',
    '09_SCENARIOS',
  ]);
  assert.equal(workbook.Sheets['02_MONTHLY_SUMMARY'].B2.t, 'n');
  assert.equal(workbook.Sheets['02_MONTHLY_SUMMARY'].B2.v, 3000);
  assert.equal(workbook.Sheets['02_MONTHLY_SUMMARY'].I2.z, '0.0%');
  assert.equal(workbook.Sheets['01_SETTINGS'].B7.z, '#,##0.00');
  assert.equal(workbook.Sheets['01_SETTINGS'].B10.z, '0.0%');
  assert.equal(workbook.Sheets['03_PLAN_LINES'].A1.v, 'Month');
  assert.equal(workbook.Sheets['05_ACTUALS']['!autofilter'].ref, 'A1:I3');

  const emptyOutput = buildFinanceAnalysisExportData({ generatedAt, timeZone: 'Europe/London' });
  const emptyWorkbook = createFinanceAnalysisWorkbook(XLSX, emptyOutput);
  assert.equal(emptyWorkbook.Sheets['07_GOALS'].A1.v, 'Goal');
});

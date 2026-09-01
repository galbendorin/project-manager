import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addMonths,
  buildFinanceForecast,
  buildFinanceMonthKpis,
  calculateEmergencyCoverage,
  calculateLoanPayment,
  calculateMortgageSummary,
  calculateSavingsRate,
  calculateSinkingFundContribution,
  createSampleFinanceData,
  formatCurrency,
  getItemAmountForMonth,
  isItemActiveInMonth,
  parseCurrencyToPence,
} from './financePlanner.js';

test('currency helpers use pence and preserve GBP formatting', () => {
  assert.equal(parseCurrencyToPence('£1,234.56'), 123456);
  assert.equal(parseCurrencyToPence('18,000'), 1800000);
  assert.equal(parseCurrencyToPence('not money'), null);
  assert.equal(formatCurrency(151700), '£1,517');
});

test('recurring, annual, and one-off plan items activate in the right months', () => {
  const monthly = { frequency: 'monthly', startMonth: '2026-08', endMonth: '2027-03' };
  const annual = { frequency: 'annual', startMonth: '2026-08', annualMonth: 2 };
  const oneOff = { frequency: 'one_off', startMonth: '2027-02' };
  assert.equal(isItemActiveInMonth(monthly, '2027-03'), true);
  assert.equal(isItemActiveInMonth(monthly, '2027-04'), false);
  assert.equal(isItemActiveInMonth(annual, '2027-02'), true);
  assert.equal(isItemActiveInMonth(annual, '2027-03'), false);
  assert.equal(isItemActiveInMonth(oneOff, '2027-02'), true);
  assert.equal(isItemActiveInMonth(oneOff, '2028-02'), false);
});

test('inflation and salary growth apply once per future calendar year', () => {
  const expense = { amountPence: 100000, flowType: 'expense', frequency: 'monthly', startMonth: '2026-08' };
  const income = { amountPence: 100000, flowType: 'income', frequency: 'monthly', startMonth: '2026-08' };
  assert.equal(getItemAmountForMonth({ item: expense, monthKey: '2027-01', forecastStartMonth: '2026-08', annualExpenseInflationBps: 250 }), 102500);
  assert.equal(getItemAmountForMonth({ item: income, monthKey: '2027-01', forecastStartMonth: '2026-08', annualIncomeGrowthBps: 200 }), 102000);
});

test('forecast calculates surplus, cash, lean emergency coverage, and future changes', () => {
  const forecast = buildFinanceForecast({
    startMonth: '2026-08',
    months: 3,
    openingCashPence: 1800000,
    budgetItems: [
      { name: 'Income', amountPence: 561500, flowType: 'income', frequency: 'monthly', startMonth: '2026-08' },
      { name: 'Required', amountPence: 359800, flowType: 'expense', classification: 'essential', frequency: 'monthly', startMonth: '2026-08' },
      { name: 'Overpayment', amountPence: 50000, flowType: 'expense', classification: 'wealth_building', frequency: 'monthly', startMonth: '2026-08' },
      { name: 'Holiday', amountPence: 80000, flowType: 'expense', classification: 'discretionary', frequency: 'one_off', startMonth: '2026-09' },
    ],
  });
  assert.equal(forecast[0].surplusPence, 151700);
  assert.equal(forecast[0].closingCashPence, 1951700);
  assert.equal(forecast[0].essentialPence, 359800);
  assert.equal(forecast[1].surplusPence, 71700);
  assert.equal(forecast[1].closingCashPence, 2023400);
  assert.equal(forecast[0].emergencyCoverageMonths, 1951700 / 359800);
});

test('cash safety, sinking fund, loan payment, and savings rate calculations are deterministic', () => {
  assert.equal(calculateSavingsRate(561500, 151700), 151700 / 561500);
  assert.equal(calculateEmergencyCoverage(1800000, 300000), 6);
  assert.equal(calculateSinkingFundContribution(80000), 6667);
  assert.equal(calculateLoanPayment({ principalPence: 1000000, annualRateBps: 0, termMonths: 10 }), 100000);
  const summary = calculateMortgageSummary({ balancePence: 16000000, annualRateBps: 450, remainingMonths: 300, propertyValuePence: 30000000, monthlyOverpaymentPence: 50000 });
  assert.ok(summary.standardPaymentPence > 0);
  assert.equal(summary.ltv, 16000000 / 30000000);
  assert.ok(summary.payoffMonths < 300);
});

test('monthly KPIs distinguish plans, snapshots, and recorded spending', () => {
  const month = buildFinanceForecast({
    startMonth: '2026-08',
    months: 1,
    openingCashPence: 1000000,
    budgetItems: [
      { amountPence: 500000, flowType: 'income', frequency: 'monthly', startMonth: '2026-08' },
      { amountPence: 300000, flowType: 'expense', classification: 'essential', frequency: 'monthly', startMonth: '2026-08' },
    ],
  })[0];
  const kpis = buildFinanceMonthKpis({
    month,
    snapshot: { cashBalancePence: 1250000 },
    actualEntries: [
      { flowType: 'expense', cashTreatment: 'cash_outflow', occurredOn: '2026-08-05', amountPence: 275000 },
      { flowType: 'expense', cashTreatment: 'internal_transfer', occurredOn: '2026-08-06', amountPence: 50000 },
      { flowType: 'expense', cashTreatment: 'cash_outflow', occurredOn: '2026-07-30', amountPence: 90000 },
    ],
    emergencyTargetMonths: 4,
    currentMonthKey: '2026-08',
  });

  assert.equal(kpis.leftPence, 200000);
  assert.equal(kpis.savingsRate, 0.4);
  assert.equal(kpis.savingsVariancePence, 50000);
  assert.equal(kpis.emergencyCoverageMonths, 1250000 / 300000);
  assert.equal(kpis.actualExpensePence, 275000);
  assert.equal(kpis.actualExpenseVariancePence, -25000);
  assert.equal(kpis.actualsArePartial, true);
});

test('monthly KPIs preserve a zero snapshot and neutral missing actuals', () => {
  const kpis = buildFinanceMonthKpis({
    month: {
      monthKey: '2026-09',
      surplusPence: -1000,
      savingsRate: null,
      closingCashPence: 5000,
      expensePence: 1000,
      essentialPence: 0,
    },
    snapshot: { cashBalancePence: 0 },
    actualEntries: [],
    currentMonthKey: '2026-08',
  });

  assert.equal(kpis.hasSnapshot, true);
  assert.equal(kpis.savingsVariancePence, -5000);
  assert.equal(kpis.emergencyCoverageMonths, null);
  assert.equal(kpis.hasActualExpenses, false);
  assert.equal(kpis.actualExpenseVariancePence, null);
});

test('sample finance data mirrors the current household baseline and schedules future childcare changes', () => {
  const sample = createSampleFinanceData({ startMonth: '2026-08' });
  const forecast = buildFinanceForecast({
    ...sample.settings,
    budgetItems: sample.budgetItems,
    months: 10,
  });
  assert.equal(addMonths('2026-08', 8), '2027-04');
  assert.equal(forecast[0].incomePence, 561500);
  assert.equal(forecast[0].expensePence, 409800);
  assert.equal(forecast[0].surplusPence, 151700);
  assert.equal(forecast[8].expensePence, 494800);
});

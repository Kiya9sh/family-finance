/*
 * Calculate: the maths screens, kept out of Planning.
 *
 * Tabs: the loan instalment calculator and the affordability check, buy-now /
 * pay-later instalments, bank deposit interest, and an income-tax estimate.
 * Every result lists the numbers it was built from, and each screen says
 * plainly that it is an estimate rather than advice.
 */

import { L } from '../i18n.js';
import { currencyLabel } from '../prefs.js';
import {
  depositPlan, bnplPlan, defaultTaxBrackets, taxReturn,
} from '../calcmath.js';
import {
  ui, profilesSorted, loanMonthlyPayment, averageMonthlyExpense,
  expectedForMonth, monthlyLoanPaymentTotal, monthSummary, upsert,
  loanSchedule, affordability,
} from '../state.js';
import { addMonthsToKey, currentMonthKey, todayISO, addMonthsToISO } from '../jalali.js';
import {
  formatMoney, formatNumber, formatDateShort, escapeHtml as esc, faDigits, parseAmount,
  normalizeDigits, sum, pct, formatAmountForInput,
} from '../util.js';
import {
  field, selectInput, toast, note, sectionTitle, segmented, datePicker, readDate,
  summaryRow,
} from '../components.js';
import { onAction, onForm, rerender } from '../bus.js';

const METHODS = ['simple', 'yearly', 'monthly', 'payout'];
const emptyAmount = '';
const emptyNum = '';

if (!ui.calcPage) {
  ui.calcPage = {
    tab: 'loan',
    deposit: { principal: emptyAmount, rate: '20', months: '12', method: 'simple', withholding: '0', result: null },
    bnpl: { platform: '', price: emptyAmount, down: '0', months: '4', feeType: 'percent', feeValue: '3', firstDate: todayISO(), result: null },
    tax: { year: String(new Date().getFullYear()), income: emptyAmount, deduction: '0', paid: '0', brackets: defaultTaxBrackets(), result: null },
    loan: { principal: emptyAmount, rate: '18', months: '24', result: null },
    afford: { income: emptyAmount, expenses: emptyAmount, existing: emptyAmount, principal: emptyAmount, rate: '18', months: '24', result: null },
  };
}

function cp() {
  return ui.calcPage;
}

function rateLabel(rate) {
  return `${faDigits(Math.round((Number(rate) || 0) * 100))}${L('٪', '%')}`;
}

function moneyField(label, name, value, extra = '') {
  return field({
    label,
    input: `<div class="amount-wrap">
      <input class="input input--amount" type="text" inputmode="numeric" autocomplete="off" data-amount
        name="${name}" value="${esc(value || '')}" ${extra}>
      <span class="amount-wrap__unit">${esc(currencyLabel())}</span></div>
      <span class="amount-preview" data-amount-preview></span>`,
  });
}

function numberField(label, name, value, extra = '') {
  return field({
    label,
    input: `<input class="input" type="number" inputmode="decimal" name="${name}" value="${esc(value || '')}" ${extra}>`,
  });
}

function percentField(label, name, value, extra = '') {
  return numberField(label, name, value, `step="0.1" min="0" max="100" ${extra}`);
}

/* ---------------- deposit interest ---------------- */

function depositResultHTML(result) {
  const methodLabels = {
    simple: L('سود ساده (بدون سرمایه‌گذاری مجدد)', 'Simple interest (no compounding)'),
    yearly: L('سود مرکب سالانه', 'Compounded yearly'),
    monthly: L('سود مرکب ماهانه', 'Compounded monthly'),
    payout: L('پرداخت ماهانه سود (بدون مرکب)', 'Interest paid out monthly (no compounding)'),
  };
  return `<div class="result-box">
    ${summaryRow(L('سود ناخالص', 'Gross interest'), formatMoney(result.grossInterest), { strong: true })}
    ${result.withholding ? summaryRow(L('مالیات سپرده', 'Withholding'), formatMoney(result.withholding)) : ''}
    ${summaryRow(L('سود خالص', 'Net interest'), formatMoney(result.netInterest), { strong: true })}
    ${summaryRow(L('موجودی در پایان دوره', 'Balance at the end'), formatMoney(result.maturity))}
    ${result.method === 'payout' ? summaryRow(L('پرداخت ماهانه', 'Monthly payout'), formatMoney(result.monthlyPayout)) : ''}
    ${summaryRow(L('بازده تقریبی سالانه', 'Approximate annual yield'), `${faDigits(result.effectiveAnnualPct)}${L('٪', '%')}`)}
    <p class="card__sub">${esc(L(
      `فرض: اصل ${formatMoney(result.principal)}، نرخ سالانه ${faDigits(result.annualRatePct)}٪، ${faDigits(result.months)} ماه، ${methodLabels[result.method] || ''}.`,
      `Assumptions: principal ${formatMoney(result.principal)}, ${result.annualRatePct}% per year, ${result.months} months, ${methodLabels[result.method] || ''}.`,
    ))}</p>
  </div>`;
}

function depositView() {
  const state = cp().deposit;
  return `<section class="card">
    ${sectionTitle(L('سود سپرده بانکی', 'Bank deposit interest'))}
    <p class="card__sub">${esc(L(
      'سود سپرده را با روش‌های رایج حساب می‌کند. بانک ممکن است روش دیگری داشته باشد؛ قرارداد سپرده مرجع است.',
      'Works out interest the usual ways. Your bank may use a different method; the deposit contract is the reference.',
    ))}</p>
    <form data-form="deposit">
      ${moneyField(L('مبلغ سپرده', 'Deposit amount'), 'principal', state.principal)}
      <div class="form-grid">
        ${percentField(L('نرخ سود سالانه (٪)', 'Annual rate (%)'), 'rate', state.rate)}
        ${numberField(L('مدت (ماه)', 'Term (months)'), 'months', state.months, 'min="1" max="600"')}
      </div>
      ${field({
        label: L('روش محاسبه', 'Method'),
        input: selectInput({
          name: 'method',
          options: [
            { value: 'simple', label: L('سود ساده', 'Simple interest') },
            { value: 'yearly', label: L('مرکب سالانه', 'Compounded yearly') },
            { value: 'monthly', label: L('مرکب ماهانه', 'Compounded monthly') },
            { value: 'payout', label: L('پرداخت ماهانه سود', 'Interest paid monthly') },
          ],
          value: state.method,
        }),
      })}
      ${percentField(L('مالیات سود (٪، اختیاری)', 'Tax on interest (%, optional)'), 'withholding', state.withholding)}
      <button type="submit" class="btn btn--primary btn--grow">${esc(L('محاسبه سود', 'Calculate interest'))}</button>
    </form>
    ${state.result ? depositResultHTML(state.result) : ''}
  </section>`;
}

/* ---------------- buy now, pay later ---------------- */

function bnplResultHTML(result) {
  return `<div class="result-box">
    ${summaryRow(L('مبلغ کالا', 'Price'), formatMoney(result.price))}
    ${result.downPayment ? summaryRow(L('پیش‌پرداخت', 'Down payment'), formatMoney(result.downPayment)) : ''}
    ${summaryRow(L('مبلغ تأمین‌شده', 'Financed'), formatMoney(result.financed))}
    ${summaryRow(L('کارمزد', 'Fee'), `${formatMoney(result.fee)} (${faDigits(result.overPaymentPct)}${L('٪', '%')})`)}
    ${summaryRow(L('جمع بازپرداخت', 'Total to repay'), formatMoney(result.total), { strong: true })}
    ${summaryRow(L('هر قسط', 'Each instalment'), formatMoney(result.perMonth), { strong: true })}
    ${result.firstInstalment !== result.lastInstalment
      ? summaryRow(L('قسط اول / آخر', 'First / last instalment'), `${formatMoney(result.firstInstalment)} / ${formatMoney(result.lastInstalment)}`)
      : ''}
    ${summaryRow(L('نرخ سالانه مؤثر (تخمین)', 'Effective annual rate (estimate)'), `${faDigits(result.effectiveAnnualPct)}${L('٪', '%')}`)}
    <details class="form-details">
      <summary>${L('جدول اقساط', 'Instalment schedule')}</summary>
      <div class="table-scroll">
        <table class="mini-table">
          <thead><tr><th>#</th><th>${esc(L('مبلغ', 'Amount'))}</th><th>${esc(L('مبلغ تجمعی', 'Cumulative'))}</th></tr></thead>
          <tbody>
            ${result.instalments.map((amount, index) => `<tr>
              <td>${faDigits(index + 1)}</td>
              <td>${formatNumber(amount)}</td>
              <td>${formatNumber(sum(result.instalments.slice(0, index + 1), (v) => v))}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>
    <p class="card__sub">${esc(L(
      'فرض: بدون جریمه دیرکرد و بدون هزینه ثبت‌نام. اگر پلتفرم کارمزد را جور دیگری حساب کند، عدد او مرجع است.',
      'Assumes no late fees and no sign-up cost. If the platform charges its fee differently, its figure wins.',
    ))}</p>
    <button type="button" class="btn btn--ghost btn--small" data-action="bnpl-to-loan">
      ${esc(L('ثبت به‌عنوان وام اقساطی', 'Save as an instalment loan'))}
    </button>
  </div>`;
}

function bnplView() {
  const state = cp().bnpl;
  return `<section class="card">
    ${sectionTitle(L('خرید اقساطی (۴ تا ۶ قسط)', 'Buy now, pay later (4–6 instalments'))}
    <p class="card__sub">${esc(L(
      'برای پلتفرم‌های خرید اقساطی: مبلغ کالا، پیش‌پرداخت و کارمزد را بدهید تا قسط ماهانه و جمع بازپرداخت را ببینید.',
      'For instalment platforms: give the price, any down payment and the fee to see each monthly payment and the total.',
    ))}</p>
    <form data-form="bnpl">
      ${field({
        label: L('پلتفرم یا فروشگاه', 'Platform or store'),
        input: `<input class="input" name="platform" maxlength="40" autocomplete="off"
          value="${esc(state.platform)}" placeholder="${esc(L('مثلاً اسنپ‌پی', 'e.g. a pay-later platform'))}">`,
      })}
      ${moneyField(L('مبلغ کالا', 'Price'), 'price', state.price)}
      <div class="form-grid">
        ${moneyField(L('پیش‌پرداخت', 'Down payment'), 'down', state.down)}
        ${field({
          label: L('تعداد اقساط', 'Instalments'),
          input: selectInput({
            name: 'months',
            options: [2, 3, 4, 5, 6, 9, 12, 18, 24].map((n) => ({
              value: String(n),
              label: `${faDigits(n)} ${L('قسط', 'instalments')}`,
            })),
            value: state.months,
          }),
        })}
      </div>
      <div class="form-grid">
        ${field({
          label: L('نوع کارمزد', 'Fee type'),
          input: selectInput({
            name: 'feeType',
            options: [
              { value: 'percent', label: L('درصدی از مبلغ', 'Percentage') },
              { value: 'amount', label: L('مبلغ ثابت', 'Fixed amount') },
            ],
            value: state.feeType,
          }),
        })}
        ${state.feeType === 'percent'
          ? percentField(L('کارمزد (٪)', 'Fee (%)'), 'feeValue', state.feeValue)
          : moneyField(L('کارمزد', 'Fee'), 'feeValue', state.feeValue)}
      </div>
      ${field({ label: L('تاریخ اولین قسط', 'First instalment date'), input: datePicker('firstDate', state.firstDate) })}
      <button type="submit" class="btn btn--primary btn--grow">${esc(L('محاسبه اقساط', 'Calculate instalments'))}</button>
    </form>
    ${state.result ? bnplResultHTML(state.result) : ''}
  </section>`;
}

/* ---------------- income tax ---------------- */

function taxRowsHTML(brackets) {
  return `<div class="bracket-list">
    ${brackets.map((bracket, index) => `<div class="bracket-row">
      <span class="bracket-row__n">${faDigits(index + 1)}</span>
      <label class="bracket-row__cell">
        <span>${esc(L('تا (سقف)', 'Up to'))}</span>
        <input class="input" type="text" inputmode="numeric" data-amount name="limit${index}"
          value="${bracket.upTo === null ? '' : esc(formatAmountForInput(bracket.upTo))}"
          placeholder="${bracket.upTo === null ? esc(L('بدون سقف', 'no limit')) : ''}">
      </label>
      <label class="bracket-row__cell bracket-row__cell--rate">
        <span>${esc(L('نرخ ٪', 'Rate %'))}</span>
        <input class="input" type="number" inputmode="decimal" step="0.1" min="0" max="100" name="rate${index}"
          value="${esc(String(Math.round((Number(bracket.rate) || 0) * 1000) / 10))}">
      </label>
    </div>`).join('')}
  </div>`;
}

function taxResultHTML(result, brackets) {
  return `<div class="result-box">
    ${summaryRow(L('درآمد مشمول', 'Taxable income'), formatMoney(result.taxable), { strong: true })}
    ${summaryRow(L('مالیات برآوردی', 'Estimated tax'), formatMoney(result.tax), { strong: true })}
    ${summaryRow(L('مالیات پرداخت‌شده', 'Tax already paid'), formatMoney(result.paid))}
    ${summaryRow(
      result.balance >= 0 ? L('باقی‌مانده بدهی', 'Still owed') : L('طلب احتمالی', 'Possible refund'),
      formatMoney(Math.abs(result.balance)),
      { strong: true, tone: result.balance > 0 ? 'expense' : '' },
    )}
    ${summaryRow(L('نرخ مؤثر', 'Effective rate'), `${faDigits(result.effectivePct)}${L('٪', '%')}`)}
    <div class="table-scroll">
      <table class="mini-table">
        <thead><tr>
          <th>${esc(L('از', 'From'))}</th><th>${esc(L('تا', 'To'))}</th><th>${esc(L('نرخ', 'Rate'))}</th><th>${esc(L('مالیات', 'Tax'))}</th>
        </tr></thead>
        <tbody>
          ${result.slices.map((slice) => `<tr>
            <td>${formatNumber(slice.from)}</td>
            <td>${slice.to === null ? '—' : formatNumber(slice.to)}</td>
            <td>${rateLabel(slice.rate)}</td>
            <td>${formatNumber(slice.amount)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="card__sub">${esc(L(
      'این تخمین، معافیت‌ها، هزینه‌های شغلی و قوانین سال را در نظر نمی‌گیرد. برای عدد قطعی به سامانه مالیاتی یا حسابدار مراجعه کنید.',
      'The estimate ignores exemptions, job-specific deductions and this year’s rules. For a definitive figure use the tax authority’s system or an accountant.',
    ))}</p>
  </div>`;
}

function taxView() {
  const state = cp().tax;
  return `<section class="card">
    ${sectionTitle(L('اظهارنامه مالیات بر درآمد', 'Income tax return estimate'))}
    ${note(esc(L(
      'پله‌های مالیاتی پیش‌فرض فقط نمونه‌اند و هر سال تغییر می‌کنند. سقف و نرخ‌های سال جاری را از جدول رسمی بردارید و اینجا وارد کنید.',
      'The default brackets are placeholders and change every year. Take this year’s limits and rates from the official table and enter them here.',
    )), 'warn')}
    <form data-form="tax">
      ${moneyField(L('درآمد سالانه', 'Annual income'), 'income', state.income)}
      <div class="form-grid">
        ${moneyField(L('هزینه‌های قابل کسر', 'Deductible amounts'), 'deduction', state.deduction)}
        ${moneyField(L('مالیات پرداخت‌شده تا امروز', 'Tax already paid'), 'paid', state.paid)}
      </div>
      <span class="field__label">${esc(L('پله‌های مالیاتی', 'Tax brackets'))}</span>
      ${taxRowsHTML(state.brackets)}
      <p class="form-error" data-form-error role="alert"></p>
      <button type="submit" class="btn btn--primary btn--grow">${esc(L('محاسبه مالیات', 'Calculate tax'))}</button>
    </form>
    ${state.result ? taxResultHTML(state.result, state.brackets) : ''}
  </section>`;
}

/* ---------------- loan and affordability ---------------- */

function loanView() {
  const state = cp().loan;
  return `<section class="card">
    ${sectionTitle(L('ماشین‌حساب قسط وام', 'Loan instalment calculator'))}
    <form data-form="calc-loan">
      ${moneyField(L('مبلغ وام', 'Loan amount'), 'principal', state.principal)}
      <div class="form-grid">
        ${percentField(L('نرخ سود سالانه (٪)', 'Annual rate (%)'), 'rate', state.rate)}
        ${numberField(L('تعداد اقساط', 'Instalments'), 'months', state.months, 'min="1" max="600"')}
      </div>
      <button type="submit" class="btn btn--primary btn--grow">${esc(L('محاسبه', 'Calculate'))}</button>
    </form>
    ${state.result ? loanResultHTML(state.result) : ''}
  </section>`;
}

function loanResultHTML(result) {
  return `<div class="result-box">
    ${summaryRow(L('قسط ماهانه', 'Monthly payment'), `<strong>${formatMoney(result.payment)}</strong>`, { strong: true })}
    ${summaryRow(L('جمع بازپرداخت', 'Total repaid'), formatMoney(result.totalPaid))}
    ${summaryRow(L('سود کل', 'Total interest'), formatMoney(result.totalInterest))}
    <p class="card__sub">${esc(L(
      `اصل ${formatMoney(result.principal)}، نرخ سالانه ${faDigits(result.rate)}٪، ${faDigits(result.months)} قسط مساوی، نرخ ثابت و پرداخت سر وقت.`,
      `principal ${formatMoney(result.principal)}, ${result.rate}% per year, ${result.months} equal instalments, fixed rate, every payment on time.`,
    ))}</p>
  </div>`;
}

function affordabilityDefaults() {
  const nextKey = addMonthsToKey(currentMonthKey(), 1);
  const expectedNext = sum(expectedForMonth(nextKey), (row) => row.amount);
  const expectedThis = sum(expectedForMonth(currentMonthKey()), (row) => row.amount);
  return {
    income: expectedNext || expectedThis || averageMonthlyIncome(3),
    expenses: averageMonthlyExpense(3),
    existing: monthlyLoanPaymentTotal(),
  };
}

function averageMonthlyIncome(monthsBack = 3) {
  const keys = [];
  for (let i = 1; i <= monthsBack; i += 1) keys.push(addMonthsToKey(currentMonthKey(), -i));
  const totals = keys.map((key) => monthSummary(key).incomeActual).filter((value) => value > 0);
  if (!totals.length) return 0;
  return Math.round(sum(totals, (value) => value) / totals.length);
}

function affordView() {
  const state = cp().afford;
  const defaults = affordabilityDefaults();
  return `<section class="card">
    ${sectionTitle(L('آیا از عهده وام جدید برمی‌آییم؟', 'Could we afford a new loan?'))}
    <p class="card__sub">${esc(L(
      'اعداد درآمد و هزینه از داده‌های خودتان پیش‌فرض شده‌اند و قابل ویرایش‌اند.',
      'Income and expense fields start from your own data and can be edited.',
    ))}</p>
    <form data-form="calc-afford">
      ${moneyField(L('درآمد ماهانه خانوار', 'Household monthly income'), 'income', state.income || formatAmountForInput(defaults.income))}
      ${moneyField(L('هزینه ماهانه', 'Monthly expenses'), 'expenses', state.expenses || formatAmountForInput(defaults.expenses))}
      ${moneyField(L('اقساط وام‌های موجود', 'Existing loan payments'), 'existing', state.existing || formatAmountForInput(defaults.existing))}
      <div class="form-grid">
        ${moneyField(L('مبلغ وام پیشنهادی', 'Proposed loan'), 'principal', state.principal)}
        ${percentField(L('نرخ سالانه (٪)', 'Annual rate (%)'), 'rate', state.rate)}
      </div>
      ${numberField(L('تعداد اقساط', 'Instalments'), 'months', state.months, 'min="1" max="600"')}
      <button type="submit" class="btn btn--primary btn--grow">${esc(L('بررسی توان بازپرداخت', 'Check affordability'))}</button>
    </form>
    ${state.result ? affordResultHTML(state.result) : ''}
  </section>`;
}

function affordResultHTML(result) {
  const verdictLabels = {
    comfortable: L('راحت', 'Comfortable'),
    ok: L('قابل انجام', 'Workable'),
    tight: L('سخت ولی ممکن', 'Tight'),
    risky: L('پرریسک', 'Risky'),
    negative: L('کم می‌آید', 'Not enough'),
    unknown: L('اطلاعات کافی نیست', 'Not enough information'),
  };
  return `<div class="result-box result-box--${result.verdict}">
    <div class="verdict">
      <span class="verdict__label">${esc(L('ارزیابی', 'Verdict'))}</span>
      <strong class="verdict__value">${esc(verdictLabels[result.verdict] || '')}</strong>
      <span class="verdict__meta">${esc(L('نسبت اقساط به درآمد', 'Instalments as a share of income'))}: ${faDigits(result.debtRatioPct)}${L('٪', '%')}</span>
    </div>
    <table class="mini-table mini-table--rows">
      <tbody>
        <tr><th>${esc(L('درآمد ماهانه', 'Monthly income'))}</th><td>${formatMoney(result.income)}</td><td class="src">${esc(L('ورودی/واقعی', 'entered'))}</td></tr>
        <tr><th>${esc(L('هزینه ماهانه', 'Monthly expenses'))}</th><td>${formatMoney(result.expenses)}</td><td class="src">${esc(L('تخمین از سابقه', 'from history'))}</td></tr>
        <tr><th>${esc(L('اقساط موجود', 'Existing instalments'))}</th><td>${formatMoney(result.existingPayments)}</td><td class="src">${esc(L('از وام‌های ثبت‌شده', 'from saved loans'))}</td></tr>
        <tr><th>${esc(L('قسط وام جدید', 'New instalment'))}</th><td>${formatMoney(result.newPayment)}</td><td class="src">${esc(L('محاسبه‌شده', 'calculated'))}</td></tr>
        <tr class="is-total"><th>${esc(L('باقی‌مانده ماهانه', 'Left each month'))}</th><td>${formatMoney(result.available)}</td><td class="src">${esc(L('محاسبه‌شده', 'calculated'))}</td></tr>
      </tbody>
    </table>
    <p class="card__sub">${esc(L(
      'این یک تخمین برنامه‌ریزی است؛ درآمد واقعی ممکن است کم‌تر یا دیرتر برسد.',
      'This is a planning estimate; real income may arrive lower or later.',
    ))}</p>
  </div>`;
}

/* ---------------- page ---------------- */

export function renderCalc() {
  const tab = cp().tab;
  const tabs = [
    { value: 'loan', label: L('وام', 'Loan') },
    { value: 'afford', label: L('توان بازپرداخت', 'Affordable?') },
    { value: 'bnpl', label: L('اقساطی', 'Instalments') },
    { value: 'deposit', label: L('سود سپرده', 'Deposit') },
    { value: 'tax', label: L('مالیات', 'Tax') },
  ];
  return `<div class="view">
    <div class="view-head">
      <h1 class="page-title">${esc(L('محاسبه', 'Calculate'))}</h1>
      ${segmented('calcTab', tabs, tab, 'calc-tab')}
    </div>
    ${tab === 'loan' ? loanView() : ''}
    ${tab === 'afford' ? affordView() : ''}
    ${tab === 'bnpl' ? bnplView() : ''}
    ${tab === 'deposit' ? depositView() : ''}
    ${tab === 'tax' ? taxView() : ''}
    ${note(esc(L(
      'همه این اعداد تخمین برنامه‌ریزی‌اند، نه مشاوره مالی یا مالیاتی و نه تضمینی از طرف بانک.',
      'These are planning estimates — not financial or tax advice, and not a bank guarantee.',
    )), 'warn')}
  </div>`;
}

/* ---------------- handlers ---------------- */

onAction('calc-tab', (element) => {
  cp().tab = element.dataset.value || 'loan';
  rerender();
});

onForm('deposit', (form) => {
  const principal = parseAmount(form.elements.principal.value);
  const rate = Number(normalizeDigits(form.elements.rate.value)) || 0;
  const months = Number(normalizeDigits(form.elements.months.value)) || 0;
  const withholding = Number(normalizeDigits(form.elements.withholding.value)) || 0;
  if (!Number.isFinite(principal) || principal <= 0 || months <= 0) {
    toast(L('مبلغ سپرده و مدت را وارد کنید.', 'Enter the deposit amount and the term.'), 'warn');
    return;
  }
  const method = form.elements.method.value;  const result = depositPlan({ principal, annualRatePct: rate, months, method, withholdingPct: withholding });
  cp().deposit = {
    principal: formatAmountForInput(principal),
    rate: String(rate),
    months: String(months),
    method,
    withholding: String(withholding),
    result,
  };
  rerender();
});


onForm('bnpl', (form) => {
  const price = parseAmount(form.elements.price.value);
  const downRaw = parseAmount(form.elements.down.value);
  const months = Number(normalizeDigits(form.elements.months.value)) || 4;
  const feeType = form.elements.feeType.value === 'amount' ? 'amount' : 'percent';
  const feeRaw = feeType === 'percent'
    ? Number(normalizeDigits(form.elements.feeValue.value)) || 0
    : parseAmount(form.elements.feeValue.value);
  if (!Number.isFinite(price) || price <= 0) {
    toast(L('مبلغ کالا را وارد کنید.', 'Enter the price.'), 'warn');
    return;
  }
  const down = Number.isFinite(downRaw) ? downRaw : 0;
  if (down >= price) {
    toast(L('پیش‌پرداخت باید کم‌تر از مبلغ کالا باشد.', 'The down payment must be less than the price.'), 'warn');
    return;
  }
  const result = bnplPlan({
    price,
    downPayment: down,
    months,
    feeType,
    feeValue: Number.isFinite(feeRaw) ? feeRaw : 0,
  });
  cp().bnpl = {
    platform: form.elements.platform.value.trim(),
    price: formatAmountForInput(price),
    down: formatAmountForInput(down),
    months: String(months),
    feeType,
    feeValue: feeType === 'percent' ? String(feeRaw) : formatAmountForInput(feeRaw),
    firstDate: readDate(form.querySelector('[data-date-picker]')),
    result,
  };
  rerender();
});

onAction('bnpl-to-loan', async () => {
  const state = cp().bnpl;
  if (!state.result) return;
  const people = profilesSorted();
  if (!people.length) {
    toast(L('اول یک نفر از اعضای خانواده را اضافه کنید.', 'Add a family member first.'), 'warn');
    return;
  }
  await upsert('loans', {
    lender: state.platform || L('خرید اقساطی', 'Instalment purchase'),
    profileId: people[0].id,
    principal: state.result.total,
    startDate: state.firstDate,
    annualRatePct: 0,
    termMonths: state.result.months,
    schedule: 'equal',
    monthlyPayment: state.result.perMonth,
    nextPaymentDate: state.firstDate,
    notes: L(
      `خرید اقساطی ${faDigits(state.result.months)} قسطه`,
      `${state.result.months}-instalment purchase`,
    ),
    payments: [],
  });
  toast(L('به‌عنوان وام اقساطی ثبت شد؛ در «برنامه» ببینید.', 'Saved as an instalment loan — see Planning.'));
  rerender();
});

onForm('tax', (form) => {
  const income = parseAmount(form.elements.income.value);
  const deduction = parseAmount(form.elements.deduction.value);
  const paid = parseAmount(form.elements.paid.value);
  if (!Number.isFinite(income) || income <= 0) {
    toast(L('درآمد سالانه را وارد کنید.', 'Enter the annual income.'), 'warn');
    return;
  }
  const brackets = cp().tax.brackets.map((bracket, index) => {
    const limit = parseAmount(form.elements[`limit${index}`].value);
    const rate = Number(normalizeDigits(form.elements[`rate${index}`].value)) || 0;
    return { upTo: Number.isFinite(limit) ? limit : null, rate: rate / 100 };
  });
  const result = taxReturn({
    income,
    deduction: Number.isFinite(deduction) ? deduction : 0,
    paid: Number.isFinite(paid) ? paid : 0,
    brackets,
  });
  cp().tax = {
    ...cp().tax,
    income: formatAmountForInput(income),
    deduction: formatAmountForInput(Number.isFinite(deduction) ? deduction : 0),
    paid: formatAmountForInput(Number.isFinite(paid) ? paid : 0),
    brackets,
    result,
  };
  rerender();
});

onForm('calc-loan', (form) => {
  const principal = parseAmount(form.elements.principal.value);
  const rate = Number(normalizeDigits(form.elements.rate.value)) || 0;
  const months = Number(normalizeDigits(form.elements.months.value)) || 0;
  if (!Number.isFinite(principal) || principal <= 0 || months <= 0) {
    toast(L('مبلغ و تعداد اقساط را وارد کنید.', 'Enter the amount and the number of instalments.'), 'warn');
    return;
  }
  const schedule = loanSchedule(principal, rate, months);
  cp().loan = {
    principal: formatAmountForInput(principal),
    rate: String(rate),
    months: String(months),
    result: {
      principal,
      rate,
      months,
      payment: schedule.payment,
      totalPaid: schedule.totalPaid,
      totalInterest: schedule.totalInterest,
    },
  };
  rerender();
});

onForm('calc-afford', (form) => {
  const income = parseAmount(form.elements.income.value);
  const expenses = parseAmount(form.elements.expenses.value);
  const existing = parseAmount(form.elements.existing.value);
  const principal = parseAmount(form.elements.principal.value);
  const rate = Number(normalizeDigits(form.elements.rate.value)) || 0;
  const months = Number(normalizeDigits(form.elements.months.value)) || 0;
  if (!Number.isFinite(income) || income <= 0) {
    toast(L('درآمد ماهانه را وارد کنید.', 'Enter the monthly income.'), 'warn');
    return;
  }
  const newPayment = Number.isFinite(principal) && principal > 0 && months > 0
    ? loanMonthlyPayment(principal, rate, months)
    : 0;
  const result = affordability({
    income,
    expenses: Number.isFinite(expenses) ? expenses : 0,
    existingPayments: Number.isFinite(existing) ? existing : 0,
    newPayment,
  });
  cp().afford = {
    income: formatAmountForInput(income),
    expenses: formatAmountForInput(Number.isFinite(expenses) ? expenses : 0),
    existing: formatAmountForInput(Number.isFinite(existing) ? existing : 0),
    principal: formatAmountForInput(Number.isFinite(principal) ? principal : 0),
    rate: String(rate),
    months: String(months),
    result,
  };
  rerender();
});

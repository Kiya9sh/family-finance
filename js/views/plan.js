/*
 * Planning tab: expected income, loans (with payment history), money lent and
 * borrowed, the loan calculator and the affordability estimate.
 */

import { L } from '../i18n.js';
import {
  data, ui, profilesSorted, categoriesOf, categoryName, upsert, removeRecord,
  recordLoanPayment, loanRemaining, loanPaidTotal, loanMonthlyPayment, loanSchedule,
  loanNextDueDate, upcomingLoanPayments, monthlyLoanPaymentTotal, averageMonthlyExpense,
  expectedForMonth, affordability, lendingTotals, monthSummary, profileName,
} from '../state.js';
import {
  todayISO, currentMonthKey, addMonthsToKey, addMonthsToISO,
} from '../jalali.js';
import {
  formatMoney, formatNumber, formatDate, formatDateShort, formatMonthLabel, escapeHtml as esc,
  parseAmount, formatAmountForInput, faDigits, relativeDay, sum, normalizeDigits, pct,
} from '../util.js';
import {
  openSheet, confirmDialog, toast, field, selectInput, datePicker, readDate, note, emptyState,
  icon, segmented, sectionTitle, summaryRow, statTile, monthNav,
} from '../components.js';
import { onAction, onForm, rerender } from '../bus.js';

if (!ui.calc) ui.calc = { principal: '', rate: '18', months: '60', result: null };
if (!ui.afford) ui.afford = { income: '', expenses: '', existing: '', principal: '', rate: '18', months: '60', result: null };

/* ---------------- view ---------------- */

export function renderPlan() {
  const tab = ui.plan.tab;
  const tabs = [
    { value: 'expected', label: L('درآمد انتظاری', 'Expected') },
    { value: 'loans', label: L('وام‌ها', 'Loans') },
    { value: 'lending', label: L('قرض', 'Lending') },
    { value: 'calc', label: L('محاسبه', 'Calculator') },
  ];
  return `<div class="view">
    <div class="view-head">
      <h1 class="page-title">${esc(L('برنامه‌ریزی', 'Planning'))}</h1>
      ${segmented('planTab', tabs, tab, 'plan-tab')}
    </div>
    ${tab === 'expected' ? expectedTab() : ''}
    ${tab === 'loans' ? loansTab() : ''}
    ${tab === 'lending' ? lendingTab() : ''}
    ${tab === 'calc' ? calcTab() : ''}
  </div>`;
}

/* ---------------- expected income ---------------- */

function expectedTab() {
  const monthKey = ui.monthKey;
  const rows = expectedForMonth(monthKey);
  const total = sum(rows, (row) => row.amount);
  const summary = monthSummary(monthKey);
  const nextKey = addMonthsToKey(monthKey, 1);
  const nextTotal = sum(expectedForMonth(nextKey), (row) => row.amount);

  return `<section class="card">
      ${monthNav(monthKey)}
      <div class="stat-grid stat-grid--two">
        ${statTile({ label: L('درآمد انتظاری این ماه', 'Expected this month'), value: formatMoney(total), tone: 'expected' })}
        ${statTile({ label: L('درآمد ثبت‌شده', 'Recorded so far'), value: formatMoney(summary.incomeActual), tone: 'income' })}
      </div>
      <div class="row row--gap row--wrap">
        <button type="button" class="btn btn--primary btn--small" data-action="new-expected">
          ${icon('plus', 16)}<span>${esc(L('درآمد انتظاری', 'Expected income'))}</span>
        </button>
        <button type="button" class="btn btn--ghost btn--small" data-action="copy-expected">
          ${esc(L('کپی از ماه قبل', 'Copy last month'))}
        </button>
      </div>
      <p class="card__sub">${esc(L('ماه بعد', 'Next month'))}: ${formatMonthLabel(nextKey)} — ${formatMoney(nextTotal)}</p>
    </section>

    ${rows.length
      ? `<section class="card">
          ${sectionTitle(L('فهرست درآمد انتظاری', 'Expected income entries'))}
          <ul class="plain-list">
            ${rows
              .map(
                (row) => `<li class="plain-list__item">
                <div class="plain-list__main">
                  <span class="plain-list__title">${esc(categoryName(row.categoryId, row.categoryName))}</span>
                  <span class="plain-list__meta">${esc(profileName(row.profileId))}${row.note ? ` · ${esc(row.note)}` : ''}</span>
                </div>
                <div class="plain-list__side">
                  <span class="plain-list__amount">${formatMoney(row.amount)}</span>
                  <button type="button" class="icon-btn" data-action="delete-expected" data-id="${esc(row.id)}"
                    aria-label="${esc(L('حذف', 'Delete'))}">${icon('trash', 18)}</button>
                </div>
              </li>`,
              )
              .join('')}
          </ul>
        </section>`
      : emptyState({
          iconName: 'calendar',
          title: L('درآمد انتظاری ثبت نشده', 'No expected income yet'),
          text: esc(L(
            'درآمدی که فکر می‌کنید این ماه یا ماه‌های بعد می‌رسد را اینجا وارد کنید تا در نمودارها از درآمد واقعی جدا بماند.',
            'Record the income you expect this month or in the months ahead, so it stays separate from income that has actually arrived.',
          )),
          action: `<button type="button" class="btn btn--primary" data-action="new-expected">${esc(L('افزودن درآمد انتظاری', 'Add expected income'))}</button>`,
        })}

    ${note(esc(L(
      'درآمد انتظاری یک برنامه است، نه پول رسیده؛ داشبورد آن را جدا از درآمد ثبت‌شده نشان می‌دهد.',
      'Expected income is a plan, not money received — the dashboard always shows it separately.',
    )))}`;
}

function openExpectedSheet() {
  const people = profilesSorted();
  const cats = categoriesOf('income');
  if (!people.length) {
    toast(L('اول یک نفر از اعضای خانواده را اضافه کنید.', 'Add a family member first.'), 'warn');
    return;
  }
  const monthOptions = [];
  for (let i = -1; i <= 11; i += 1) {
    const key = addMonthsToKey(currentMonthKey(), i);
    monthOptions.push({ value: key, label: formatMonthLabel(key) });
  }
  const formId = `exp-form-${Math.random().toString(36).slice(2, 7)}`;
  const body = `<form id="${formId}">
    ${field({ label: L('ماه', 'Month'), input: selectInput({ name: 'month', options: monthOptions, value: ui.monthKey }) })}
    ${field({ label: L('شخص', 'Person'), input: selectInput({ name: 'profileId', options: people.map((p) => ({ value: p.id, label: p.name })) }) })}
    ${field({ label: L('دسته درآمد', 'Income category'), input: selectInput({ name: 'categoryId', options: cats.map((c) => ({ value: c.id, label: c.name })) }) })}
    ${field({ label: L('مبلغ (تومان)', 'Amount (Toman)'), input: `<div class="amount-wrap">
        <input class="input input--amount" type="text" inputmode="numeric" autocomplete="off" data-amount name="amount" value="">
        <span class="amount-wrap__unit">${esc(L('تومان', 'Toman'))}</span>
      </div><span class="amount-preview" data-amount-preview></span>`, required: true })}
    ${field({ label: L('یادداشت', 'Note'), input: `<input class="input" name="note" maxlength="80" autocomplete="off">` })}
    <p class="form-error" data-form-error role="alert"></p>
  </form>`;
  const sheet = openSheet({
    title: L('درآمد انتظاری', 'Expected income'),
    body,
    footer: `<button type="submit" form="${formId}" class="btn btn--primary btn--grow">${esc(L('ذخیره', 'Save'))}</button>`,
  });
  const form = sheet.el.querySelector('form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const amount = parseAmount(form.elements.amount.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      form.querySelector('[data-form-error]').textContent = L('مبلغ را وارد کنید.', 'Enter an amount.');
      return;
    }
    const categoryId = form.elements.categoryId.value;
    await upsert('expected', {
      month: form.elements.month.value,
      profileId: form.elements.profileId.value,
      categoryId,
      categoryName: categoryName(categoryId),
      amount,
      note: form.elements.note.value.trim(),
    });
    sheet.close();
    rerender();
    toast(L('ذخیره شد', 'Saved'));
  });
}

/* ---------------- loans ---------------- */

function loansTab() {
  const loans = data.loans
    .slice()
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
  const monthlyTotal = monthlyLoanPaymentTotal();
  const remainingTotal = sum(loans, (loan) => loanRemaining(loan));
  const due = upcomingLoanPayments(30);

  return `<section class="card">
      <div class="stat-grid stat-grid--two">
        ${statTile({ label: L('جمع اقساط ماهانه', 'Monthly instalments'), value: formatMoney(monthlyTotal), tone: 'loan' })}
        ${statTile({ label: L('جمع مانده بدهی', 'Total remaining'), value: formatMoney(remainingTotal), tone: 'expense' })}
      </div>
      <button type="button" class="btn btn--primary btn--small" data-action="new-loan">
        ${icon('plus', 16)}<span>${esc(L('وام جدید', 'New loan'))}</span>
      </button>
      ${due.length
        ? `<p class="card__sub">${esc(L('قسط نزدیک', 'Next instalment'))}: ${esc(formatDateShort(due[0].dueDate))} — ${formatMoney(due[0].amount)} (${esc(due[0].lender)})</p>`
        : ''}
    </section>

    ${loans.length
      ? `<section class="card">
          ${sectionTitle(L('وام‌ها', 'Loans'))}
          <ul class="plain-list">
            ${loans.map((loan) => loanRowHTML(loan)).join('')}
          </ul>
        </section>`
      : emptyState({
          iconName: 'wallet',
          title: L('وامی ثبت نشده', 'No loans recorded'),
          text: esc(L(
            'وام‌های بانکی یا قرض‌های بزرگ را ثبت کنید تا اقساط نزدیک و مانده بدهی را ببینید.',
            'Record bank loans or large debts to see upcoming instalments and what is left to pay.',
          )),
          action: `<button type="button" class="btn btn--primary" data-action="new-loan">${esc(L('افزودن وام', 'Add a loan'))}</button>`,
        })}

    ${note(esc(L(
      'محاسبه اقساط یک تخمین است و ممکن است با مبلغ واقعی بانک فرق کند؛ عدد قرارداد همیشه مرجع است.',
      'Instalment estimates can differ from what the bank actually charges; the contract figure always wins.',
    )))}`;
}

function loanRowHTML(loan) {
  const remaining = loanRemaining(loan);
  const principal = Number(loan.principal) || 0;
  const paidShare = principal ? Math.min(100, Math.round(((principal - remaining) / principal) * 100)) : 0;
  return `<li class="plain-list__item plain-list__item--stacked">
    <button type="button" class="plain-list__button" data-action="open-loan" data-id="${esc(loan.id)}">
      <div class="plain-list__main">
        <span class="plain-list__title">${esc(loan.lender || L('وام', 'Loan'))}</span>
        <span class="plain-list__meta">
          ${esc(profileName(loan.profileId))} · ${esc(L('قسط', 'Instalment'))} ${formatMoney(loan.monthlyPayment || 0)}
          ${loan.demo ? ` · ${esc(L('نمونه', 'Sample'))}` : ''}
        </span>
      </div>
      <div class="plain-list__side">
        <span class="plain-list__amount">${formatMoney(remaining)}</span>
        <span class="plain-list__hint">${esc(L('مانده', 'left'))}</span>
      </div>
    </button>
    <div class="progress" role="img" aria-label="${esc(`${paidShare}%`)}">
      <span class="progress__fill" style="width:${paidShare}%"></span>
    </div>
  </li>`;
}

function openLoanSheet(existing = null) {
  const people = profilesSorted();
  if (!people.length) {
    toast(L('اول یک نفر از اعضای خانواده را اضافه کنید.', 'Add a family member first.'), 'warn');
    return;
  }
  const loan = existing || {};
  const formId = `loan-form-${Math.random().toString(36).slice(2, 7)}`;
  const schedule = loan.schedule || 'equal';
  const body = `<form id="${formId}">
    ${field({ label: L('وام‌دهنده', 'Lender'), input: `<input class="input" name="lender" autocomplete="off" maxlength="60" value="${esc(loan.lender || '')}" placeholder="${esc(L('مثلاً بانک ملت', 'e.g. Bank Mellat'))}">`, required: true })}
    ${field({ label: L('برای', 'For'), input: selectInput({ name: 'profileId', options: people.map((p) => ({ value: p.id, label: p.name })), value: loan.profileId || people[0].id }) })}
    ${field({ label: L('مبلغ اصل وام (تومان)', 'Principal (Toman)'), input: `<div class="amount-wrap">
        <input class="input input--amount" type="text" inputmode="numeric" data-amount name="principal" value="${esc(formatAmountForInput(loan.principal || 0))}">
        <span class="amount-wrap__unit">${esc(L('تومان', 'Toman'))}</span></div><span class="amount-preview" data-amount-preview></span>`, required: true })}
    ${field({ label: L('تاریخ شروع', 'Start date'), input: datePicker('startDate', loan.startDate || todayISO()) })}
    <div class="form-grid">
      ${field({ label: L('نرخ سود سالانه (٪)', 'Annual rate (%)'), input: `<input class="input" type="number" inputmode="decimal" step="0.1" min="0" max="100" name="annualRatePct" value="${esc(loan.annualRatePct ?? 18)}">` })}
      ${field({ label: L('تعداد اقساط', 'Number of instalments'), input: `<input class="input" type="number" inputmode="numeric" min="1" max="600" name="termMonths" value="${esc(loan.termMonths ?? 60)}">` })}
    </div>
    ${field({
      label: L('نوع بازپرداخت', 'Payment schedule'),
      input: selectInput({
        name: 'schedule',
        options: [
          { value: 'equal', label: L('اقساط مساوی (محاسبه خودکار)', 'Equal instalments (calculated)') },
          { value: 'manual', label: L('مبلغ را خودم وارد می‌کنم', 'I enter the amount myself') },
        ],
        value: schedule,
      }),
    })}
    ${field({
      label: L('قسط ماهانه (تومان)', 'Monthly payment (Toman)'),
      input: `<div class="amount-wrap">
        <input class="input input--amount" type="text" inputmode="numeric" data-amount name="monthlyPayment" data-auto="${loan.id ? '0' : '1'}" value="${esc(formatAmountForInput(loan.monthlyPayment || 0))}">
        <span class="amount-wrap__unit">${esc(L('تومان', 'Toman'))}</span></div><span class="amount-preview" data-amount-preview></span>
        <span class="field__hint" data-payment-hint></span>`,
    })}
    ${field({ label: L('قسط بعدی', 'Next instalment date'), input: datePicker('nextPaymentDate', loan.nextPaymentDate || loan.startDate || todayISO()) })}
    ${field({
      label: L('مانده بدهی (اختیاری)', 'Remaining balance (optional)'),
      input: `<div class="amount-wrap">
        <input class="input input--amount" type="text" inputmode="numeric" data-amount name="remainingBalance"
          value="${typeof loan.remainingBalance === 'number' ? esc(formatAmountForInput(loan.remainingBalance)) : ''}">
        <span class="amount-wrap__unit">${esc(L('تومان', 'Toman'))}</span></div><span class="amount-preview" data-amount-preview></span>`,
      hint: esc(L('اگر خالی بماند، از اصل وام منهای پرداخت‌ها حساب می‌شود.', 'Left empty, it is calculated from the principal minus payments.')),
    })}
    ${field({ label: L('یادداشت', 'Note'), input: `<textarea class="input input--area" name="notes" rows="2">${esc(loan.notes || '')}</textarea>` })}
    <p class="form-error" data-form-error role="alert"></p>
  </form>`;

  const sheet = openSheet({
    title: existing ? L('ویرایش وام', 'Edit loan') : L('وام جدید', 'New loan'),
    subtitle: L('همه اعداد تخمینی‌اند؛ مبلغ قرارداد بانک مرجع است.', 'All figures are estimates; the bank contract is the reference.'),
    body,
    footer: `<div class="row row--gap">
      ${existing ? `<button type="button" class="btn btn--ghost btn--icon" data-delete aria-label="${esc(L('حذف', 'Delete'))}">${icon('trash', 20)}</button>` : ''}
      <button type="submit" form="${formId}" class="btn btn--primary btn--grow">${esc(L('ذخیره وام', 'Save loan'))}</button>
    </div>`,
  });

  const form = sheet.el.querySelector('form');
  const principalEl = form.elements.principal;
  const rateEl = form.elements.annualRatePct;
  const termEl = form.elements.termMonths;
  const scheduleEl = form.elements.schedule;
  const monthlyEl = form.elements.monthlyPayment;

  const recompute = () => {
    if (scheduleEl.value !== 'equal') return;
    const principal = parseAmount(principalEl.value);
    const rate = Number(normalizeDigits(rateEl.value)) || 0;
    const months = Number(normalizeDigits(termEl.value)) || 0;
    if (!Number.isFinite(principal) || principal <= 0 || months <= 0) return;
    const payment = loanMonthlyPayment(principal, rate, months);
    if (monthlyEl.dataset.auto !== '0' && payment > 0) {
      monthlyEl.value = formatAmountForInput(payment);
      const preview = form.querySelector('[data-amount-preview]');
      const hint = form.querySelector('[data-payment-hint]');
      if (hint) hint.textContent = `${L('قسط محاسبه‌شده', 'Calculated instalment')}: ${formatMoney(payment)}`;
      if (preview) preview.textContent = `${formatMoney(payment)}`;
    }
  };
  [principalEl, rateEl, termEl, scheduleEl].forEach((el) => {
    el.addEventListener('input', recompute);
    el.addEventListener('change', recompute);
  });
  monthlyEl.addEventListener('input', () => {
    monthlyEl.dataset.auto = '0';
  });
  setTimeout(recompute, 60);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const principal = parseAmount(principalEl.value);
    if (!Number.isFinite(principal) || principal <= 0) {
      form.querySelector('[data-form-error]').textContent = L('مبلغ اصل وام را وارد کنید.', 'Enter the loan principal.');
      return;
    }
    const monthlyPayment = parseAmount(monthlyEl.value);
    const remainingInput = parseAmount(form.elements.remainingBalance.value);
    const startDateIso = readDate(form.querySelectorAll('[data-date-picker]')[0]);
    const nextPickers = form.querySelectorAll('[data-date-picker]');
    const nextPaymentDate = nextPickers.length > 1 ? readDate(nextPickers[1]) : startDateIso;
    const next = {
      ...(existing || {}),
      lender: form.elements.lender.value.trim(),
      profileId: form.elements.profileId.value,
      principal,
      startDate: startDateIso,
      annualRatePct: Number(normalizeDigits(rateEl.value)) || 0,
      termMonths: Number(normalizeDigits(termEl.value)) || 0,
      schedule: scheduleEl.value,
      monthlyPayment: Number.isFinite(monthlyPayment) ? monthlyPayment : 0,
      nextPaymentDate,
      notes: form.elements.notes.value.trim(),
      payments: (existing && existing.payments) || [],
    };
    if (Number.isFinite(remainingInput) && remainingInput > 0) next.remainingBalance = remainingInput;
    else delete next.remainingBalance;
    if (!existing) delete next.id;

    await upsert('loans', next);
    sheet.close();
    rerender();
    toast(L('وام ذخیره شد', 'Loan saved'));
  });

  const deleteBtn = sheet.el.querySelector('[data-delete]');
  if (deleteBtn && existing) {
    deleteBtn.addEventListener('click', async () => {
      sheet.close();
      const ok = await confirmDialog({
        title: L('حذف وام', 'Delete loan'),
        message: esc(L(
          'این وام و تاریخچه پرداخت‌هایش حذف شود؟ این کار قابل بازگشت نیست.',
          'Delete this loan and its payment history? This cannot be undone.',
        )),
        confirmText: L('حذف', 'Delete'),
        danger: true,
      });
      if (!ok) return;
      await removeRecord('loans', existing.id);
      rerender();
      toast(L('حذف شد', 'Deleted'));
    });
  }
}

function openLoanDetail(loanId) {
  const loan = data.loans.find((item) => item.id === loanId);
  if (!loan) return;
  const remaining = loanRemaining(loan);
  const payments = (loan.payments || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const computedRemaining = Math.max(0, (Number(loan.principal) || 0) - loanPaidTotal(loan));
  const body = `
    ${summaryRow(L('اصل وام', 'Principal'), formatMoney(loan.principal), { strong: true })}
    ${summaryRow(L('قسط ماهانه', 'Monthly payment'), formatMoney(loan.monthlyPayment || 0))}
    ${summaryRow(L('نرخ سود سالانه', 'Annual rate'), `${faDigits(loan.annualRatePct || 0)}${L('٪', '%')}`)}
    ${summaryRow(L('تعداد اقساط', 'Instalments'), faDigits(loan.termMonths || 0))}
    ${summaryRow(L('شروع', 'Started'), formatDateShort(loan.startDate))}
    ${summaryRow(L('قسط بعدی', 'Next instalment'), `${formatDateShort(loanNextDueDate(loan))} (${relativeDay(loanNextDueDate(loan))})`)}
    ${summaryRow(L('پرداخت‌شده', 'Paid so far'), formatMoney(loanPaidTotal(loan)))}
    ${summaryRow(
      L('مانده بدهی', 'Remaining'),
      formatMoney(remaining),
      { strong: true, tone: 'expense' },
    )}
    <p class="card__sub">${esc(
      typeof loan.remainingBalance === 'number'
        ? L('مانده از عددی است که خودتان وارد کرده‌اید.', 'Remaining uses the figure you entered.')
        : `${L('مانده از اصل منهای پرداخت‌ها حساب شده', 'Remaining is calculated from principal minus payments')}: ${formatMoney(computedRemaining)}`,
    )}</p>
    ${loan.notes ? `<p class="card__sub">${esc(loan.notes)}</p>` : ''}
    <div class="row row--gap row--wrap">
      <button type="button" class="btn btn--primary btn--small" data-pay>${icon('plus', 16)}<span>${esc(L('ثبت پرداخت', 'Record payment'))}</span></button>
      <button type="button" class="btn btn--ghost btn--small" data-edit>${esc(L('ویرایش وام', 'Edit loan'))}</button>
    </div>
    ${payments.length
      ? `<h3 class="subhead">${esc(L('تاریخچه پرداخت‌ها', 'Payment history'))}</h3>
        <ul class="plain-list">
          ${payments
            .map(
              (payment) => `<li class="plain-list__item">
              <div class="plain-list__main">
                <span class="plain-list__title">${formatMoney(payment.amount)}</span>
                <span class="plain-list__meta">${esc(formatDate(payment.date))}${payment.note ? ` · ${esc(payment.note)}` : ''}</span>
              </div>
              <button type="button" class="icon-btn" data-remove-payment="${esc(payment.id)}"
                aria-label="${esc(L('حذف پرداخت', 'Delete payment'))}">${icon('trash', 18)}</button>
            </li>`,
            )
            .join('')}
        </ul>`
      : `<p class="card__sub">${esc(L('هنوز پرداختی ثبت نشده است.', 'No payments recorded yet.'))}</p>`}
  `;

  const sheet = openSheet({ title: loan.lender || L('وام', 'Loan'), body });
  sheet.el.querySelector('[data-pay]').addEventListener('click', () => {
    sheet.close();
    openLoanPaymentSheet(loan);
  });
  sheet.el.querySelector('[data-edit]').addEventListener('click', () => {
    sheet.close();
    openLoanSheet(loan);
  });
  sheet.el.querySelectorAll('[data-remove-payment]').forEach((button) => {
    button.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: L('حذف پرداخت', 'Delete payment'),
        message: esc(L('این پرداخت از تاریخچه حذف شود؟', 'Remove this payment from the history?')),
        confirmText: L('حذف', 'Delete'),
        danger: true,
      });
      if (!ok) return;
      const payments2 = (loan.payments || []).filter((payment) => payment.id !== button.dataset.removePayment);
      const restored = Math.min(
        Number(loan.principal) || 0,
        loanRemaining(loan) + (Number((loan.payments || []).find((p) => p.id === button.dataset.removePayment)?.amount) || 0),
      );
      await upsert('loans', { ...loan, payments: payments2, remainingBalance: restored });
      sheet.close();
      rerender();
      toast(L('پرداخت حذف شد', 'Payment removed'));
    });
  });
}

function openLoanPaymentSheet(loan) {
  const formId = `loan-pay-${Math.random().toString(36).slice(2, 7)}`;
  const body = `<form id="${formId}">
    <p class="dialog-text">${esc(loan.lender)} — ${esc(L('مانده', 'remaining'))}: ${formatMoney(loanRemaining(loan))}</p>
    ${field({
      label: L('مبلغ پرداخت (تومان)', 'Payment amount (Toman)'),
      input: `<div class="amount-wrap">
        <input class="input input--amount" type="text" inputmode="numeric" data-amount name="amount"
          value="${esc(formatAmountForInput(loan.monthlyPayment || 0))}">
        <span class="amount-wrap__unit">${esc(L('تومان', 'Toman'))}</span></div><span class="amount-preview" data-amount-preview></span>`,
      required: true,
    })}
    ${field({ label: L('تاریخ', 'Date'), input: datePicker('payDate', todayISO()) })}
    ${field({ label: L('یادداشت', 'Note'), input: `<input class="input" name="note" maxlength="80" autocomplete="off">` })}
    <p class="form-error" data-form-error role="alert"></p>
  </form>`;
  const sheet = openSheet({
    title: L('ثبت پرداخت وام', 'Record loan payment'),
    body,
    footer: `<button type="submit" form="${formId}" class="btn btn--primary btn--grow">${esc(L('ثبت پرداخت', 'Record payment'))}</button>`,
  });
  const form = sheet.el.querySelector('form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const amount = parseAmount(form.elements.amount.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      form.querySelector('[data-form-error]').textContent = L('مبلغ را وارد کنید.', 'Enter an amount.');
      return;
    }
    await recordLoanPayment(loan.id, {
      amount,
      date: readDate(form.querySelector('[data-date-picker]')),
      note: form.elements.note.value.trim(),
    });
    sheet.close();
    rerender();
    toast(L('پرداخت ثبت شد', 'Payment recorded'));
  });
}

/* ---------------- lent / borrowed ---------------- */

function lendingTab() {
  const totals = lendingTotals();
  const rows = data.lendings
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `<section class="card">
      <div class="stat-grid stat-grid--two">
        ${statTile({ label: L('پول قرض داده‌شده (باز)', 'Lent out (open)'), value: formatMoney(totals.lentOpen), tone: 'income' })}
        ${statTile({ label: L('پول قرض گرفته‌شده (باز)', 'Borrowed (open)'), value: formatMoney(totals.borrowedOpen), tone: 'expense' })}
      </div>
      ${totals.overdue ? `<p class="card__sub">${esc(L('موعد گذشته', 'Past due'))}: ${faDigits(totals.overdue)}</p>` : ''}
      <button type="button" class="btn btn--primary btn--small" data-action="new-lending">
        ${icon('plus', 16)}<span>${esc(L('قرض جدید', 'New entry'))}</span>
      </button>
    </section>

    ${rows.length
      ? `<section class="card">
          ${sectionTitle(L('قرض‌ها', 'Lent & borrowed'))}
          <ul class="plain-list">
            ${rows.map((item) => lendingRowHTML(item)).join('')}
          </ul>
        </section>`
      : emptyState({
          iconName: 'swap',
          title: L('قرضی ثبت نشده', 'Nothing lent or borrowed'),
          text: esc(L(
            'پولی که به کسی داده‌اید یا از کسی گرفته‌اید را با موعد بازپرداخت ثبت کنید.',
            'Record money you lent or borrowed, along with when it should come back.',
          )),
          action: `<button type="button" class="btn btn--primary" data-action="new-lending">${esc(L('افزودن', 'Add'))}</button>`,
        })}
    ${note(esc(L(
      'قرض دادن پول درآمد نیست و قرض گرفتن هزینه؛ این بخش فقط برای پیگیری است و در جمع هزینه‌ها حساب نمی‌شود.',
      'Lending is not income and borrowing is not an expense: this section is for tracking only and is not counted in expense totals.',
    )))}`;
}

function lendingRowHTML(item) {
  const open = Math.max(0, (Number(item.amount) || 0) - (Number(item.repaidAmount) || 0));
  const isLent = item.direction === 'lent';
  const overdue = item.status !== 'closed' && item.dueDate && item.dueDate < todayISO();
  return `<li class="plain-list__item">
    <div class="plain-list__main">
      <span class="plain-list__title">
        ${esc(item.counterparty)}
        <span class="tag ${isLent ? 'tag--income' : 'tag--expense'}">${esc(isLent ? L('قرض دادم', 'Lent') : L('قرض گرفتم', 'Borrowed'))}</span>
        ${overdue ? `<span class="tag tag--warn">${esc(L('موعد گذشته', 'overdue'))}</span>` : ''}
      </span>
      <span class="plain-list__meta">
        ${esc(formatDate(item.date))}
        ${item.dueDate ? ` · ${esc(L('موعد', 'due'))}: ${esc(formatDate(item.dueDate))}` : ''}
        ${item.status === 'closed' ? ` · ${esc(L('تسویه‌شده', 'settled'))}` : ''}
      </span>
      ${item.notes ? `<span class="plain-list__meta">${esc(item.notes)}</span>` : ''}
    </div>
    <div class="plain-list__side">
      <span class="plain-list__amount">${formatMoney(open)}</span>
      <div class="row row--gap">
        ${item.status !== 'closed'
          ? `<button type="button" class="btn btn--small" data-action="settle-lending" data-id="${esc(item.id)}">${esc(L('تسویه', 'Settle'))}</button>`
          : ''}
        <button type="button" class="icon-btn" data-action="edit-lending" data-id="${esc(item.id)}"
          aria-label="${esc(L('ویرایش', 'Edit'))}">${icon('pencil', 18)}</button>
      </div>
    </div>
  </li>`;
}

function openLendingSheet(existing = null) {
  const people = profilesSorted();
  const item = existing || {};
  const formId = `lend-form-${Math.random().toString(36).slice(2, 7)}`;
  const body = `<form id="${formId}">
    ${field({
      label: L('نوع', 'Direction'),
      input: selectInput({
        name: 'direction',
        options: [
          { value: 'lent', label: L('پول دادم به کسی', 'I lent money') },
          { value: 'borrowed', label: L('پول گرفتم از کسی', 'I borrowed money') },
        ],
        value: item.direction || 'lent',
      }),
    })}
    ${field({ label: L('نام طرف مقابل', 'Other person'), input: `<input class="input" name="counterparty" maxlength="60" autocomplete="off" value="${esc(item.counterparty || '')}">`, required: true })}
    ${field({ label: L('مبلغ (تومان)', 'Amount (Toman)'), input: `<div class="amount-wrap">
        <input class="input input--amount" type="text" inputmode="numeric" data-amount name="amount" value="${esc(formatAmountForInput(item.amount || 0))}">
        <span class="amount-wrap__unit">${esc(L('تومان', 'Toman'))}</span></div><span class="amount-preview" data-amount-preview></span>`, required: true })}
    ${field({ label: L('تاریخ', 'Date'), input: datePicker('date', item.date || todayISO()) })}
    ${field({ label: L('موعد بازپرداخت', 'Expected repayment'), input: datePicker('dueDate', item.dueDate || addMonthsToISO(todayISO(), 1)) })}
    ${field({ label: L('وضعیت', 'Status'), input: selectInput({
        name: 'status',
        options: [
          { value: 'open', label: L('باز', 'Open') },
          { value: 'partial', label: L('بخشی برگشته', 'Partly repaid') },
          { value: 'closed', label: L('تسویه‌شده', 'Settled') },
        ],
        value: item.status || 'open',
      }) })}
    ${field({ label: L('مبلغ برگشته (تومان)', 'Repaid so far (Toman)'), input: `<div class="amount-wrap">
        <input class="input input--amount" type="text" inputmode="numeric" data-amount name="repaidAmount" value="${esc(formatAmountForInput(item.repaidAmount || 0))}">
        <span class="amount-wrap__unit">${esc(L('تومان', 'Toman'))}</span></div><span class="amount-preview" data-amount-preview></span>` })}
    ${people.length ? field({ label: L('مرتبط با', 'Related to'), input: selectInput({ name: 'profileId', options: people.map((p) => ({ value: p.id, label: p.name })), value: item.profileId || people[0].id }) }) : ''}
    ${field({ label: L('یادداشت', 'Note'), input: `<textarea class="input input--area" name="notes" rows="2">${esc(item.notes || '')}</textarea>` })}
    <p class="form-error" data-form-error role="alert"></p>
  </form>`;
  const sheet = openSheet({
    title: existing ? L('ویرایش قرض', 'Edit entry') : L('قرض جدید', 'New entry'),
    body,
    footer: `<div class="row row--gap">
      ${existing ? `<button type="button" class="btn btn--ghost btn--icon" data-delete aria-label="${esc(L('حذف', 'Delete'))}">${icon('trash', 20)}</button>` : ''}
      <button type="submit" form="${formId}" class="btn btn--primary btn--grow">${esc(L('ذخیره', 'Save'))}</button>
    </div>`,
  });
  const form = sheet.el.querySelector('form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const counterparty = form.elements.counterparty.value.trim();
    const amount = parseAmount(form.elements.amount.value);
    if (!counterparty || !Number.isFinite(amount) || amount <= 0) {
      form.querySelector('[data-form-error]').textContent = L('نام و مبلغ را کامل کنید.', 'Fill in the name and amount.');
      return;
    }
    const pickers = form.querySelectorAll('[data-date-picker]');
    const repaid = parseAmount(form.elements.repaidAmount.value);
    const next = {
      ...(existing || {}),
      direction: form.elements.direction.value,
      counterparty,
      amount,
      date: readDate(pickers[0]),
      dueDate: pickers.length > 1 ? readDate(pickers[1]) : '',
      status: form.elements.status.value,
      repaidAmount: Number.isFinite(repaid) ? repaid : 0,
      profileId: form.elements.profileId ? form.elements.profileId.value : null,
      notes: form.elements.notes.value.trim(),
    };
    if (!existing) delete next.id;
    await upsert('lendings', next);
    sheet.close();
    rerender();
    toast(L('ذخیره شد', 'Saved'));
  });
  const deleteBtn = sheet.el.querySelector('[data-delete]');
  if (deleteBtn && existing) {
    deleteBtn.addEventListener('click', async () => {
      sheet.close();
      const ok = await confirmDialog({
        title: L('حذف', 'Delete'),
        message: esc(L('این مورد حذف شود؟', 'Delete this entry?')),
        confirmText: L('حذف', 'Delete'),
        danger: true,
      });
      if (!ok) return;
      await removeRecord('lendings', existing.id);
      rerender();
      toast(L('حذف شد', 'Deleted'));
    });
  }
}

/* ---------------- calculator & affordability ---------------- */

function calcTab() {
  const calc = ui.calc;
  const result = calc.result;
  const afford = ui.afford;
  const affordResult = afford.result;
  const defaults = affordabilityDefaults();

  return `<section class="card">
      ${sectionTitle(L('ماشین‌حساب قسط وام', 'Loan instalment calculator'))}
      <form data-form="calc">
        ${field({
          label: L('مبلغ وام (تومان)', 'Loan amount (Toman)'),
          input: `<div class="amount-wrap">
            <input class="input input--amount" type="text" inputmode="numeric" data-amount name="principal" value="${esc(calc.principal)}">
            <span class="amount-wrap__unit">${esc(L('تومان', 'Toman'))}</span></div><span class="amount-preview" data-amount-preview></span>`,
        })}
        <div class="form-grid">
          ${field({ label: L('نرخ سود سالانه (٪)', 'Annual rate (%)'), input: `<input class="input" type="number" inputmode="decimal" step="0.1" min="0" max="100" name="rate" value="${esc(calc.rate)}">` })}
          ${field({ label: L('تعداد اقساط', 'Instalments'), input: `<input class="input" type="number" inputmode="numeric" min="1" max="600" name="months" value="${esc(calc.months)}">` })}
        </div>
        <button type="submit" class="btn btn--primary btn--grow">${esc(L('محاسبه', 'Calculate'))}</button>
      </form>
      ${result ? calcResultHTML(result) : ''}
    </section>

    <section class="card">
      ${sectionTitle(L('آیا از عهده وام جدید برمی‌آیم؟', 'Could we afford a new loan?'))}
      <p class="card__sub">${esc(L(
        'اعداد درآمد و هزینه از داده‌های خودتان پیش‌فرض شده‌اند و قابل ویرایش‌اند.',
        'Income and expense fields start from your own data and can be edited.',
      ))}</p>
      <form data-form="afford">
        ${field({
          label: L('درآمد ماهانه خانوار (تومان)', 'Household monthly income (Toman)'),
          input: `<div class="amount-wrap">
            <input class="input input--amount" type="text" inputmode="numeric" data-amount name="income" value="${esc(afford.income || formatAmountForInput(defaults.income))}">
            <span class="amount-wrap__unit">${esc(L('تومان', 'Toman'))}</span></div><span class="amount-preview" data-amount-preview></span>`,
          hint: esc(L(`پیش‌فرض: درآمد انتظاری ماه بعد یا میانگین ۳ ماه اخیر (${formatMoney(defaults.income)})`, `Default: next month's expected income or the last 3 months' average (${formatMoney(defaults.income)})`)),
        })}
        ${field({
          label: L('هزینه ماهانه (تومان)', 'Monthly expenses (Toman)'),
          input: `<div class="amount-wrap">
            <input class="input input--amount" type="text" inputmode="numeric" data-amount name="expenses" value="${esc(afford.expenses || formatAmountForInput(defaults.expenses))}">
            <span class="amount-wrap__unit">${esc(L('تومان', 'Toman'))}</span></div><span class="amount-preview" data-amount-preview></span>`,
          hint: esc(L('پیش‌فرض: میانگین هزینه سه ماه اخیر.', 'Default: your average expenses over the last three months.')),
        })}
        ${field({
          label: L('جمع اقساط وام‌های موجود (تومان)', 'Existing loan payments (Toman)'),
          input: `<div class="amount-wrap">
            <input class="input input--amount" type="text" inputmode="numeric" data-amount name="existing" value="${esc(afford.existing || formatAmountForInput(defaults.existing))}">
            <span class="amount-wrap__unit">${esc(L('تومان', 'Toman'))}</span></div><span class="amount-preview" data-amount-preview></span>`,
          hint: esc(L('پیش‌فرض: جمع اقساط وام‌های ثبت‌شده در همین برنامه.', 'Default: the instalments of the loans saved in this app.')),
        })}
        <div class="form-grid">
          ${field({ label: L('مبلغ وام پیشنهادی (تومان)', 'Proposed loan (Toman)'), input: `<div class="amount-wrap">
            <input class="input input--amount" type="text" inputmode="numeric" data-amount name="principal" value="${esc(afford.principal || calc.principal)}">
            <span class="amount-wrap__unit">${esc(L('تومان', 'Toman'))}</span></div>` })}
          ${field({ label: L('نرخ سالانه (٪)', 'Annual rate (%)'), input: `<input class="input" type="number" inputmode="decimal" step="0.1" min="0" max="100" name="rate" value="${esc(afford.rate)}">` })}
        </div>
        ${field({ label: L('تعداد اقساط', 'Instalments'), input: `<input class="input" type="number" inputmode="numeric" min="1" max="600" name="months" value="${esc(afford.months)}">` })}
        <button type="submit" class="btn btn--primary btn--grow">${esc(L('بررسی توان بازپرداخت', 'Check affordability'))}</button>
      </form>
      ${affordResult ? affordResultHTML(affordResult) : ''}
    </section>

    ${note(esc(L(
      'این نتایج تخمین برنامه‌ریزی‌اند، نه مشاوره مالی حرفه‌ای و نه تضمینی از طرف بانک.',
      'These results are planning estimates — not professional financial advice and not a bank guarantee.',
    )), 'warn')}`;
}

function calcResultHTML(result) {
  return `<div class="result-box">
    ${summaryRow(L('قسط ماهانه', 'Monthly payment'), `<strong>${formatMoney(result.payment)}</strong>`, { strong: true })}
    ${summaryRow(L('جمع بازپرداخت', 'Total repaid'), formatMoney(result.totalPaid))}
    ${summaryRow(L('سود کل', 'Total interest'), formatMoney(result.totalInterest))}
    <p class="card__sub">${esc(L('فرض‌ها', 'Assumptions'))}: ${esc(L(
      `اصل ${formatMoney(result.principal)}، نرخ سالانه ${faDigits(result.rate)}٪، ${faDigits(result.months)} قسط مساوی، نرخ ثابت و پرداخت سر وقت.`,
      `principal ${formatMoney(result.principal)}, ${result.rate}% per year, ${result.months} equal instalments, fixed rate, every payment on time.`,
    ))}</p>
    <details class="form-details">
      <summary>${icon('list', 18)}<span>${esc(L('چند قسط اول (تخمین)', 'First few instalments (estimate)'))}</span></summary>
      <div class="table-scroll">
        <table class="mini-table">
          <thead><tr>
            <th>#</th><th>${esc(L('قسط', 'Payment'))}</th><th>${esc(L('سود', 'Interest'))}</th><th>${esc(L('مانده', 'Balance'))}</th>
          </tr></thead>
          <tbody>
            ${result.rows
              .slice(0, 6)
              .map(
                (row) => `<tr>
                <td>${faDigits(row.n)}</td>
                <td>${formatNumber(row.payment)}</td>
                <td>${formatNumber(row.interest)}</td>
                <td>${formatNumber(row.balance)}</td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </details>
  </div>`;
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
        <tr><th>${esc(L('درآمد ماهانه', 'Monthly income'))}</th><td>${formatMoney(result.income)}</td><td class="src">${esc(L('واقعی/ورودی', 'entered'))}</td></tr>
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

function affordabilityDefaults() {
  const nextKey = addMonthsToKey(currentMonthKey(), 1);
  const expectedNext = sum(expectedForMonth(nextKey), (row) => row.amount);
  const expectedThis = sum(expectedForMonth(currentMonthKey()), (row) => row.amount);
  const income = expectedNext || expectedThis || averageMonthlyIncome(3);
  return {
    income,
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

/* ---------------- form handlers ---------------- */

onForm('calc', (form) => {
  const principal = parseAmount(form.elements.principal.value);
  const rate = Number(normalizeDigits(form.elements.rate.value)) || 0;
  const months = Number(normalizeDigits(form.elements.months.value)) || 0;
  if (!Number.isFinite(principal) || principal <= 0 || months <= 0) {
    toast(L('مبلغ و تعداد اقساط را وارد کنید.', 'Enter the amount and the number of instalments.'), 'warn');
    return;
  }
  const schedule = loanSchedule(principal, rate, months);
  ui.calc = {
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
      rows: schedule.rows,
    },
  };
  rerender();
});

onForm('afford', (form) => {
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
  ui.afford = {
    income: formatAmountForInput(income),
    expenses: formatAmountForInput(Number.isFinite(expenses) ? expenses : 0),
    existing: formatAmountForInput(Number.isFinite(existing) ? existing : 0),
    principal: formatAmountForInput(Number.isFinite(principal) ? principal : 0),
    rate: String(rate),
    months: String(months),
    result: { ...result, principal, rate, months },
  };
  rerender();
});

/* ---------------- actions ---------------- */

onAction('plan-tab', (element) => {
  ui.plan.tab = element.dataset.value || 'expected';
  rerender();
});

onAction('new-expected', () => openExpectedSheet());

onAction('delete-expected', async (element) => {
  const ok = await confirmDialog({
    title: L('حذف درآمد انتظاری', 'Delete expected income'),
    message: esc(L('این مورد حذف شود؟', 'Delete this entry?')),
    confirmText: L('حذف', 'Delete'),
    danger: true,
  });
  if (!ok) return;
  await removeRecord('expected', element.dataset.id);
  rerender();
  toast(L('حذف شد', 'Deleted'));
});

onAction('copy-expected', async () => {
  const previousKey = addMonthsToKey(ui.monthKey, -1);
  const previous = expectedForMonth(previousKey);
  const current = expectedForMonth(ui.monthKey);
  if (!previous.length) {
    toast(L('ماه قبل درآمد انتظاری ثبت نشده بود.', 'Last month had no expected income.'), 'warn');
    return;
  }
  let copied = 0;
  for (const row of previous) {
    const exists = current.some((item) => item.profileId === row.profileId && item.categoryId === row.categoryId);
    if (exists) continue;
    await upsert('expected', {
      month: ui.monthKey,
      profileId: row.profileId,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      amount: row.amount,
      note: row.note || '',
    });
    copied += 1;
  }
  rerender();
  toast(copied ? L(`${faDigits(copied)} مورد کپی شد`, `${copied} copied`) : L('همه موارد از قبل وجود داشتند.', 'Everything was already there.'));
});

onAction('new-loan', () => openLoanSheet());
onAction('open-loan', (element) => openLoanDetail(element.dataset.id));
onAction('loan-payment', (element) => {
  const loan = data.loans.find((item) => item.id === element.dataset.id);
  if (loan) openLoanPaymentSheet(loan);
});

onAction('new-lending', () => openLendingSheet());
onAction('edit-lending', (element) => {
  const item = data.lendings.find((row) => row.id === element.dataset.id);
  if (item) openLendingSheet(item);
});
onAction('settle-lending', async (element) => {
  const item = data.lendings.find((row) => row.id === element.dataset.id);
  if (!item) return;
  const ok = await confirmDialog({
    title: L('تسویه کامل', 'Mark as settled'),
    message: esc(L('این مورد به‌طور کامل تسویه شود؟', 'Mark this entry as fully settled?')),
    confirmText: L('تسویه شد', 'Settled'),
  });
  if (!ok) return;
  await upsert('lendings', { ...item, status: 'closed', repaidAmount: item.amount });
  rerender();
  toast(L('تسویه شد', 'Settled'));
});

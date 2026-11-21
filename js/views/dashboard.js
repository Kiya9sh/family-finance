/*
 * Dashboard: one Jalali month at a glance — recorded income, expected income,
 * expenses, loan instalments and the money left, plus the comparisons.
 */

import { L } from '../i18n.js';
import {
  data, ui, activeFilterIds, monthSummary, expenseByCategory, totalsByPerson, trendSeries,
  upcomingLoanPayments, profilesSorted, profileColor, hasTodayExpense, hasDemoData, removeDemo,
  unrecordedDays, loanRemaining, profileName,
} from '../state.js';
import { addMonthsToKey, todayISO, monthKeyOfISO } from '../jalali.js';
import {
  formatMoney, formatNumber, formatDateShort, faDigits, escapeHtml as esc, pct, relativeDay, sum,
  formatMonthLabel,
} from '../util.js';
import {
  icon, monthNav, statTile, barList, columnChart, chartLegend, emptyState, note, sectionTitle,
  chip, summaryRow, openSheet, confirmDialog, toast,
} from '../components.js';
import { onAction, rerender, go } from '../bus.js';
import { transactionRowHTML } from './entry.js';

export function renderDashboard() {
  const monthKey = ui.monthKey;
  const personIds = activeFilterIds();
  const summary = monthSummary(monthKey, personIds);
  const previous = monthSummary(addMonthsToKey(monthKey, -1), personIds);
  const categories = expenseByCategory(monthKey, personIds);
  const people = totalsByPerson(monthKey, personIds);
  const trendKeys = [];
  for (let i = 5; i >= 0; i -= 1) trendKeys.push(addMonthsToKey(monthKey, -i));
  const trend = trendSeries(trendKeys, personIds);
  const upcoming = upcomingLoanPayments(21).filter(
    (item) => !personIds || !item.profileId || personIds.includes(item.profileId),
  );
  const recent = data.transactions
    .filter((t) => monthKeyOfISO(t.date) === monthKey)
    .filter((t) => !personIds || personIds.includes(t.profileId))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const hasAnyData = data.transactions.length > 0 || data.expected.length > 0 || data.loans.length > 0;
  const expenseDelta = previous.expenseTotal
    ? pct(summary.expenseTotal - previous.expenseTotal, previous.expenseTotal)
    : 0;

  return `<div class="view">
    <div class="view-head">
      ${monthNav(monthKey)}
      ${personChips()}
    </div>

    ${hasDemoData() ? demoBanner() : ''}
    ${reminderCard()}

    <section class="hero">
      <span class="hero__label">${esc(L('باقیمانده تخمینی این ماه', 'Estimated money left this month'))}</span>
      <span class="hero__value ${summary.remainingActual < 0 ? 'is-negative' : ''}">${formatMoney(summary.remainingActual)}</span>
      <span class="hero__formula">${esc(L(
        'درآمد ثبت‌شده − هزینه − اقساط پرداخت‌شده',
        'recorded income − expenses − loan payments made',
      ))}</span>
      <span class="hero__forecast">${esc(L('با درآمد انتظاری', 'With expected income'))}: ${formatMoney(summary.remainingForecast)}</span>
    </section>

    <div class="quick-row">
      <button type="button" class="quick-btn quick-btn--expense" data-action="quick-expense">
        ${icon('plus', 20)}<span>${esc(L('هزینه', 'Expense'))}</span>
      </button>
      <button type="button" class="quick-btn quick-btn--income" data-action="quick-income">
        ${icon('plus', 20)}<span>${esc(L('درآمد', 'Income'))}</span>
      </button>
      <button type="button" class="quick-btn" data-action="paste-import" data-type="expense">
        ${icon('doc', 20)}<span>${esc(L('از پیامک', 'From text'))}</span>
      </button>
    </div>

    <div class="stat-grid">
      ${statTile({
        label: L('درآمد ثبت‌شده', 'Recorded income'),
        value: formatMoney(summary.incomeActual),
        tone: 'income',
      })}
      ${statTile({
        label: L('درآمد انتظاری', 'Expected income'),
        value: formatMoney(summary.incomeExpected),
        tone: 'expected',
        hint: esc(L('برنامه‌ریزی‌شده، نه قطعی', 'Planned, not certain')),
      })}
      ${statTile({
        label: L('هزینه‌ها', 'Expenses'),
        value: formatMoney(summary.expenseTotal),
        tone: 'expense',
        hint: previous.expenseTotal
          ? esc(`${expenseDelta > 0 ? '+' : ''}${faDigits(expenseDelta)}${L('٪ نسبت به ماه قبل', '% vs last month')}`)
          : '',
      })}
      ${statTile({
        label: L('اقساط وام', 'Loan payments'),
        value: formatMoney(summary.loanPaid),
        tone: 'loan',
        hint: summary.loanDue
          ? esc(`${L('قسط سررسیدشده ثبت‌نشده', 'Unrecorded due')}: ${formatMoney(summary.loanDue)}`)
          : esc(L('همه ثبت شده', 'All recorded')),
      })}
    </div>

    ${upcoming.length ? upcomingSection(upcoming) : ''}
    ${categories.length ? categorySection(categories, summary.expenseTotal) : ''}
    ${people.length > 1 ? peopleSection(people) : ''}
    ${trend.length ? trendSection(trend) : ''}
    ${recent.length ? recentSection(recent) : ''}
    ${!hasAnyData ? onboardingCard() : ''}

    ${note(esc(L(
      'همه چیز روی همین گوشی ذخیره می‌شود و به جایی فرستاده نمی‌شود. اعداد «انتظاری» و «تخمینی» برنامه‌ریزی هستند، نه تضمین.',
      'Everything stays on this phone and is never sent anywhere. “Expected” and “estimated” figures are planning numbers, not guarantees.',
    )))}
  </div>`;
}

function personChips() {
  const people = profilesSorted();
  const items = [
    chip({ label: L('همه', 'Everyone'), active: ui.personFilter === 'all', action: 'person-filter', value: 'all' }),
    ...people.map((person) => chip({
      label: person.name,
      active: ui.personFilter === person.id,
      action: 'person-filter',
      value: person.id,
    })),
  ];
  return `<div class="chip-row chip-row--scroll">${items.join('')}</div>`;
}

function demoBanner() {
  return `<div class="banner banner--demo">
    ${icon('info', 18)}
    <div class="banner__text">
      <strong>${esc(L('داده نمونه فعال است', 'Sample data is on'))}</strong>
      <span>${esc(L(
        'این رکوردها ساختگی‌اند تا برنامه را ببینید. هر وقت خواستید پاکشان کنید.',
        'These records are made up so you can explore. Remove them whenever you like.',
      ))}</span>
    </div>
    <button type="button" class="btn btn--small" data-action="remove-demo">${esc(L('حذف', 'Remove'))}</button>
  </div>`;
}

function reminderCard() {
  const settings = data.settings;
  if (!settings.reminderEnabled) return '';
  if (hasTodayExpense()) return '';
  /* Only nudge once the chosen reminder time has passed today. */
  const [hh, mm] = String(settings.reminderTime || '21:00').split(':').map(Number);
  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const dueAt = (Number.isFinite(hh) ? hh : 21) * 60 + (Number.isFinite(mm) ? mm : 0);
  if (minutesNow < dueAt) return '';
  const missing = unrecordedDays(ui.monthKey).length;
  return `<div class="banner banner--reminder">
    ${icon('bell', 18)}
    <div class="banner__text">
      <strong>${esc(L('هزینه‌های امروز ثبت نشده', 'Today has no expenses recorded'))}</strong>
      <span>${esc(L(
        `این ماه ${faDigits(missing)} روز بدون هزینه مانده است.`,
        `${missing} day(s) this month still have nothing recorded.`,
      ))}</span>
    </div>
    <div class="banner__actions">
      <button type="button" class="btn btn--small btn--primary" data-action="quick-day-expense" data-date="${todayISO()}">
        ${esc(L('ثبت', 'Add'))}
      </button>
      <button type="button" class="btn btn--small" data-action="review-unrecorded">${esc(L('روزها', 'Days'))}</button>
    </div>
  </div>`;
}

function upcomingSection(upcoming) {
  return `<section class="card">
    ${sectionTitle(L('اقساط نزدیک', 'Upcoming loan payments'),
      `<button type="button" class="link-btn" data-action="goto" data-route="#/plan?tab=loans">${esc(L('همه وام‌ها', 'All loans'))}</button>`)}
    <ul class="upcoming-list">
      ${upcoming
        .slice(0, 3)
        .map(
          (item) => `<li class="upcoming">
          <div class="upcoming__main">
            <span class="upcoming__title">${esc(item.lender)}</span>
            <span class="upcoming__meta">${esc(formatDateShort(item.dueDate))} · ${esc(relativeDay(item.dueDate))}
              ${item.overdue ? `<span class="tag tag--warn">${esc(L('گذشته', 'overdue'))}</span>` : ''}</span>
          </div>
          <div class="upcoming__side">
            <span class="upcoming__amount">${formatMoney(item.amount)}</span>
            <button type="button" class="btn btn--small" data-action="loan-payment" data-id="${esc(item.loanId)}">
              ${esc(L('پرداخت شد', 'Paid'))}
            </button>
          </div>
        </li>`,
        )
        .join('')}
    </ul>
  </section>`;
}

function categorySection(categories, total) {
  const rows = categories.slice(0, 7).map((row) => ({
    label: row.name,
    value: row.total,
    valueLabel: formatMoney(row.total),
    hint: `${faDigits(row.share)}${L('٪ از هزینه‌ها', '% of expenses')}`,
  }));
  return `<section class="card">
    ${sectionTitle(L('هزینه به تفکیک دسته', 'Expenses by category'))}
    <p class="card__sub">${esc(L('جمع', 'Total'))}: ${formatMoney(total)}</p>
    ${barList(rows, { tone: 'expense' })}
  </section>`;
}

function peopleSection(people) {
  return `<section class="card">
    ${sectionTitle(L('درآمد و هزینه هر نفر', 'Income and expenses per person'))}
    ${columnChart(
      people.map((person) => ({
        label: person.name.length > 8 ? `${person.name.slice(0, 8)}…` : person.name,
        income: person.income,
        expense: person.expense,
      })),
    )}
    ${chartLegend()}
    <ul class="person-list">
      ${people
        .map(
          (person) => `<li class="person-line">
          <span class="person-line__name">${esc(person.name)}</span>
          <span class="person-line__values">
            <span class="value value--income">+${formatNumber(person.income)}</span>
            <span class="value value--expense">−${formatNumber(person.expense)}</span>
          </span>
        </li>`,
        )
        .join('')}
    </ul>
  </section>`;
}

function trendSection(trend) {
  return `<section class="card">
    ${sectionTitle(L('شش ماه اخیر', 'Last six months'))}
    ${columnChart(
      trend.map((row) => ({
        label: formatMonthLabel(row.key).split(' ')[0].slice(0, 7),
        income: row.income,
        expense: row.expense,
      })),
    )}
    ${chartLegend()}
    <div class="table-scroll">
      <table class="mini-table">
        <thead>
          <tr>
            <th>${esc(L('ماه', 'Month'))}</th>
            <th>${esc(L('درآمد', 'Income'))}</th>
            <th>${esc(L('هزینه', 'Expense'))}</th>
            <th>${esc(L('درآمد انتظاری', 'Expected'))}</th>
          </tr>
        </thead>
        <tbody>
          ${trend
            .map(
              (row) => `<tr>
              <td>${esc(formatMonthLabel(row.key))}</td>
              <td>${formatNumber(row.income)}</td>
              <td>${formatNumber(row.expense)}</td>
              <td>${formatNumber(row.expected)}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}

function recentSection(recent) {
  return `<section class="card">
    ${sectionTitle(L('آخرین تراکنش‌ها', 'Recent transactions'),
      `<button type="button" class="link-btn" data-action="goto" data-route="#/records">${esc(L('همه', 'All'))}</button>`)}
    <div class="tx-list">${recent.map((tx) => transactionRowHTML(tx)).join('')}</div>
  </section>`;
}

function onboardingCard() {
  return `<section class="card card--soft">
    ${emptyState({
      iconName: 'wallet',
      title: L('این ماه هنوز چیزی ثبت نشده', 'Nothing recorded this month yet'),
      text: esc(L(
        'با یک هزینه کوچک شروع کنید، یا داده نمونه را روشن کنید تا برنامه را ببینید.',
        'Start with one small expense, or turn on sample data to look around.',
      )),
      action: `<div class="col col--gap">
        <button type="button" class="btn btn--primary" data-action="quick-expense">${esc(L('ثبت هزینه', 'Add an expense'))}</button>
        <button type="button" class="btn btn--ghost" data-action="seed-demo">${esc(L('نمایش داده نمونه', 'Show sample data'))}</button>
      </div>`,
    })}
  </section>`;
}

/* ---------------- unrecorded days review ---------------- */

function openUnrecordedSheet() {
  const missing = unrecordedDays(ui.monthKey).slice(0, 14);
  const body = missing.length
    ? `<p class="dialog-text">${esc(L(
      'روزهایی از این ماه که هیچ هزینه‌ای در آن‌ها ثبت نشده است:',
      'Days this month with no expenses recorded:',
    ))}</p>
    <ul class="day-list">
      ${missing
        .map(
          (day) => `<li class="day-list__item">
          <span class="day-list__date">${esc(formatDateShort(day))}</span>
          <button type="button" class="btn btn--small" data-action="quick-day-expense" data-date="${day}">
            ${esc(L('ثبت هزینه', 'Add expense'))}
          </button>
        </li>`,
        )
        .join('')}
    </ul>`
    : `<p class="dialog-text">${esc(L('برای همه روزهای گذشته این ماه هزینه ثبت شده است.', 'Every past day this month has an expense recorded.'))}</p>`;
  openSheet({
    title: L('روزهای ثبت‌نشده', 'Days not recorded'),
    subtitle: formatMonthLabel(ui.monthKey),
    body,
  });
}

/* ---------------- actions ---------------- */

onAction('person-filter', (element) => {
  ui.personFilter = element.dataset.value || 'all';
  rerender();
});

onAction('month-prev', () => {
  ui.monthKey = addMonthsToKey(ui.monthKey, -1);
  rerender();
});

onAction('month-next', () => {
  ui.monthKey = addMonthsToKey(ui.monthKey, 1);
  rerender();
});

onAction('month-today', () => {
  ui.monthKey = monthKeyOfISO(todayISO());
  rerender();
});

onAction('goto', (element) => {
  const route = element.dataset.route;
  if (route) go(route);
});

onAction('review-unrecorded', () => openUnrecordedSheet());

onAction('remove-demo', async () => {
  const ok = await confirmDialog({
    title: L('حذف داده نمونه', 'Remove sample data'),
    message: encodedMessage(L(
      'همه رکوردهای نمونه (افراد، تراکنش‌ها، وام‌ها و حساب‌های نمونه) حذف می‌شوند. رکوردهای واقعی دست نمی‌خورند.',
      'All sample records (people, transactions, loans, accounts) are deleted. Your real records stay.',
    )),
    confirmText: L('حذف نمونه‌ها', 'Remove samples'),
    danger: true,
  });
  if (!ok) return;
  await removeDemo();
  if (ui.personFilter !== 'all' && !profilesSorted().some((person) => person.id === ui.personFilter)) {
    ui.personFilter = 'all';
  }
  rerender();
  toast(L('داده نمونه حذف شد', 'Sample data removed'));
});

onAction('seed-demo', async () => {
  const { seedDemo } = await import('../state.js');
  await seedDemo();
  rerender();
  toast(L('داده نمونه اضافه شد', 'Sample data added'));
});

function encodedMessage(text) {
  return esc(text);
}

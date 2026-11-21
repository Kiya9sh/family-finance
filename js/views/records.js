/*
 * All transactions, filterable by month, type, person and category.
 */

import { L } from '../i18n.js';
import {
  data, ui, txInRange, sortByDateDesc, profilesSorted, categoriesOf,
} from '../state.js';
import { monthKeyStartISO, monthKeyEndISO, addMonthsToKey, currentMonthKey, todayISO, monthKeyOfISO } from '../jalali.js';
import {
  formatMoney, formatNumber, formatDateListHeader, escapeHtml as esc, faDigits, groupBy, sum,
  formatMonthLabel, formatDateShort,
} from '../util.js';
import { icon, monthNav, segmented, emptyState, note } from '../components.js';
import { onAction, rerender, go } from '../bus.js';
import { transactionRowHTML } from './entry.js';

function filteredTransactions() {
  const f = ui.records;
  const personIds = f.person === 'all' ? null : [f.person];
  const from = f.scope === 'month' ? monthKeyStartISO(f.monthKey) : '1900-01-01';
  const to = f.scope === 'month' ? monthKeyEndISO(f.monthKey) : '2999-12-31';
  let list = txInRange(from, to, { personIds, type: f.type });
  if (f.category !== 'all') list = list.filter((tx) => tx.categoryId === f.category);
  const query = (f.query || '').trim().toLowerCase();
  if (query) {
    list = list.filter((tx) => {
      const haystack = [tx.notes, tx.payeeName, tx.categoryName, String(tx.amount)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }
  return sortByDateDesc(list);
}

export function renderRecords() {
  const f = ui.records;
  const people = profilesSorted();
  const categories = data.categories.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const list = filteredTransactions();
  const income = sum(list.filter((tx) => tx.type === 'income'), (tx) => tx.amount);
  const expense = sum(list.filter((tx) => tx.type === 'expense'), (tx) => tx.amount);
  const groups = groupBy(list, (tx) => tx.date);

  const personOptions = [{ value: 'all', label: L('همه افراد', 'Everyone') }]
    .concat(people.map((person) => ({ value: person.id, label: person.name })));
  const categoryOptions = [{ value: 'all', label: L('همه دسته‌ها', 'All categories') }]
    .concat(categories.map((category) => ({
      value: category.id,
      label: `${category.name} (${category.kind === 'income' ? L('درآمد', 'income') : L('هزینه', 'expense')})`,
    })));

  return `<div class="view">
    <div class="view-head">
      <h1 class="page-title">${esc(L('تراکنش‌ها', 'Transactions'))}</h1>
      <button type="button" class="btn btn--primary btn--small" data-action="quick-expense">
        ${icon('plus', 16)}<span>${esc(L('ثبت', 'Add'))}</span>
      </button>
    </div>

    ${segmented(
      'recordsType',
      [
        { value: 'all', label: L('همه', 'All') },
        { value: 'expense', label: L('هزینه', 'Expenses') },
        { value: 'income', label: L('درآمد', 'Income') },
      ],
      f.type,
      'records-type',
    )}

    <div class="filters">
      <div class="filters__row">
        ${monthNav(f.monthKey, {
          prevAction: 'records-month-prev',
          nextAction: 'records-month-next',
          todayAction: 'records-month-today',
        })}
        <button type="button" class="chip ${f.scope === 'all' ? 'is-active' : ''}" data-action="records-scope" data-value="${f.scope === 'all' ? 'month' : 'all'}">
          ${f.scope === 'all' ? esc(L('همه ماه‌ها', 'All months')) : esc(L('همه ماه‌ها', 'All months'))}
        </button>
      </div>
      <div class="filters__row filters__row--two">
        <select class="input input--select" data-action="records-person" aria-label="${esc(L('شخص', 'Person'))}">
          ${personOptions
            .map((option) => `<option value="${option.value}" ${f.person === option.value ? 'selected' : ''}>${esc(option.label)}</option>`)
            .join('')}
        </select>
        <select class="input input--select" data-action="records-category" aria-label="${esc(L('دسته', 'Category'))}">
          ${categoryOptions
            .map((option) => `<option value="${option.value}" ${f.category === option.value ? 'selected' : ''}>${esc(option.label)}</option>`)
            .join('')}
        </select>
      </div>
      <input class="input input--search" type="search" inputmode="search" autocomplete="off"
        data-live-input="records-query" value="${esc(f.query)}"
        placeholder="${esc(L('جستجو در یادداشت، فروشگاه یا مبلغ', 'Search notes, store or amount'))}">
    </div>

    <div class="totals-strip">
      <div class="totals-strip__item">
        <span>${esc(L('درآمد', 'Income'))}</span>
        <strong class="value value--income">${formatMoney(income)}</strong>
      </div>
      <div class="totals-strip__item">
        <span>${esc(L('هزینه', 'Expenses'))}</span>
        <strong class="value value--expense">${formatMoney(expense)}</strong>
      </div>
      <div class="totals-strip__item">
        <span>${esc(L('تعداد', 'Entries'))}</span>
        <strong>${faDigits(list.length)}</strong>
      </div>
    </div>

    ${list.length
      ? [...groups.entries()]
          .map(([date, items]) => {
            const dayExpense = sum(items.filter((tx) => tx.type === 'expense'), (tx) => tx.amount);
            const dayIncome = sum(items.filter((tx) => tx.type === 'income'), (tx) => tx.amount);
            return `<section class="day-group">
              <header class="day-group__head">
                <span class="day-group__date">${esc(formatDateListHeader(date))}</span>
                <span class="day-group__sums">
                  ${dayIncome ? `<span class="value value--income">+${formatNumber(dayIncome)}</span>` : ''}
                  ${dayExpense ? `<span class="value value--expense">−${formatNumber(dayExpense)}</span>` : ''}
                </span>
              </header>
              <div class="tx-list">${items.map((tx) => transactionRowHTML(tx)).join('')}</div>
            </section>`;
          })
          .join('')
      : emptyState({
          iconName: 'list',
          title: L('چیزی پیدا نشد', 'Nothing here yet'),
          text: esc(L(
            'برای این فیلترها تراکنشی نیست. فیلترها را عوض کنید یا یک هزینه ثبت کنید.',
            'No transactions match these filters. Change them, or record an expense.',
          )),
          action: `<div class="col col--gap">
            <button type="button" class="btn btn--primary" data-action="quick-expense">${esc(L('ثبت هزینه', 'Add expense'))}</button>
            <button type="button" class="btn btn--ghost" data-action="records-clear">${esc(L('پاک کردن فیلترها', 'Clear filters'))}</button>
          </div>`,
        })}

    <button type="button" class="fab" data-action="quick-expense" aria-label="${esc(L('ثبت هزینه', 'Add expense'))}">
      ${icon('plus', 24)}
    </button>
  </div>`;
}

/* ---------------- actions ---------------- */

onAction('records-type', (element) => {
  ui.records.type = element.dataset.value;
  ui.records.category = 'all';
  rerender();
});

onAction('records-scope', (element) => {
  ui.records.scope = element.dataset.value === 'all' ? 'all' : 'month';
  rerender();
});

onAction('records-person', (element) => {
  ui.records.person = element.value || 'all';
  rerender();
});

onAction('records-category', (element) => {
  ui.records.category = element.value || 'all';
  rerender();
});

onAction('records-query', (element) => {
  ui.records.query = element.value || '';
  rerender();
});

onAction('records-month-prev', () => {
  ui.records.monthKey = addMonthsToKey(ui.records.monthKey, -1);
  rerender();
});

onAction('records-month-next', () => {
  ui.records.monthKey = addMonthsToKey(ui.records.monthKey, 1);
  rerender();
});

onAction('records-month-today', () => {
  ui.records.monthKey = currentMonthKey();
  rerender();
});

onAction('records-clear', () => {
  ui.records = {
    monthKey: currentMonthKey(),
    scope: 'month',
    type: 'all',
    person: 'all',
    category: 'all',
    query: '',
  };
  rerender();
});

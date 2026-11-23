/*
 * Builds the Markdown report. Account / card / IBAN details are left out unless
 * the user explicitly turns them on.
 */

import { L } from './i18n.js';
import { currencyLabel } from './prefs.js';
import {
  data, txInRange, expectedForMonth, profilesSorted, categoryName, profileName,
  loanPaidTotal, loanRemaining,
} from './state.js';
import { monthKeyStartISO, monthKeyEndISO, monthKeysBetween, monthKeyOfISO } from './jalali.js';
import {
  formatMoney, formatDate, formatDateShort, formatMonthLabel, formatDateTime, sum, formatNumber,
  faDigits,
} from './util.js';

const STATUS_LABELS = {
  open: () => L('باز', 'open'),
  partial: () => L('بخشی برگشته', 'partly repaid'),
  closed: () => L('تسویه‌شده', 'settled'),
};

export function buildReportMarkdown(options) {
  const {
    from, to, personIds = null, includeDemo = false, fields = {},
  } = options;
  const fromISO = monthKeyStartISO(from);
  const toISO = monthKeyEndISO(to);
  const months = monthKeysBetween(from, to);
  const people = personIds && personIds.length
    ? profilesSorted().filter((person) => personIds.includes(person.id))
    : profilesSorted();
  const personSet = new Set(people.map((person) => person.id));

  const matchesPerson = (profileId) => !profileId || personSet.has(profileId);
  const transactions = txInRange(fromISO, toISO, { includeDemo })
    .filter((tx) => matchesPerson(tx.profileId));
  const income = transactions.filter((tx) => tx.type === 'income');
  const expenses = transactions.filter((tx) => tx.type === 'expense');
  const expected = months.flatMap((monthKey) => expectedForMonth(monthKey)).filter((row) => matchesPerson(row.profileId));
  const loans = data.loans.filter((loan) => matchesPerson(loan.profileId));
  const lendings = data.lendings.filter((item) => matchesPerson(item.profileId));
  const accounts = fields.accounts
    ? data.accounts.filter((account) => matchesPerson(account.profileId))
    : [];

  const lines = [];
  lines.push(`# ${L('گزارش مالی خانواده', 'Family finance report')}`);
  lines.push('');
  lines.push(`${L('دوره', 'Period')}: ${formatDateShort(fromISO)} — ${formatDateShort(toISO)} (${formatMonthLabel(from)}${from !== to ? ` — ${formatMonthLabel(to)}` : ''})`);
  lines.push(`${L('تاریخ ساخت گزارش', 'Generated')}: ${formatDateTime(new Date())}`);
  lines.push(`${L('افراد', 'People')}: ${people.length ? people.map((person) => person.name).join('، ') : L('هیچ‌کس', 'nobody')}`);
  lines.push('');
  lines.push(`> ${L(`همه مبالغ به ${currencyLabel()} است.`, `All amounts are in ${currencyLabel()}.`)}`);
  lines.push('');

  if (fields.summary) {
    const loanPayments = loanPaidInRange(loans, fromISO, toISO);
    const incomeTotal = sum(income, (tx) => tx.amount);
    const expenseTotal = sum(expenses, (tx) => tx.amount);
    const expectedTotal = sum(expected, (row) => row.amount);
    lines.push(`## ${L('خلاصه', 'Summary')}`);
    lines.push('');
    lines.push(`- ${L('درآمد ثبت‌شده', 'Recorded income')}: ${formatMoney(incomeTotal)}`);
    lines.push(`- ${L('درآمد انتظاری', 'Expected income')}: ${formatMoney(expectedTotal)} ${L('(برنامه، نه پول رسیده)', '(a plan, not money received)')}`);
    lines.push(`- ${L('هزینه‌ها', 'Expenses')}: ${formatMoney(expenseTotal)}`);
    lines.push(`- ${L('اقساط پرداخت‌شده در این دوره', 'Loan payments in this period')}: ${formatMoney(loanPayments)}`);
    lines.push(`- ${L('باقی‌مانده تخمینی', 'Estimated money left')}: ${formatMoney(incomeTotal - expenseTotal - loanPayments)}`);
    lines.push(`- ${L('تعداد تراکنش‌ها', 'Transactions')}: ${faDigits(transactions.length)}`);
    lines.push('');
  }

  if (fields.income && income.length) {
    lines.push(`## ${L('درآمد', 'Income')}`);
    lines.push('');
    people.forEach((person) => {
      const rows = income.filter((tx) => tx.profileId === person.id);
      if (!rows.length) return;
      lines.push(`### ${person.name} — ${formatMoney(sum(rows, (tx) => tx.amount))}`);
      const byCategory = new Map();
      rows.forEach((tx) => {
        const key = categoryName(tx.categoryId, tx.categoryName);
        byCategory.set(key, (byCategory.get(key) || 0) + tx.amount);
      });
      byCategory.forEach((amount, name) => {
        lines.push(`- ${name}: ${formatMoney(amount)}`);
      });
      lines.push('');
    });
  }

  if (fields.expenses && expenses.length) {
    lines.push(`## ${L('هزینه‌ها به تفکیک دسته', 'Expenses by category')}`);
    lines.push('');
    const byCategory = new Map();
    expenses.forEach((tx) => {
      const key = categoryName(tx.categoryId, tx.categoryName);
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key).push(tx);
    });
    [...byCategory.entries()]
      .sort((a, b) => sum(b[1], (tx) => tx.amount) - sum(a[1], (tx) => tx.amount))
      .forEach(([name, rows]) => {
        lines.push(`### ${name} — ${formatMoney(sum(rows, (tx) => tx.amount))}`);
        rows
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date))
          .forEach((tx) => {
            const parts = [formatDateShort(tx.date), profileName(tx.profileId)];
            const store = tx.payeeName;
            if (store) parts.push(store);
            lines.push(`- ${formatMoney(tx.amount)} — ${parts.join(' · ')}`);
            if (fields.notes && tx.notes) lines.push(`  - ${L('یادداشت', 'Note')}: ${tx.notes}`);
          });
        lines.push('');
      });
  }

  if (fields.expenses) {
    const byPerson = people
      .map((person) => ({
        name: person.name,
        expense: sum(expenses.filter((tx) => tx.profileId === person.id), (tx) => tx.amount),
        income: sum(income.filter((tx) => tx.profileId === person.id), (tx) => tx.amount),
      }))
      .filter((row) => row.expense || row.income);
    if (byPerson.length) {
      lines.push(`## ${L('مقایسه افراد', 'Comparison by person')}`);
      lines.push('');
      byPerson.forEach((row) => {
        lines.push(`- ${row.name}: ${L('درآمد', 'income')} ${formatMoney(row.income)} · ${L('هزینه', 'expense')} ${formatMoney(row.expense)}`);
      });
      lines.push('');
    }
  }

  if (fields.expected && expected.length) {
    lines.push(`## ${L('درآمد انتظاری', 'Expected income')}`);
    lines.push('');
    months.forEach((monthKey) => {
      const rows = expected.filter((row) => row.month === monthKey);
      if (!rows.length) return;
      lines.push(`### ${formatMonthLabel(monthKey)} — ${formatMoney(sum(rows, (row) => row.amount))}`);
      rows.forEach((row) => {
        lines.push(`- ${profileName(row.profileId)} · ${categoryName(row.categoryId, row.categoryName)}: ${formatMoney(row.amount)}`);
      });
      lines.push('');
    });
  }

  if (fields.loans && loans.length) {
    lines.push(`## ${L('وام‌ها', 'Loans')}`);
    lines.push('');
    loans.forEach((loan) => {
      lines.push(`### ${loan.lender}`);
      lines.push(`- ${L('اصل وام', 'Principal')}: ${formatMoney(loan.principal)}`);
      lines.push(`- ${L('قسط ماهانه', 'Monthly payment')}: ${formatMoney(loan.monthlyPayment || 0)}`);
      lines.push(`- ${L('نرخ سود سالانه', 'Annual rate')}: ${faDigits(loan.annualRatePct || 0)}${L('٪', '%')}`);
      lines.push(`- ${L('پرداخت‌شده', 'Paid')}: ${formatMoney(loanPaidTotal(loan))}`);
      lines.push(`- ${L('مانده بدهی', 'Remaining')}: ${formatMoney(loanRemaining(loan))}`);
      const payments = (loan.payments || []).filter((payment) => payment.date >= fromISO && payment.date <= toISO);
      if (payments.length) {
        lines.push(`- ${L('پرداخت‌های این دوره', 'Payments in this period')}:`);
        payments.forEach((payment) => {
          lines.push(`  - ${formatDateShort(payment.date)}: ${formatMoney(payment.amount)}${fields.notes && payment.note ? ` — ${payment.note}` : ''}`);
        });
      }
      if (fields.notes && loan.notes) lines.push(`- ${L('یادداشت', 'Note')}: ${loan.notes}`);
      lines.push('');
    });
  }

  if (fields.lendings && lendings.length) {
    let lentOpen = 0;
    let borrowedOpen = 0;
    lendings.forEach((item) => {
      const open = Math.max(0, (Number(item.amount) || 0) - (Number(item.repaidAmount) || 0));
      if (item.status === 'closed' || open <= 0) return;
      if (item.direction === 'lent') lentOpen += open;
      else borrowedOpen += open;
    });
    lines.push(`## ${L('پول قرض‌داده‌شده و قرض‌گرفته‌شده', 'Money lent and borrowed')}`);
    lines.push('');
    lines.push(`- ${L('باز (دادم)', 'Open (lent)')}: ${formatMoney(lentOpen)}`);
    lines.push(`- ${L('باز (گرفتم)', 'Open (borrowed)')}: ${formatMoney(borrowedOpen)}`);
    lines.push('');
    lendings.forEach((item) => {
      const status = STATUS_LABELS[item.status] ? STATUS_LABELS[item.status]() : item.status;
      lines.push(
        `- ${formatMoney(item.amount)} — ${item.direction === 'lent' ? L('دادم به', 'lent to') : L('گرفتم از', 'borrowed from')} ${item.counterparty}`
        + ` · ${L('تاریخ', 'date')} ${formatDateShort(item.date)}`
        + (item.dueDate ? ` · ${L('موعد', 'due')} ${formatDateShort(item.dueDate)}` : '')
        + ` · ${status}`
        + (Number(item.repaidAmount) ? ` · ${L('برگشته', 'repaid')} ${formatMoney(item.repaidAmount)}` : ''),
      );
      if (fields.notes && item.notes) lines.push(`  - ${L('یادداشت', 'Note')}: ${item.notes}`);
    });
    lines.push('');
  }

  if (accounts.length) {
    lines.push(`## ${L('حساب‌ها', 'Accounts')}`);
    lines.push('');
    accounts.forEach((account) => {
      const parts = [`${account.nickname}`, profileName(account.profileId)];
      if (account.bank) parts.push(account.bank);
      if (fields.sensitive && account.last4) parts.push(`•••• ${account.last4}`);
      if (fields.sensitive && account.iban) parts.push(account.iban);
      lines.push(`- ${parts.join(' · ')}`);
    });
    lines.push('');
    lines.push(`> ${L(
      'نام حساب یا شبا هیچ اتصالی به بانک ایجاد نمی‌کند و مانده حساب را تأیید نمی‌کند.',
      'An account name or IBAN does not connect to any bank and does not confirm a balance.',
    )}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`**${L('یادداشت‌ها', 'Notes')}**`);
  lines.push('');
  lines.push(`- ${L('اعداد «انتظاری» و «تخمینی» برنامه‌ریزی هستند، نه تضمین.', '“Expected” and “estimated” figures are planning numbers, not guarantees.')}`);
  lines.push(`- ${L('این گزارش از داده‌های ذخیره‌شده روی همین گوشی ساخته شده است.', 'This report was built from data stored on this phone only.')}`);
  if (includeDemo) {
    lines.push(`- ${L('داده نمونه (ساختگی) در این گزارش گنجانده شده است.', 'Sample (made-up) data is included in this report.')}`);
  }
  lines.push('');

  return lines.join('\n');
}

function loanPaidInRange(loans, fromISO, toISO) {
  let total = 0;
  loans.forEach((loan) => {
    (loan.payments || []).forEach((payment) => {
      if (payment.date >= fromISO && payment.date <= toISO) total += Number(payment.amount) || 0;
    });
  });
  return total;
}

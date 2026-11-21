/*
 * The single in-memory copy of the family's records, plus every calculation the
 * views need (month summaries, charts, loan maths, reminders).
 *
 * Reads happen from memory; every write goes to IndexedDB first and only then
 * updates memory, so the UI can never show something that was not stored.
 */

import * as db from './db.js';
import { L, getLang, setLang } from './i18n.js';
import {
  todayISO, currentMonthKey, monthKeyOfISO, monthKeyStartISO, monthKeyEndISO,
  addMonthsToKey, addMonthsToISO, addDaysISO, diffDaysISO, daysInMonthKey,
} from './jalali.js';
import { uid, sum, parseAmount } from './util.js';

export const data = {
  profiles: [],
  categories: [],
  payees: [],
  transactions: [],
  expected: [],
  loans: [],
  lendings: [],
  accounts: [],
  settings: {},
};

export const ui = {
  monthKey: currentMonthKey(),
  personFilter: 'all',
  records: {
    monthKey: currentMonthKey(),
    scope: 'month', // 'month' | 'all'
    type: 'all',
    person: 'all',
    category: 'all',
    query: '',
  },
  plan: { tab: 'expected' },
  reports: {
    from: currentMonthKey(),
    to: currentMonthKey(),
    includeDemo: false,
    fields: {
      summary: true,
      income: true,
      expenses: true,
      expected: true,
      loans: true,
      lendings: true,
      accounts: false,
      notes: true,
      sensitive: false,
    },
    persons: null, // null = all people at the time of export
  },
};

export const DEFAULT_SETTINGS = {
  id: 'app',
  lang: 'fa',
  onboarded: false,
  reminderEnabled: false,
  reminderTime: '21:00',
  lastUsed: { profileId: null, incomeCategoryId: null, expenseCategoryId: null, payeeId: null },
  demoSeeded: false,
  createdAt: null,
  schema: 1,
};

/* ---------------- lifecycle ---------------- */

export async function initState() {
  const all = await db.loadAll();
  db.STORES.forEach((name) => {
    if (name === 'settings') return;
    data[name] = Array.isArray(all[name]) ? all[name] : [];
  });
  const settingsRows = Array.isArray(all.settings) ? all.settings : [];
  const stored = settingsRows.find((row) => row.id === 'app') || {};
  data.settings = {
    ...DEFAULT_SETTINGS,
    ...stored,
    lastUsed: { ...DEFAULT_SETTINGS.lastUsed, ...(stored.lastUsed || {}) },
  };
  setLang(data.settings.lang);

  await ensureDefaults();
  const created = await materializeRecurring();
  data.settings.lastRecurringCount = created;
  return data;
}

async function ensureDefaults() {
  if (!data.settings.createdAt) {
    data.settings.createdAt = new Date().toISOString();
  }
  if (!data.categories.length) {
    const seeded = defaultCategories();
    await db.putMany('categories', seeded);
    data.categories = seeded;
  }
  await db.put('settings', data.settings);
}

export function defaultCategories() {
  const fa = [
    ['salary', 'income', 'حقوق'],
    ['bonus', 'income', 'پاداش و اضافه‌کار'],
    ['freelance', 'income', 'درآمد آزاد'],
    ['interest', 'income', 'سود سپرده'],
    ['rent', 'income', 'اجاره دریافتی'],
    ['income-other', 'income', 'درآمد دیگر'],
    ['housing', 'expense', 'مسکن و اجاره'],
    ['groceries', 'expense', 'خواربار'],
    ['dining', 'expense', 'رستوران و کافه'],
    ['transport', 'expense', 'حمل‌ونقل'],
    ['bills', 'expense', 'قبض‌ها'],
    ['health', 'expense', 'سلامت و دارو'],
    ['education', 'expense', 'آموزش'],
    ['clothing', 'expense', 'پوشاک'],
    ['fun', 'expense', 'سرگرمی'],
    ['gift', 'expense', 'هدیه و مناسبت'],
    ['expense-other', 'expense', 'هزینه دیگر'],
  ];
  const en = [
    ['salary', 'income', 'Salary'],
    ['bonus', 'income', 'Bonus / overtime'],
    ['freelance', 'income', 'Freelance income'],
    ['interest', 'income', 'Bank interest'],
    ['rent', 'income', 'Rent received'],
    ['income-other', 'income', 'Other income'],
    ['housing', 'expense', 'Housing / rent'],
    ['groceries', 'expense', 'Groceries'],
    ['dining', 'expense', 'Restaurants & cafés'],
    ['transport', 'expense', 'Transport'],
    ['bills', 'expense', 'Bills'],
    ['health', 'expense', 'Health & pharmacy'],
    ['education', 'expense', 'Education'],
    ['clothing', 'expense', 'Clothing'],
    ['fun', 'expense', 'Entertainment'],
    ['gift', 'expense', 'Gifts & occasions'],
    ['expense-other', 'expense', 'Other expense'],
  ];
  const source = getLang() === 'en' ? en : fa;
  return source.map(([id, kind, name]) => ({
    id: `cat_${id}`,
    kind,
    name,
    builtin: true,
  }));
}

/* ---------------- writes ---------------- */

export async function saveSettings(patch) {
  data.settings = { ...data.settings, ...patch };
  await db.put('settings', data.settings);
  return data.settings;
}

export async function upsert(store, record) {
  const rec = { ...record };
  if (!rec.id) rec.id = uid(store.slice(0, 3));
  rec.updatedAt = new Date().toISOString();
  await db.put(store, rec);
  const list = data[store];
  const index = list.findIndex((item) => item.id === rec.id);
  if (index >= 0) list[index] = rec;
  else list.push(rec);
  return rec;
}

export async function upsertMany(store, records) {
  if (!records.length) return records;
  const prepared = records.map((record) => ({
    updatedAt: new Date().toISOString(),
    ...record,
    id: record.id || uid(store.slice(0, 3)),
  }));
  await db.putMany(store, prepared);
  data[store].push(...prepared);
  return prepared;
}

export async function removeRecord(store, id) {
  await db.remove(store, id);
  data[store] = data[store].filter((item) => item.id !== id);
}

export async function removeRecords(store, ids) {
  if (!ids.length) return;
  await db.removeMany(store, ids);
  const set = new Set(ids);
  data[store] = data[store].filter((item) => !set.has(item.id));
}

/* ---------------- lookups ---------------- */

export function profilesSorted() {
  const order = { self: 0, spouse: 1, child: 2, other: 3 };
  return data.profiles
    .slice()
    .sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export function profileById(id) {
  return data.profiles.find((p) => p.id === id) || null;
}

export function profileName(id) {
  const p = profileById(id);
  return p ? p.name : L('نامشخص', 'Unknown');
}

export function categoriesOf(kind) {
  return data.categories
    .filter((c) => c.kind === kind)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', getLang() === 'en' ? 'en' : 'fa'));
}

export function categoryById(id) {
  return data.categories.find((c) => c.id === id) || null;
}

export function categoryName(id, fallback) {
  const c = categoryById(id);
  return c ? c.name : fallback || L('دسته حذف‌شده', 'Deleted category');
}

export function payeesSorted() {
  return data.payees.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', getLang() === 'en' ? 'en' : 'fa'));
}

export function payeeById(id) {
  return data.payees.find((p) => p.id === id) || null;
}

export function payeeName(id, fallback) {
  const p = payeeById(id);
  return p ? p.name : fallback || '';
}

export function accountsOfProfile(profileId) {
  return data.accounts.filter((a) => a.profileId === profileId);
}

export function activeFilterIds() {
  return ui.personFilter === 'all' ? null : [ui.personFilter];
}

const PROFILE_COLORS = ['#0f766e', '#b45309', '#4338ca', '#be123c', '#0369a1', '#7c3aed'];

export function profileColor(profileId) {
  const list = profilesSorted();
  const index = list.findIndex((person) => person.id === profileId);
  return PROFILE_COLORS[(index < 0 ? 0 : index) % PROFILE_COLORS.length];
}

/* ---------------- transactions ---------------- */

export function txInRange(fromISO, toISOValue, options = {}) {
  const { personIds = null, includeDemo = true, type = 'all' } = options;
  return data.transactions.filter((t) => {
    if (t.date < fromISO || t.date > toISOValue) return false;
    if (type !== 'all' && t.type !== type) return false;
    if (personIds && personIds.length && !personIds.includes(t.profileId)) return false;
    if (!includeDemo && t.demo) return false;
    return true;
  });
}

export function monthTransactions(monthKey, options = {}) {
  return txInRange(monthKeyStartISO(monthKey), monthKeyEndISO(monthKey), options);
}

export function sortByDateDesc(list) {
  return list.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function deleteTransaction(id, { wholeSeries = false } = {}) {
  const record = data.transactions.find((t) => t.id === id);
  if (!record) return;
  if (wholeSeries) {
    const ids = data.transactions
      .filter((t) => t.id === record.id || t.seriesId === (record.seriesId || record.id))
      .map((t) => t.id);
    await removeRecords('transactions', ids);
    return;
  }
  await removeRecord('transactions', id);
}

/* Fill in occurrences of recurring entries up to today. Runs on every launch,
 * so there is no background task and no server involved. */
export async function materializeRecurring() {
  const today = todayISO();
  const roots = data.transactions.filter(
    (t) => t.recurring && t.recurring.freq && t.recurring.freq !== 'none' && !t.seriesId,
  );
  const toCreate = [];
  roots.forEach((root) => {
    const freq = root.recurring.freq;
    const until = root.recurring.until || null;
    const existing = new Set(
      data.transactions.filter((t) => t.seriesId === root.id).map((t) => t.date),
    );
    existing.add(root.date);
    for (let k = 1; k <= 24; k += 1) {
      const date = freq === 'weekly'
        ? addDaysISO(root.date, 7 * k)
        : addMonthsToISO(root.date, freq === 'yearly' ? 12 * k : k);
      if (date > today) break;
      if (until && date > until) break;
      if (existing.has(date)) continue;
      toCreate.push({
        ...root,
        id: uid('tx'),
        date,
        seriesId: root.id,
        auto: true,
        createdAt: new Date().toISOString(),
        updatedAt: undefined,
      });
    }
  });
  if (toCreate.length) await upsertMany('transactions', toCreate);
  return toCreate.length;
}

/* ---------------- summaries ---------------- */

export function expectedForMonth(monthKey, personIds = null) {
  return data.expected.filter((e) => {
    if (e.month !== monthKey) return false;
    if (personIds && personIds.length && !personIds.includes(e.profileId)) return false;
    return true;
  });
}

export function loanPaymentsInRange(fromISO, toISOValue, personIds = null) {
  const items = [];
  data.loans.forEach((loan) => {
    if (personIds && personIds.length && !personIds.includes(loan.profileId)) return;
    (loan.payments || []).forEach((payment) => {
      if (payment.date < fromISO || payment.date > toISOValue) return;
      items.push({ loanId: loan.id, lender: loan.lender, ...payment });
    });
  });
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

export function monthSummary(monthKey, personIds = activeFilterIds()) {
  const list = monthTransactions(monthKey, { personIds });
  const incomeActual = sum(list.filter((t) => t.type === 'income'), (t) => t.amount);
  const expenseTotal = sum(list.filter((t) => t.type === 'expense'), (t) => t.amount);
  const incomeExpected = sum(expectedForMonth(monthKey, personIds), (e) => e.amount);
  const payments = loanPaymentsInRange(monthKeyStartISO(monthKey), monthKeyEndISO(monthKey), personIds);
  const loanPaid = sum(payments, (p) => p.amount);
  const dueRows = loanDueInMonth(monthKey, personIds);
  const loanDue = sum(dueRows, (item) => item.amount);
  const futureMonth = monthKey > currentMonthKey();
  return {
    monthKey,
    incomeActual,
    expenseTotal,
    incomeExpected,
    loanPaid,
    loanDue,
    loanDueCount: dueRows.length,
    remainingActual: incomeActual - expenseTotal - loanPaid,
    remainingForecast: incomeExpected - expenseTotal - loanDue,
    transactionCount: list.length,
    expenseCount: list.filter((t) => t.type === 'expense').length,
    futureMonth,
  };
}

/* Scheduled instalments that fall in a Jalali month (an estimate, not a fact). */
export function loanDueInMonth(monthKey, personIds = null) {
  const start = monthKeyStartISO(monthKey);
  const end = monthKeyEndISO(monthKey);
  const out = [];
  data.loans.forEach((loan) => {
    if (personIds && personIds.length && !personIds.includes(loan.profileId)) return;
    if (!loan.monthlyPayment || loanRemaining(loan) <= 0) return;
    const alreadyPaid = (loan.payments || []).some((p) => monthKeyOfISO(p.date) === monthKey);
    if (alreadyPaid) return;
    const due = loanNextDueDate(loan, start);
    if (due > end) return;
    if (loan.startDate && due < loan.startDate) return;
    out.push({ loanId: loan.id, lender: loan.lender, dueDate: due, amount: loan.monthlyPayment });
  });
  return out;
}

export function expenseByCategory(monthKey, personIds = activeFilterIds()) {
  const list = monthTransactions(monthKey, { personIds, type: 'expense' });
  const total = sum(list, (t) => t.amount);
  const map = new Map();
  list.forEach((t) => {
    const key = t.categoryId || 'none';
    const current = map.get(key) || {
      id: key,
      name: categoryName(t.categoryId, t.categoryName),
      total: 0,
      count: 0,
    };
    current.total += Number(t.amount) || 0;
    current.count += 1;
    map.set(key, current);
  });
  return [...map.values()]
    .map((row) => ({ ...row, share: total ? Math.round((row.total / total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);
}

export function incomeByCategory(monthKey, personIds = activeFilterIds()) {
  const list = monthTransactions(monthKey, { personIds, type: 'income' });
  const map = new Map();
  list.forEach((t) => {
    const key = t.categoryId || 'none';
    const current = map.get(key) || {
      id: key,
      name: categoryName(t.categoryId, t.categoryName),
      total: 0,
      count: 0,
    };
    current.total += Number(t.amount) || 0;
    current.count += 1;
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function totalsByPerson(monthKey, personIds = activeFilterIds()) {
  const people = personIds && personIds.length
    ? personIds.map(profileById).filter(Boolean)
    : profilesSorted();
  return people.map((person) => {
    const list = monthTransactions(monthKey, { personIds: [person.id] });
    const payments = loanPaymentsInRange(
      monthKeyStartISO(monthKey),
      monthKeyEndISO(monthKey),
      [person.id],
    );
    return {
      profileId: person.id,
      name: person.name,
      income: sum(list.filter((t) => t.type === 'income'), (t) => t.amount),
      expense: sum(list.filter((t) => t.type === 'expense'), (t) => t.amount),
      loanPaid: sum(payments, (p) => p.amount),
      expected: sum(expectedForMonth(monthKey, [person.id]), (e) => e.amount),
    };
  });
}

export function trendSeries(monthKeys, personIds = activeFilterIds()) {
  return monthKeys.map((key) => {
    const summary = monthSummary(key, personIds);
    return {
      key,
      income: summary.incomeActual,
      expected: summary.incomeExpected,
      expense: summary.expenseTotal,
      loanPaid: summary.loanPaid,
    };
  });
}

export function unrecordedDays(monthKey = currentMonthKey()) {
  const start = monthKeyStartISO(monthKey);
  const end = monthKeyEndISO(monthKey);
  const today = todayISO();
  const recorded = new Set(
    data.transactions.filter((t) => t.type === 'expense').map((t) => t.date),
  );
  const days = [];
  for (let day = start; day <= end; day = addDaysISO(day, 1)) {
    if (day > today) break;
    if (!recorded.has(day)) days.push(day);
  }
  return days.reverse();
}

export function hasTodayExpense() {
  const today = todayISO();
  return data.transactions.some((t) => t.type === 'expense' && t.date === today);
}

export function daysSinceLastExpense() {
  const dates = data.transactions.filter((t) => t.type === 'expense').map((t) => t.date).sort();
  if (!dates.length) return null;
  return diffDaysISO(dates[dates.length - 1], todayISO());
}

/* ---------------- loans ---------------- */

export function loanMonthlyPayment(principal, annualRatePct, months) {
  const p = Number(principal) || 0;
  const n = Math.round(Number(months) || 0);
  const rate = Number(annualRatePct) || 0;
  if (p <= 0 || n <= 0) return 0;
  const r = rate / 1200;
  if (r <= 0) return Math.round(p / n);
  const payment = (p * r) / (1 - Math.pow(1 + r, -n));
  return Number.isFinite(payment) ? Math.round(payment) : 0;
}

export function loanPaidTotal(loan) {
  return sum(loan.payments || [], (p) => p.amount);
}

export function loanRemaining(loan) {
  if (typeof loan.remainingBalance === 'number' && Number.isFinite(loan.remainingBalance)) {
    return Math.max(0, loan.remainingBalance);
  }
  return Math.max(0, (Number(loan.principal) || 0) - loanPaidTotal(loan));
}

export function loanNextDueDate(loan, fromISO = todayISO()) {
  let due = loan.nextPaymentDate || loan.startDate || fromISO;
  let guard = 0;
  while (due < fromISO && guard < 600) {
    due = addMonthsToISO(due, 1);
    guard += 1;
  }
  return due;
}

export function upcomingLoanPayments(withinDays = 60) {
  const today = todayISO();
  const limit = addDaysISO(today, withinDays);
  const items = [];
  data.loans.forEach((loan) => {
    if (loanRemaining(loan) <= 0) return;
    let due = loanNextDueDate(loan, today);
    let guard = 0;
    while (due <= limit && guard < 24) {
      items.push({
        loanId: loan.id,
        lender: loan.lender,
        profileId: loan.profileId,
        amount: loan.monthlyPayment || 0,
        dueDate: due,
        overdue: due < today,
      });
      due = addMonthsToISO(due, 1);
      guard += 1;
    }
  });
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function loanSchedule(principal, annualRatePct, months) {
  const p = Number(principal) || 0;
  const n = Math.round(Number(months) || 0);
  const rate = Number(annualRatePct) || 0;
  const r = rate / 1200;
  const payment = loanMonthlyPayment(p, rate, n);
  const rows = [];
  let balance = p;
  for (let i = 1; i <= Math.min(n, 600); i += 1) {
    const interest = Math.round(balance * r);
    const principalPart = payment - interest;
    balance = Math.max(0, balance - principalPart);
    rows.push({ n: i, payment, interest, principal: principalPart, balance });
    if (balance <= 0) break;
  }
  return { payment, rows, totalPaid: payment * n, totalInterest: Math.max(0, payment * n - p) };
}

export async function recordLoanPayment(loanId, { amount, date, note }) {
  const loan = data.loans.find((l) => l.id === loanId);
  if (!loan) return null;
  const payment = {
    id: uid('pay'),
    amount: Math.round(Number(amount) || 0),
    date: date || todayISO(),
    note: note || '',
    createdAt: new Date().toISOString(),
  };
  const payments = [...(loan.payments || []), payment];
  const currentRemaining = loanRemaining(loan);
  const next = {
    ...loan,
    payments,
    remainingBalance: Math.max(0, currentRemaining - payment.amount),
    nextPaymentDate: addMonthsToISO(payment.date, 1),
  };
  await upsert('loans', next);
  return payment;
}

export function affordability({ income, expenses, existingPayments, newPayment }) {
  const inc = Number(income) || 0;
  const exp = Number(expenses) || 0;
  const existing = Number(existingPayments) || 0;
  const loan = Number(newPayment) || 0;
  const available = inc - exp - existing - loan;
  const debtRatio = inc > 0 ? (existing + loan) / inc : 0;
  let verdict = 'unknown';
  if (inc <= 0) verdict = 'unknown';
  else if (available < 0) verdict = 'negative';
  else if (debtRatio > 0.6) verdict = 'risky';
  else if (debtRatio > 0.4) verdict = 'tight';
  else if (debtRatio > 0.25) verdict = 'ok';
  else verdict = 'comfortable';
  return {
    income: inc,
    expenses: exp,
    existingPayments: existing,
    newPayment: loan,
    available,
    debtRatio,
    debtRatioPct: Math.round(debtRatio * 1000) / 10,
    verdict,
  };
}

export function averageMonthlyExpense(monthsBack = 3) {
  const keys = [];
  for (let i = 1; i <= monthsBack; i += 1) keys.push(addMonthsToKey(currentMonthKey(), -i));
  const totals = keys.map((key) => sum(monthTransactions(key, { type: 'expense' }), (t) => t.amount));
  const used = totals.filter((t) => t > 0);
  if (!used.length) return 0;
  return Math.round(sum(used, (t) => t) / used.length);
}

export function monthlyLoanPaymentTotal() {
  return sum(
    data.loans.filter((loan) => loanRemaining(loan) > 0),
    (loan) => loan.monthlyPayment || 0,
  );
}

/* ---------------- lent / borrowed ---------------- */

export function lendingTotals(personIds = activeFilterIds()) {
  const list = data.lendings.filter(
    (l) => !personIds || !personIds.length || personIds.includes(l.profileId),
  );
  const out = { lentOpen: 0, borrowedOpen: 0, overdue: 0, openCount: 0 };
  list.forEach((item) => {
    const open = Math.max(0, (Number(item.amount) || 0) - (Number(item.repaidAmount) || 0));
    if (item.status !== 'closed' && open > 0) {
      if (item.direction === 'lent') out.lentOpen += open;
      else out.borrowedOpen += open;
      out.openCount += 1;
      if (item.dueDate && item.dueDate < todayISO()) out.overdue += 1;
    }
  });
  return out;
}

/* ---------------- demo data ---------------- */

export function hasDemoData() {
  return ['profiles', 'payees', 'transactions', 'expected', 'loans', 'lendings', 'accounts'].some(
    (store) => data[store].some((record) => record.demo),
  );
}

export async function seedDemo() {
  if (hasDemoData()) return 0;
  const now = currentMonthKey();
  const today = todayISO();
  const suffix = L(' (نمونه)', ' (sample)');
  const people = [
    { id: uid('pro'), name: L('خودم', 'Me') + suffix, role: 'self', demo: true },
    { id: uid('pro'), name: L('همسرم', 'My spouse') + suffix, role: 'spouse', demo: true },
    { id: uid('pro'), name: L('سارا', 'Sara') + suffix, role: 'child', demo: true },
    { id: uid('pro'), name: L('امیر', 'Amir') + suffix, role: 'child', demo: true },
  ];
  const payees = [
    { id: uid('pay'), name: L('فروشگاه رفاه', 'Refah market'), demo: true },
    { id: uid('pay'), name: L('دیجی‌کالا', 'Digikala'), demo: true },
    { id: uid('pay'), name: L('کافه نبش', 'Corner café'), demo: true },
    { id: uid('pay'), name: L('اسنپ', 'Snapp'), demo: true },
  ];
  const fallbackFor = {
    cat_groceries: 'expense', cat_dining: 'expense', cat_transport: 'expense',
    cat_bills: 'expense', cat_health: 'expense', cat_education: 'expense',
    cat_clothing: 'expense', cat_fun: 'expense', cat_housing: 'expense',
    cat_salary: 'income', cat_bonus: 'income',
  };
  const cat = (id) => {
    if (categoryById(id)) return id;
    const kind = fallbackFor[id] || 'expense';
    const other = data.categories.find((c) => c.kind === kind);
    return other ? other.id : null;
  };
  const groceries = cat('cat_groceries');
  const dining = cat('cat_dining');
  const transport = cat('cat_transport');
  const bills = cat('cat_bills');
  const health = cat('cat_health');
  const education = cat('cat_education');
  const clothing = cat('cat_clothing');
  const fun = cat('cat_fun');
  const housing = cat('cat_housing');
  const salary = cat('cat_salary');
  const bonus = cat('cat_bonus');

  const transactions = [];
  const monthList = [addMonthsToKey(now, -2), addMonthsToKey(now, -1), now];
  monthList.forEach((monthKey, monthIndex) => {
    const length = daysInMonthKey(monthKey);
    const isCurrent = monthKey === now;
    const push = (type, amount, categoryId, profileId, day, extras = {}) => {
      const date = isoToDay(monthKey, Math.min(day, length));
      if (isCurrent && date > today) return;
      transactions.push({
        id: uid('tx'),
        type,
        amount,
        date,
        categoryId,
        categoryName: categoryName(categoryId),
        profileId,
        payeeId: extras.payeeId || null,
        payeeName: extras.payeeId ? payeeName(extras.payeeId) : '',
        notes: extras.notes || '',
        recurring: { freq: 'none' },
        demo: true,
        createdAt: new Date().toISOString(),
      });
    };
    const amountScale = monthIndex === 0 ? 0.92 : monthIndex === 1 ? 0.97 : 1;
    const scaled = (value) => Math.round(value * amountScale);
    push('income', 25000000, salary, people[0].id, 3);
    push('income', monthIndex === 2 ? 13500000 : 12800000, salary, people[1].id, 4);
    if (monthIndex === 2) push('income', 4000000, bonus, people[0].id, 9);
    push('expense', 12000000, housing, people[0].id, 1, { notes: L('اجاره ماهانه', 'Monthly rent') });
    push('expense', scaled(3200000), groceries, people[1].id, 6, { payeeId: payees[0].id });
    push('expense', scaled(1850000), groceries, people[1].id, 15, { payeeId: payees[0].id });
    push('expense', scaled(780000), dining, people[0].id, 9, { payeeId: payees[2].id });
    push('expense', scaled(1200000), transport, people[0].id, 11, { payeeId: payees[3].id });
    push('expense', scaled(2400000), bills, people[0].id, 12, { notes: L('آب، برق، گاز، اینترنت', 'Water, power, gas, internet') });
    push('expense', scaled(950000), health, people[1].id, 18, { notes: L('داروخانه', 'Pharmacy') });
    push('expense', scaled(4500000), education, people[2].id, 20, { notes: L('شهریه کلاس‌ها', 'Tuition') });
    push('expense', scaled(1100000), clothing, people[3].id, 22, { payeeId: payees[1].id });
    push('expense', scaled(600000), fun, people[0].id, 26);
    push('expense', scaled(350000), groceries, people[1].id, Math.min(length, 28), { payeeId: payees[1].id });
  });

  const nextMonth = addMonthsToKey(now, 1);
  const expected = [
    {
      id: uid('exp'), month: now, profileId: people[0].id, categoryId: salary,
      categoryName: categoryName(salary), amount: 27000000, demo: true,
    },
    {
      id: uid('exp'), month: now, profileId: people[1].id, categoryId: salary,
      categoryName: categoryName(salary), amount: 13500000, demo: true,
    },
    {
      id: uid('exp'), month: nextMonth, profileId: people[0].id, categoryId: salary,
      categoryName: categoryName(salary), amount: 27000000, demo: true,
    },
    {
      id: uid('exp'), month: nextMonth, profileId: people[1].id, categoryId: salary,
      categoryName: categoryName(salary), amount: 13500000, demo: true,
    },
  ];

  const startDate = addMonthsToISO(today, -8);
  const principal = 400000000;
  const monthly = loanMonthlyPayment(principal, 18, 120);
  const payments = [1, 2, 3].map((i) => ({
    id: uid('pay'),
    amount: monthly,
    date: addMonthsToISO(startDate, i),
    note: '',
    createdAt: new Date().toISOString(),
  }));
  const loans = [
    {
      id: uid('loan'),
      lender: L('بانک ملت — وام مسکن', 'Bank Mellat — home loan'),
      profileId: people[0].id,
      principal,
      startDate,
      annualRatePct: 18,
      termMonths: 120,
      monthlyPayment: monthly,
      remainingBalance: principal - monthly * 3,
      nextPaymentDate: addMonthsToISO(startDate, 4),
      notes: L('نرخ سود بر اساس قرارداد فرضی است.', 'Rate is from a made-up contract.'),
      payments,
      demo: true,
    },
  ];

  const lendings = [
    {
      id: uid('lend'),
      direction: 'lent',
      counterparty: L('دایی احمد', 'Uncle Ahmad'),
      profileId: people[0].id,
      amount: 15000000,
      repaidAmount: 0,
      date: addDaysISO(today, -45),
      dueDate: addDaysISO(today, 20),
      status: 'open',
      notes: L('قرار بود آخر ماه پس بدهد.', 'Promised to repay at the end of the month.'),
      demo: true,
    },
    {
      id: uid('lend'),
      direction: 'borrowed',
      counterparty: L('آقای رضایی', 'Mr Rezaei'),
      profileId: people[0].id,
      amount: 8000000,
      repaidAmount: 3000000,
      date: addDaysISO(today, -70),
      dueDate: addDaysISO(today, 45),
      status: 'partial',
      notes: '',
      demo: true,
    },
  ];

  const accounts = [
    {
      id: uid('acc'),
      profileId: people[0].id,
      nickname: L('حساب اصلی بانک ملت', 'Main Mellat account'),
      bank: L('ملت', 'Mellat'),
      last4: '1234',
      iban: 'IR062960000000100324200001',
      note: L('حساب نمونه؛ هیچ اتصالی به بانک ندارد.', 'Sample account; not connected to any bank.'),
      demo: true,
    },
  ];

  await upsertMany('profiles', people);
  await upsertMany('payees', payees);
  await upsertMany('transactions', transactions);
  await upsertMany('expected', expected);
  await upsertMany('loans', loans);
  await upsertMany('lendings', lendings);
  await upsertMany('accounts', accounts);
  await saveSettings({ demoSeeded: true });
  if (ui.personFilter === 'all') ui.monthKey = now;
  return transactions.length;
}

function isoToDay(monthKey, day) {
  const start = monthKeyStartISO(monthKey);
  return addDaysISO(start, day - 1);
}

export async function removeDemo() {
  const stores = ['transactions', 'expected', 'loans', 'lendings', 'accounts', 'payees', 'profiles'];
  for (const store of stores) {
    const ids = data[store].filter((record) => record.demo).map((record) => record.id);
    if (ids.length) await removeRecords(store, ids);
  }
  await saveSettings({ demoSeeded: false });
}

/* ---------------- backup / restore ---------------- */

export function buildBackup() {
  const payload = {
    app: 'family-finance',
    version: db.DB_VERSION,
    exportedAt: new Date().toISOString(),
    data: {},
  };
  db.STORES.forEach((name) => {
    if (name === 'settings') {
      payload.data.settings = [data.settings];
    } else {
      payload.data[name] = data[name];
    }
  });
  return payload;
}

export async function restoreBackup(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('not-json');
  if (payload.app !== 'family-finance' || !payload.data) throw new Error('wrong-app');
  const cleaned = {};
  db.STORES.forEach((name) => {
    if (name === 'settings') return;
    const list = Array.isArray(payload.data[name]) ? payload.data[name] : [];
    cleaned[name] = list.filter((record) => record && typeof record === 'object' && record.id);
  });
  const settingsRows = Array.isArray(payload.data.settings) ? payload.data.settings : [];
  const storedSettings = settingsRows.find((row) => row.id === 'app') || payload.data.settings || {};
  const settingsRecord = {
    ...DEFAULT_SETTINGS,
    ...(settingsRows.length ? storedSettings : {}),
    id: 'app',
    lastUsed: { ...DEFAULT_SETTINGS.lastUsed, ...(storedSettings.lastUsed || {}) },
  };
  cleaned.settings = [settingsRecord];

  await db.replaceAll(cleaned);
  db.STORES.forEach((name) => {
    if (name === 'settings') return;
    data[name] = cleaned[name] || [];
  });
  data.settings = settingsRecord;
  setLang(data.settings.lang);
  await materializeRecurring();
  return true;
}

export async function wipeEverything() {
  const keepLang = getLang();
  const keepOnboarded = Boolean(data.settings.onboarded);
  const keepReminder = {
    reminderEnabled: Boolean(data.settings.reminderEnabled),
    reminderTime: data.settings.reminderTime || '21:00',
  };
  await db.wipeAll();
  db.STORES.forEach((name) => {
    if (name === 'settings') return;
    data[name] = [];
  });
  data.settings = {
    ...DEFAULT_SETTINGS,
    lang: keepLang,
    onboarded: keepOnboarded,
    ...keepReminder,
    createdAt: new Date().toISOString(),
  };
  data.categories = [];
  await ensureDefaults();
}

/* ---------------- misc ---------------- */

export function parseAmountSafe(value) {
  const parsed = parseAmount(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function monthKeyOfDate(iso) {
  return monthKeyOfISO(iso);
}

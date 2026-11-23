/*
 * Adding and editing income/expense records — the fastest path in the app.
 * Also home of the "paste from an SMS" importer: nothing is ever read from the
 * Messages app, the user pastes text themselves.
 */

import { L } from '../i18n.js';
import {
  data, profilesSorted, profileName, categoriesOf, categoryName, payeesSorted, payeeName,
  upsert, saveSettings, deleteTransaction, materializeRecurring, ui,
} from '../state.js';
import { todayISO, jalaliToISO, addMonthsToISO } from '../jalali.js';
import {
  parseAmount, formatMoney, formatAmountForInput, escapeHtml as esc, formatDate, normalizeDigits,
} from '../util.js';
import {
  openSheet, confirmDialog, toast, field, datePicker, selectInput, readDate, note, icon,
  closeSheetOf,
} from '../components.js';
import { onAction, rerender, go } from '../bus.js';

export function transactionRowHTML(tx) {
  const isIncome = tx.type === 'income';
  const title = categoryName(tx.categoryId, tx.categoryName);
  const meta = [profileName(tx.profileId)];
  const store = tx.payeeName || payeeName(tx.payeeId);
  if (store) meta.push(store);
  if (tx.recurring && tx.recurring.freq && tx.recurring.freq !== 'none') meta.push(L('تکراری', 'Repeating'));
  if (tx.demo) meta.push(L('نمونه', 'Sample'));
  if (tx.notes) meta.push(tx.notes);
  return `<button type="button" class="tx-row" data-action="edit-tx" data-id="${esc(tx.id)}">
    <span class="tx-row__mark tx-row__mark--${isIncome ? 'income' : 'expense'}">${icon(isIncome ? 'arrowDown' : 'arrowUp', 16)}</span>
    <span class="tx-row__main">
      <span class="tx-row__title">${esc(title)}</span>
      <span class="tx-row__meta">${esc(meta.join(' · '))}</span>
    </span>
    <span class="tx-row__amount tx-row__amount--${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '−'}${formatMoney(tx.amount)}</span>
  </button>`;
}

function payeeOptionsDatalist() {
  return `<datalist id="payee-list">${payeesSorted()
    .map((payee) => `<option value="${esc(payee.name)}"></option>`)
    .join('')}</datalist>`;
}

export function openTransactionSheet({ type = 'expense', record = null, prefill = {} } = {}) {
  const people = profilesSorted();
  if (!people.length) {
    toast(L('اول یک نفر از اعضای خانواده را اضافه کنید.', 'Add a family member first.'), 'warn');
    go('#/more/people');
    return null;
  }
  const kind = record ? record.type : type === 'income' ? 'income' : 'expense';
  const isIncome = kind === 'income';
  const cats = categoriesOf(kind);
  const lastUsed = data.settings.lastUsed || {};
  const initial = {
    amount: record ? record.amount : Number(prefill.amount) || 0,
    date: record ? record.date : prefill.date || todayISO(),
    profileId: record ? record.profileId : prefill.profileId || lastUsed.profileId || people[0].id,
    categoryId: record
      ? record.categoryId
      : prefill.categoryId
        || (isIncome ? lastUsed.incomeCategoryId : lastUsed.expenseCategoryId)
        || (cats[0] ? cats[0].id : ''),
    payeeName: record ? record.payeeName || payeeName(record.payeeId) : prefill.payeeName || '',
    notes: record ? record.notes || '' : prefill.notes || '',
    freq: record && record.recurring ? record.recurring.freq || 'none' : 'none',
    until: record && record.recurring && record.recurring.until
      ? record.recurring.until
      : addMonthsToISO(record ? record.date : prefill.date || todayISO(), 11),
  };
  const formId = `tx-form-${Math.random().toString(36).slice(2, 7)}`;

  const personOptions = people.map((person) => ({ value: person.id, label: person.name }));
  const categoryOptions = cats.map((category) => ({ value: category.id, label: category.name }));
  const freqOptions = [
    { value: 'none', label: L('بدون تکرار', 'Does not repeat') },
    { value: 'monthly', label: L('هر ماه', 'Every month') },
    { value: 'weekly', label: L('هر هفته', 'Every week') },
    { value: 'yearly', label: L('هر سال', 'Every year') },
  ];

  const body = `
  <form id="${formId}" data-form="tx" novalidate>
    <div class="form-hero">
      <span class="form-hero__label">${esc(L('مبلغ', 'Amount'))}</span>
      <input class="input input--hero" type="text" inputmode="numeric" autocomplete="off" name="amount"
        data-amount value="${esc(formatAmountForInput(initial.amount))}" placeholder="0">
      <span class="amount-preview" data-amount-preview></span>
      ${prefill.fromText ? `<span class="form-hero__hint">${esc(L('از متن خوانده شد؛ بررسی کنید.', 'Read from your text — please check.'))}</span>` : ''}
    </div>

    <div class="form-grid">
      ${field({ label: L('تاریخ شمسی', 'Jalali date'), input: datePicker('date', initial.date) })}
      ${field({
        label: L('برای', 'For'),
        input: selectInput({ name: 'profileId', options: personOptions, value: initial.profileId }),
        required: true,
      })}
    </div>

    <div class="field">
      <span class="field__label">${esc(L('دسته', 'Category'))}<span class="field__req">*</span></span>
      <div class="input-row">
        ${selectInput({ name: 'categoryId', options: categoryOptions, value: initial.categoryId })}
        <button type="button" class="icon-btn icon-btn--bordered" data-inline-category
          aria-label="${esc(L('دسته جدید', 'New category'))}">${icon('plus', 18)}</button>
      </div>
    </div>

    ${isIncome
      ? ''
      : `<div class="field">
          <span class="field__label">${esc(L('فروشگاه یا سایت', 'Store or website'))}</span>
          <input class="input" type="text" name="payeeName" list="payee-list" autocomplete="off"
            value="${esc(initial.payeeName)}" placeholder="${esc(L('مثلاً فروشگاه رفاه', 'e.g. local market'))}">
          ${payeeOptionsDatalist()}
          <span class="field__hint">${esc(L('اگر نام تازه بنویسید، خودش به فهرست فروشگاه‌ها اضافه می‌شود.', 'A new name is added to your stores list automatically.'))}</span>
        </div>`}

    ${field({
      label: L('یادداشت (اختیاری)', 'Note (optional)'),
      input: `<textarea class="input input--area" name="notes" rows="2"
        placeholder="${esc(L('مثلاً خرید هفتگی', 'e.g. weekly shopping'))}">${esc(initial.notes)}</textarea>`,
    })}

    <details class="form-details">
      <summary>${icon('refresh', 18)}<span>${esc(L('تکرار خودکار', 'Repeat automatically'))}</span></summary>
      <div class="form-details__body">
        ${field({ label: L('تکرار', 'Repeats'), input: selectInput({ name: 'freq', options: freqOptions, value: initial.freq }) })}
        ${field({
          label: L('تا تاریخ', 'Until'),
          input: datePicker('until', initial.until),
          hint: esc(L('فقط وقتی تکرار انتخاب شده باشد اثر دارد.', 'Only used when a repeat is chosen.')),
        })}
      </div>
    </details>

    <p class="form-error" data-form-error role="alert"></p>
  </form>`;

  const footer = `<div class="row row--gap">
    ${record ? `<button type="button" class="btn btn--ghost btn--icon" data-delete
      aria-label="${esc(L('حذف', 'Delete'))}">${icon('trash', 20)}</button>` : ''}
    <button type="submit" form="${formId}" class="btn btn--primary btn--grow">
      ${isIncome ? esc(L('ثبت درآمد', 'Save income')) : esc(L('ثبت هزینه', 'Save expense'))}
    </button>
  </div>`;

  const sheet = openSheet({
    title: record
      ? isIncome ? L('ویرایش درآمد', 'Edit income') : L('ویرایش هزینه', 'Edit expense')
      : isIncome ? L('ثبت درآمد', 'Add income') : L('ثبت هزینه', 'Add expense'),
    subtitle: L('مبلغ‌ها همیشه به تومان ذخیره می‌شوند.', 'Amounts are always stored in Toman.'),
    body,
    footer,
  });

  const form = sheet.el.querySelector('form');
  const errorBox = form.querySelector('[data-form-error]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.textContent = '';
    const amount = parseAmount(form.elements.amount.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      errorBox.textContent = L('مبلغ را وارد کنید (بزرگ‌تر از صفر).', 'Enter an amount greater than zero.');
      form.elements.amount.focus();
      return;
    }
    const profileId = form.elements.profileId.value;
    if (!profileId) {
      errorBox.textContent = L('یک نفر را انتخاب کنید.', 'Choose a family member.');
      return;
    }
    const categoryId = form.elements.categoryId.value;
    if (!categoryId) {
      errorBox.textContent = L('یک دسته انتخاب کنید.', 'Choose a category.');
      return;
    }
    const date = readDate(form.querySelector('[data-date-picker]'));
    const payeeTyped = form.elements.payeeName ? form.elements.payeeName.value.trim() : '';
    const payee = isIncome ? { id: null, name: '' } : await ensurePayee(payeeTyped);
    const freq = form.elements.freq.value;
    const untilPickers = form.querySelectorAll('[data-date-picker]');
    const until = freq === 'none' || untilPickers.length < 2 ? '' : readDate(untilPickers[1]);

    const next = {
      ...(record || {}),
      type: kind,
      amount,
      date,
      profileId,
      categoryId,
      categoryName: categoryName(categoryId),
      payeeId: payee.id,
      payeeName: payee.name,
      notes: form.elements.notes.value.trim(),
      recurring: { freq, until },
    };
    if (!record) delete next.id;

    await upsert('transactions', next);
    await materializeRecurring();
    await saveSettings({
      lastUsed: {
        ...lastUsed,
        profileId,
        [isIncome ? 'incomeCategoryId' : 'expenseCategoryId']: categoryId,
      },
    });
    sheet.close();
    rerender();
    toast(record ? L('ذخیره شد', 'Saved') : L('ثبت شد', 'Saved'), 'ok');
  });

  const deleteBtn = sheet.el.querySelector('[data-delete]');
  if (deleteBtn && record) {
    deleteBtn.addEventListener('click', async () => {
      sheet.close();
      await deleteTransactionFlow(record);
    });
  }

  const inlineCatBtn = sheet.el.querySelector('[data-inline-category]');
  if (inlineCatBtn) {
    inlineCatBtn.addEventListener('click', () => openQuickCategory(kind, sheet.el));
  }

  return sheet;
}

async function ensurePayee(name) {
  if (!name) return { id: null, name: '' };
  const existing = data.payees.find((payee) => payee.name.trim().toLowerCase() === name.toLowerCase());
  if (existing) return { id: existing.id, name: existing.name };
  const created = await upsert('payees', { name });
  return { id: created.id, name: created.name };
}

function openQuickCategory(kind, parentSheetEl) {
  const formId = `cat-form-${Math.random().toString(36).slice(2, 7)}`;
  const sheet = openSheet({
    title: kind === 'income' ? L('دسته درآمد جدید', 'New income category') : L('دسته هزینه جدید', 'New expense category'),
    body: `<form id="${formId}">
      ${field({
        label: L('نام دسته', 'Category name'),
        input: `<input class="input" name="catName" maxlength="40" autocomplete="off"
          placeholder="${esc(L('مثلاً شهریه مدرسه', 'e.g. school fees'))}">`,
        required: true,
      })}
      <p class="form-error" data-form-error role="alert"></p>
    </form>`,
    footer: `<button type="submit" form="${formId}" class="btn btn--primary btn--grow">${esc(L('افزودن', 'Add'))}</button>`,
  });
  const form = sheet.el.querySelector('form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = form.elements.catName;
    const name = input.value.trim();
    if (!name) {
      form.querySelector('[data-form-error]').textContent = L('نام دسته را بنویسید.', 'Type a category name.');
      return;
    }
    const created = await upsert('categories', { kind, name });
    const select = parentSheetEl.querySelector('select[name="categoryId"]');
    if (select) {
      const option = document.createElement('option');
      option.value = created.id;
      option.textContent = created.name;
      option.selected = true;
      select.appendChild(option);
    }
    sheet.close();
    rerender();
    toast(L('دسته اضافه شد', 'Category added'));
  });
}

export async function deleteTransactionFlow(record) {
  const isSeries = Boolean(
    record.seriesId || (record.recurring && record.recurring.freq && record.recurring.freq !== 'none'),
  );
  if (!isSeries) {
    const ok = await confirmDialog({
      title: L('حذف تراکنش', 'Delete transaction'),
      message: L('این تراکنش حذف شود؟ این کار قابل بازگشت نیست.', 'Delete this transaction? This cannot be undone.'),
      confirmText: L('حذف', 'Delete'),
      danger: true,
    });
    if (!ok) return;
    await deleteTransaction(record.id);
    rerender();
    toast(L('حذف شد', 'Deleted'));
    return;
  }
  const sheet = openSheet({
    title: L('حذف مورد تکراری', 'Delete repeating entry'),
    body: `<p class="dialog-text">${esc(L(
      'این تراکنش بخشی از یک سری تکراری است. کدام را حذف کنم؟',
      'This entry belongs to a repeating series. What should be deleted?',
    ))}</p>`,
    footer: `<div class="col col--gap">
      <button type="button" class="btn btn--danger" data-mode="one">${esc(L('فقط همین مورد', 'Only this one'))}</button>
      <button type="button" class="btn btn--ghost" data-mode="series">${esc(L('همه موارد این سری', 'The whole series'))}</button>
    </div>`,
  });
  sheet.el.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', async () => {
      const wholeSeries = button.dataset.mode === 'series';
      sheet.close();
      await deleteTransaction(record.id, { wholeSeries });
      rerender();
      toast(L('حذف شد', 'Deleted'));
    });
  });
}

/* ---------------- import from a pasted text ---------------- */

export function parsePastedText(raw) {
  const text = String(raw || '');
  const normalized = normalizeDigits(text);
  const out = { amount: NaN, date: todayISO(), merchant: '', note: text.trim().slice(0, 280) };

  const candidates = [];
  const numberPattern = /(\d[\d,٬،\s]{2,}\d|\d{4,})/g;
  let match = numberPattern.exec(normalized);
  while (match) {
    const cleaned = match[1].replace(/[,٬،\s]/g, '');
    const value = Number(cleaned);
    if (Number.isFinite(value) && value >= 1000) {
      const context = normalized.slice(Math.max(0, match.index - 16), match.index + match[1].length + 16);
      const weighted = /تومان|تومن|مبلغ|ریال|پرداخت|برداشت|خرید|انتقال/.test(context) ? 2 : 1;
      candidates.push({ value, weighted, index: match.index });
    }
    match = numberPattern.exec(normalized);
  }
  if (candidates.length) {
    candidates.sort((a, b) => b.weighted - a.weighted || b.value - a.value);
    out.amount = candidates[0].value;
  }

  const dateMatch = normalized.match(/(1[34]\d{2})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (dateMatch) {
    const jy = Number(dateMatch[1]);
    const jm = Number(dateMatch[2]);
    const jd = Number(dateMatch[3]);
    if (jm >= 1 && jm <= 12 && jd >= 1 && jd <= 31) {
      try {
        out.date = jalaliToISO(jy, jm, jd);
      } catch (err) {
        /* keep today */
      }
    }
  }

  const merchantMatch = text.match(/(?:فروشگاه|سایت|به\s+نام|درگاه|پذیرنده)\s*[:：]?\s*([^\n،,]{2,40})/);
  if (merchantMatch) out.merchant = merchantMatch[1].trim().replace(/[.。]+$/, '');
  return out;
}

export function openPasteSheet({ type = 'expense' } = {}) {
  const formId = `paste-form-${Math.random().toString(36).slice(2, 7)}`;
  const body = `
    <p class="dialog-text">${esc(L(
      'متن پیامک بانک یا فیش خرید را اینجا بچسبانید. مبلغ و تاریخ شمسی خوانده می‌شود و پیش از ذخیره می‌توانید اصلاح کنید.',
      'Paste the bank SMS or receipt text here. The amount and Jalali date are picked out, and you can correct them before saving.',
    ))}</p>
    <form id="${formId}">
      <textarea class="input input--area" name="text" rows="6" autocomplete="off"
        placeholder="${esc(L('مثلاً: خرید ۱٬۲۵۰٬۰۰۰ تومان از فروشگاه رفاه ۱۴۰۴/۰۷/۱۲', 'e.g. purchase 1,250,000 Toman at the local market 1404/07/12'))}"></textarea>
      <p class="form-error" data-form-error role="alert"></p>
    </form>
    ${note(esc(L(
      'هیچ پیامی از گوشی خوانده نمی‌شود؛ فقط همین متنی که خودتان می‌چسبانید پردازش می‌شود.',
      'Nothing is read from your phone: only the text you paste here is processed.',
    )))}`;
  const sheet = openSheet({
    title: L('ورود از متن پیامک', 'Import from text'),
    body,
    footer: `<button type="submit" form="${formId}" class="btn btn--primary btn--grow">${esc(L('خواندن و ادامه', 'Read and continue'))}</button>`,
  });
  const form = sheet.el.querySelector('form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const raw = form.elements.text.value;
    if (!raw.trim()) {
      form.querySelector('[data-form-error]').textContent = L('متنی را بچسبانید.', 'Paste some text first.');
      return;
    }
    const parsed = parsePastedText(raw);
    if (!Number.isFinite(parsed.amount)) {
      form.querySelector('[data-form-error]').textContent = L(
        'مبلغی در متن پیدا نشد؛ می‌توانید آن را در فرم بعدی دستی وارد کنید.',
        'No amount found in the text — you can type it in the next screen.',
      );
    }
    sheet.close();
    openTransactionSheet({
      type,
      prefill: {
        amount: Number.isFinite(parsed.amount) ? parsed.amount : 0,
        date: parsed.date,
        payeeName: parsed.merchant,
        notes: parsed.note,
        fromText: true,
      },
    });
  });
  return sheet;
}

/* ---------------- actions ---------------- */

onAction('edit-tx', (element) => {
  const record = data.transactions.find((item) => item.id === element.dataset.id);
  if (record) openTransactionSheet({ record });
});

onAction('quick-expense', () => openTransactionSheet({ type: 'expense' }));
onAction('quick-income', () => openTransactionSheet({ type: 'income' }));
onAction('paste-import', (element) => openPasteSheet({ type: element.dataset.type === 'income' ? 'income' : 'expense' }));
onAction('quick-day-expense', (element) => openTransactionSheet({ type: 'expense', prefill: { date: element.dataset.date } }));

/*
 * "More": family profiles, categories, stores, accounts, the daily reminder,
 * backup/restore, and the notes about what this app can and cannot do.
 */

import { L, getLang, setLang } from '../i18n.js';
import {
  data, ui, profilesSorted, upsert, removeRecord, saveSettings, buildBackup, restoreBackup,
  wipeEverything, hasDemoData, unrecordedDays, seedDemo, removeDemo,
} from '../state.js';
import { currentMonthKey, todayISO, pad2, monthKeyOfISO, addMonthsToKey } from '../jalali.js';
import {
  escapeHtml as esc, formatMoney, formatDate, downloadText, shareOrDownload, copyToClipboard,
  fileStamp, faDigits, normalizeDigits,
} from '../util.js';
import {
  openSheet, confirmDialog, toast, field, selectInput, checkboxRow, note, emptyState, icon,
  sectionTitle, segmented,
} from '../components.js';
import { onAction, rerender, go } from '../bus.js';

const revealedAccounts = new Set();

const ROLE_LABELS = {
  self: () => L('خودم', 'Myself'),
  spouse: () => L('همسر', 'Spouse'),
  child: () => L('فرزند', 'Child'),
  other: () => L('دیگر', 'Other'),
};

function backLink() {
  return `<a class="link-back" href="#/more">${icon('chevronRight', 18)}<span>${esc(L('بیشتر', 'More'))}</span></a>`;
}

function navRow(href, iconName, title, subtitle, action = '') {
  const inner = `<span class="nav-row__icon">${icon(iconName, 20)}</span>
    <span class="nav-row__text">
      <span class="nav-row__title">${esc(title)}</span>
      ${subtitle ? `<span class="nav-row__sub">${esc(subtitle)}</span>` : ''}
    </span>
    ${icon('chevronLeft', 18, 'nav-row__chevron')}`;
  if (action) {
    return `<button type="button" class="nav-row" data-action="${action}">${inner}</button>`;
  }
  return `<a class="nav-row" href="${href}">${inner}</a>`;
}

/* ---------------- index ---------------- */

function moreIndex() {
  const people = profilesSorted();
  return `<div class="view">
    <div class="view-head">
      <h1 class="page-title">${esc(L('بیشتر', 'More'))}</h1>
    </div>

    <section class="card card--flush">
      ${navRow('#/more/people', 'users', L('افراد خانواده', 'Family profiles'), L(`${faDigits(people.length)} نفر`, `${people.length} people`))}
      ${navRow('#/more/categories', 'tag', L('دسته‌بندی‌ها', 'Categories'), L(`${faDigits(data.categories.length)} دسته`, `${data.categories.length} categories`))}
      ${navRow('#/more/payees', 'store', L('فروشگاه‌ها و سایت‌ها', 'Stores & websites'), L(`${faDigits(data.payees.length)} مورد`, `${data.payees.length} saved`))}
      ${navRow('#/more/accounts', 'card', L('حساب‌ها', 'Accounts'), L('فقط نام و چهار رقم آخر', 'Nickname and last 4 digits only'))}
      ${navRow('#/more/reminder', 'bell', L('یادآور روزانه', 'Daily reminder'), data.settings.reminderEnabled ? `${data.settings.reminderTime}` : L('خاموش', 'Off'))}
      ${navRow('#/more/backup', 'shield', L('پشتیبان‌گیری و بازیابی', 'Backup & restore'), L('فایل روی همین گوشی', 'A file on this phone'))}
      ${navRow('#/more/about', 'info', L('راهنما و محدودیت‌ها', 'Help & limitations'), '')}
    </section>

    <section class="card">
      ${sectionTitle(L('زبان', 'Language'))}
      ${segmented('lang', [
        { value: 'fa', label: 'فارسی' },
        { value: 'en', label: 'English' },
      ], getLang(), 'set-lang')}
    </section>

    <section class="card">
      ${sectionTitle(L('داده آزمایشی', 'Sample data'))}
      <p class="card__sub">${esc(L(
        'برای اینکه ببینید برنامه چطور کار می‌کند، می‌توانید داده ساختگی اضافه کنید. با یک دکمه پاک می‌شود و با رکوردهای واقعی قاطی نمی‌شود.',
        'Add made-up records to see how the app works. One tap removes them, and they are kept apart from your real records.',
      ))}</p>
      <div class="row row--gap row--wrap">
        ${hasDemoData()
          ? `<button type="button" class="btn btn--ghost btn--small" data-action="remove-demo">${esc(L('حذف داده نمونه', 'Remove sample data'))}</button>`
          : `<button type="button" class="btn btn--ghost btn--small" data-action="seed-demo">${esc(L('افزودن داده نمونه', 'Add sample data'))}</button>`}
      </div>
    </section>

    <p class="version">${esc(L('مدیریت مالی خانواده', 'Family Finance'))} · v1.0</p>
  </div>`;
}

/* ---------------- people ---------------- */

function peoplePage() {
  const people = profilesSorted();
  return `<div class="view">
    <div class="view-head">
      ${backLink()}
      <h1 class="page-title">${esc(L('افراد خانواده', 'Family profiles'))}</h1>
      <button type="button" class="btn btn--primary btn--small" data-action="new-profile">
        ${icon('plus', 16)}<span>${esc(L('افراد', 'Add'))}</span>
      </button>
    </div>
    <section class="card card--flush">
      ${people.length
        ? people
            .map(
              (person) => `<div class="nav-row nav-row--static">
                <span class="nav-row__icon">${icon('users', 20)}</span>
                <span class="nav-row__text">
                  <span class="nav-row__title">${esc(person.name)}</span>
                  <span class="nav-row__sub">${esc(ROLE_LABELS[person.role] ? ROLE_LABELS[person.role]() : person.role)}
                    · ${faDigits(countRecordsFor(person.id))} ${esc(L('رکورد', 'records'))}</span>
                </span>
                <span class="row row--gap">
                  <button type="button" class="icon-btn" data-action="edit-profile" data-id="${esc(person.id)}"
                    aria-label="${esc(L('ویرایش', 'Edit'))}">${icon('pencil', 18)}</button>
                  <button type="button" class="icon-btn" data-action="delete-profile" data-id="${esc(person.id)}"
                    aria-label="${esc(L('حذف', 'Delete'))}">${icon('trash', 18)}</button>
                </span>
              </div>`,
            )
            .join('')
        : emptyState({
            iconName: 'users',
            title: L('کسی اضافه نشده', 'No one added yet'),
            text: esc(L(
              'برای خودتان، همسرتان و فرزندانتان یک پروفایل بسازید تا درآمد و هزینه هر کس جدا باشد.',
              'Create a profile for yourself, your spouse and your children so each person’s income and spending stays separate.',
            )),
          })}
    </section>
    ${note(esc(L(
      'این پروفایل‌ها فقط روی همین گوشی هستند. اگر همسرتان همین برنامه را روی گوشی خودش نصب کند، داده‌ها به‌طور خودکار بین دو گوشی مشترک نمی‌شود. اشتراک‌گذاری نیاز به یک سرور امن جداگانه دارد و در این نسخه نیست.',
      'These profiles live on this phone only. If your spouse installs the same app on their phone, the data is not shared automatically: real sync needs its own secure backend and is not part of this version.',
    )))}
  </div>`;
}

function countRecordsFor(profileId) {
  let count = 0;
  ['transactions', 'expected', 'lendings', 'accounts'].forEach((store) => {
    count += data[store].filter((record) => record.profileId === profileId).length;
  });
  count += data.loans.filter((loan) => loan.profileId === profileId).length;
  return count;
}

function openProfileSheet(existing = null) {
  const formId = `profile-form-${Math.random().toString(36).slice(2, 7)}`;
  const body = `<form id="${formId}">
    ${field({
      label: L('نام', 'Name'),
      input: `<input class="input" name="name" maxlength="40" autocomplete="off" value="${esc(existing ? existing.name : '')}"
        placeholder="${esc(L('مثلاً مریم', 'e.g. Maryam'))}">`,
      required: true,
    })}
    ${field({
      label: L('نسبت', 'Role'),
      input: selectInput({
        name: 'role',
        options: [
          { value: 'self', label: L('خودم', 'Myself') },
          { value: 'spouse', label: L('همسرم', 'My spouse') },
          { value: 'child', label: L('فرزندم', 'My child') },
          { value: 'other', label: L('دیگر', 'Someone else') },
        ],
        value: existing ? existing.role : 'self',
      }),
    })}
    <p class="form-error" data-form-error role="alert"></p>
  </form>`;
  const sheet = openSheet({
    title: existing ? L('ویرایش فرد', 'Edit person') : L('فرد جدید', 'New person'),
    body,
    footer: `<button type="submit" form="${formId}" class="btn btn--primary btn--grow">${esc(L('ذخیره', 'Save'))}</button>`,
  });
  const form = sheet.el.querySelector('form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) {
      form.querySelector('[data-form-error]').textContent = L('نام را بنویسید.', 'Type a name.');
      return;
    }
    await upsert('profiles', { ...(existing || {}), name, role: form.elements.role.value });
    sheet.close();
    rerender();
    toast(L('ذخیره شد', 'Saved'));
  });
}

/* ---------------- categories ---------------- */

function categoriesPage() {
  return `<div class="view">
    <div class="view-head">
      ${backLink()}
      <h1 class="page-title">${esc(L('دسته‌بندی‌ها', 'Categories'))}</h1>
    </div>
    ${['expense', 'income'].map((kind) => categorySection(kind)).join('')}
    ${note(esc(L(
      'اگر دسته‌ای را حذف کنید، تراکنش‌های قبلی حذف نمی‌شوند و نام همان دسته را نگه می‌دارند.',
      'Deleting a category never deletes past transactions — they keep the old category name.',
    )))}
  </div>`;
}

function categorySection(kind) {
  const list = data.categories
    .filter((category) => category.kind === kind)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return `<section class="card">
    ${sectionTitle(
      kind === 'expense' ? L('دسته‌های هزینه', 'Expense categories') : L('دسته‌های درآمد', 'Income categories'),
      `<button type="button" class="link-btn" data-action="new-category" data-kind="${kind}">${esc(L('افزودن', 'Add'))}</button>`,
    )}
    <ul class="plain-list">
      ${list
        .map(
          (category) => `<li class="plain-list__item">
          <div class="plain-list__main">
            <span class="plain-list__title">${esc(category.name)}</span>
          </div>
          <div class="row row--gap">
            <button type="button" class="icon-btn" data-action="edit-category" data-id="${esc(category.id)}"
              aria-label="${esc(L('تغییر نام', 'Rename'))}">${icon('pencil', 18)}</button>
            <button type="button" class="icon-btn" data-action="delete-category" data-id="${esc(category.id)}"
              aria-label="${esc(L('حذف', 'Delete'))}">${icon('trash', 18)}</button>
          </div>
        </li>`,
        )
        .join('')}
    </ul>
  </section>`;
}

function openNameSheet({ title, value = '', onSave, placeholder = '' }) {
  const formId = `name-form-${Math.random().toString(36).slice(2, 7)}`;
  const sheet = openSheet({
    title,
    body: `<form id="${formId}">
      ${field({
        label: L('نام', 'Name'),
        input: `<input class="input" name="value" maxlength="60" autocomplete="off" value="${esc(value)}"
          placeholder="${esc(placeholder)}">`,
        required: true,
      })}
      <p class="form-error" data-form-error role="alert"></p>
    </form>`,
    footer: `<button type="submit" form="${formId}" class="btn btn--primary btn--grow">${esc(L('ذخیره', 'Save'))}</button>`,
  });
  const form = sheet.el.querySelector('form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const next = form.elements.value.value.trim();
    if (!next) {
      form.querySelector('[data-form-error]').textContent = L('نام را بنویسید.', 'Type a name.');
      return;
    }
    await onSave(next);
    sheet.close();
    rerender();
    toast(L('ذخیره شد', 'Saved'));
  });
}

/* ---------------- stores ---------------- */

function payeesPage() {
  const list = data.payees.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return `<div class="view">
    <div class="view-head">
      ${backLink()}
      <h1 class="page-title">${esc(L('فروشگاه‌ها و سایت‌ها', 'Stores & websites'))}</h1>
      <button type="button" class="btn btn--primary btn--small" data-action="new-payee">${icon('plus', 16)}</button>
    </div>
    <section class="card">
      ${list.length
        ? `<ul class="plain-list">
            ${list
              .map(
                (payee) => `<li class="plain-list__item">
                <div class="plain-list__main"><span class="plain-list__title">${esc(payee.name)}</span></div>
                <div class="row row--gap">
                  <button type="button" class="icon-btn" data-action="edit-payee" data-id="${esc(payee.id)}"
                    aria-label="${esc(L('تغییر نام', 'Rename'))}">${icon('pencil', 18)}</button>
                  <button type="button" class="icon-btn" data-action="delete-payee" data-id="${esc(payee.id)}"
                    aria-label="${esc(L('حذف', 'Delete'))}">${icon('trash', 18)}</button>
                </div>
              </li>`,
              )
              .join('')}
          </ul>`
        : emptyState({
            iconName: 'store',
            title: L('فروشگاهی ثبت نشده', 'No stores saved'),
            text: esc(L(
              'در فرم ثبت هزینه می‌توانید نام فروشگاه را بنویسید؛ خودش اینجا ذخیره می‌شود.',
              'Type a store name in the expense form and it is saved here automatically.',
            )),
          })}
    </section>
  </div>`;
}

/* ---------------- accounts ---------------- */

function maskIban(iban) {
  const clean = String(iban || '').replace(/\s+/g, '').toUpperCase();
  if (clean.length < 8) return '••••';
  return `${clean.slice(0, 4)} •••• •••• •••• ${clean.slice(-4)}`;
}

function accountsPage() {
  return `<div class="view">
    <div class="view-head">
      ${backLink()}
      <h1 class="page-title">${esc(L('حساب‌ها', 'Accounts'))}</h1>
      <button type="button" class="btn btn--primary btn--small" data-action="new-account">${icon('plus', 16)}</button>
    </div>
    ${note(esc(L(
      'وارد کردن نام حساب یا شبا، حساب شما را به بانک وصل نمی‌کند و مانده را بررسی نمی‌کند. شماره کارت کامل، رمز، CVV یا اطلاعات ورود بانک را هرگز وارد نکنید.',
      'An account name or IBAN does not connect to your bank and does not check a balance. Never enter a full card number, PIN, CVV or banking login details.',
    )), 'warn')}
    <section class="card">
      ${data.accounts.length
        ? `<ul class="plain-list">
            ${data.accounts
              .map((account) => {
                const shown = revealedAccounts.has(account.id);
                return `<li class="plain-list__item plain-list__item--stacked">
                <div class="plain-list__button">
                  <div class="plain-list__main">
                    <span class="plain-list__title">${esc(account.nickname)}</span>
                    <span class="plain-list__meta">
                      ${esc(account.bank ? account.bank : L('حساب', 'Account'))}
                      · ${esc(account.last4 ? (shown ? account.last4 : `•••• ${account.last4}`) : L('بدون چهار رقم', 'no last digits'))}
                    </span>
                    ${account.iban ? `<span class="plain-list__meta mono">${esc(shown ? account.iban : maskIban(account.iban))}</span>` : ''}
                    ${account.note ? `<span class="plain-list__meta">${esc(account.note)}</span>` : ''}
                  </div>
                  <div class="row row--gap">
                    <button type="button" class="icon-btn" data-action="reveal-account" data-id="${esc(account.id)}"
                      aria-label="${esc(shown ? L('پنهان کردن', 'Hide') : L('نمایش', 'Show'))}">${icon('lock', 18)}</button>
                    <button type="button" class="icon-btn" data-action="edit-account" data-id="${esc(account.id)}"
                      aria-label="${esc(L('ویرایش', 'Edit'))}">${icon('pencil', 18)}</button>
                    <button type="button" class="icon-btn" data-action="delete-account" data-id="${esc(account.id)}"
                      aria-label="${esc(L('حذف', 'Delete'))}">${icon('trash', 18)}</button>
                  </div>
                </div>
              </li>`;
              })
              .join('')}
          </ul>`
        : emptyState({
            iconName: 'card',
            title: L('حسابی ثبت نشده', 'No accounts saved'),
            text: esc(L(
              'برای اینکه بدانید درآمد به کدام حساب می‌رود، می‌توانید فقط نام و چهار رقم آخر را ذخیره کنید.',
              'To remember which account money goes to, save just a nickname and the last four digits.',
            )),
            action: `<button type="button" class="btn btn--primary" data-action="new-account">${esc(L('افزودن حساب', 'Add account'))}</button>`,
          })}
    </section>
  </div>`;
}

function openAccountSheet(existing = null) {
  const people = profilesSorted();
  const formId = `acc-form-${Math.random().toString(36).slice(2, 7)}`;
  const body = `<form id="${formId}">
    ${field({
      label: L('نام نمایشی حساب', 'Account nickname'),
      input: `<input class="input" name="nickname" maxlength="50" autocomplete="off"
        value="${esc(existing ? existing.nickname : '')}" placeholder="${esc(L('مثلاً حساب اصلی', 'e.g. Main account'))}">`,
      required: true,
    })}
    ${people.length
      ? field({
          label: L('صاحب حساب', 'Owner'),
          input: selectInput({
            name: 'profileId',
            options: people.map((person) => ({ value: person.id, label: person.name })),
            value: existing && existing.profileId ? existing.profileId : people[0].id,
          }),
        })
      : ''}
    ${field({
      label: L('بانک (اختیاری)', 'Bank (optional)'),
      input: `<input class="input" name="bank" maxlength="40" autocomplete="off" value="${esc(existing ? existing.bank || '' : '')}">`,
    })}
    ${field({
      label: L('چهار رقم آخر کارت (اختیاری)', 'Last 4 card digits (optional)'),
      input: `<input class="input" type="text" inputmode="numeric" maxlength="4" name="last4" autocomplete="off"
        value="${esc(existing ? existing.last4 || '' : '')}" placeholder="1234">`,
      hint: esc(L('فقط چهار رقم؛ شماره کامل کارت را وارد نکنید.', 'Four digits only — never the full card number.')),
    })}
    ${field({
      label: L('شبا (اختیاری)', 'IBAN (optional)'),
      input: `<input class="input mono" name="iban" maxlength="32" autocomplete="off" dir="ltr"
        value="${esc(existing ? existing.iban || '' : '')}" placeholder="IR...">`,
      hint: esc(L('در فهرست حساب‌ها پنهان می‌شود؛ در گزارش‌ها به‌طور پیش‌فرض نمی‌آید.', 'Masked in lists and left out of reports by default.')),
    })}
    ${field({
      label: L('یادداشت', 'Note'),
      input: `<textarea class="input input--area" name="note" rows="2">${esc(existing ? existing.note || '' : '')}</textarea>`,
    })}
    <p class="form-error" data-form-error role="alert"></p>
  </form>`;
  const sheet = openSheet({
    title: existing ? L('ویرایش حساب', 'Edit account') : L('حساب جدید', 'New account'),
    subtitle: L('این حساب به بانک وصل نیست و مانده را نمی‌خواند.', 'This account is not connected to a bank and no balance is read.'),
    body,
    footer: `<button type="submit" form="${formId}" class="btn btn--primary btn--grow">${esc(L('ذخیره', 'Save'))}</button>`,
  });
  const form = sheet.el.querySelector('form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const nickname = form.elements.nickname.value.trim();
    if (!nickname) {
      form.querySelector('[data-form-error]').textContent = L('نام حساب را بنویسید.', 'Type an account nickname.');
      return;
    }
    const last4Raw = normalizeDigits(form.elements.last4.value).replace(/\D/g, '').slice(-4);
    await upsert('accounts', {
      ...(existing || {}),
      nickname,
      profileId: form.elements.profileId ? form.elements.profileId.value : existing && existing.profileId,
      bank: form.elements.bank.value.trim(),
      last4: last4Raw,
      iban: form.elements.iban.value.trim().replace(/\s+/g, '').toUpperCase(),
      note: form.elements.note.value.trim(),
    });
    sheet.close();
    rerender();
    toast(L('ذخیره شد', 'Saved'));
  });
}

/* ---------------- reminder ---------------- */

function buildReminderIcs(time) {
  const [hh, mm] = String(time || '21:00').split(':');
  const now = new Date();
  const dtstart = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}T${pad2(hh)}${pad2(mm)}00`;
  const stamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}00Z`;
  const summary = getLang() === 'en' ? 'Daily reminder: record the day expenses' : 'ثبت هزینه‌های امروز';
  const description = getLang() === 'en'
    ? 'Open the family finance app and add the expenses of the day.'
    : 'برنامه مدیریت مالی خانواده را باز کنید و هزینه‌های امروز را ثبت کنید.';
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Family Finance//Reminder//FA',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:reminder-${Date.now()}@family-finance`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtstart}`,
    'RRULE:FREQ=DAILY',
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'BEGIN:VALARM',
    'TRIGGER:PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${summary}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function reminderPage() {
  const settings = data.settings;
  const missing = unrecordedDays(currentMonthKey());
  return `<div class="view">
    <div class="view-head">
      ${backLink()}
      <h1 class="page-title">${esc(L('یادآور روزانه', 'Daily reminder'))}</h1>
    </div>

    <section class="card">
      <label class="switch-row">
        <span class="switch-row__text">
          <span class="switch-row__title">${esc(L('یادآوری ثبت هزینه‌های روز', 'Remind me to record the day'))}</span>
          <span class="switch-row__sub">${esc(L('وقتی برنامه را باز کنید نمایش داده می‌شود.', 'Shown inside the app when you open it.'))}</span>
        </span>
        <input type="checkbox" data-action="reminder-enabled" ${settings.reminderEnabled ? 'checked' : ''}>
        <span class="switch" aria-hidden="true"></span>
      </label>
      ${field({
        label: L('ساعت یادآوری', 'Reminder time'),
        input: `<input class="input" type="time" data-action="reminder-time" value="${esc(settings.reminderTime || '21:00')}">`,
      })}
      <p class="card__sub">${esc(L(`این ماه ${faDigits(missing.length)} روز بدون هزینه مانده است.`, `${missing.length} day(s) this month still have no expenses.`))}</p>
      <div class="row row--gap row--wrap">
        <button type="button" class="btn btn--ghost btn--small" data-action="review-unrecorded">${esc(L('دیدن روزهای ثبت‌نشده', 'See unrecorded days'))}</button>
        <button type="button" class="btn btn--ghost btn--small" data-action="reminder-ics">${icon('calendar', 16)}<span>${esc(L('افزودن به تقویم گوشی', 'Add to iPhone Calendar'))}</span></button>
      </div>
    </section>

    ${note(esc(L(
      'در iOS، یک وب‌اپ نصب‌شده نمی‌تواند مثل اپ معمولی در پس‌زمینه یادآور بفرستد. به همین دلیل یادآور این برنامه داخل خودش نمایش داده می‌شود، و برای یادآوری واقعی می‌توانید یک رویداد تکرارشونده در تقویم گوشی بسازید.',
      'On iOS a web app cannot schedule a background notification the way a native app can. That is why this reminder appears inside the app itself — and to get a real notification, add a repeating event to the iPhone Calendar.',
    )), 'warn')}

    ${note(esc(L(
      'اگر اعلان‌های وب برایتان فعال باشد، برنامه هیچ اعلانی از خودش نمی‌فرستد؛ تمام داده‌ها روی گوشی می‌ماند.',
      'This app sends no web notifications at all: nothing leaves the phone.',
    )))}
  </div>`;
}

/* ---------------- backup ---------------- */

function backupPage() {
  return `<div class="view">
    <div class="view-head">
      ${backLink()}
      <h1 class="page-title">${esc(L('پشتیبان‌گیری و بازیابی', 'Backup & restore'))}</h1>
    </div>

    ${note(esc(L(
      'داده‌ها در حافظه مرورگر روی همین گوشی ذخیره می‌شوند. مرورگر ممکن است در شرایط کمبود فضا داده‌ها را پاک کند؛ پشتیبان فایل، جایگزین مطمئن است. اگر برنامه را از Home Screen حذف کنید، داده‌هایش هم همراه آن می‌رود.',
      'Your records live in this browser’s storage on this phone. The browser can clear it under storage pressure, so a backup file is the reliable copy. Deleting the app from the Home Screen also deletes its data.',
    )), 'warn')}

    <section class="card">
      ${sectionTitle(L('ساخت پشتیبان', 'Make a backup'))}
      <p class="card__sub">${esc(L(
        'همه افراد، تراکنش‌ها، وام‌ها، قرض‌ها و تنظیمات در یک فایل JSON ذخیره می‌شود. این فایل رمزگذاری نشده است؛ آن را در جای امن نگه دارید.',
        'Everyone, transactions, loans, lending and settings go into one JSON file. It is not encrypted — keep it somewhere safe.',
      ))}</p>
      <div class="row row--gap row--wrap">
        <button type="button" class="btn btn--primary btn--small" data-action="backup-export">
          ${icon('download', 16)}<span>${esc(L('ذخیره فایل پشتیبان', 'Save backup file'))}</span>
        </button>
        <button type="button" class="btn btn--ghost btn--small" data-action="backup-share">
          ${icon('share', 16)}<span>${esc(L('اشتراک‌گذاری', 'Share'))}</span>
        </button>
        <button type="button" class="btn btn--ghost btn--small" data-action="backup-copy">
          ${icon('doc', 16)}<span>${esc(L('کپی متن', 'Copy text'))}</span>
        </button>
      </div>
    </section>

    <section class="card">
      ${sectionTitle(L('بازیابی از فایل', 'Restore from a file'))}
      <p class="card__sub">${esc(L(
        'فایل پشتیبان را انتخاب کنید. همه داده‌های فعلی با محتوای فایل جایگزین می‌شوند.',
        'Pick a backup file. Everything currently in the app is replaced with its contents.',
      ))}</p>
      <input class="file-input" type="file" accept=".json,application/json" data-action="restore-file">
    </section>

    <section class="card card--danger">
      ${sectionTitle(L('حذف همه داده‌ها', 'Delete all data'))}
      <p class="card__sub">${esc(L(
        'همه رکوردها برای همیشه از این گوشی پاک می‌شوند. اگر پشتیبان نگرفته‌اید، بازگشتی نیست.',
        'Every record is erased from this phone for good. Without a backup, there is no way back.',
      ))}</p>
      <button type="button" class="btn btn--danger btn--small" data-action="delete-all">
        ${icon('trash', 16)}<span>${esc(L('حذف همه داده‌ها', 'Delete everything'))}</span>
      </button>
    </section>

    ${note(esc(L(
      'این داده‌ها به‌طور خودکار به گوشی دیگر منتقل نمی‌شوند. برای انتقال، فایل پشتیبان را با AirDrop یا فایل‌ها به گوشی دیگر ببرید و آنجا بازیابی کنید.',
      'Nothing moves to another phone by itself. To transfer, send the backup file with AirDrop or Files and restore it there.',
    )))}
  </div>`;
}

/* ---------------- about ---------------- */

function aboutPage() {
  return `<div class="view">
    <div class="view-head">
      ${backLink()}
      <h1 class="page-title">${esc(L('راهنما و محدودیت‌ها', 'Help & limitations'))}</h1>
    </div>

    <section class="card">
      ${sectionTitle(L('این برنامه چه می‌کند', 'What this app does'))}
      <ul class="bullets">
        <li>${esc(L('درآمد و هزینه هر فرد خانواده را به تومان ثبت می‌کند.', 'Records income and expenses for each family member, in Toman.'))}</li>
        <li>${esc(L('درآمد انتظاری را جدا از درآمد رسیده نگه می‌دارد.', 'Keeps expected income separate from income that actually arrived.'))}</li>
        <li>${esc(L('وام‌ها، اقساط، مانده بدهی و پول قرضی را پیگیری می‌کند.', 'Tracks loans, instalments, remaining balance and money lent or borrowed.'))}</li>
        <li>${esc(L('گزارش Markdown از هر بازه شمسی می‌سازد.', 'Builds a Markdown report for any Jalali range.'))}</li>
        <li>${esc(L('آفلاین کار می‌کند و داده‌ها را روی همین گوشی نگه می‌دارد.', 'Works offline and keeps everything on this phone.'))}</li>
      </ul>
    </section>

    <section class="card">
      ${sectionTitle(L('محدودیت‌ها را بدانید', 'Limitations to know'))}
      <ul class="bullets">
        <li>${esc(L('این برنامه به هیچ بانکی وصل نیست؛ هیچ مانده‌ای را نمی‌خواند و هیچ پرداختی انجام نمی‌دهد.', 'It is not connected to any bank: it reads no balances and makes no payments.'))}</li>
        <li>${esc(L('داده‌ها به‌طور خودکار بین گوشی‌ها هم‌گام نمی‌شوند. هم‌گام‌سازی نیاز به یک سرور امن جداگانه دارد.', 'Data does not sync between phones. Real sync would need its own secure backend.'))}</li>
        <li>${esc(L('پیامک‌های گوشی خوانده نمی‌شوند؛ فقط متنی که خودتان می‌چسبانید.', 'Messages are never read from the phone: only the text you paste.'))}</li>
        <li>${esc(L('یادآور در پس‌زمینه کار نمی‌کند؛ داخل برنامه یا با تقویم گوشی.', 'The reminder does not run in the background — inside the app, or through the phone Calendar.'))}</li>
        <li>${esc(L('اعداد تخمینی برنامه‌ریزی‌اند، نه مشاوره مالی حرفه‌ای.', 'Estimates are for planning, not professional financial advice.'))}</li>
        <li>${esc(L('حافظه مرورگر می‌تواند پاک شود؛ پشتیبان بگیرید.', 'Browser storage can be cleared; keep a backup.'))}</li>
      </ul>
    </section>

    <section class="card">
      ${sectionTitle(L('حریم خصوصی', 'Privacy'))}
      <p class="card__sub">${esc(L(
        'هیچ داده‌ای به سرور فرستاده نمی‌شود. برنامه فقط از اینترنت استفاده می‌کند تا خودش را برای اولین بار دانلود کند و بعد از آن آفلاین کار می‌کند.',
        'Nothing is sent to a server. The app only uses the internet to download itself the first time; after that it runs offline.',
      ))}</p>
    </section>

    <p class="version">${esc(L('مدیریت مالی خانواده', 'Family Finance'))} · v1.0 · ${esc(faDigits(todayISO()))}</p>
  </div>`;
}

/* ---------------- router entry ---------------- */

export function renderMore(sub = '') {
  if (sub === 'people') return peoplePage();
  if (sub === 'categories') return categoriesPage();
  if (sub === 'payees') return payeesPage();
  if (sub === 'accounts') return accountsPage();
  if (sub === 'reminder') return reminderPage();
  if (sub === 'backup') return backupPage();
  if (sub === 'about') return aboutPage();
  return moreIndex();
}

/* ---------------- actions ---------------- */

onAction('set-lang', async (element) => {
  const next = element.dataset.value === 'en' ? 'en' : 'fa';
  setLang(next);
  await saveSettings({ lang: next });
  rerender();
});

onAction('new-profile', () => openProfileSheet());

onAction('edit-profile', (element) => {
  const person = profilesSorted().find((item) => item.id === element.dataset.id);
  if (person) openProfileSheet(person);
});

onAction('delete-profile', async (element) => {
  const person = profilesSorted().find((item) => item.id === element.dataset.id);
  if (!person) return;
  const records = countRecordsFor(person.id);
  if (!records) {
    const ok = await confirmDialog({
      title: L('حذف فرد', 'Delete person'),
      message: esc(L(`«${person.name}» حذف شود؟`, `Delete “${person.name}”?`)),
      confirmText: L('حذف', 'Delete'),
      danger: true,
    });
    if (!ok) return;
    await removeRecord('profiles', person.id);
    rerender();
    toast(L('حذف شد', 'Deleted'));
    return;
  }
  const sheet = openSheet({
    title: L('این فرد رکورد دارد', 'This person has records'),
    body: `<p class="dialog-text">${esc(L(
      `«${person.name}» ${faDigits(records)} رکورد دارد. اگر فقط پروفایل را حذف کنید، رکوردها می‌مانند و بدون نام نمایش داده می‌شوند.`,
      `“${person.name}” has ${records} record(s). Deleting only the profile keeps them, shown without a name.`,
    ))}</p>`,
    footer: `<div class="col col--gap">
      <button type="button" class="btn btn--danger" data-mode="with">${esc(L('پروفایل و رکوردهایش حذف شود', 'Delete the profile and its records'))}</button>
      <button type="button" class="btn btn--ghost" data-mode="only">${esc(L('فقط پروفایل حذف شود', 'Delete the profile only'))}</button>
    </div>`,
  });
  sheet.el.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', async () => {
      const withRecords = button.dataset.mode === 'with';
      sheet.close();
      if (withRecords) {
        await removeProfileRecords(person.id);
      }
      await removeRecord('profiles', person.id);
      if (ui.personFilter === person.id) ui.personFilter = 'all';
      rerender();
      toast(L('حذف شد', 'Deleted'));
    });
  });
});

async function removeProfileRecords(profileId) {
  const stores = ['transactions', 'expected', 'lendings', 'accounts', 'loans'];
  for (const store of stores) {
    const ids = data[store].filter((record) => record.profileId === profileId).map((record) => record.id);
    for (const id of ids) await removeRecord(store, id);
  }
}

onAction('new-category', (element) => {
  const kind = element.dataset.kind === 'income' ? 'income' : 'expense';
  openNameSheet({
    title: kind === 'income' ? L('دسته درآمد جدید', 'New income category') : L('دسته هزینه جدید', 'New expense category'),
    onSave: async (name) => {
      await upsert('categories', { kind, name });
    },
  });
});

onAction('edit-category', (element) => {
  const category = data.categories.find((item) => item.id === element.dataset.id);
  if (!category) return;
  openNameSheet({
    title: L('تغییر نام دسته', 'Rename category'),
    value: category.name,
    onSave: async (name) => {
      await upsert('categories', { ...category, name });
    },
  });
});

onAction('delete-category', async (element) => {
  const category = data.categories.find((item) => item.id === element.dataset.id);
  if (!category) return;
  const used = data.transactions.filter((tx) => tx.categoryId === category.id).length;
  const ok = await confirmDialog({
    title: L('حذف دسته', 'Delete category'),
    message: esc(L(
      `«${category.name}» حذف شود؟ ${used ? `${faDigits(used)} تراکنش نام این دسته را نگه می‌دارد.` : ''}`,
      `Delete “${category.name}”? ${used ? `${used} transaction(s) keep the old name.` : ''}`,
    )),
    confirmText: L('حذف', 'Delete'),
    danger: true,
  });
  if (!ok) return;
  await removeRecord('categories', category.id);
  rerender();
  toast(L('حذف شد', 'Deleted'));
});

onAction('new-payee', () => {
  openNameSheet({
    title: L('فروشگاه یا سایت جدید', 'New store or website'),
    onSave: async (name) => {
      await upsert('payees', { name });
    },
  });
});

onAction('edit-payee', (element) => {
  const payee = data.payees.find((item) => item.id === element.dataset.id);
  if (!payee) return;
  openNameSheet({
    title: L('تغییر نام', 'Rename'),
    value: payee.name,
    onSave: async (name) => {
      await upsert('payees', { ...payee, name });
    },
  });
});

onAction('delete-payee', async (element) => {
  const payee = data.payees.find((item) => item.id === element.dataset.id);
  if (!payee) return;
  const ok = await confirmDialog({
    title: L('حذف فروشگاه', 'Delete store'),
    message: esc(L(`«${payee.name}» حذف شود؟`, `Delete “${payee.name}”?`)),
    confirmText: L('حذف', 'Delete'),
    danger: true,
  });
  if (!ok) return;
  await removeRecord('payees', payee.id);
  rerender();
  toast(L('حذف شد', 'Deleted'));
});

onAction('new-account', () => openAccountSheet());
onAction('edit-account', (element) => {
  const account = data.accounts.find((item) => item.id === element.dataset.id);
  if (account) openAccountSheet(account);
});
onAction('reveal-account', (element) => {
  const id = element.dataset.id;
  if (revealedAccounts.has(id)) revealedAccounts.delete(id);
  else revealedAccounts.add(id);
  rerender();
});
onAction('delete-account', async (element) => {
  const account = data.accounts.find((item) => item.id === element.dataset.id);
  if (!account) return;
  const ok = await confirmDialog({
    title: L('حذف حساب', 'Delete account'),
    message: esc(L(`«${account.nickname}» حذف شود؟`, `Delete “${account.nickname}”?`)),
    confirmText: L('حذف', 'Delete'),
    danger: true,
  });
  if (!ok) return;
  await removeRecord('accounts', account.id);
  rerender();
  toast(L('حذف شد', 'Deleted'));
});

onAction('reminder-enabled', async (element) => {
  await saveSettings({ reminderEnabled: element.checked });
  rerender();
});

onAction('reminder-time', async (element) => {
  const value = element.value || '21:00';
  await saveSettings({ reminderTime: value });
  rerender();
});

onAction('reminder-ics', () => {
  const ics = buildReminderIcs(data.settings.reminderTime);
  downloadText('family-finance-reminder.ics', ics, 'text/calendar;charset=utf-8');
  toast(L('فایل تقویم ساخته شد؛ با تقویم بازش کنید.', 'Calendar file created — open it with Calendar.'));
});

onAction('backup-export', () => {
  const payload = JSON.stringify(buildBackup(), null, 2);
  downloadText(`family-finance-backup-${fileStamp()}.json`, payload, 'application/json');
  toast(L('فایل پشتیبان ذخیره شد.', 'Backup file saved.'));
});

onAction('backup-share', async () => {
  const payload = JSON.stringify(buildBackup(), null, 2);
  const result = await shareOrDownload({
    filename: `family-finance-backup-${fileStamp()}.json`,
    text: payload,
    mime: 'application/json',
    title: L('پشتیبان مالی خانواده', 'Family finance backup'),
  });
  if (result === 'downloaded') toast(L('فایل در فایل‌ها ذخیره شد.', 'Saved to Files.'));
});

onAction('backup-copy', async () => {
  const ok = await copyToClipboard(JSON.stringify(buildBackup()));
  toast(
    ok ? L('متن پشتیبان کپی شد.', 'Backup copied.') : L('کپی نشد؛ از ذخیره فایل استفاده کنید.', 'Could not copy — save the file instead.'),
    ok ? 'ok' : 'warn',
  );
});

onAction('restore-file', (input) => {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let payload;
    try {
      payload = JSON.parse(String(reader.result));
    } catch (err) {
      toast(L('این فایل پشتیبان معتبر نیست.', 'That file is not a valid backup.'), 'warn');
      input.value = '';
      return;
    }
    const ok = await confirmDialog({
      title: L('بازیابی پشتیبان', 'Restore backup'),
      message: esc(L(
        'همه داده‌های فعلی با محتوای این فایل جایگزین می‌شوند. ادامه می‌دهید؟',
        'All current data will be replaced by this file. Continue?',
      )),
      confirmText: L('جایگزین کن', 'Replace'),
      danger: true,
    });
    if (!ok) {
      input.value = '';
      return;
    }
    try {
      await restoreBackup(payload);
      ui.personFilter = 'all';
      ui.monthKey = currentMonthKey();
      ui.records.monthKey = currentMonthKey();
      rerender();
      toast(L('بازیابی انجام شد.', 'Restored.'));
    } catch (err) {
      toast(L('بازیابی نشد؛ فایل را بررسی کنید.', 'Restore failed — check the file.'), 'warn');
    } finally {
      input.value = '';
    }
  };
  reader.readAsText(file);
});

onAction('delete-all', async () => {
  const ok = await confirmDialog({
    title: L('حذف همه داده‌ها', 'Delete all data'),
    message: esc(L(
      'همه افراد، تراکنش‌ها، وام‌ها، قرض‌ها، حساب‌ها و تنظیمات برای همیشه پاک می‌شوند. این کار قابل بازگشت نیست.',
      'Every person, transaction, loan, lending record, account and setting is erased for good. This cannot be undone.',
    )),
    confirmText: L('همه را حذف کن', 'Delete everything'),
    danger: true,
  });
  if (!ok) return;
  await wipeEverything();
  ui.personFilter = 'all';
  ui.monthKey = currentMonthKey();
  ui.records.monthKey = currentMonthKey();
  rerender();
  toast(L('همه داده‌ها پاک شد.', 'All data deleted.'));
});

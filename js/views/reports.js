/*
 * Report screen: pick a Jalali range, choose people and fields, preview the
 * Markdown, then share it with the iOS share sheet or save the file.
 */

import { L } from '../i18n.js';
import { ui, profilesSorted } from '../state.js';
import { currentMonthKey, addMonthsToKey } from '../jalali.js';
import {
  escapeHtml as esc, formatMonthLabel, fileStamp, shareOrDownload, copyToClipboard, downloadText,
} from '../util.js';
import { icon, field, selectInput, checkboxRow, note, sectionTitle, toast, segmented } from '../components.js';
import { onAction, rerender } from '../bus.js';
import { buildReportMarkdown } from '../report.js';

function monthOptions() {
  const options = [];
  for (let i = -12; i <= 3; i += 1) {
    const key = addMonthsToKey(currentMonthKey(), i);
    options.push({ value: key, label: formatMonthLabel(key) });
  }
  return options;
}

function selectedPersons() {
  const all = profilesSorted().map((person) => person.id);
  const chosen = ui.reports.persons;
  if (!chosen) return all;
  return all.filter((id) => chosen.includes(id));
}

function currentMarkdown() {
  const r = ui.reports;
  return buildReportMarkdown({
    from: r.from,
    to: r.to,
    personIds: selectedPersons(),
    includeDemo: r.includeDemo,
    fields: r.fields,
  });
}

export function renderReports() {
  const r = ui.reports;
  const people = profilesSorted();
  const chosen = selectedPersons();
  const markdown = currentMarkdown();
  const months = monthOptions();
  const fileName = `family-finance-${fileStamp()}.md`;

  return `<div class="view">
    <div class="view-head">
      <h1 class="page-title">${esc(L('گزارش', 'Report'))}</h1>
    </div>

    <section class="card">
      ${sectionTitle(L('بازه زمانی', 'Date range'))}
      <div class="row row--gap row--wrap">
        ${[['this', L('این ماه', 'This month')], ['last3', L('۳ ماه اخیر', 'Last 3 months')], ['year', L('امسال', 'This year')], ['last12', L('۱۲ ماه اخیر', 'Last 12 months')]]
          .map(([value, label]) => `<button type="button" class="chip" data-action="report-quick" data-value="${value}">${esc(label)}</button>`)
          .join('')}
      </div>
      <div class="form-grid">
        ${field({ label: L('از ماه', 'From'), input: selectInput({ name: 'from', options: months, value: r.from, }) })}
        ${field({ label: L('تا ماه', 'To'), input: selectInput({ name: 'to', options: months, value: r.to }) })}
      </div>
      <button type="button" class="btn btn--ghost btn--small" data-action="report-apply-range">${esc(L('اعمال بازه', 'Apply range'))}</button>
    </section>

    <section class="card">
      ${sectionTitle(L('افراد', 'People'))}
      <div class="checkbox-list">
        ${people
          .map((person) => `<label class="checkbox-row">
            <input type="checkbox" data-action="report-person" data-id="${esc(person.id)}" ${chosen.includes(person.id) ? 'checked' : ''}>
            <span class="checkbox-row__box" aria-hidden="true">${icon('check', 14)}</span>
            <span class="checkbox-row__text">${esc(person.name)}</span>
          </label>`)
          .join('')}
      </div>
    </section>

    <section class="card">
      ${sectionTitle(L('چه چیزهایی بیاید', 'What to include'))}
      <div class="checkbox-list">
        ${[
          ['summary', L('خلاصه ماه', 'Month summary')],
          ['income', L('درآمد', 'Income')],
          ['expenses', L('هزینه‌ها', 'Expenses')],
          ['expected', L('درآمد انتظاری', 'Expected income')],
          ['loans', L('وام‌ها', 'Loans')],
          ['lendings', L('قرض‌ها', 'Money lent / borrowed')],
          ['notes', L('یادداشت‌ها', 'Notes')],
          ['accounts', L('نام حساب‌ها (بدون جزئیات کارت)', 'Account nicknames (no card details)')],
        ]
          .map(
            ([key, label]) => `<label class="checkbox-row">
              <input type="checkbox" data-action="report-field" data-value="${key}" ${r.fields[key] ? 'checked' : ''}>
              <span class="checkbox-row__box" aria-hidden="true">${icon('check', 14)}</span>
              <span class="checkbox-row__text">${esc(label)}</span>
            </label>`,
          )
          .join('')}
        <label class="checkbox-row checkbox-row--warn">
          <input type="checkbox" data-action="report-field" data-value="sensitive" ${r.fields.sensitive ? 'checked' : ''}>
          <span class="checkbox-row__box" aria-hidden="true">${icon('check', 14)}</span>
          <span class="checkbox-row__text">${esc(L('نمایش چهار رقم آخر کارت و شبا', 'Include last 4 digits and IBAN'))}
            <span class="checkbox-row__hint">${esc(L('به‌طور پیش‌فرض خاموش است.', 'Off by default.'))}</span></span>
        </label>
        <label class="checkbox-row">
          <input type="checkbox" data-action="report-demo" ${r.includeDemo ? 'checked' : ''}>
          <span class="checkbox-row__box" aria-hidden="true">${icon('check', 14)}</span>
          <span class="checkbox-row__text">${esc(L('داده نمونه هم بیاید', 'Include sample data'))}</span>
        </label>
      </div>
    </section>

    <section class="card">
      ${sectionTitle(L('پیش‌نمایش', 'Preview'))}
      <pre class="preview" dir="auto">${esc(markdown)}</pre>
      <div class="row row--gap row--wrap">
        <button type="button" class="btn btn--primary btn--small" data-action="report-share">
          ${icon('share', 16)}<span>${esc(L('اشتراک‌گذاری فایل', 'Share file'))}</span>
        </button>
        <button type="button" class="btn btn--ghost btn--small" data-action="report-download">
          ${icon('download', 16)}<span>${esc(L('ذخیره فایل', 'Save file'))}</span>
        </button>
        <button type="button" class="btn btn--ghost btn--small" data-action="report-copy">
          ${icon('doc', 16)}<span>${esc(L('کپی متن', 'Copy text'))}</span>
        </button>
      </div>
      <p class="card__sub">${esc(L(`نام فایل: ${fileName}`, `File name: ${fileName}`))}</p>
    </section>

    ${note(esc(L(
      'فایل Markdown در گوشی ساخته می‌شود؛ فقط اگر خودتان اشتراک بگذارید از گوشی خارج می‌شود.',
      'The Markdown file is made on the phone; it only leaves if you share it yourself.',
    )))}
  </div>`;
}

/* ---------------- actions ---------------- */

onAction('report-quick', (element) => {
  const value = element.dataset.value;
  const now = currentMonthKey();
  if (value === 'this') {
    ui.reports.from = now;
    ui.reports.to = now;
  } else if (value === 'last3') {
    ui.reports.from = addMonthsToKey(now, -2);
    ui.reports.to = now;
  } else if (value === 'year') {
    ui.reports.from = `${now.split('-')[0]}-01`;
    ui.reports.to = now;
  } else if (value === 'last12') {
    ui.reports.from = addMonthsToKey(now, -11);
    ui.reports.to = now;
  }
  rerender();
});

onAction('report-apply-range', (element) => {
  const card = element.closest('.card');
  const from = card.querySelector('select[name="from"]').value;
  const to = card.querySelector('select[name="to"]').value;
  ui.reports.from = from;
  ui.reports.to = to <= from ? from : to;
  rerender();
});

onAction('report-person', (element) => {
  const id = element.dataset.id;
  const current = selectedPersons();
  const next = element.checked
    ? [...new Set([...current, id])]
    : current.filter((personId) => personId !== id);
  /* Never leave an empty selection: it would silently mean "everyone". */
  ui.reports.persons = next.length ? next : profilesSorted().map((person) => person.id);
  rerender();
});

onAction('report-field', (element) => {
  const key = element.dataset.value;
  ui.reports.fields[key] = element.checked;
  rerender();
});

onAction('report-demo', (element) => {
  ui.reports.includeDemo = element.checked;
  rerender();
});

onAction('report-share', async () => {
  const text = currentMarkdown();
  const result = await shareOrDownload({
    filename: `family-finance-${fileStamp()}.md`,
    text,
    mime: 'text/markdown;charset=utf-8',
    title: L('گزارش مالی خانواده', 'Family finance report'),
  });
  if (result === 'downloaded') {
    toast(L('فایل در فایل‌ها ذخیره شد.', 'Saved to Files.'));
  }
});

onAction('report-download', () => {
  downloadText(`family-finance-${fileStamp()}.md`, currentMarkdown(), 'text/markdown;charset=utf-8');
  toast(L('فایل ساخته شد.', 'File created.'));
});

onAction('report-copy', async () => {
  const ok = await copyToClipboard(currentMarkdown());
  toast(
    ok ? L('متن کپی شد.', 'Copied.') : L('کپی نشد؛ از «ذخیره فایل» استفاده کنید.', 'Could not copy — use Save file.'),
    ok ? 'ok' : 'warn',
  );
});

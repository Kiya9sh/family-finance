/*
 * Reusable UI pieces: icons, bottom sheets, confirmations, toasts, form fields,
 * the phone-friendly Jalali date picker, amount input binding and the charts.
 *
 * Everything returns HTML strings or mounts into #sheet-root / #toast-root, so a
 * view stays a pure function of state.
 */

import { L, getLang } from './i18n.js';
import {
  escapeHtml as esc, formatNumber, parseAmount, normalizeDigits, formatAmountForInput,
  faDigits, formatMoney, formatMonthLabel,
} from './util.js';
import {
  isoToJalali, jalaliToISO, jalaaliMonthLength, monthName, todayISO, monthKeyParts,
  partsFromISO, isoFromParts, gregorianMonthLength, gregorianMonthName,
} from './jalali.js';
import { currencyLabel, currencyDecimals, getCalendarMode } from './prefs.js';

/* ---------------- icons ---------------- */

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10.5h18M16.5 14.5h.01"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  grid: '<circle cx="6" cy="6" r="1.6"/><circle cx="12" cy="6" r="1.6"/><circle cx="18" cy="6" r="1.6"/><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/><circle cx="6" cy="18" r="1.6"/><circle cx="12" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6.5 7l.8 13h9.4l.8-13"/>',
  pencil: '<path d="M12 20h8M16.8 3.6a2 2 0 0 1 2.8 2.8L7.2 18.8 3 20l1.2-4.2z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.2 2.7-5.5 6-5.5s6 2.3 6 5.5"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 20c0-2.4-.8-4-2-5"/>',
  tag: '<path d="M20.5 13.5 13 21 3 11V3h8l9.5 9.5z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  store: '<path d="M4 9h16l-1-4H5L4 9zM5.5 9V20h13V9"/><path d="M10 20v-5h4v5"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M7 15h4"/>',
  calculator: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
  download: '<path d="M12 4v12M8 12l4 4 4-4M4 20h16"/>',
  upload: '<path d="M12 20V8M8 12l4-4 4 4M4 4h16"/>',
  share: '<path d="M12 16V3M8 7l4-4 4 4"/><path d="M5 12v8h14v-8"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M21 4v5h-5"/>',
  swap: '<path d="M4 8h13M13 4l4 4-4 4"/><path d="M20 16H7M11 20l-4-4 4-4"/>',
  chevronLeft: '<path d="M14.5 5 8 12l6.5 7"/>',
  chevronRight: '<path d="M9.5 5 16 12l-6.5 7"/>',
  chevronDown: '<path d="M5 9.5 12 16l7-6.5"/>',
  arrowUp: '<path d="M12 20V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 4v15M6 13l6 6 6-6"/>',
  shield: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  split: '<path d="M4 5h6l8 14h4M4 19h6l3-5"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M10.5 20a2 2 0 0 0 3 0"/>',
  lock: '<rect x="4.5" y="10" width="15" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
};

export function icon(name, size = 20, extraClass = '') {
  const body = ICONS[name] || ICONS.info;
  return `<svg class="icon ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">${body}</svg>`;
}

/* ---------------- sheets ---------------- */

export function openSheet({ title, subtitle = '', body = '', footer = '', onMount, onClose, full = false }) {
  const root = document.getElementById('sheet-root');
  const layer = document.createElement('div');
  layer.className = 'sheet-layer';
  layer.innerHTML = `
    <div class="sheet-backdrop" data-sheet-close></div>
    <div class="sheet ${full ? 'sheet--full' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-handle" aria-hidden="true"></div>
      <header class="sheet-head">
        <div class="sheet-head__text">
          <h2 class="sheet-title">${esc(title)}</h2>
          ${subtitle ? `<p class="sheet-sub">${esc(subtitle)}</p>` : ''}
        </div>
        <button type="button" class="icon-btn" data-sheet-close aria-label="${esc(L('بستن', 'Close'))}">
          ${icon('close', 20)}
        </button>
      </header>
      <div class="sheet-body">${body}</div>
      ${footer ? `<footer class="sheet-footer">${footer}</footer>` : ''}
    </div>`;
  root.appendChild(layer);
  document.body.classList.add('sheet-open');

  const api = {
    el: layer,
    close() {
      layer.remove();
      document.removeEventListener('keydown', onKey);
      if (!root.children.length) document.body.classList.remove('sheet-open');
      if (onClose) onClose();
    },
    update(html) {
      const bodyEl = layer.querySelector('.sheet-body');
      if (bodyEl) bodyEl.innerHTML = html;
    },
  };

  function onKey(event) {
    if (event.key === 'Escape') api.close();
  }

  layer.addEventListener('click', (event) => {
    if (event.target.closest('[data-sheet-close]')) api.close();
  });
  document.addEventListener('keydown', onKey);
  if (onMount) onMount(api);
  bindInputs(layer);
  const focusTarget = layer.querySelector('input:not([type="hidden"]), select, textarea');
  if (focusTarget) {
    setTimeout(() => {
      try {
        focusTarget.focus({ preventScroll: true });
      } catch (err) {
        /* ignore */
      }
    }, 120);
  }
  return api;
}

export function confirmDialog({ title, message, confirmText, cancelText, danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      api.close();
      resolve(value);
    };
    const api = openSheet({
      title,
      body: `<p class="dialog-text">${message}</p>`,
      footer: `<div class="row row--gap">
        <button type="button" class="btn btn--ghost" data-confirm-cancel>${esc(cancelText || L('انصراف', 'Cancel'))}</button>
        <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-confirm-ok>${esc(confirmText || L('تأیید', 'Confirm'))}</button>
      </div>`,
      onMount(sheetApi) {
        sheetApi.el.querySelector('[data-confirm-ok]').addEventListener('click', () => finish(true));
        sheetApi.el.querySelector('[data-confirm-cancel]').addEventListener('click', () => finish(false));
      },
      onClose() {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
    });
  });
}

export function toast(message, tone = 'ok') {
  const host = document.getElementById('toast-root');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

/* ---------------- layout helpers ---------------- */

export function emptyState({ iconName = 'list', title, text, action = '' }) {
  return `<div class="empty">
    <div class="empty__icon">${icon(iconName, 28)}</div>
    <h3 class="empty__title">${esc(title)}</h3>
    ${text ? `<p class="empty__text">${text}</p>` : ''}
    ${action ? `<div class="empty__action">${action}</div>` : ''}
  </div>`;
}

export function note(text, tone = 'info') {
  const iconName = tone === 'warn' ? 'alert' : tone === 'lock' ? 'lock' : 'info';
  return `<div class="note note--${tone}">${icon(iconName, 18)}<div class="note__text">${text}</div></div>`;
}

export function statTile({ label, value, hint = '', tone = '', big = false, action = '' }) {
  return `<div class="stat ${big ? 'stat--big' : ''} ${tone ? `stat--${tone}` : ''}" ${action ? `data-action="${action}" role="button" tabindex="0"` : ''}>
    <span class="stat__label">${esc(label)}</span>
    <span class="stat__value">${value}</span>
    ${hint ? `<span class="stat__hint">${hint}</span>` : ''}
  </div>`;
}

export function monthNav(monthKey, { prevAction = 'month-prev', nextAction = 'month-next', todayAction = 'month-today' } = {}) {
  const label = formatMonthLabel(monthKey);
  return `<div class="month-nav">
    <button type="button" class="icon-btn" data-action="${prevAction}" aria-label="${esc(L('ماه قبل', 'Previous month'))}">${icon('chevronRight', 20)}</button>
    <button type="button" class="month-nav__label" data-action="${todayAction}">${esc(label)}</button>
    <button type="button" class="icon-btn" data-action="${nextAction}" aria-label="${esc(L('ماه بعد', 'Next month'))}">${icon('chevronLeft', 20)}</button>
  </div>`;
}

export function segmented(name, options, value, action) {
  return `<div class="segmented" role="tablist">
    ${options
      .map(
        (option) => `<button type="button" role="tab" class="segmented__item ${option.value === value ? 'is-active' : ''}"
          aria-selected="${option.value === value ? 'true' : 'false'}"
          data-action="${action}" data-name="${esc(name)}" data-value="${esc(option.value)}">${esc(option.label)}</button>`,
      )
      .join('')}
  </div>`;
}

export function chip({ label, active = false, action, value = '', name = '' }) {
  return `<button type="button" class="chip ${active ? 'is-active' : ''}" data-action="${action}"
    ${name ? `data-name="${esc(name)}"` : ''} ${value ? `data-value="${esc(value)}"` : ''}>${esc(label)}</button>`;
}

/* ---------------- form fields ---------------- */

export function field({ label, input, hint = '', required = false, id = '' }) {
  return `<label class="field" ${id ? `for="${esc(id)}"` : ''}>
    <span class="field__label">${esc(label)}${required ? '<span class="field__req">*</span>' : ''}</span>
    ${input}
    ${hint ? `<span class="field__hint">${hint}</span>` : ''}
  </label>`;
}

export function textInput({ name, value = '', placeholder = '', type = 'text', id = '', extra = '' }) {
  return `<input class="input" type="${type}" name="${esc(name)}" ${id ? `id="${esc(id)}"` : ''}
    value="${esc(value)}" placeholder="${esc(placeholder)}" ${extra}>`;
}

export function textArea({ name, value = '', placeholder = '', rows = 2 }) {
  return `<textarea class="input input--area" name="${esc(name)}" rows="${rows}"
    placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;
}

export function selectInput({ name, options, value = '', placeholder = '' }) {
  const opts = options
    .map(
      (option) => `<option value="${esc(option.value)}" ${String(option.value) === String(value) ? 'selected' : ''}>${esc(option.label)}</option>`,
    )
    .join('');
  return `<div class="select-wrap">
    <select class="input input--select" name="${esc(name)}">${placeholder ? `<option value="">${esc(placeholder)}</option>` : ''}${opts}</select>
    ${icon('chevronDown', 18, 'select-wrap__icon')}
  </div>`;
}

export function checkboxRow({ name, checked = false, label, hint = '', value = '1' }) {
  return `<label class="checkbox-row">
    <input type="checkbox" name="${esc(name)}" value="${esc(value)}" ${checked ? 'checked' : ''}>
    <span class="checkbox-row__box" aria-hidden="true">${icon('check', 14)}</span>
    <span class="checkbox-row__text">${esc(label)}${hint ? `<span class="checkbox-row__hint">${esc(hint)}</span>` : ''}</span>
  </label>`;
}

export function amountInput({ name, value = 0, placeholder = '' }) {
  return `<div class="amount-wrap">
    <input class="input input--amount" type="text" inputmode="numeric" autocomplete="off"
      data-amount name="${esc(name)}" value="${esc(formatAmountForInput(value))}"
      placeholder="${esc(placeholder || L('مثلاً ۱٬۲۵۰٬۰۰۰', 'e.g. 1,250,000'))}">
    <span class="amount-wrap__unit">${esc(currencyLabel())}</span>
  </div>
  <span class="amount-preview" data-amount-preview></span>`;
}

/* Close the sheet that contains a given element (used by form handlers). */
export function closeSheetOf(element) {
  const layer = element && element.closest ? element.closest('.sheet-layer') : null;
  if (!layer) return;
  layer.remove();
  const root = document.getElementById('sheet-root');
  if (root && !root.children.length) document.body.classList.remove('sheet-open');
}

/* ---------------- Jalali date picker ---------------- */

export function datePicker(name, iso = todayISO()) {
  const mode = getCalendarMode();
  return `<div class="date-picker" data-date-picker data-calendar="${mode}" data-name="${esc(name)}" data-value="${esc(iso)}">
    ${dateSelectsHTML(iso, mode)}
    <button type="button" class="date-picker__today" data-date-today>${esc(L('امروز', 'Today'))}</button>
  </div>`;
}

function yearRange(center) {
  const years = [];
  for (let y = center - 6; y <= center + 3; y += 1) years.push(y);
  return years;
}

function dateSelectsHTML(iso, mode) {
  const lang = getLang();
  const gregorian = mode === 'gregorian';
  const parts = gregorian ? partsFromISO(iso) : isoToJalali(iso);
  const yearValue = gregorian ? parts.gy : parts.jy;
  const monthValue = gregorian ? parts.gm : parts.jm;
  const dayValue = gregorian ? parts.gd : parts.jd;
  const monthLength = gregorian
    ? gregorianMonthLength(yearValue, monthValue)
    : jalaaliMonthLength(yearValue, monthValue);

  const dayOptions = Array.from({ length: monthLength }, (_, i) => i + 1)
    .map((d) => `<option value="${d}" ${d === dayValue ? 'selected' : ''}>${faDigits(d)}</option>`)
    .join('');
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
    .map((m) => `<option value="${m}" ${m === monthValue ? 'selected' : ''}>${esc(
      gregorian ? gregorianMonthName(m, lang) : monthName(m, lang),
    )}</option>`)
    .join('');
  const yearOptions = yearRange(yearValue)
    .map((y) => `<option value="${y}" ${y === yearValue ? 'selected' : ''}>${faDigits(y)}</option>`)
    .join('');

  return `
    <div class="date-picker__custom">
      <select class="input input--select dp-day" data-part="d" aria-label="${esc(L('روز', 'Day'))}">${dayOptions}</select>
      <select class="input input--select dp-month" data-part="m" aria-label="${esc(L('ماه', 'Month'))}">${monthOptions}</select>
      <select class="input input--select dp-year" data-part="y" aria-label="${esc(L('سال', 'Year'))}">${yearOptions}</select>
    </div>`;
}

export function readDate(container) {
  const day = Number(container.querySelector('[data-part="d"]').value);
  const month = Number(container.querySelector('[data-part="m"]').value);
  const year = Number(container.querySelector('[data-part="y"]').value);
  if (container.dataset.calendar === 'gregorian') {
    return isoFromParts(year, month, Math.min(day, gregorianMonthLength(year, month)));
  }
  return jalaliToISO(year, month, Math.min(day, jalaaliMonthLength(year, month)));
}

function refreshDays(container) {
  const daySelect = container.querySelector('[data-part="d"]');
  const month = Number(container.querySelector('[data-part="m"]').value);
  const year = Number(container.querySelector('[data-part="y"]').value);
  const current = Number(daySelect.value);
  const length = container.dataset.calendar === 'gregorian'
    ? gregorianMonthLength(year, month)
    : jalaaliMonthLength(year, month);
  daySelect.innerHTML = Array.from({ length }, (_, i) => i + 1)
    .map((d) => `<option value="${d}" ${d === Math.min(current, length) ? 'selected' : ''}>${faDigits(d)}</option>`)
    .join('');
}

/* ---------------- binding after render ---------------- */

export function bindInputs(root = document) {
  if (!root || !root.querySelectorAll) return;

  root.querySelectorAll('input[data-amount]').forEach((input) => {
    if (input.dataset.bound === '1') return;
    input.dataset.bound = '1';
    /* A decimal point is needed for foreign currencies; the numeric keypad has none. */
    if (currencyDecimals() > 0) input.setAttribute('inputmode', 'decimal');
    const updatePreview = () => {
      const wrap = input.closest('.field') || input.parentElement;
      const preview = wrap ? wrap.querySelector('[data-amount-preview]') : null;
      const value = parseAmount(input.value);
      if (preview) {
        preview.textContent = Number.isFinite(value) && value > 0 ? formatMoney(value) : '';
      }
    };
    input.addEventListener('input', () => {
      const caretAtEnd = input.selectionStart === input.value.length;
      /* Foreign currencies need a decimal point; Toman and Rial do not. */
      const decimals = currencyDecimals();
      let cleaned = normalizeDigits(input.value);
      cleaned = decimals > 0
        ? cleaned.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
        : cleaned.replace(/[^\d]/g, '');
      input.value = cleaned;
      if (!caretAtEnd) return;
      updatePreview();
    });
    input.addEventListener('blur', () => {
      const value = parseAmount(input.value);
      if (Number.isFinite(value) && value > 0) input.value = formatAmountForInput(value);
      updatePreview();
    });
    updatePreview();
  });

  root.querySelectorAll('[data-date-picker]').forEach((container) => {
    if (container.dataset.bound === '1') return;
    container.dataset.bound = '1';
    container.querySelectorAll('[data-part]').forEach((select) => {
      select.addEventListener('change', () => {
        if (select.dataset.part !== 'd') refreshDays(container);
        bindInputs(container);
      });
    });
    const todayBtn = container.querySelector('[data-date-today]');
    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        const iso = todayISO();
        const gregorian = container.dataset.calendar === 'gregorian';
        const parts = gregorian ? partsFromISO(iso) : isoToJalali(iso);
        container.querySelector('[data-part="y"]').value = String(gregorian ? parts.gy : parts.jy);
        container.querySelector('[data-part="m"]').value = String(gregorian ? parts.gm : parts.jm);
        refreshDays(container);
        container.querySelector('[data-part="d"]').value = String(gregorian ? parts.gd : parts.jd);
      });
    }
  });

  root.querySelectorAll('form').forEach((form) => {
    if (form.dataset.boundSoft === '1') return;
    form.dataset.boundSoft = '1';
    form.addEventListener('input', () => {
      const errorBox = form.querySelector('[data-form-error]');
      if (errorBox) errorBox.textContent = '';
    });
  });
}

/* ---------------- charts ---------------- */

export function barList(items, { tone = 'expense' } = {}) {
  const max = items.reduce((acc, item) => Math.max(acc, item.value), 0) || 1;
  return `<ul class="bar-list">
    ${items
      .map(
        (item) => `<li class="bar-list__item">
        <div class="bar-list__row">
          <span class="bar-list__label">${esc(item.label)}</span>
          <span class="bar-list__value">${esc(item.valueLabel || formatMoney(item.value))}</span>
        </div>
        <div class="bar-list__track" role="img" aria-label="${esc(`${item.label}: ${item.valueLabel || formatMoney(item.value)}`)}">
          <span class="bar-list__fill bar-list__fill--${tone}" style="width:${Math.max(2, Math.round((item.value / max) * 100))}%"></span>
        </div>
        ${item.hint ? `<span class="bar-list__hint">${esc(item.hint)}</span>` : ''}
      </li>`,
      )
      .join('')}
  </ul>`;
}

export function columnChart(groups, { height = 132 } = {}) {
  const max = groups.reduce(
    (acc, group) => Math.max(acc, group.income || 0, group.expense || 0),
    0,
  ) || 1;
  return `<div class="col-chart" style="--chart-height:${height}px">
    ${groups
      .map((group) => {
        const incomeH = Math.round(((group.income || 0) / max) * 100);
        const expenseH = Math.round(((group.expense || 0) / max) * 100);
        return `<div class="col-chart__group">
          <div class="col-chart__bars" role="img" aria-label="${esc(
            `${group.label}: ${L('درآمد', 'income')} ${formatMoney(group.income || 0)}، ${L('هزینه', 'expense')} ${formatMoney(group.expense || 0)}`,
          )}">
            <span class="col-chart__bar col-chart__bar--income" style="height:${Math.max(incomeH, group.income ? 3 : 0)}%"></span>
            <span class="col-chart__bar col-chart__bar--expense" style="height:${Math.max(expenseH, group.expense ? 3 : 0)}%"></span>
          </div>
          <span class="col-chart__label">${esc(group.label)}</span>
        </div>`;
      })
      .join('')}
  </div>`;
}

export function chartLegend() {
  return `<div class="chart-legend">
    <span class="chart-legend__item"><i class="dot dot--income"></i>${esc(L('درآمد ثبت‌شده', 'Recorded income'))}</span>
    <span class="chart-legend__item"><i class="dot dot--expense"></i>${esc(L('هزینه', 'Expenses'))}</span>
  </div>`;
}

/* ---------------- misc ---------------- */

export function sectionTitle(title, actionHTML = '') {
  return `<div class="section-title">
    <h2>${esc(title)}</h2>
    ${actionHTML || ''}
  </div>`;
}

export function personBadge(name, color) {
  const initial = (name || '?').trim().charAt(0);
  return `<span class="person-badge" style="--badge:${esc(color || '#0f766e')}">${esc(initial)}</span>`;
}

export function summaryRow(label, value, { strong = false, tone = '' } = {}) {
  return `<div class="summary-row ${strong ? 'summary-row--strong' : ''} ${tone ? `summary-row--${tone}` : ''}">
    <span class="summary-row__label">${esc(label)}</span>
    <span class="summary-row__value">${value}</span>
  </div>`;
}

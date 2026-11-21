/*
 * Small shared helpers: digits, Toman formatting, Jalali display formatting,
 * DOM-safe text, files for export/backup.
 */

import { L, getLang } from './i18n.js';
import {
  isoToJalali, monthKeyParts, monthName, weekdayName, relativeIso, pad2,
} from './jalali.js';

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const GROUPER = new Intl.NumberFormat('en-US');

export function uid(prefix = 'id') {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

/* Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII. */
export function normalizeDigits(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660));
}

export function toPersianDigits(input) {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[+d]);
}

/* Digits in the digits of the current language. */
export function faDigits(input) {
  const s = String(input);
  return getLang() === 'en' ? s : toPersianDigits(s);
}

/* 1250000 -> "۱٬۲۵۰٬۰۰۰" (fa) or "1,250,000" (en). Always Toman, never Rial. */
export function formatNumber(value) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  const negative = safe < 0;
  const grouped = GROUPER.format(Math.round(Math.abs(safe)));
  if (getLang() === 'en') return (negative ? '-' : '') + grouped;
  return (negative ? '-' : '') + toPersianDigits(grouped).replace(/,/g, '٬');
}

export function formatMoney(value) {
  return `${formatNumber(value)} ${L('تومان', 'Toman')}`;
}

export function formatSignedMoney(value) {
  const n = Number(value) || 0;
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}${formatNumber(Math.abs(n))}`;
}

/* Value shown inside an amount <input>: plain ASCII with simple commas. */
export function formatAmountForInput(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '';
  return GROUPER.format(Math.round(n));
}

/* Accepts "1,250,000", "۱۲۵۰۰۰۰", " 1250000 " and returns 1250000, or NaN. */
export function parseAmount(input) {
  if (input === null || input === undefined) return NaN;
  let s = normalizeDigits(input);
  s = s.replace(/[,٬،\s\u00A0]/g, '').replace(/^\+/, '');
  if (!s) return NaN;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  const value = Number(s);
  if (!Number.isFinite(value)) return NaN;
  return Math.round(value);
}

export function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sum(list, pick = (x) => x) {
  return list.reduce((acc, item) => acc + (Number(pick(item)) || 0), 0);
}

export function groupBy(list, keyFn) {
  const map = new Map();
  list.forEach((item) => {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}

export function sortByDesc(list, pick) {
  return list.slice().sort((a, b) => (Number(pick(b)) || 0) - (Number(pick(a)) || 0));
}

export function pct(part, whole) {
  const w = Number(whole) || 0;
  if (!w) return 0;
  return Math.round(((Number(part) || 0) / w) * 100);
}

export function formatPercent(value) {
  const n = Math.round(Number(value) || 0);
  return `${faDigits(n)}${getLang() === 'en' ? '%' : '٪'}`;
}

export function truncate(text, max = 40) {
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function titleCaseFirst(text) {
  const s = String(text || '');
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/* ---------- Jalali display formatting ---------- */

export function formatDate(iso) {
  const j = isoToJalali(iso);
  const month = monthName(j.jm, getLang());
  if (getLang() === 'en') return `${j.jd} ${month} ${j.jy}`;
  return `${faDigits(j.jd)} ${month} ${faDigits(j.jy)}`;
}

export function formatDateListHeader(iso) {
  const j = isoToJalali(iso);
  const month = monthName(j.jm, getLang());
  const wd = weekdayName(iso, getLang());
  if (getLang() === 'en') return `${wd}, ${j.jd} ${month} ${j.jy}`;
  return `${wd} ${faDigits(j.jd)} ${month}`;
}

export function formatDateShort(iso) {
  const j = isoToJalali(iso);
  const s = `${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`;
  return faDigits(s);
}

export function formatMonthLabel(key) {
  const { jy, jm } = monthKeyParts(key);
  const month = monthName(jm, getLang());
  return `${month} ${faDigits(jy)}`;
}

export function formatMonthLabelShort(key) {
  const { jy, jm } = monthKeyParts(key);
  return `${monthName(jm, getLang())} ${faDigits(String(jy).slice(2))}`;
}

export function formatDateTime(when = new Date()) {
  const d = when instanceof Date ? when : new Date(when);
  const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return `${formatDate(iso)} — ${faDigits(time)}`;
}

export function relativeDay(iso) {
  const offset = relativeIso(iso);
  if (offset === 0) return L('امروز', 'today');
  if (offset === -1) return L('دیروز', 'yesterday');
  if (offset === 1) return L('فردا', 'tomorrow');
  if (offset < 0) return L(`${faDigits(Math.abs(offset))} روز پیش`, `${Math.abs(offset)} days ago`);
  return L(`${faDigits(offset)} روز بعد`, `in ${offset} days`);
}

export function daysLabel(days) {
  const n = Math.abs(Number(days) || 0);
  return L(`${faDigits(n)} روز`, `${n} day${n === 1 ? '' : 's'}`);
}

/* ---------- Files ---------- */

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 4000);
}

export function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  downloadBlob(filename, new Blob([text], { type: mime }));
}

/* Share through the iOS share sheet when possible, otherwise save the file. */
export async function shareOrDownload({ filename, text, mime = 'text/markdown;charset=utf-8', title }) {
  try {
    const file = new File([text], filename, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: title || filename });
      return 'shared';
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return 'cancelled';
    /* fall through to download */
  }
  downloadText(filename, text, mime);
  return 'downloaded';
}

export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    /* ignore */
  }
  return false;
}

export function debounce(fn, ms = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/* Stable file name part for Jalali dates. */
export function fileStamp(date = new Date()) {
  const iso = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const j = isoToJalali(iso);
  return `${j.jy}-${pad2(j.jm)}-${pad2(j.jd)}`;
}

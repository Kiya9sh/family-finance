/*
 * Jalali (Hejri Shamsi) <-> Gregorian date helpers.
 *
 * The conversion maths follows the well known jalaali algorithm
 * (Behrang Noruzi Niya, MIT licensed), which is accurate for the
 * years this app cares about (1300-1500 Jalali).
 *
 * This module is pure date maths: no formatting, no DOM, no language.
 * Formatting of numbers/dates lives in util.js so that this file stays
 * a single, testable source of truth for calendar arithmetic.
 */

const div = (a, b) => ~~(a / b);
const mod = (a, b) => a - ~~(a / b) * b;

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210,
  1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
];

function jalCal(jy) {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;

  if (jy < jp || jy >= BREAKS[bl - 1]) {
    throw new Error('Jalali year out of supported range: ' + jy);
  }

  for (let i = 1; i < bl; i += 1) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }

  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

function g2d(gy, gm, gd) {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let jd;
  let jm;
  let k = jdn - jdn1f;

  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }

  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

export const MONTHS_FA = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

export const MONTHS_EN = [
  'Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar',
  'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand',
];

export const GREGORIAN_MONTHS_FA = [
  'ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن',
  'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر',
];

export const GREGORIAN_MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function gregorianMonthName(gm, lang) {
  const list = lang === 'en' ? GREGORIAN_MONTHS_EN : GREGORIAN_MONTHS_FA;
  return list[Math.min(Math.max(gm, 1), 12) - 1];
}

export function gregorianMonthLength(gy, gm) {
  return new Date(Date.UTC(gy, gm, 0)).getUTCDate();
}

/* Saturday first, matching the Iranian week. */
export const WEEKDAYS_FA = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
export const WEEKDAYS_EN = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toJalaali(gy, gm, gd) {
  return d2j(g2d(gy, gm, gd));
}

export function toGregorian(jy, jm, jd) {
  return d2g(j2d(jy, jm, jd));
}

export function isLeapJalaaliYear(jy) {
  return jalCal(jy).leap === 0;
}

export function jalaaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaaliYear(jy) ? 30 : 29;
}

/* ---------- ISO day strings ('YYYY-MM-DD') ---------- */

export function isoFromParts(gy, gm, gd) {
  return `${gy}-${pad2(gm)}-${pad2(gd)}`;
}

export function partsFromISO(iso) {
  if (typeof iso !== 'string') return { gy: 2024, gm: 1, gd: 1 };
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { gy: 2024, gm: 1, gd: 1 };
  return { gy: +m[1], gm: +m[2], gd: +m[3] };
}

export function isoToJalali(iso) {
  const p = partsFromISO(iso);
  return toJalaali(p.gy, p.gm, p.gd);
}

export function jalaliToISO(jy, jm, jd) {
  const g = toGregorian(jy, jm, jd);
  return isoFromParts(g.gy, g.gm, g.gd);
}

export function todayISO() {
  const d = new Date();
  return isoFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function todayJalali() {
  return isoToJalali(todayISO());
}

export function isTodayISO(iso) {
  return iso === todayISO();
}

export function addDaysISO(iso, n) {
  const p = partsFromISO(iso);
  const t = new Date(Date.UTC(p.gy, p.gm - 1, p.gd));
  t.setUTCDate(t.getUTCDate() + n);
  return isoFromParts(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function diffDaysISO(fromISO, toISOValue) {
  const a = partsFromISO(fromISO);
  const b = partsFromISO(toISOValue);
  const ta = Date.UTC(a.gy, a.gm - 1, a.gd);
  const tb = Date.UTC(b.gy, b.gm - 1, b.gd);
  return Math.round((tb - ta) / 86400000);
}

/* 0 = Saturday ... 6 = Friday */
export function weekdayIndex(iso) {
  const p = partsFromISO(iso);
  const jsDay = new Date(Date.UTC(p.gy, p.gm - 1, p.gd)).getUTCDay();
  return (jsDay + 1) % 7;
}

/* Days from today to iso: negative in the past, 0 today, positive ahead. */
export function relativeIso(iso) {
  return diffDaysISO(todayISO(), iso);
}

export function addMonthsToISO(iso, n) {
  if (!n) return iso;
  const j = isoToJalali(iso);
  const total = j.jy * 12 + (j.jm - 1) + n;
  const jy = Math.floor(total / 12);
  const jm = (total % 12 + 12) % 12 + 1;
  const maxDay = jalaaliMonthLength(jy, jm);
  return jalaliToISO(jy, jm, Math.min(j.jd, maxDay));
}

/* ---------- Month keys ('1404-07') ---------- */

export function monthKeyOfISO(iso) {
  const j = isoToJalali(iso);
  return `${j.jy}-${pad2(j.jm)}`;
}

export function currentMonthKey() {
  return monthKeyOfISO(todayISO());
}

export function monthKeyParts(key) {
  const m = String(key || '').match(/^(-?\d{3,4})-(\d{2})$/);
  if (!m) {
    const now = todayJalali();
    return { jy: now.jy, jm: now.jm };
  }
  return { jy: +m[1], jm: +m[2] };
}

export function makeMonthKey(jy, jm) {
  const total = jy * 12 + (jm - 1);
  const y = Math.floor(total / 12);
  const m = (total % 12 + 12) % 12 + 1;
  return `${y}-${pad2(m)}`;
}

export function addMonthsToKey(key, n) {
  const p = monthKeyParts(key);
  return makeMonthKey(p.jy, p.jm + n);
}

export function monthKeyStartISO(key) {
  const p = monthKeyParts(key);
  return jalaliToISO(p.jy, p.jm, 1);
}

export function monthKeyEndISO(key) {
  const p = monthKeyParts(key);
  return jalaliToISO(p.jy, p.jm, jalaaliMonthLength(p.jy, p.jm));
}

export function daysInMonthKey(key) {
  const p = monthKeyParts(key);
  return jalaaliMonthLength(p.jy, p.jm);
}

export function monthKeysBetween(fromKey, toKey) {
  const out = [];
  let guard = 0;
  let key = fromKey;
  const end = toKey;
  while (guard < 240) {
    out.push(key);
    if (key === end) break;
    key = addMonthsToKey(key, 1);
    guard += 1;
  }
  return out;
}

export function monthName(jm, lang) {
  const list = lang === 'en' ? MONTHS_EN : MONTHS_FA;
  return list[Math.min(Math.max(jm, 1), 12) - 1];
}

export function weekdayName(iso, lang) {
  const list = lang === 'en' ? WEEKDAYS_EN : WEEKDAYS_FA;
  return list[weekdayIndex(iso)];
}

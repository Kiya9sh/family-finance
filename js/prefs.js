/*
 * Preferences that change how numbers and dates are *displayed* — never how
 * they are stored.
 *
 *  - calendar: 'jalali' (default) or 'gregorian'. Record dates are always kept
 *    as ISO Gregorian in storage, so switching only changes display and entry.
 *  - currency: 'toman' (default) or 'rial'. Amounts are always stored as whole
 *    Toman; Rial is the same money shown ×10, clearly labelled, and Rial entry
 *    is divided back by 10 before it is stored.
 *
 * These live outside state.js so the formatting helpers in util.js can read
 * them without an import cycle.
 */

import { L } from './i18n.js';

let calendar = 'jalali';
let currency = 'toman';

export function setCalendarMode(value) {
  calendar = value === 'gregorian' ? 'gregorian' : 'jalali';
}

export function getCalendarMode() {
  return calendar;
}

export function isGregorian() {
  return calendar === 'gregorian';
}

export function setCurrencyMode(value) {
  currency = value === 'rial' ? 'rial' : 'toman';
}

export function getCurrencyMode() {
  return currency;
}

/* How many display units make one stored Toman. */
export function currencyMultiplier() {
  return currency === 'rial' ? 10 : 1;
}

export function currencyLabel() {
  return currency === 'rial' ? L('ریال', 'Rial') : L('تومان', 'Toman');
}

export function currencyCode() {
  return currency === 'rial' ? 'IRR' : 'IRT';
}

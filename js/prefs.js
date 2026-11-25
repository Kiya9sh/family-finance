/*
 * Preferences that change how numbers and dates are *displayed* — never how
 * they are stored.
 *
 *  - calendar: 'jalali' (default) or 'gregorian'. Record dates are always kept
 *    as ISO Gregorian in storage, so switching only changes display and entry.
 *  - currency: 'toman' (default), 'rial', 'usd', 'eur' or 'custom'. Amounts are
 *    always stored as whole Toman. Any other unit is the same money divided by
 *    a rate the user controls (rial is fixed at 10 to the Toman), and what the
 *    user types is multiplied back before it is stored. Nothing is converted
 *    silently: the unit is written next to every amount and the rate is shown
 *    on the currency screen.
 *
 * These live outside state.js so util.js can read them without an import cycle.
 */

import { L } from './i18n.js';

const CODES = ['toman', 'rial', 'usd', 'eur', 'custom'];

let calendar = 'jalali';
let currency = 'toman';
let fx = { usd: 0, eur: 0, custom: 0, customLabel: '' };

export function setCalendarMode(value) {
  calendar = value === 'gregorian' ? 'gregorian' : 'jalali';
}

export function getCalendarMode() {
  return calendar;
}

export function isGregorian() {
  return calendar === 'gregorian';
}

export function setCurrencyMode(value, rates) {
  currency = CODES.includes(value) ? value : 'toman';
  if (rates) setFxRates(rates);
}

export function setFxRates(rates) {
  if (!rates) return;
  fx = {
    usd: Number(rates.usd) || 0,
    eur: Number(rates.eur) || 0,
    custom: Number(rates.custom) || 0,
    customLabel: String(rates.customLabel || ''),
  };
}

export function getCurrencyMode() {
  return currency;
}

export function getFxRates() {
  return { ...fx };
}

/* Toman per one unit of the given currency code. */
export function tomanPerUnit(code) {
  switch (code) {
    case 'rial':
      return 0.1;
    case 'usd':
      return fx.usd || 0;
    case 'eur':
      return fx.eur || 0;
    case 'custom':
      return fx.custom || 0;
    default:
      return 1;
  }
}

/* How many display units make one stored Toman. */
export function currencyMultiplier() {
  const rate = tomanPerUnit(currency);
  return rate > 0 ? 1 / rate : 1;
}

/* Toman and Rial are whole numbers; foreign units need decimals. */
export function currencyDecimals() {
  return currency === 'toman' || currency === 'rial' ? 0 : 2;
}

export function currencyIsReady() {
  return tomanPerUnit(currency) > 0;
}

export function currencyLabel() {
  switch (currency) {
    case 'rial':
      return L('ریال', 'Rial');
    case 'usd':
      return L('دلار', 'USD');
    case 'eur':
      return L('یورو', 'EUR');
    case 'custom':
      return fx.customLabel || L('واحد دلخواه', 'Custom');
    default:
      return L('تومان', 'Toman');
  }
}

export function currencyCode() {
  switch (currency) {
    case 'rial':
      return 'IRR';
    case 'usd':
      return 'USD';
    case 'eur':
      return 'EUR';
    case 'custom':
      return 'CUSTOM';
    default:
      return 'IRT';
  }
}

export const CURRENCY_CODES = CODES;

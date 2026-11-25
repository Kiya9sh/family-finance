/*
 * Display and input preferences. Currency selection is a label/input unit only:
 * the app never converts amounts or asks for exchange rates.
 */

import { L } from './i18n.js';

const CODES = ['toman', 'rial', 'usd', 'eur', 'custom'];

let calendar = 'jalali';
let currency = 'toman';
let customCurrencyLabel = '';

export const CURRENCY_CODES = CODES;

export function setCalendarMode(value) {
  calendar = value === 'gregorian' ? 'gregorian' : 'jalali';
}

export function getCalendarMode() {
  return calendar;
}

export function isGregorian() {
  return calendar === 'gregorian';
}

export function setCurrencyMode(value, customLabel = '') {
  currency = CODES.includes(value) ? value : 'toman';
  customCurrencyLabel = String(customLabel || '').trim();
}

export function getCurrencyMode() {
  return currency;
}

export function currencyDecimals(code = currency) {
  return code === 'toman' || code === 'rial' ? 0 : 2;
}

export function currencyLabel(code = currency) {
  switch (code) {
    case 'rial':
      return L('ریال', 'Rial');
    case 'usd':
      return L('دلار آمریکا', 'US dollar');
    case 'eur':
      return L('یورو', 'Euro');
    case 'custom':
      return customCurrencyLabel || L('واحد دلخواه', 'Custom currency');
    default:
      return L('تومان', 'Toman');
  }
}

export function currencyCode(code = currency) {
  switch (code) {
    case 'rial': return 'IRR';
    case 'usd': return 'USD';
    case 'eur': return 'EUR';
    case 'custom': return 'CUSTOM';
    default: return 'IRT';
  }
}

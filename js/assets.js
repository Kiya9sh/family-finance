/*
 * Investments: starting points for common holdings, and a best-effort price
 * fetch.
 *
 * The fetch is never automatic. It runs only when the user taps the button, it
 * asks two public endpoints for a price and sends nothing about the user or
 * their holdings. If the network blocks them (common in Iran) it fails with a
 * message and the manual price update keeps working.
 */

import { L } from '../i18n.js';

export const ASSET_PRESETS = [
  {
    key: 'usd', kind: 'currency', fa: 'دلار آمریکا', en: 'US dollar', symbol: 'USD',
    unitFa: 'دلار', unitEn: 'USD', priceCurrency: 'toman',
  },
  {
    key: 'eur', kind: 'currency', fa: 'یورو', en: 'Euro', symbol: 'EUR',
    unitFa: 'یورو', unitEn: 'EUR', priceCurrency: 'toman',
  },
  {
    key: 'gold-gram', kind: 'gold', fa: 'طلای ۱۸ عیار (گرم)', en: 'Gold 18k (gram)', symbol: 'XAU',
    unitFa: 'گرم', unitEn: 'g', priceCurrency: 'toman',
  },
  {
    key: 'coin', kind: 'gold', fa: 'سکه', en: 'Gold coin', symbol: 'COIN',
    unitFa: 'سکه', unitEn: 'coin', priceCurrency: 'toman',
  },
  {
    key: 'silver-gram', kind: 'silver', fa: 'نقره (گرم)', en: 'Silver (gram)', symbol: 'XAG',
    unitFa: 'گرم', unitEn: 'g', priceCurrency: 'toman',
  },
  {
    key: 'btc', kind: 'crypto', fa: 'بیت‌کوین', en: 'Bitcoin', symbol: 'BTC',
    unitFa: 'واحد', unitEn: 'unit', priceCurrency: 'usd', gecko: 'bitcoin',
  },
  {
    key: 'eth', kind: 'crypto', fa: 'اتریوم', en: 'Ethereum', symbol: 'ETH',
    unitFa: 'واحد', unitEn: 'unit', priceCurrency: 'usd', gecko: 'ethereum',
  },
  {
    key: 'usdt', kind: 'crypto', fa: 'تتر', en: 'Tether', symbol: 'USDT',
    unitFa: 'واحد', unitEn: 'unit', priceCurrency: 'usd', gecko: 'tether',
  },
  {
    key: 'stock', kind: 'stock', fa: 'سهام یا صندوق', en: 'Shares or fund', symbol: '',
    unitFa: 'واحد', unitEn: 'unit', priceCurrency: 'toman',
  },
];

export const KIND_LABELS = {
  currency: () => L('ارز', 'Currency'),
  gold: () => L('طلا', 'Gold'),
  silver: () => L('نقره', 'Silver'),
  crypto: () => L('رمزارز', 'Crypto'),
  stock: () => L('سهام', 'Shares'),
  other: () => L('سایر', 'Other'),
};

const TIMEOUT_MS = 9000;

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/* Toman per USD and per EUR, plus USD prices for the coins we know. */
export async function fetchMarketRates() {
  const out = { usd: 0, eur: 0, crypto: {}, source: '', at: new Date().toISOString() };

  /* Toman per USD: the public FX table quotes Iranian Rial per USD. */
  try {
    const fx = await getJson('https://open.er-api.com/v6/latest/USD');
    const rial = Number(fx && fx.rates && fx.rates.IRR);
    const eurPerUsd = Number(fx && fx.rates && fx.rates.EUR);
    if (rial > 0) {
      out.usd = Math.round(rial / 10);
      if (eurPerUsd > 0) out.eur = Math.round(out.usd / eurPerUsd);
      out.source = 'open.er-api.com';
    }
  } catch (err) {
    /* try the crypto source anyway, then report what is missing */
  }

  try {
    const prices = await getJson(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd',
    );
    ['bitcoin', 'ethereum', 'tether'].forEach((id) => {
      const value = prices && prices[id] && Number(prices[id].usd);
      if (value > 0) out.crypto[id] = value;
    });
    if (!out.source) out.source = 'coingecko.com';
  } catch (err) {
    /* crypto prices are optional */
  }

  if (!out.usd && !Object.keys(out.crypto).length) {
    throw new Error('unreachable');
  }
  return out;
}

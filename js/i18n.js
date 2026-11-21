/*
 * Language state for the whole app.
 *
 * Persian is the default (the app is built for Iranian households), English is a
 * full alternative. Instead of a translation-key table every string is written
 * where it is used as L('متن فارسی', 'English text'), so no key can go missing
 * and the two languages always sit next to each other.
 */

let lang = 'fa';

export function getLang() {
  return lang;
}

export function isRTL() {
  return lang !== 'en';
}

export function setLang(next) {
  lang = next === 'en' ? 'en' : 'fa';
  const root = document.documentElement;
  root.lang = lang === 'en' ? 'en' : 'fa';
  root.dir = isRTL() ? 'rtl' : 'ltr';
  root.dataset.lang = lang;
}

/* Pick the string for the current language. */
export function L(fa, en) {
  return lang === 'en' ? (en === undefined ? fa : en) : fa;
}

/* Join two language variants only when the second is meaningfully different. */
export function L2(fa, en) {
  return L(fa, en);
}

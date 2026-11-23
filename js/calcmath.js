/*
 * Pure maths for the calculator screens: bank deposit interest, buy-now /
 * pay-later instalments, and a progressive income-tax estimate.
 *
 * Nothing here touches the DOM or storage, and every function returns the
 * intermediate numbers so the views can show its working rather than a
 * single magic figure.
 */

export const DEPOSIT_METHODS = ['simple', 'yearly', 'monthly', 'payout'];

/* Deposit interest.
 * Simple: no compounding. Yearly / monthly: interest compounds at that step.
 * Payout: interest is paid out each month and does not compound.
 * Withholding (if entered) is taken from the gross interest only.
 */
export function depositPlan({ principal, annualRatePct, months, method = 'simple', withholdingPct = 0 }) {
  const p = Math.max(0, Number(principal) || 0);
  const rate = Math.max(0, Number(annualRatePct) || 0);
  const n = Math.max(0, Math.round(Number(months) || 0));
  const tax = Math.min(100, Math.max(0, Number(withholdingPct) || 0));
  if (p <= 0 || n <= 0) {
    return { principal: p, annualRatePct: rate, months: n, method, withholdingPct: tax,
      grossInterest: 0, withholding: 0, netInterest: 0, maturity: p, effectiveAnnualPct: 0, monthlyPayout: 0 };
  }

  const years = n / 12;
  let maturity;
  let gross;
  switch (method) {
    case 'monthly':
      maturity = p * Math.pow(1 + rate / 100 / 12, n);
      break;
    case 'yearly':
      maturity = p * Math.pow(1 + rate / 100, years);
      break;
    case 'payout':
      maturity = p;
      break;
    default:
      maturity = p * (1 + (rate / 100) * years);
      break;
  }
  gross = Math.max(0, maturity - p) + (method === 'payout' ? p * (rate / 100) * years : 0);
  if (method === 'payout') maturity = p + gross;

  const withholding = gross * (tax / 100);
  const netInterest = gross - withholding;
  /* Principal plus net interest, whichever method was used: for payout the
   * interest leaves in monthly instalments, for the others it stays inside. */
  const maturityNet = p + netInterest;
  const effectiveAnnualPct = years > 0 && p > 0
    ? ((Math.pow(maturityNet / p, 1 / years) - 1) * 100)
    : 0;

  return {
    principal: Math.round(p),
    annualRatePct: rate,
    months: n,
    method,
    withholdingPct: tax,
    grossInterest: Math.round(gross),
    withholding: Math.round(withholding),
    netInterest: Math.round(netInterest),
    maturity: Math.round(maturityNet),
    monthlyPayout: Math.round(gross / n),
    effectiveAnnualPct: Math.round(effectiveAnnualPct * 100) / 100,
  };
}

/* Buy now, pay later: a total split into equal instalments.
 * feeType 'percent' = a percentage of the price, 'amount' = a fixed fee.
 * The rounding remainder goes on the last instalment so the parts add up.
 */
export function bnplPlan({ price, downPayment = 0, months, feeType = 'percent', feeValue = 0 }) {
  const p = Math.max(0, Number(price) || 0);
  const down = Math.min(p, Math.max(0, Number(downPayment) || 0));
  const n = Math.min(36, Math.max(1, Math.round(Number(months) || 1)));
  const financed = p - down;
  const fee = feeType === 'percent'
    ? financed * (Math.max(0, Number(feeValue) || 0) / 100)
    : Math.max(0, Number(feeValue) || 0);
  const total = financed + fee;
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  const instalments = Array.from({ length: n }, (_, i) => (i === n - 1 ? base + remainder : base));

  let first = instalments[0];
  let last = instalments[n - 1];
  return {
    price: Math.round(p),
    downPayment: Math.round(down),
    financed: Math.round(financed),
    feeType,
    feeValue: Number(feeValue) || 0,
    fee: Math.round(fee),
    total: Math.round(total),
    months: n,
    instalments: instalments.map((v) => Math.round(v)),
    perMonth: Math.round(total / n),
    firstInstalment: Math.round(first),
    lastInstalment: Math.round(last),
    effectiveAnnualPct: equivalentAnnualRate(financed, instalments, n),
    overPaymentPct: financed > 0 ? Math.round((fee / financed) * 1000) / 10 : 0,
  };
}

/* Annual rate implied by equal instalments, found by bisection.
 * Returns 0 when the instalments add up to the amount financed. */
export function equivalentAnnualRate(financed, instalments, months) {
  const p = Number(financed) || 0;
  const n = Number(months) || 0;
  if (p <= 0 || n <= 0 || !instalments.length) return 0;
  const total = instalments.reduce((acc, value) => acc + (Number(value) || 0), 0);
  if (total <= p) return 0;
  const pv = (monthlyRate) => {
    if (monthlyRate === 0) return instalments.reduce((acc, v) => acc + v, 0);
    return instalments.reduce((acc, value, index) => acc + value / Math.pow(1 + monthlyRate, index + 1), 0);
  };
  let low = 0.0000001;
  let high = 1.5;
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    if (pv(mid) > p) low = mid;
    else high = mid;
  }
  return Math.round(((Math.pow(1 + (low + high) / 2, 12) - 1) * 100) * 10) / 10;
}

/* Sample progressive brackets. Rates and limits differ every year and are set
 * by the tax administration — these are placeholders to edit, not the law. */
export function defaultTaxBrackets() {
  return [
    { upTo: 200000000, rate: 0 },
    { upTo: 400000000, rate: 0.1 },
    { upTo: 800000000, rate: 0.15 },
    { upTo: 1200000000, rate: 0.2 },
    { upTo: null, rate: 0.3 },
  ];
}

/* Progressive tax: each slice of the taxable income is taxed at its own rate.
 * A null upTo means "the rest". Brackets are sorted by limit. */
export function taxFromBrackets(taxableIncome, brackets) {
  const income = Math.max(0, Number(taxableIncome) || 0);
  const list = (brackets || [])
    .filter((b) => b && (b.upTo === null || b.upTo === undefined || Number(b.upTo) > 0))
    .map((b) => ({ upTo: b.upTo === null || b.upTo === undefined ? null : Number(b.upTo), rate: Math.max(0, Number(b.rate) || 0) }))
    .sort((a, b) => {
      if (a.upTo === null) return 1;
      if (b.upTo === null) return -1;
      return a.upTo - b.upTo;
    });

  let lower = 0;
  let tax = 0;
  const slices = [];
  for (const bracket of list) {
    if (income <= lower) break;
    const top = bracket.upTo === null ? income : Math.min(bracket.upTo, income);
    const slice = Math.max(0, top - lower);
    const amount = slice * bracket.rate;
    tax += amount;
    slices.push({ from: lower, to: top, rate: bracket.rate, amount });
    if (bracket.upTo === null || income <= bracket.upTo) {
      lower = top;
      break;
    }
    lower = bracket.upTo;
  }
  return {
    taxable: Math.round(income),
    tax: Math.round(tax),
    effectivePct: income > 0 ? Math.round((tax / income) * 1000) / 10 : 0,
    slices,
  };
}

export function taxReturn({ income, deduction = 0, paid = 0, brackets }) {
  const gross = Math.max(0, Number(income) || 0);
  const deductible = Math.max(0, Number(deduction) || 0);
  const taxable = Math.max(0, gross - deductible);
  const result = taxFromBrackets(taxable, brackets);
  const alreadyPaid = Math.max(0, Number(paid) || 0);
  return {
    income: Math.round(gross),
    deduction: Math.round(deductible),
    taxable,
    tax: result.tax,
    paid: Math.round(alreadyPaid),
    balance: Math.round(result.tax - alreadyPaid),
    effectivePct: result.effectivePct,
    slices: result.slices,
  };
}

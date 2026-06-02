// Indian-format currency + helpers used across the app.
export function formatINR(amount, { paise = false } = {}) {
  const n = Number(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: paise ? 2 : 0,
  }).format(n);
}

export function formatNumberINR(amount) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(amount) || 0);
}

export function formatPct(n, digits = 2) {
  const v = Number(n) || 0;
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

// Stable color per company index for charts / accents.
export const COMPANY_COLORS = ['#3B82F6', '#F59E0B', '#22D3A5', '#A78BFA', '#F87171', '#38BDF8'];
export const companyColor = (i) => COMPANY_COLORS[i % COMPANY_COLORS.length];

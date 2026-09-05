// Decimal values arrive from the API as strings so no precision is lost.
// These helpers format them for display without ever doing arithmetic on them.

const MONEY = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function money(value: string | number): string {
  const asNumber = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(asNumber) ? MONEY.format(asNumber) : String(value);
}

/** Percentages keep their two decimals: 12.00 stays 12.00%, not 12%. */
export function percent(value: string | number): string {
  const asNumber = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(asNumber) ? `${asNumber.toFixed(2)}%` : String(value);
}

/** Points over a ceiling, as the OVER badge shows them. */
export function points(value: string | number): string {
  const asNumber = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(asNumber) ? `${Number(asNumber.toFixed(2))}` : String(value);
}

/** Calendar dates — due dates, billing periods — without a time of day. */
export function date(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

export function dateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

/** Turns SCREAMING_SNAKE enum values into readable labels. */
export function humanise(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

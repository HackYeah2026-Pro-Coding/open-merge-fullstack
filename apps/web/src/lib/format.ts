import type { TokenAmount } from '@escrow/shared';

const GROUPED = new Intl.NumberFormat('en-US');

/**
 * Formats integer base units without ever going through a float.
 * Keeps at least `minFraction` decimals and drops trailing zeros beyond that.
 */
export function formatUnits(baseUnits: string | bigint, decimals: number, minFraction = 2): string {
  const value = typeof baseUnits === 'bigint' ? baseUnits : BigInt(baseUnits);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);

  const whole = GROUPED.format(abs / scale);
  let fraction = (abs % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  if (fraction.length < minFraction) fraction = fraction.padEnd(Math.min(minFraction, decimals), '0');

  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

export function formatAmount(amount: TokenAmount, options: { symbol?: boolean } = {}): string {
  const number = formatUnits(amount.amount, amount.decimals);
  return options.symbol === false ? number : `${number} ${amount.symbol}`;
}

export type ParsedAmount = { ok: true; baseUnits: string } | { ok: false; error: string };

/** Parses what a person typed ("1,250.5") into integer base units. */
export function parseAmount(input: string, decimals: number): ParsedAmount {
  const cleaned = input.trim().replace(/,/g, '');
  if (cleaned === '') return { ok: false, error: 'Enter a reward amount.' };
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '.') {
    return { ok: false, error: 'Use digits and an optional decimal point.' };
  }

  const [whole = '', fraction = ''] = cleaned.split('.');
  if (fraction.length > decimals) {
    return { ok: false, error: `At most ${decimals} decimal places.` };
  }

  const baseUnits = BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (baseUnits <= 0n) return { ok: false, error: 'The reward must be greater than zero.' };

  return { ok: true, baseUnits: baseUnits.toString() };
}

export function sumAmounts(amounts: TokenAmount[], fallback: Omit<TokenAmount, 'amount'>): TokenAmount {
  const total = amounts.reduce((acc, a) => acc + BigInt(a.amount), 0n);
  const first = amounts[0];
  return {
    amount: total.toString(),
    symbol: first?.symbol ?? fallback.symbol,
    decimals: first?.decimals ?? fallback.decimals,
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const EXACT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "just now", "5m ago", "2h ago", "3d ago", then a calendar date. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diff = now.getTime() - date.getTime();

  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return date.getFullYear() === now.getFullYear() ? MONTH_DAY.format(date) : MONTH_DAY_YEAR.format(date);
}

export function formatExact(iso: string): string {
  return EXACT.format(new Date(iso));
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** "7xKXtg…9fQa": enough to recognise an address or signature at a glance. */
export function shortKey(key: string, edge = 4): string {
  return key.length <= edge * 2 + 1 ? key : `${key.slice(0, edge)}…${key.slice(-edge)}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

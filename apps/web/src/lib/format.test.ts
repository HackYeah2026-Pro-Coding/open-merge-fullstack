import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  formatRelative,
  formatUnits,
  parseAmount,
  shortKey,
  shortSha,
  sumAmounts,
} from './format';

describe('formatUnits', () => {
  it('formats whole amounts with two decimals and grouping', () => {
    expect(formatUnits('1250000000', 6)).toBe('1,250.00');
  });

  it('keeps significant decimals beyond two and trims trailing zeros', () => {
    expect(formatUnits('1500', 6)).toBe('0.0015');
    expect(formatUnits('12345670', 6)).toBe('12.34567');
  });

  it('handles values beyond Number.MAX_SAFE_INTEGER exactly', () => {
    expect(formatUnits(9_007_199_254_740_993_000_001n, 6)).toBe('9,007,199,254,740,993.000001');
  });

  it('handles zero-decimal tokens', () => {
    expect(formatUnits('42', 0)).toBe('42');
  });

  it('formats negative values', () => {
    expect(formatUnits(-2_500_000n, 6)).toBe('-2.50');
  });
});

describe('formatAmount', () => {
  const amount = { amount: '500000000', symbol: 'USDC', decimals: 6 };

  it('appends the symbol by default', () => {
    expect(formatAmount(amount)).toBe('500.00 USDC');
  });

  it('can omit the symbol', () => {
    expect(formatAmount(amount, { symbol: false })).toBe('500.00');
  });
});

describe('parseAmount', () => {
  it('parses whole and fractional input into base units', () => {
    expect(parseAmount('1,250.5', 6)).toEqual({ ok: true, baseUnits: '1250500000' });
    expect(parseAmount('.25', 6)).toEqual({ ok: true, baseUnits: '250000' });
    expect(parseAmount('300', 6)).toEqual({ ok: true, baseUnits: '300000000' });
  });

  it('rejects empty, zero and malformed input', () => {
    expect(parseAmount('', 6).ok).toBe(false);
    expect(parseAmount('0', 6).ok).toBe(false);
    expect(parseAmount('0.000', 6).ok).toBe(false);
    expect(parseAmount('12a', 6).ok).toBe(false);
    expect(parseAmount('1.2.3', 6).ok).toBe(false);
    expect(parseAmount('-5', 6).ok).toBe(false);
    expect(parseAmount('.', 6).ok).toBe(false);
  });

  it('rejects more decimals than the token supports', () => {
    expect(parseAmount('1.1234567', 6)).toEqual({ ok: false, error: 'At most 6 decimal places.' });
  });
});

describe('sumAmounts', () => {
  it('adds base units exactly', () => {
    const a = { amount: '100000001', symbol: 'USDC', decimals: 6 };
    const b = { amount: '200000002', symbol: 'USDC', decimals: 6 };
    expect(sumAmounts([a, b], { symbol: 'USDC', decimals: 6 }).amount).toBe('300000003');
  });

  it('returns zero in the fallback token for an empty list', () => {
    expect(sumAmounts([], { symbol: 'USDC', decimals: 6 })).toEqual({ amount: '0', symbol: 'USDC', decimals: 6 });
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-10-03T12:00:00Z');

  it('uses short relative units within a week', () => {
    expect(formatRelative('2026-10-03T11:59:30Z', now)).toBe('just now');
    expect(formatRelative('2026-10-03T11:55:00Z', now)).toBe('5m ago');
    expect(formatRelative('2026-10-03T10:00:00Z', now)).toBe('2h ago');
    expect(formatRelative('2026-09-30T12:00:00Z', now)).toBe('3d ago');
  });

  it('falls back to a calendar date after a week', () => {
    expect(formatRelative('2026-09-12T12:00:00Z', now)).toBe('Sep 12');
    expect(formatRelative('2025-09-12T12:00:00Z', now)).toBe('Sep 12, 2025');
  });
});

describe('short identifiers', () => {
  it('shortens commit hashes to seven characters', () => {
    expect(shortSha('a3f9c1e7b2d4')).toBe('a3f9c1e');
  });

  it('keeps both ends of a key', () => {
    expect(shortKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')).toBe('7xKX…gAsU');
    expect(shortKey('short')).toBe('short');
  });
});

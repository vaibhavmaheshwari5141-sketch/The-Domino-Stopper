import { expect, it } from 'vitest';
import * as f from '../shared/format.ts';

it('formats numbers, rates, minutes, multipliers and dates', () => {
  expect(f.formatCompact(1641071)).toBe('1.64M');
  expect(f.formatPercent(0.259)).toBe('25.9%');
  expect(f.formatMinutes(63)).toBe('63 min');
  expect(f.formatMultiplier(4.04)).toBe('4.0x');
  expect(f.formatNumber(1641071)).toBe('1,641,071');
  expect(f.formatDate('2026-01-15')).toBe('15 Jan 2026');
  expect(f.formatDateTime('2026-10-25T10:01:00')).toBe('25 Oct 2026, 10:01 UTC');
  expect(f.formatMonth('2026-01')).toBe('Jan 2026');
  expect([f.formatCompact(null), f.formatPercent(NaN), f.formatDate('junk')]).toEqual(['–', '–', '–']);
});

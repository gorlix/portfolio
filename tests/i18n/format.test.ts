import { describe, expect, it } from 'vitest';
import { formatDate } from '../../src/lib/format';

describe('formatDate', () => {
  it('formatta anno-mese nella lingua data, senza scarti di fuso', () => {
    expect(formatDate('2024-03', 'en')).toBe('Mar 2024');
    expect(formatDate('2024-03', 'it')).toMatch(/^mar(\.)? 2024$/);
    expect(formatDate('2024-01', 'en')).toBe('Jan 2024');
  });

  it('con il giorno lo include', () => {
    expect(formatDate('2024-03-05', 'en')).toBe('Mar 5, 2024');
  });
});

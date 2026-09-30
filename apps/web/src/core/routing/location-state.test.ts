import { describe, expect, it } from 'vitest';
import { readLocationState } from './location-state';

describe('readLocationState', () => {
  it('returns the field, whatever its type: callers validate it', () => {
    expect(readLocationState({ from: '/invoices' }, 'from')).toBe('/invoices');
    expect(readLocationState({ from: 42 }, 'from')).toBe(42);
  });

  it.each([undefined, null, 'from', 42, {}, { to: '/invoices' }])(
    'returns undefined when %j has no such field',
    (locationState) => {
      expect(readLocationState(locationState, 'from')).toBeUndefined();
    },
  );

  it('ignores inherited properties', () => {
    expect(readLocationState(Object.create({ from: '/invoices' }), 'from')).toBeUndefined();
  });
});

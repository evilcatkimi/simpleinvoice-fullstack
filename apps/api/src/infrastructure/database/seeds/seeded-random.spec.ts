import { SeededRandom } from './seeded-random';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function draws(seed: number, count = 50): number[] {
  const random = new SeededRandom(seed);
  return Array.from({ length: count }, () => random.int(0, 1_000_000));
}

describe('SeededRandom', () => {
  it('replays exactly the same sequence for the same seed', () => {
    expect(draws(101)).toEqual(draws(101));
  });

  it('produces a different sequence for another seed', () => {
    expect(draws(101)).not.toEqual(draws(102));
  });

  it('draws integers within inclusive bounds and reaches both ends', () => {
    const random = new SeededRandom(7);
    const values = Array.from({ length: 2_000 }, () => random.int(1, 6));

    expect(values.every(Number.isInteger)).toBe(true);
    expect(Math.min(...values)).toBe(1);
    expect(Math.max(...values)).toBe(6);
  });

  it('treats chance(0) as never and chance(1) as always', () => {
    const random = new SeededRandom(7);

    for (let i = 0; i < 100; i += 1) {
      expect(random.chance(0)).toBe(false);
      expect(random.chance(1)).toBe(true);
    }
  });

  it('only picks from the given items', () => {
    const random = new SeededRandom(7);
    const items = ['Draft', 'Pending', 'Paid'] as const;

    const picked = new Set(Array.from({ length: 100 }, () => random.pick(items)));

    expect(picked).toEqual(new Set(items));
  });

  it('builds reproducible RFC 4122 version-4 UUIDs', () => {
    const first = new SeededRandom(5).uuid();

    expect(first).toMatch(UUID_V4_PATTERN);
    expect(new SeededRandom(5).uuid()).toBe(first);
    expect(new SeededRandom(6).uuid()).not.toBe(first);
  });
});

import { BcryptPasswordHasher } from './bcrypt-password-hasher';

describe('BcryptPasswordHasher', () => {
  // bcrypt's minimum cost: the behaviour under test does not depend on the work factor.
  const hasher = new BcryptPasswordHasher(4);

  it('hashes with bcrypt at the configured cost and verifies the original password only', async () => {
    const hash = await hasher.hash('Reviewer@2026');

    expect(hash).toMatch(/^\$2[aby]\$04\$/);
    await expect(hasher.verify('Reviewer@2026', hash)).resolves.toBe(true);
    await expect(hasher.verify('reviewer@2026', hash)).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    const [first, second] = await Promise.all([hasher.hash('same'), hasher.hash('same')]);

    expect(first).not.toBe(second);
  });
});

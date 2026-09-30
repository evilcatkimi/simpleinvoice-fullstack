import { describe, expect, it } from 'vitest';
import { mailtoHref } from './mailto';

describe('mailtoHref', () => {
  it('keeps an ordinary address readable', () => {
    expect(mailtoHref('paul@101digital.io')).toBe('mailto:paul@101digital.io');
  });

  it.each([
    // Accepted by the API's email validator: would otherwise add a Bcc and a subject.
    'billing?bcc=spy%40evil.example&subject=New%20bank%20details&x=@example.com',
    '"x?bcc=spy@evil.example"@example.com',
    'billing#fragment@example.com',
    'billing\r\nBcc: spy@evil.example@example.com',
  ])('addresses the message to %j and nothing else', (address) => {
    const href = mailtoHref(address);
    const url = new URL(href);

    expect(url.protocol).toBe('mailto:');
    expect(decodeURIComponent(url.pathname)).toBe(address);
    expect(url.search).toBe('');
    expect([...url.searchParams]).toEqual([]);
    expect(url.hash).toBe('');
    expect(href).not.toMatch(/[\r\n]/);
  });

  it('never turns a percent-encoded "@" from the input into a real one', () => {
    expect(mailtoHref('spy%40evil.example@example.com')).toBe(
      'mailto:spy%2540evil.example@example.com',
    );
  });
});

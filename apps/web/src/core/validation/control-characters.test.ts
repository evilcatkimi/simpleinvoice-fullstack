import { describe, expect, it } from 'vitest';
import {
  containsControlCharacter,
  replaceControlCharacters,
  withoutControlCharacters,
} from './control-characters';

describe('containsControlCharacter', () => {
  it.each(['\u0000', '\u0007', '\u001b[31m', '\u007f', 'a\tb', 'a\nb', 'a\rb'])(
    'finds a control character in %j',
    (value) => {
      expect(containsControlCharacter(value)).toBe(true);
    },
  );

  it.each(['', 'Jane Doe', 'Đặng Thị Hồng', 'O’Connor & Sons', '€ 100'])(
    'accepts ordinary text %j',
    (value) => {
      expect(containsControlCharacter(value)).toBe(false);
    },
  );

  it('lets multi-line fields keep tabs and line breaks, but nothing else', () => {
    expect(containsControlCharacter('12 George St\r\nSydney\tNSW', true)).toBe(false);
    expect(containsControlCharacter('line\u0000break', true)).toBe(true);
    expect(containsControlCharacter('bell\u0007', true)).toBe(true);
  });
});

describe('replaceControlCharacters', () => {
  it('turns every control character into a space', () => {
    expect(replaceControlCharacters('paul\tsmith\u0000\n')).toBe('paul smith  ');
    expect(replaceControlCharacters('INV-0001')).toBe('INV-0001');
  });
});

describe('withoutControlCharacters', () => {
  it('builds single-line and multi-line predicates', () => {
    expect(withoutControlCharacters()('a\tb')).toBe(false);
    expect(withoutControlCharacters({ multiline: true })('a\tb')).toBe(true);
  });
});

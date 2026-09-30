import { BadRequestException, UnsupportedMediaTypeException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { exceedsJsonDepth, rejectDeeplyNestedJson, requireJsonBody } from './json-body';

/** A request whose `is()` answers like Express's (type-is) for the given Content-Type. */
function requestWith(headers: Record<string, string>, body?: unknown): Request {
  const contentType = headers['content-type'] ?? '';
  return {
    headers,
    body,
    is: (type: string) => contentType.split(';')[0].trim() === type && type,
  } as unknown as Request;
}

function run(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  request: Request,
): unknown[] {
  const next = jest.fn();
  middleware(request, {} as Response, next);
  expect(next).toHaveBeenCalledTimes(1);
  return next.mock.calls[0] as unknown[];
}

describe('requireJsonBody', () => {
  it.each([
    ['application/json', { 'content-type': 'application/json', 'content-length': '2' }],
    [
      'JSON with a charset',
      { 'content-type': 'application/json; charset=utf-8', 'content-length': '2' },
    ],
    ['no body (GET)', {}],
    ['an empty POST, as fetch sends a bodiless logout', { 'content-length': '0' }],
  ])('lets %s through', (_case, headers) => {
    expect(run(requireJsonBody, requestWith(headers))).toEqual([]);
  });

  it.each([
    ['an HTML form', 'application/x-www-form-urlencoded'],
    ['a text/plain form', 'text/plain'],
    ['a multipart upload', 'multipart/form-data; boundary=x'],
  ])(
    'refuses %s with 415: cross-site forms can send it without a CORS preflight',
    (_case, type) => {
      const [error] = run(
        requireJsonBody,
        requestWith({ 'content-type': type, 'content-length': '27' }),
      );

      expect(error).toBeInstanceOf(UnsupportedMediaTypeException);
      expect((error as UnsupportedMediaTypeException).message).toBe(
        'Content-Type must be application/json',
      );
    },
  );

  it('refuses a body without any Content-Type, chunked or not', () => {
    const bodies: Record<string, string>[] = [
      { 'content-length': '5' },
      { 'transfer-encoding': 'chunked' },
    ];
    for (const headers of bodies) {
      expect(run(requireJsonBody, requestWith(headers))[0]).toBeInstanceOf(
        UnsupportedMediaTypeException,
      );
    }
  });
});

describe('exceedsJsonDepth', () => {
  /** `depth` nested arrays: [[[…]]] */
  const nestedArrays = (depth: number): unknown =>
    Array.from({ length: depth - 1 }).reduce<unknown>((inner) => [inner], []);

  it('measures containers only: scalars and the invoice body are shallow', () => {
    expect(exceedsJsonDepth('text', 1)).toBe(false);
    expect(exceedsJsonDepth(undefined, 1)).toBe(false);
    expect(
      exceedsJsonDepth(
        { customer: { fullname: 'Jane' }, items: [{ name: 'Consulting', quantity: 1 }] },
        3,
      ),
    ).toBe(false);
  });

  it('flags the first level beyond the limit', () => {
    expect(exceedsJsonDepth(nestedArrays(8), 8)).toBe(false);
    expect(exceedsJsonDepth(nestedArrays(9), 8)).toBe(true);
    expect(exceedsJsonDepth({ a: { b: { c: {} } } }, 3)).toBe(true);
  });

  it('checks 40,000 levels without overflowing its own stack', () => {
    expect(exceedsJsonDepth(nestedArrays(40_000), 8)).toBe(true);
  });
});

describe('rejectDeeplyNestedJson', () => {
  it('answers 400 for a body nested deeper than 8 levels', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } } };

    const [error] = run(rejectDeeplyNestedJson, requestWith({}, deep));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe('Request body is nested too deeply');
  });

  it('lets ordinary bodies and bodiless requests through', () => {
    expect(run(rejectDeeplyNestedJson, requestWith({}, { items: [{ name: 'x' }] }))).toEqual([]);
    expect(run(rejectDeeplyNestedJson, requestWith({}))).toEqual([]);
  });
});

import { expect } from 'vitest';
import { configureAxe } from 'vitest-axe';

/**
 * axe-core configured for jsdom: colour contrast needs real layout and fonts, so that rule is left
 * to the browser (Playwright) suite. Every other WCAG rule runs.
 */
const axe = configureAxe({ rules: { 'color-contrast': { enabled: false } } });

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

/** Fails with a readable list of the serious and critical violations found inside `container`. */
export async function expectNoSeriousA11yViolations(container: Element): Promise<void> {
  const { violations } = await axe(container);
  const blocking = violations
    .filter((violation) => BLOCKING_IMPACTS.has(violation.impact ?? ''))
    .map(
      (violation) =>
        `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help} → ${violation.nodes
          .map((node) => node.html)
          .join(' | ')}`,
    );
  expect(blocking).toEqual([]);
}

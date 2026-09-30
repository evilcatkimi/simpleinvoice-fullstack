import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** WCAG 2.0, 2.1 and 2.2 success criteria at levels A and AA (colour contrast included). */
const WCAG_A_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

type Violation = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'][number];

function summarize({ id, impact, help, nodes }: Violation): string {
  const elements = nodes.map((node) => node.target.join(' ')).join(', ');
  return `${id} (${impact ?? 'unknown impact'}): ${help} → ${elements}`;
}

/**
 * Runs axe on the page as rendered right now; any serious or critical violation fails the test.
 * Only a real browser computes colour contrast, which the SPA's jsdom unit tests cannot check.
 */
export async function expectAccessible(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA).analyze();
  const blocking = violations.filter(({ impact }) => impact === 'serious' || impact === 'critical');
  expect(blocking.map(summarize), 'serious or critical accessibility violations').toEqual([]);
}

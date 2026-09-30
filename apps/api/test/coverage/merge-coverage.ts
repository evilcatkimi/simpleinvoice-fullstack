import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCoverageMap, type CoverageMapData } from 'istanbul-lib-coverage';
import { createContext } from 'istanbul-lib-report';
import { create, type ReportType } from 'istanbul-reports';

/**
 * `npm run test:cov:all`: merges the unit and e2e coverage into coverage/merged. The suites are complementary — the
 * e2e suite exercises controllers, modules and wiring, the unit suite the domain edge cases — so neither report alone
 * says what is untested. The istanbul libraries ship with Jest.
 */
const API_ROOT = resolve(__dirname, '../..');
const REPORTS = ['coverage/coverage-final.json', 'coverage/e2e/coverage-final.json'];
const OUTPUTS: ReportType[] = ['text-summary', 'json-summary', 'html'];

const coverageMap = createCoverageMap({});
for (const report of REPORTS) {
  const path = resolve(API_ROOT, report);
  if (!existsSync(path)) {
    throw new Error(`${report} not found: run the unit and e2e suites with --coverage first.`);
  }
  coverageMap.merge(JSON.parse(readFileSync(path, 'utf8')) as CoverageMapData);
}

const context = createContext({ dir: resolve(API_ROOT, 'coverage/merged'), coverageMap });
for (const output of OUTPUTS) {
  create(output).execute(context);
}

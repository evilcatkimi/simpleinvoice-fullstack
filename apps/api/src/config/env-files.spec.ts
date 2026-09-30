import fs from 'node:fs';
import { ENV_FILE_PATHS, loadEnvFiles, shouldLoadEnvFiles } from './env-files';

describe('env files', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let loadEnvFile: jest.SpyInstance;

  beforeEach(() => {
    loadEnvFile = jest.spyOn(process, 'loadEnvFile').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  it('never reads .env files in production: configuration comes from the real environment only', () => {
    process.env.NODE_ENV = 'production';
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);

    loadEnvFiles();

    expect(shouldLoadEnvFiles()).toBe(false);
    expect(loadEnvFile).not.toHaveBeenCalled();
  });

  it.each(['development', 'test'])('reads them in %s', (nodeEnv) => {
    process.env.NODE_ENV = nodeEnv;

    expect(shouldLoadEnvFiles()).toBe(true);
  });

  it('loads apps/api/.env before the repository-root .env (the first file wins)', () => {
    process.env.NODE_ENV = 'development';
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);

    loadEnvFiles();

    expect(ENV_FILE_PATHS[0]).toMatch(/apps[\\/]api[\\/]\.env$/);
    expect(loadEnvFile.mock.calls).toEqual([[ENV_FILE_PATHS[0]], [ENV_FILE_PATHS[1]]]);
  });

  it('skips files that do not exist', () => {
    process.env.NODE_ENV = 'development';
    jest.spyOn(fs, 'existsSync').mockImplementation((path) => path === ENV_FILE_PATHS[0]);

    loadEnvFiles();

    expect(loadEnvFile.mock.calls).toEqual([[ENV_FILE_PATHS[0]]]);
  });
});

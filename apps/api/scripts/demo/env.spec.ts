import { loadDemoEnv, requireToken } from './env';
import { UsageError } from './errors';

describe('loadDemoEnv', () => {
  it('falls back to the default organization and a local API', () => {
    const env = loadDemoEnv({});
    expect(env.org).toBe('HackYeah2026-Pro-Coding');
    expect(env.apiUrl).toBe('http://localhost:3000');
    expect(env.tokens).toEqual({ bot: undefined, admin: undefined, dev: undefined });
  });

  it('prefers DEMO_API_URL over API_URL and drops a trailing slash', () => {
    expect(loadDemoEnv({ API_URL: 'https://api.example.com/', DEMO_API_URL: 'https://demo.example.com//' }).apiUrl).toBe(
      'https://demo.example.com',
    );
    expect(loadDemoEnv({ API_URL: 'https://api.example.com/' }).apiUrl).toBe('https://api.example.com');
  });

  it('treats empty values in .env as not set', () => {
    const env = loadDemoEnv({ DEMO_ADMIN_TOKEN: '', DEMO_DEV_TOKEN: '  ', DEMO_API_URL: '', GITHUB_TOKEN: 'bot' });
    expect(env.tokens).toEqual({ bot: 'bot', admin: undefined, dev: undefined });
    expect(env.apiUrl).toBe('http://localhost:3000');
  });
});

describe('requireToken', () => {
  it('returns the token of that role', () => {
    expect(requireToken(loadDemoEnv({ DEMO_DEV_TOKEN: 'dev' }), 'dev')).toBe('dev');
  });

  it('names the missing variable', () => {
    expect(() => requireToken(loadDemoEnv({}), 'admin')).toThrow(UsageError);
    expect(() => requireToken(loadDemoEnv({}), 'admin')).toThrow('DEMO_ADMIN_TOKEN');
    expect(() => requireToken(loadDemoEnv({}), 'bot')).toThrow('GITHUB_TOKEN');
  });
});

import { describe, expect, it } from 'vitest';
import { InvalidEnvironmentError, loadConfig } from './env.schema.js';

const validEnv = {
  NODE_ENV: 'development',
  WEB_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://user:secret-password@localhost:5432/db',
  REDIS_URL: 'redis://:secret@localhost:6379',
  SESSION_SECRET: 'x'.repeat(32),
  SMTP_URL: 'smtp://localhost:1025',
};

describe('loadConfig', () => {
  it('accepts a valid environment and applies defaults', () => {
    const config = loadConfig(validEnv);
    expect(config.API_PORT).toBe(4000);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.DATABASE_POOL_MAX).toBe(10);
  });

  it('fails fast and names every missing required variable', () => {
    expect(() => loadConfig({})).toThrow(InvalidEnvironmentError);
    try {
      loadConfig({});
    } catch (error) {
      const message = (error as Error).message;
      for (const name of ['WEB_URL', 'DATABASE_URL', 'REDIS_URL', 'SESSION_SECRET']) {
        expect(message).toContain(`${name} is required`);
      }
    }
  });

  it('never echoes secret values in validation errors', () => {
    const badEnv = {
      ...validEnv,
      DATABASE_URL: 'mysql://user:super-secret-value@host/db',
      SESSION_SECRET: 'short-secret',
    };
    expect(() => loadConfig(badEnv)).toThrow(InvalidEnvironmentError);
    try {
      loadConfig(badEnv);
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain('super-secret-value');
      expect(message).not.toContain('short-secret');
      expect(message).toContain('SESSION_SECRET must be at least 32 characters');
    }
  });

  it('requires https for the web origin in production', () => {
    expect(() => loadConfig({ ...validEnv, NODE_ENV: 'production' })).toThrow(
      /WEB_URL must use https/,
    );
  });

  it('rejects a port outside the valid range', () => {
    expect(() => loadConfig({ ...validEnv, API_PORT: '70000' })).toThrow(/API_PORT/);
  });
});

describe('loadConfig identity and email settings', () => {
  it('requires SMTP_URL when sending email over SMTP', () => {
    const withoutSmtp: Record<string, string> = { ...validEnv };
    delete withoutSmtp.SMTP_URL;
    expect(() => loadConfig(withoutSmtp)).toThrow(/SMTP_URL is required when EMAIL_TRANSPORT=smtp/);
    expect(() => loadConfig({ ...withoutSmtp, EMAIL_TRANSPORT: 'memory' })).not.toThrow();
  });

  it('refuses test-only transports in production', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        NODE_ENV: 'production',
        WEB_URL: 'https://app.example',
        JOBS_MODE: 'inline',
      }),
    ).toThrow(/tests only/);
  });

  it('parses boolean flags', () => {
    expect(loadConfig({ ...validEnv, RATE_LIMIT_ENABLED: 'false' }).RATE_LIMIT_ENABLED).toBe(false);
    expect(loadConfig(validEnv).RATE_LIMIT_ENABLED).toBe(true);
  });
});

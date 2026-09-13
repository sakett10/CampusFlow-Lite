import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isServerlessEnvironment, getPoolConfig } from './db.js';

describe('Serverless Database Pool Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('detects serverless environments correctly', () => {
    delete process.env.VERCEL;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    delete process.env.LAMBDA_TASK_ROOT;
    expect(isServerlessEnvironment()).toBe(false);

    process.env.VERCEL = '1';
    expect(isServerlessEnvironment()).toBe(true);

    delete process.env.VERCEL;
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'my-lambda';
    expect(isServerlessEnvironment()).toBe(true);

    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    process.env.LAMBDA_TASK_ROOT = '/var/task';
    expect(isServerlessEnvironment()).toBe(true);
  });

  it('caps max connections to 2 in serverless environments', () => {
    process.env.VERCEL = '1';
    const config = getPoolConfig('postgres://test:5432/db');
    expect(config.max).toBe(2);
    expect(config.connectionTimeoutMillis).toBe(5000);
    expect(config.idleTimeoutMillis).toBe(10000);
  });

  it('preserves max connections of 10 in standard server / development environments', () => {
    delete process.env.VERCEL;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    delete process.env.LAMBDA_TASK_ROOT;

    const config = getPoolConfig('postgres://test:5432/db');
    expect(config.max).toBe(10);
    expect(config.connectionTimeoutMillis).toBe(5000);
    expect(config.idleTimeoutMillis).toBe(10000);
  });
});

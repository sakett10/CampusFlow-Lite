import 'dotenv/config';
import pg from 'pg';
import { isServerlessEnvironment } from './config.js';

export { isServerlessEnvironment };

const connectionString = process.env.DATABASE_URL;

export function getPoolConfig(connStr?: string): pg.PoolConfig {
  const isServerless = isServerlessEnvironment();

  return {
    connectionString: connStr || connectionString,
    // In Vercel / AWS Lambda serverless runtimes, each container instance runs a separate Node process.
    // Cap at 2 connections per runtime instance to reduce burst exhaustion against PostgreSQL.
    // In local development or long-lived servers, use standard pool size of 10.
    max: isServerless ? 2 : 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  };
}

if (!connectionString && process.env.NODE_ENV !== 'test') {
  throw new Error('DATABASE_URL is not set.');
}

export const pool = new pg.Pool(getPoolConfig());
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export interface CreatePrismaClientOptions {
  connectionString: string;
  /** Maximum connections in this process's pool. Size it to the managed database's limits. */
  maxConnections?: number;
}

/**
 * Creates a Prisma client backed by the `pg` driver adapter.
 * Create one per process and reuse it; each instance owns a connection pool.
 */
export function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
  });
  return new PrismaClient({ adapter });
}

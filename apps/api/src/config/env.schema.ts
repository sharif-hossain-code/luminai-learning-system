import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug'] as const;

const postgresUrl = z.url({
  protocol: /^postgres(ql)?$/,
  error: 'must be a postgresql:// connection URL',
});
const redisUrl = z.url({ protocol: /^rediss?$/, error: 'must be a redis:// or rediss:// URL' });

/**
 * Every environment variable the API reads, validated once at startup.
 * Add new variables here (and to .env.example) rather than reading process.env elsewhere.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    WEB_URL: z.url({
      protocol: /^https?$/,
      error: 'must be an http(s) origin, e.g. http://localhost:3000',
    }),
    DATABASE_URL: postgresUrl,
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    REDIS_URL: redisUrl,
    SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(1500),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.WEB_URL.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['WEB_URL'], message: 'must use https in production' });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export class InvalidEnvironmentError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}\n` +
        'Copy .env.example to .env and fill in the missing values.',
    );
    this.name = 'InvalidEnvironmentError';
  }
}

/**
 * Parses and validates environment variables. Error messages name the variable
 * and the rule it broke, but never echo the value, so secrets can't leak into logs.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const name = issue.path.join('.') || '(root)';
      const message =
        issue.code === 'invalid_type' && issue.input === undefined ? 'is required' : issue.message;
      return `${name} ${message}`;
    });
    throw new InvalidEnvironmentError(problems);
  }
  return Object.freeze(result.data);
}

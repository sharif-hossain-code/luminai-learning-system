import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug'] as const;

const postgresUrl = z.url({
  protocol: /^postgres(ql)?$/,
  error: 'must be a postgresql:// connection URL',
});
const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

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

    // --- Identity ---
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(10).max(240).default(60),
    /** Version of the terms/privacy notice new accounts accept. */
    TERMS_VERSION: z.string().min(1).max(32).default('2026-11-draft'),
    /** Which upstream proxies may set X-Forwarded-For: "loopback", a CIDR list, or "false". */
    TRUST_PROXY: z.string().default('loopback'),
    RATE_LIMIT_ENABLED: booleanString.default(true),

    // --- Email ---
    /** smtp: send through SMTP_URL. memory: keep in-process (tests only). */
    EMAIL_TRANSPORT: z.enum(['smtp', 'memory']).default('smtp'),
    SMTP_URL: z
      .url({ protocol: /^smtps?$/, error: 'must be an smtp:// or smtps:// URL' })
      .optional(),
    EMAIL_FROM: z.string().min(3).default('Luminai <no-reply@luminai.local>'),

    // --- Background jobs ---
    /** queue: hand work to the BullMQ worker. inline: run it in-process (tests only). */
    JOBS_MODE: z.enum(['queue', 'inline']).default('queue'),
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_TRANSPORT === 'smtp' && !env.SMTP_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_URL'],
        message: 'is required when EMAIL_TRANSPORT=smtp',
      });
    }
    if (
      env.NODE_ENV === 'production' &&
      (env.EMAIL_TRANSPORT === 'memory' || env.JOBS_MODE === 'inline')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_TRANSPORT'],
        message: 'memory email and inline jobs are for tests only',
      });
    }
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

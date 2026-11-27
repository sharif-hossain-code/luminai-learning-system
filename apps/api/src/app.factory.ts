import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { type LogLevel } from '@nestjs/common';
import { CSRF_HEADER } from '@luminai/contracts';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { REQUEST_ID_HEADER, resolveRequestId } from './common/request-id.js';
import { createValidationPipe } from './common/validation.js';
import type { AppConfig } from './config/env.schema.js';

export const API_PREFIX = 'api/v1';

function parseTrustProxy(value: string): boolean | string {
  if (value === 'false') return false;
  if (value === 'true') return true;
  return value;
}

const NEST_LOG_LEVELS: Record<AppConfig['LOG_LEVEL'], LogLevel[]> = {
  fatal: ['fatal'],
  error: ['fatal', 'error'],
  warn: ['fatal', 'error', 'warn'],
  info: ['fatal', 'error', 'warn', 'log'],
  debug: ['fatal', 'error', 'warn', 'log', 'debug'],
};

/** Builds a fully configured (but not yet listening) API application. */
export async function createApp(config: AppConfig): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    // Structured JSON request logs, each line carrying the request ID.
    logger: config.NODE_ENV === 'test' ? false : { level: config.LOG_LEVEL },
    genReqId: resolveRequestId,
    requestIdLogLabel: 'requestId',
    bodyLimit: 1024 * 1024,
    // Which proxies may set X-Forwarded-For (affects request.ip and rate limits).
    trustProxy: parseTrustProxy(config.TRUST_PROXY),
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule.forRoot(config), adapter, {
    logger: config.NODE_ENV === 'test' ? false : NEST_LOG_LEVELS[config.LOG_LEVEL],
    bufferLogs: true,
  });

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', async (request, reply) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
  });

  await app.register(cookie);
  await app.register(helmet, {
    // The API serves JSON only, so the strictest content security policy applies.
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  });

  app.enableCors({
    origin: [config.WEB_URL],
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', CSRF_HEADER, REQUEST_ID_HEADER],
    exposedHeaders: [REQUEST_ID_HEADER, 'retry-after'],
  });

  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();

  return app;
}

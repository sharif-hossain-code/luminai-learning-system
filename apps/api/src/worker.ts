import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { InvalidEnvironmentError, loadConfig } from './config/env.schema.js';
import { WorkerModule } from './worker.module.js';

async function bootstrap(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof InvalidEnvironmentError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(config), {
    logger: ['fatal', 'error', 'warn', 'log'],
  });
  app.enableShutdownHooks();
  new Logger('Worker').log('Worker running');
}

await bootstrap();

import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './app.factory.js';
import { InvalidEnvironmentError, loadConfig } from './config/env.schema.js';

async function bootstrap(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof InvalidEnvironmentError) {
      // Fail fast with a readable message; no stack trace needed.
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const app = await createApp(config);
  await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
  new Logger('Bootstrap').log(`API listening on port ${config.API_PORT}`);
}

await bootstrap();

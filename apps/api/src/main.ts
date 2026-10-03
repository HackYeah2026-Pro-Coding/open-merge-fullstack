import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './core/filters/http-exception.filter';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Env, true>);

  app.setGlobalPrefix('api');
  // Request validation will use zod schemas from @escrow/shared via a custom
  // pipe, so class-validator is deliberately not a dependency.
  app.useGlobalFilters(new HttpExceptionFilter());

  // In development the SPA reaches the API through Vite's /api proxy, so requests
  // are same-origin. CORS is here for the deployed / ngrok case.
  app.enableCors({ origin: config.get('WEB_ORIGIN', { infer: true }), credentials: true });
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  // 0.0.0.0 rather than loopback: required for the process to be reachable
  // from outside its container on Render and friends.
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`API listening on http://localhost:${port}/api`);
}

void bootstrap();

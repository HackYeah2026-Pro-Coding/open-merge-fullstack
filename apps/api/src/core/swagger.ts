import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Path under the global `api` prefix, so the UI is served at /api/docs. */
export const SWAGGER_PATH = 'docs';

/**
 * Serves the interactive UI at /api/docs and the raw spec at /api/docs-json.
 * Request and response types are zod schemas and interfaces, which the
 * generator cannot introspect, so schemas appear only where a route is
 * annotated with @nestjs/swagger decorators.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('OpenMerge API')
    .setDescription('Paid bounties for open-source issues.')
    .setVersion('0.1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_PATH, app, document, { useGlobalPrefix: true });
}

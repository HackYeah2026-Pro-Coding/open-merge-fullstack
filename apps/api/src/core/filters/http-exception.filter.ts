import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Maps thrown errors onto HTTP responses in one place. Nothing is swallowed:
 * unexpected errors are logged with their stack and surface as a 500, so a bug
 * stays loud instead of degrading into a silent empty response.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!isHttp) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const payload = isHttp ? exception.getResponse() : undefined;
    const message =
      typeof payload === 'string'
        ? payload
        : ((payload as { message?: string | string[] } | undefined)?.message ??
          (isHttp ? exception.message : 'Internal server error'));

    response.status(status).json({
      statusCode: status,
      error: isHttp ? exception.name : 'InternalServerError',
      message,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }
}

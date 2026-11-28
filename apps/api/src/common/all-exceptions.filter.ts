import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ErrorCode, type ErrorEnvelope, type FieldError } from '@luminai/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.RESOURCE_NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  BAD_REQUEST: 'The request could not be processed.',
  VALIDATION_FAILED: 'Some fields are invalid.',
  UNAUTHENTICATED: 'You need to sign in to do that.',
  FORBIDDEN: 'You do not have permission to do that.',
  RESOURCE_NOT_FOUND: 'The requested resource was not found.',
  CONFLICT: 'The request conflicts with the current state of the resource.',
  RATE_LIMITED: 'Too many requests. Please wait and try again.',
  PAYLOAD_TOO_LARGE: 'The request is too large.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
};

/**
 * Converts every error into the shared error envelope.
 * Clients never see stack traces, SQL, provider errors or configuration;
 * unexpected errors are logged server-side with the request ID instead.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const requestId = String(request.id);

    const { status, body } = this.toEnvelope(exception, requestId);

    if (status >= 500) {
      this.logger.error(
        { requestId, method: request.method, path: request.routeOptions?.url ?? 'unmatched' },
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    void reply.status(status).header('content-type', 'application/json; charset=utf-8').send(body);
  }

  toEnvelope(exception: unknown, requestId: string): { status: number; body: ErrorEnvelope } {
    if (exception instanceof ZodError) {
      return this.build(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED, requestId, {
        fieldErrors: exception.issues.map((issue): FieldError => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code =
        STATUS_TO_CODE[status] ??
        (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST);
      // Only 4xx messages thrown deliberately by our own code are shown to clients.
      const message = status < 500 ? this.clientMessage(exception) : undefined;
      return this.build(status, code, requestId, { message });
    }

    // Fastify errors (e.g. invalid JSON body, body too large) carry a statusCode.
    const statusCode = (exception as { statusCode?: unknown } | null)?.statusCode;
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      return this.build(
        statusCode,
        STATUS_TO_CODE[statusCode] ?? ErrorCode.BAD_REQUEST,
        requestId,
        {},
      );
    }

    return this.build(HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR, requestId, {});
  }

  private clientMessage(exception: HttpException): string | undefined {
    const response = exception.getResponse();
    if (typeof response === 'string') return response;
    const message = (response as { message?: unknown }).message;
    return typeof message === 'string' ? message : undefined;
  }

  private build(
    status: number,
    code: ErrorCode,
    requestId: string,
    options: { message?: string; fieldErrors?: FieldError[] },
  ): { status: number; body: ErrorEnvelope } {
    return {
      status,
      body: {
        error: {
          code,
          message: options.message ?? DEFAULT_MESSAGES[code],
          requestId,
          fieldErrors: options.fieldErrors ?? [],
        },
      },
    };
  }
}

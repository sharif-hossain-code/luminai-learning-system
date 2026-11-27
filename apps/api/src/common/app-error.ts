import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, type FieldError } from '@luminai/contracts';

/**
 * A deliberate, client-safe error with a stable code. Its message is shown to
 * the client, so never put internal details in it.
 */
export class AppError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: HttpStatus,
    message: string,
    readonly fieldErrors: FieldError[] = [],
  ) {
    super(message, status);
  }
}

/** Thrown by the validation pipe; rendered as 422 VALIDATION_FAILED with field errors. */
export class RequestValidationError extends AppError {
  constructor(fieldErrors: FieldError[]) {
    super(
      ErrorCode.VALIDATION_FAILED,
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Some fields are invalid.',
      fieldErrors,
    );
  }
}

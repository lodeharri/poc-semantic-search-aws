/**
 * Domain-level error types following hexagonal architecture principles.
 * Domain errors are pure — they carry no infrastructure knowledge.
 */

/**
 * Base application error — all domain errors extend this.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'APP_ERROR',
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error — thrown when business rules or input validation fails.
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly issues?: unknown,
  ) {
    super(message, 'VALIDATION_ERROR');
  }
}

/**
 * External service error — thrown when a downstream service (LLM, DB, etc.) fails.
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, originalError: unknown) {
    super(`Error from external service: ${service}`, 'EXTERNAL_SERVICE_ERROR');
    this.cause = originalError;
  }
}

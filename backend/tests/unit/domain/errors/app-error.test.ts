import {
  AppError,
  ValidationError,
  ExternalServiceError,
} from '../../../../src/domain/errors/app-error.js';

describe('AppError', () => {
  it('preserves message and sets default code', () => {
    const err = new AppError('something failed');
    expect(err.message).toBe('something failed');
    expect(err.code).toBe('APP_ERROR');
    expect(err.name).toBe('AppError');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it('accepts custom code', () => {
    const err = new AppError('msg', 'CUSTOM_CODE');
    expect(err.code).toBe('CUSTOM_CODE');
  });
});

describe('ValidationError', () => {
  it('is AppError and uses VALIDATION_ERROR code', () => {
    const err = new ValidationError('invalid input');
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('invalid input');
  });

  it('accepts issues detail', () => {
    const issues = { field: 'content', reason: 'too short' };
    const err = new ValidationError('bad', issues);
    expect(err.issues).toEqual(issues);
  });
});

describe('ExternalServiceError', () => {
  it('wraps original error and names the service', () => {
    const original = new Error('network timeout');
    const err = new ExternalServiceError('Gemini', original);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('EXTERNAL_SERVICE_ERROR');
    expect(err.message).toContain('Gemini');
    expect(err.cause).toBe(original);
  });

  it('accepts non-Error causes (defensive)', () => {
    const err = new ExternalServiceError('NeonDatabase', 'string failure');
    expect(err.message).toContain('NeonDatabase');
    expect(err.cause).toBe('string failure');
  });
});

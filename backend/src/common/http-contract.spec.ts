import {
  ArgumentsHost,
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { ResponseInterceptor } from './interceptors/response.interceptor';
import { ApiErrorResponse } from './dto/response.dto';

describe('HTTP envelopes', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('wraps successful data in the canonical envelope', async () => {
    const interceptor = new ResponseInterceptor<{ id: string }>();
    const context = {
      switchToHttp: () => ({
        getResponse: () => ({ statusCode: 201 }),
        getRequest: () => ({
          url: '/api/examples',
          originalUrl: '/api/examples?source=test',
        }),
      }),
    } as ExecutionContext;
    const next: CallHandler<{ id: string }> = {
      handle: () => of({ id: 'example-1' }),
    };

    const response = await lastValueFrom(interceptor.intercept(context, next));

    expect(response).toMatchObject({
      success: true,
      data: { id: 'example-1' },
      path: '/api/examples?source=test',
      statusCode: 201,
    });
    expect(new Date(response.timestamp).toISOString()).toBe(response.timestamp);
  });

  it('serializes Prisma bigint values without turning a successful write into a 500', async () => {
    const interceptor = new ResponseInterceptor<{ size: bigint }>();
    const context = {
      switchToHttp: () => ({
        getResponse: () => ({ statusCode: 201 }),
        getRequest: () => ({ url: '/api/documents/upload' }),
      }),
    } as ExecutionContext;
    const next: CallHandler<{ size: bigint }> = {
      handle: () => of({ size: 42n }),
    };

    const response = await lastValueFrom(interceptor.intercept(context, next));

    expect(response.data).toEqual({ size: '42' });
    expect(() => JSON.stringify(response)).not.toThrow();
  });

  it('normalizes validation errors without exposing a stack', () => {
    let sent: unknown;
    const json = jest.fn((body: unknown) => {
      sent = body;
    });
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({
          method: 'POST',
          url: '/api/orders',
          originalUrl: '/api/orders',
        }),
      }),
    } as ArgumentsHost;
    const exception = new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: ['status must be canonical'],
    });

    new HttpExceptionFilter().catch(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 400,
        path: '/api/orders',
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: ['status must be canonical'],
        },
      }),
    );
    expect(sent).not.toHaveProperty('stack');
  });

  it('hides unexpected exception details', () => {
    let sent: unknown;
    const json = jest.fn((body: unknown) => {
      sent = body;
    });
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'GET', url: '/api/example' }),
      }),
    } as ArgumentsHost;

    new HttpExceptionFilter().catch(
      new Error('database password leaked'),
      host,
    );

    const payload = sent as ApiErrorResponse;
    expect(payload.error).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    });
    expect(JSON.stringify(payload)).not.toContain('database password leaked');
  });

  it('preserves only allowlisted workflow-gate diagnostics', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'PATCH', url: '/api/dossiers/id/status' }),
      }),
    } as ArgumentsHost;

    new HttpExceptionFilter().catch(
      new BadRequestException({
        code: 'DOSSIER_CHECKPOINT_EVIDENCE_REQUIRED',
        message: 'Evidence is incomplete',
        checkpoint: 'CUSTOMS',
        missingVehicleIds: ['vehicle-a'],
        unsafeInternalPath: 'must-not-leak',
      }),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: {
          code: 'DOSSIER_CHECKPOINT_EVIDENCE_REQUIRED',
          message: 'Evidence is incomplete',
          checkpoint: 'CUSTOMS',
          missingVehicleIds: ['vehicle-a'],
        },
      }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain('must-not-leak');
  });
});

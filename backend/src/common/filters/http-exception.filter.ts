import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorBody, ApiErrorResponse } from '../dto/response.dto';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let errorBody: ApiErrorBody;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        errorBody = {
          code: this.codeForStatus(status),
          message: exceptionResponse,
        };
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const body = exceptionResponse as Record<string, unknown>;
        const rawMessage = body.message ?? exception.message;
        const details = Array.isArray(body.details)
          ? body.details.map(String)
          : Array.isArray(rawMessage)
            ? rawMessage.map(String)
            : undefined;
        errorBody = {
          code:
            typeof body.code === 'string'
              ? body.code
              : this.codeForStatus(status),
          message:
            typeof rawMessage === 'string'
              ? rawMessage
              : (details?.[0] ?? exception.message),
          ...(details?.length ? { details } : {}),
          ...(typeof body.checkpoint === 'string'
            ? { checkpoint: body.checkpoint }
            : {}),
          ...(Array.isArray(body.missingVehicleIds) &&
          body.missingVehicleIds.every((value) => typeof value === 'string')
            ? { missingVehicleIds: body.missingVehicleIds.map(String) }
            : {}),
        };
      } else {
        errorBody = {
          code: this.codeForStatus(status),
          message: exception.message,
        };
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      errorBody = {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      };
    }

    if (status !== Number(HttpStatus.NOT_FOUND)) {
      this.logger.error(
        `[${request.method}] ${request.url} - Status: ${status}`,
        exception instanceof Error ? exception.stack : '',
      );
    }

    const payload: ApiErrorResponse = {
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url,
      error: errorBody,
    };

    response.status(status).json(payload);
  }

  private codeForStatus(status: number): string {
    return HttpStatus[status] ?? 'HTTP_ERROR';
  }
}

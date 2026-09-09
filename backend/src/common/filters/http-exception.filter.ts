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
import { Prisma } from '@prisma/client';

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
    } else if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2021', 'P2022'].includes(exception.code)
    ) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      errorBody = {
        code: 'DATABASE_SCHEMA_OUTDATED',
        message:
          'La base de données ERP doit être mise à jour. Exécutez les migrations avant de réessayer.',
      };
    } else if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2003', 'P2025', 'P2034', 'P2020'].includes(exception.code)
    ) {
      status =
        exception.code === 'P2025'
          ? HttpStatus.NOT_FOUND
          : exception.code === 'P2020'
            ? HttpStatus.BAD_REQUEST
            : HttpStatus.CONFLICT;
      const messages: Record<string, string> = {
        P2002: 'Cette référence existe déjà. Vérifiez les données saisies.',
        P2003:
          'Cette opération est incompatible avec les enregistrements liés.',
        P2025: 'L’enregistrement demandé n’existe plus. Rechargez les données.',
        P2034:
          'Les données ont été modifiées simultanément. Rechargez puis réessayez.',
        P2020: 'Le montant dépasse la capacité du champ comptable.',
      };
      errorBody = {
        code: this.codeForStatus(status),
        message: messages[exception.code],
      };
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

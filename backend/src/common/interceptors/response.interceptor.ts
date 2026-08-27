import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiSuccessResponse } from '../dto/response.dto';
import { Request, Response as ExpressResponse } from 'express';

function makeJsonSafe<T>(data: T): T {
  if (data === undefined) return data;
  return JSON.parse(
    JSON.stringify(data, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  ) as T;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<ExpressResponse>();
    const request = ctx.getRequest<Request>();

    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        data: makeJsonSafe(data),
        timestamp: new Date().toISOString(),
        path: request.originalUrl ?? request.url,
        statusCode: response.statusCode,
      })),
    );
  }
}

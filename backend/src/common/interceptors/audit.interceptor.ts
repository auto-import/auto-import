import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, mergeMap, of } from 'rxjs';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';

const SENSITIVE =
  /password|passphrase|secret|token|cookie|authorization|file|buffer|bytes|credential|api[-_]?key/i;

export function safeChangedFields(body: unknown): string[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  return Object.keys(body as Record<string, unknown>)
    .filter((key) => !SENSITIVE.test(key))
    .sort();
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    if (
      !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) ||
      request.path.startsWith('/api/auth')
    )
      return next.handle();
    return next.handle().pipe(
      mergeMap((data: unknown) => {
        const actor = request.user;
        if (!actor) return of(data);
        const segments = request.path
          .replace(/^\/api\//, '')
          .split('/')
          .filter(Boolean);
        const result = data as { id?: string; data?: { id?: string } } | null;
        const parameterId = request.params.id;
        const entityId =
          (Array.isArray(parameterId) ? parameterId[0] : parameterId) ??
          result?.id ??
          result?.data?.id ??
          'collection';
        const changedFields = safeChangedFields(request.body);
        return this.prisma.auditLog
          .create({
            data: {
              organizationId: actor.organizationId,
              userId: actor.id,
              action: request.method.toLowerCase(),
              entityType: segments[0] ?? 'unknown',
              entityId,
              newValues: changedFields.length ? { changedFields } : undefined,
              ipAddress: request.ip,
              userAgent: request.get('user-agent')?.slice(0, 500),
              correlationId: request.get('x-request-id')?.slice(0, 200),
            },
          })
          .then(() => data)
          .catch((error: unknown) => {
            this.logger.error(
              `Audit persistence failed for ${request.method} ${request.path}`,
              error instanceof Error ? error.stack : undefined,
            );
            return data;
          });
      }),
    );
  }
}

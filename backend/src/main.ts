import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger, BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { PrismaService } from './prisma/prisma.service';
import helmet from 'helmet';
import { configureOpenApi } from './common/openapi';
import { validateProductionEnvironment } from './config/production-environment';
import type { NestExpressApplication } from '@nestjs/platform-express';

function validationDetails(
  errors: ValidationError[],
  parentPath = '',
): string[] {
  return errors.flatMap((error) => {
    const segment = /^\d+$/.test(error.property)
      ? `[${error.property}]`
      : parentPath
        ? `.${error.property}`
        : error.property;
    const path = `${parentPath}${segment}`;
    const own = Object.entries(error.constraints ?? {}).map(([key, message]) =>
      key === 'unknownValue'
        ? `${path}: invalid nested object`
        : `${path}: ${message}`,
    );
    return [...own, ...validationDetails(error.children ?? [], path)];
  });
}

async function bootstrap() {
  validateProductionEnvironment(process.env);
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.enableShutdownHooks();
  const configService = app.get(ConfigService);

  const port = configService.get<number>('PORT', 3000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  if (nodeEnv === 'production') {
    const hops = Number(configService.get<string>('TRUST_PROXY_HOPS'));
    app.set('trust proxy', hops);
  }
  const allowedOrigins = configService
    .get<string>('CORS_ORIGIN', 'http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
    throw new Error(
      'CORS_ORIGIN must contain explicit origins when credentials are enabled',
    );
  }

  app.use(helmet());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  app.setGlobalPrefix('api', {
    exclude: ['health', 'ping'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) => {
        return new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: validationDetails(errors),
        });
      },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new AuditInterceptor(app.get(PrismaService)),
    new ResponseInterceptor(),
  );

  configureOpenApi(app);

  await app.listen(port);
  logger.log(`Application listening on port ${port}`);
  logger.log(`Environment: ${nodeEnv}`);
  logger.log(`Revision: ${process.env.APP_COMMIT_SHA ?? 'unknown'}`);
  logger.log(`Health check path: /health`);
}
void bootstrap();

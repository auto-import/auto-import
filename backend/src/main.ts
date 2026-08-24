import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import helmet from 'helmet';
import { configureOpenApi } from './common/openapi';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);

  const port = configService.get<number>('PORT', 3000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
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
        const messages = errors.map((error) =>
          Object.values(error.constraints || {}).join(', '),
        );
        return new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: messages,
        });
      },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ResponseInterceptor(),
  );

  configureOpenApi(app);

  await app.listen(port);
  logger.log(`🚀 Application running on: http://localhost:${port}`);
  logger.log(`📝 Environment: ${nodeEnv}`);
  logger.log(`🔍 Health check: http://localhost:${port}/health`);
}
void bootstrap();

import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Auto-Import ERP API')
    .setDescription('Implemented HTTP API for the Auto-Import ERP application.')
    .setVersion('1.0')
    .addServer('/api')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT refresh token',
      },
      'refresh-token',
    )
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function configureOpenApi(app: INestApplication): OpenAPIObject {
  const document = createOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document, { useGlobalPrefix: true });
  return document;
}

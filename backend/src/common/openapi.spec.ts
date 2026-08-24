import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiBearerAuth } from '@nestjs/swagger';
import { createOpenApiDocument } from './openapi';

@Controller('implemented')
@ApiBearerAuth('access-token')
class ImplementedController {
  @Get()
  findAll() {
    return [];
  }
}

@Module({ controllers: [ImplementedController] })
class OpenApiTestModule {}

describe('OpenAPI configuration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [OpenApiTestModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => app.close());

  it('generates paths and the named bearer scheme', () => {
    const document = createOpenApiDocument(app);

    expect(document.paths['/api/implemented']).toBeDefined();
    expect(
      document.components?.securitySchemes?.['access-token'],
    ).toMatchObject({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
    expect(
      document.components?.securitySchemes?.['refresh-token'],
    ).toMatchObject({ type: 'http', scheme: 'bearer' });
  });
});

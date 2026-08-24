import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ping (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/ping')
      .expect(200);
    const body = JSON.parse(response.text) as {
      pong: boolean;
      timestamp: string;
    };
    expect(body.pong).toBe(true);
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  afterEach(async () => {
    await app.close();
  });
});

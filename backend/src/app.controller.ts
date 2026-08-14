import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  @HttpCode(HttpStatus.OK)
  async healthCheck() {
    const dbHealthy = await this.prisma.isHealthy();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: dbHealthy ? 'connected' : 'disconnected',
      },
      version: process.env.npm_package_version || '1.0.0',
    };
  }

  @Public()
  @Get('ping')
  ping() {
    return { pong: true, timestamp: new Date().toISOString() };
  }
}

import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly connectionPool: pg.Pool;
  private static readonly REQUIRED_MIGRATION =
    '20260830020000_offer_reservation_price_snapshot';

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    const pool = new pg.Pool({ connectionString });
    const adapter = new PrismaPg(pool);

    super({
      adapter,
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['error'],
    });
    this.connectionPool = pool;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      await this.assertRequiredMigration();
      this.logger.log('✅ Successfully connected to database');
    } catch (error) {
      this.logger.error('❌ Failed to connect to database:', error);
      throw error;
    }
  }

  private async assertRequiredMigration(): Promise<void> {
    const rows = await this.$queryRaw<Array<{ applied: boolean }>>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1
          FROM "_prisma_migrations"
          WHERE "migration_name" = ${PrismaService.REQUIRED_MIGRATION}
            AND "finished_at" IS NOT NULL
            AND "rolled_back_at" IS NULL
        ) AS applied
      `,
    );
    if (!rows[0]?.applied) {
      throw new Error(
        `Database schema is behind the application. Run "npx prisma migrate deploy"; required migration: ${PrismaService.REQUIRED_MIGRATION}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.connectionPool.end();
    this.logger.log('Database connection closed');
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

import { Module } from '@nestjs/common';
import {
  AuditController,
  DashboardController,
  NotificationsController,
  ReportsController,
  SettingsController,
  TasksController,
} from './phase3.controller';
import { Phase3Service } from './phase3.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { NotificationsGateway } from './notifications.gateway';

@Module({
  imports: [
    AuthModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  controllers: [
    TasksController,
    NotificationsController,
    AuditController,
    DashboardController,
    ReportsController,
    SettingsController,
  ],
  providers: [Phase3Service, NotificationsGateway],
  exports: [Phase3Service],
})
export class Phase3Module {}

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

@Module({
  controllers: [
    TasksController,
    NotificationsController,
    AuditController,
    DashboardController,
    ReportsController,
    SettingsController,
  ],
  providers: [Phase3Service],
  exports: [Phase3Service],
})
export class Phase3Module {}

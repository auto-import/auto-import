import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { ProspectsModule } from './prospects/prospects.module';
import { ClientsModule } from './clients/clients.module';
import { DossiersModule } from './dossiers/dossiers.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { OfficesModule } from './offices/offices.module';
import { VehicleRequestsModule } from './vehicle-requests/vehicle-requests.module';
import { OrdersModule } from './orders/orders.module';
import { PartnersModule } from './partners/partners.module';
import { AppController } from './app.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { CrmModule } from './crm/crm.module';
import { CallCenterModule } from './call-center/call-center.module';
import { OffersModule } from './offers/offers.module';
import { PurchasesModule } from './purchases/purchases.module';
import { FinanceModule } from './finance/finance.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { CustomsModule } from './customs/customs.module';
import { DocumentsModule } from './documents/documents.module';
import { Phase3Module } from './phase3/phase3.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { CatalogueModule } from './catalogue/catalogue.module';
import { ConfigurationModule } from './configuration/configuration.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    ProspectsModule,
    ClientsModule,
    DossiersModule,
    VehiclesModule,
    WarehousesModule,
    OfficesModule,
    VehicleRequestsModule,
    OrdersModule,
    PartnersModule,
    CrmModule,
    CallCenterModule,
    OffersModule,
    PurchasesModule,
    FinanceModule,
    ShipmentsModule,
    CustomsModule,
    DocumentsModule,
    Phase3Module,
    IntegrationsModule,
    CatalogueModule,
    ConfigurationModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}

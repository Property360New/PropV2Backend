import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
 
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
 
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { HierarchyModule } from './modules/hierarchy/hierarchy.module';
import { LeadsModule } from './modules/leads/leads.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { CustomersModule } from './modules/customers/customers.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { TargetsModule } from './modules/targets/targets.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { NotificationsModule } from './modules/notification/notification.module';
import { FieldDefinitionsModule } from './modules/field-definitions/field-definitions.module';
import { BulkImportModule } from './modules/bulk-import/bulk-import.module'
import { ReportsModule } from './modules/reports/reports.module'
import { StaffLocationModule } from './modules/staff-location/staff-location.module';
import { TermsConditionsModule } from './modules/terms-conditions/terms-conditions.module';
import { PrivacyPolicyModule } from './modules/privacy-policy/privacy-policy.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
 
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
 
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
 
    ScheduleModule.forRoot(),
 
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 20 },
      { name: 'medium', ttl: 60000, limit: 300 },
    ]),
 
    PrismaModule,
    AuthModule,
    HierarchyModule,
    FieldDefinitionsModule,   // before LeadsModule (leads uses it)
    LeadsModule,
    ProjectsModule,
    CustomersModule,
    InventoryModule,
    ExpensesModule,
    TargetsModule,
    AttendanceModule,
    StaffLocationModule,
    TermsConditionsModule,
    PrivacyPolicyModule,
    NotificationsModule,
    BulkImportModule,
    ReportsModule,
    WhatsappModule
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}

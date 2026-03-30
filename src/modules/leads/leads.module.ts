// src/modules/leads/leads.module.ts
import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { HierarchyModule } from '../hierarchy/hierarchy.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { FieldDefinitionsModule } from '../field-definitions/field-definitions.module';
import { TargetsModule } from '../targets/targets.module';
import { NotificationsModule } from '../notification/notification.module';

@Module({
  imports: [
    PrismaModule,
    HierarchyModule,
    FieldDefinitionsModule,
    TargetsModule,
    NotificationsModule,
  ],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
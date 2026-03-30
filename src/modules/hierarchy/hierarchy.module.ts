// ============================================================
// src/modules/hierarchy/hierarchy.module.ts
// ============================================================
import { Module } from '@nestjs/common';
import { HierarchyController } from './hierarchy.controller';
import { HierarchyService } from './hierarchy.service';
 
@Module({
  controllers: [HierarchyController],
  providers: [HierarchyService],
  exports: [HierarchyService], // exported so LeadsService, AttendanceService etc. can use getScopeEmployeeIds
})
export class HierarchyModule {}
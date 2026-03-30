import { Module } from '@nestjs/common';
import { StaffLocationController } from './staff-location.controller';
import { StaffLocationService } from './staff-location.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [StaffLocationController],
  providers: [StaffLocationService],
})
export class StaffLocationModule {}

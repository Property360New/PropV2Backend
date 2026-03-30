import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import {
  NotificationService,
  CreateNotificationDto,
  ListNotificationsDto,
} from './notification.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationController {
  constructor(private notificationsService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications — own + subordinates for managers, all for admin' })
  getMyNotifications(
    @CurrentUser() user: any,
    @Query() query: ListNotificationsDto,
  ) {
    return this.notificationsService.getMyNotifications(
      user.employeeId,
      user.designation,
      user.subordinateIds ?? [],
      query,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread count — own + subordinates for managers, all for admin' })
  getUnreadCount(@CurrentUser() user: any) {
    return this.notificationsService.getUnreadCount(
      user.employeeId,
      user.designation,
      user.subordinateIds ?? [],
    );
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read (own or subordinate)' })
  markAsRead(
    @CurrentUser() user: any,
    @Param('id') notificationId: string,
  ) {
    return this.notificationsService.markAsRead(
      user.employeeId,
      user.designation,
      user.subordinateIds ?? [],
      notificationId,
    );
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read (own + subordinates)' })
  markAllAsRead(@CurrentUser() user: any) {
    return this.notificationsService.markAllAsRead(
      user.employeeId,
      user.designation,
      user.subordinateIds ?? [],
    );
  }

  @Post('send')
  @ApiOperation({ summary: 'Admin: send manual notification to employees' })
  send(@CurrentUser() user: any, @Body() dto: CreateNotificationDto) {
    return this.notificationsService.sendManualNotification(
      user.companyId,
      user.employeeId,
      dto,
      user.designation,
    );
  }
}

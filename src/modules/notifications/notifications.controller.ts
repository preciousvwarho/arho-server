import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/types/authenticated-request';
import { ListNotificationsQuery } from './dto/list-notifications.query';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async listMine(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListNotificationsQuery,
  ) {
    return {
      status: 'success',
      message: 'Notifications retrieved successfully',
      data: await this.notifications.listMine(user.sub, query),
    };
  }

  @Patch('read-all')
  async markAllRead(@CurrentUser() user: JwtPayload) {
    return {
      status: 'success',
      message: 'Notifications marked as read successfully',
      data: await this.notifications.markAllRead(user.sub),
    };
  }

  @Patch(':id/read')
  async markRead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return {
      status: 'success',
      message: 'Notification marked as read successfully',
      data: await this.notifications.markRead(user.sub, id),
    };
  }
}

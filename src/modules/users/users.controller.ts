import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/types/authenticated-request';
import { PushNotificationsDto } from './dto/push-notifications.dto';
import { PushTokenDto } from './dto/push-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser() user: JwtPayload) {
    return {
      status: 'success',
      message: 'User profile retrieved successfully',
      data: { user: await this.users.getProfile(user.sub) },
    };
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return {
      status: 'success',
      message: 'User profile updated successfully',
      data: { user: await this.users.updateProfile(user.sub, dto) },
    };
  }

  @Patch('push-token')
  async setPushToken(
    @CurrentUser() user: JwtPayload,
    @Body() dto: PushTokenDto,
  ) {
    return {
      status: 'success',
      message: 'Push token updated successfully',
      data: await this.users.setPushToken(user.sub, dto),
    };
  }

  @Get('push-notifications')
  async getPushNotificationPreference(@CurrentUser() user: JwtPayload) {
    return {
      status: 'success',
      message: 'Push notification preference retrieved successfully',
      data: await this.users.getPushNotificationPreference(user.sub),
    };
  }

  @Patch('push-notifications')
  async setPushNotificationPreference(
    @CurrentUser() user: JwtPayload,
    @Body() dto: PushNotificationsDto,
  ) {
    return {
      status: 'success',
      message: 'Push notification preference updated successfully',
      data: await this.users.setPushNotificationPreference(user.sub, dto),
    };
  }
}

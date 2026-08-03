import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/types/authenticated-request';
import { PaginationQuery } from '../../common/types/pagination';
import { ChangePasswordDto } from './dto/change-password.dto';
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

  @Get('dashboard')
  async getDashboard(@CurrentUser() user: JwtPayload) {
    return {
      status: 'success',
      message: 'User dashboard retrieved successfully',
      data: { dashboard: await this.users.getDashboard(user.sub) },
    };
  }

  @Get('activities')
  async getActivities(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationQuery,
  ) {
    const result = await this.users.getActivities(user.sub, query);
    return {
      status: 'success',
      message: 'User activities retrieved successfully',
      data: { activities: result.activities },
      pagination: result.pagination,
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

  @Patch('change-password')
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return {
      status: 'success',
      message: 'Password changed successfully',
      data: await this.users.changePassword(user.sub, dto),
    };
  }

  @Delete('me')
  async deleteMe(@CurrentUser() user: JwtPayload) {
    return {
      status: 'success',
      message: 'Account deleted successfully',
      data: await this.users.deleteAccount(user.sub),
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

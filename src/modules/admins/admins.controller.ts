import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminPermission } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AdminJwtAuthGuard } from '../../common/guards/admin-jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../../common/types/authenticated-request';
import { PaginationQuery } from '../../common/types/pagination';
import { AdminsService } from './admins.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { ChangeAdminPasswordDto } from './dto/change-admin-password.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { ListUsersQuery } from './dto/list-users.query';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { UpdateDepositStatusDto } from './dto/update-deposit-status.dto';

@ApiTags('admin')
@Controller('admin')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Post('auth/login')
  async login(@Body() dto: AdminLoginDto) {
    return {
      status: 'success',
      message: 'Admin logged in successfully',
      data: await this.admins.login(dto),
    };
  }

  @Post('auth/logout')
  logout() {
    return { status: 'success', message: 'Admin logged out successfully' };
  }

  @Get('auth/me')
  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard)
  async getMe(@CurrentUser() admin: JwtPayload) {
    return {
      status: 'success',
      message: 'Admin profile retrieved successfully',
      data: { admin: await this.admins.getMe(admin.sub) },
    };
  }

  @Patch('auth/change-password')
  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard)
  async changePassword(
    @CurrentUser() admin: JwtPayload,
    @Body() dto: ChangeAdminPasswordDto,
  ) {
    return {
      status: 'success',
      message: 'Admin password changed successfully',
      data: await this.admins.changePassword(admin.sub, dto),
    };
  }

  @Post('admins')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_ADMINS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async createAdmin(@Body() dto: CreateAdminDto) {
    return {
      status: 'success',
      message: 'Admin created successfully',
      data: { admin: await this.admins.createAdmin(dto) },
    };
  }

  @Get('admins')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_ADMINS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async listAdmins(@Query() query: PaginationQuery) {
    return {
      status: 'success',
      message: 'Admins retrieved successfully',
      data: await this.admins.listAdmins(query),
    };
  }

  @Get('admins/:id')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_ADMINS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async getAdmin(@Param('id') id: string) {
    return {
      status: 'success',
      message: 'Admin retrieved successfully',
      data: { admin: await this.admins.getAdmin(id) },
    };
  }

  @Patch('admins/:id')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_ADMINS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async updateAdmin(@Param('id') id: string, @Body() dto: UpdateAdminDto) {
    return {
      status: 'success',
      message: 'Admin updated successfully',
      data: { admin: await this.admins.updateAdmin(id, dto) },
    };
  }

  @Patch('admins/:id/toggle-status')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_ADMINS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async toggleAdminStatus(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
  ) {
    return {
      status: 'success',
      message: 'Admin status updated successfully',
      data: { admin: await this.admins.toggleAdminStatus(admin.sub, id) },
    };
  }

  @Delete('admins/:id')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_ADMINS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async deleteAdmin(@CurrentUser() admin: JwtPayload, @Param('id') id: string) {
    return {
      status: 'success',
      message: 'Admin deleted successfully',
      data: { admin: await this.admins.deleteAdmin(admin.sub, id) },
    };
  }

  @Get('users')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_USERS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async listUsers(@Query() query: ListUsersQuery) {
    return {
      status: 'success',
      message: 'Users retrieved successfully',
      data: await this.admins.listUsers(query),
    };
  }

  @Patch('users/:userId/toggle-status')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_USERS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async toggleUserStatus(@Param('userId') userId: string) {
    return {
      status: 'success',
      message: 'User status updated successfully',
      data: { user: await this.admins.toggleUserStatus(userId) },
    };
  }

  @Get('stats')
  @ApiBearerAuth()
  @Permissions(AdminPermission.VIEW_ANALYTICS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async getSystemStats() {
    return {
      status: 'success',
      message: 'System statistics retrieved successfully',
      data: { stats: await this.admins.getSystemStats() },
    };
  }

  @Get('deposits')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_DEPOSITS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async listDeposits(@Query() query: PaginationQuery) {
    return {
      status: 'success',
      message: 'Deposit requests retrieved successfully',
      data: await this.admins.listDeposits(query),
    };
  }

  @Patch('deposits/:id/status')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_DEPOSITS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async processDeposit(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateDepositStatusDto,
  ) {
    return {
      status: 'success',
      message: 'Deposit request processed successfully',
      data: { deposit: await this.admins.processDeposit(admin.sub, id, dto) },
    };
  }
}

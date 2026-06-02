import {
  Body,
  Controller,
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
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateDepositStatusDto } from './dto/update-deposit-status.dto';

@ApiTags('admin')
@Controller('admin')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Post('auth/login')
  login(@Body() dto: AdminLoginDto) {
    return this.admins.login(dto);
  }

  @Post('items')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_DEPOSITS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async createItem(@Body() dto: CreateItemDto) {
    return {
      status: 'success',
      data: { item: await this.admins.createItem(dto) },
    };
  }

  @Get('deposits')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_DEPOSITS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async listDeposits(@Query() query: PaginationQuery) {
    return { status: 'success', data: await this.admins.listDeposits(query) };
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
      data: { deposit: await this.admins.processDeposit(admin.sub, id, dto) },
    };
  }
}

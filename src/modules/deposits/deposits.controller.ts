import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/types/authenticated-request';
import { DepositsService } from './deposits.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { ListDepositsQuery } from './dto/list-deposits.query';

@ApiTags('deposits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('deposits')
export class DepositsController {
  constructor(private readonly deposits: DepositsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a recyclable item pickup request' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateDepositDto) {
    return {
      status: 'success',
      data: { deposit: await this.deposits.create(user.sub, dto) },
    };
  }

  @Get()
  async listMine(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListDepositsQuery,
  ) {
    return {
      status: 'success',
      data: await this.deposits.listMine(user.sub, query),
    };
  }

  @Get('stats')
  async stats(@CurrentUser() user: JwtPayload) {
    return { status: 'success', data: await this.deposits.getStats(user.sub) };
  }

  @Get(':id')
  async getMine(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return {
      status: 'success',
      data: { deposit: await this.deposits.getMine(user.sub, id) },
    };
  }
}

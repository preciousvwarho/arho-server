import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/types/authenticated-request';
import { PaginationQuery } from '../../common/types/pagination';
import { TransactionsService } from './transactions.service';

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  async listMine(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationQuery,
  ) {
    return {
      status: 'success',
      message: 'Transactions retrieved successfully',
      data: await this.transactions.listMine(user.sub, query),
    };
  }

  @Get(':id')
  async getMine(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return {
      status: 'success',
      message: 'Transaction retrieved successfully',
      data: { transaction: await this.transactions.getMine(user.sub, id) },
    };
  }
}

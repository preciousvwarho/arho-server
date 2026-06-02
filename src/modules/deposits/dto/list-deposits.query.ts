import { ApiPropertyOptional } from '@nestjs/swagger';
import { DepositStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQuery } from '../../../common/types/pagination';

export class ListDepositsQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: DepositStatus })
  @IsOptional()
  @IsEnum(DepositStatus)
  status?: DepositStatus;
}

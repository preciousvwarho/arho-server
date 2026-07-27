import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQuery } from '../../../common/types/pagination';

export class ListItemsQuery extends PaginationQuery {
  @ApiPropertyOptional({ type: String, example: 'plastic' })
  @IsOptional()
  @IsString()
  search?: string;
}

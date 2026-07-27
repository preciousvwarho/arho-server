import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { NotificationType } from '@prisma/client';
import { PaginationQuery } from '../../../common/types/pagination';

export class ListNotificationsQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: NotificationType, example: NotificationType.GENERAL })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @ApiPropertyOptional({ type: Boolean, example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isRead?: boolean;
}

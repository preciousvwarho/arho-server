import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate } from 'class-validator';

export class SchedulePickupDto {
  @ApiProperty({ example: '2026-07-07T10:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  scheduledPickupAt: Date;
}

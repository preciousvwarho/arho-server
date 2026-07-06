import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class PushNotificationsDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}

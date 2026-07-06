import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class PushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  pushToken: string;
}

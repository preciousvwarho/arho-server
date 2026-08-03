import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class ResetPinDto {
  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/)
  otp: string;

  @ApiProperty({ example: '5678' })
  @Matches(/^\d{4,6}$/)
  newPin: string;
}

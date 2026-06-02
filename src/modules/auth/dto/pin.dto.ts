import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class CreatePinDto {
  @ApiProperty({ example: '1234' })
  @Matches(/^\d{4,6}$/)
  pin: string;
}

export class UpdatePinDto {
  @ApiProperty({ example: '1234' })
  @Matches(/^\d{4,6}$/)
  oldPin: string;

  @ApiProperty({ example: '5678' })
  @Matches(/^\d{4,6}$/)
  newPin: string;
}

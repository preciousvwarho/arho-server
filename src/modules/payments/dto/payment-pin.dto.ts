import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class PaymentPinDto {
  @ApiProperty({ example: '1234' })
  @Matches(/^\d{4,6}$/)
  transactionPin: string;
}

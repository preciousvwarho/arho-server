import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';
import { PaymentPinDto } from './payment-pin.dto';

export class BuyAirtimeDto extends PaymentPinDto {
  @ApiProperty({ example: '08031234567' })
  @IsString()
  phoneNumber: string;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(50)
  amount: number;

  @ApiProperty({ example: 'mtn' })
  @IsString()
  network: string;
}
